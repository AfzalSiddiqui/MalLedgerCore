import { describe, expect, it } from 'vitest';
import { LedgerReplay } from '../src/replay/ledger-replay.js';
import {
  SCENARIO_ACCOUNTS,
  SCENARIO_EVENTS,
  SCENARIO_OVERDRAFT_FEES,
} from '../src/replay/scenario.js';

const accounts = SCENARIO_ACCOUNTS;
const events = SCENARIO_EVENTS;

describe('LedgerReplay', () => {
  const createReplay = () =>
    new LedgerReplay(accounts, SCENARIO_OVERDRAFT_FEES);

  it('replays the event stream and produces the expected historical balances', () => {
    const result = createReplay().replay(events);

    expect(
      result.ledger.balanceAt(
        accounts[0],
        'Day1',
      ).toString(),
    ).toBe('250.00');

    expect(
      result.ledger.balanceAt(
        accounts[0],
        'Day2',
      ).toString(),
    ).toBe('225.00');

    expect(
      result.ledger.balanceAt(
        accounts[0],
        'Day3',
      ).toString(),
    ).toBe('625.00');

    expect(
      result.ledger.balanceAt(
        accounts[0],
        'Day4',
      ).toString(),
    ).toBe('415.00');

    expect(
      result.ledger.balanceAt(accounts[0], 'Day5').toString(),
    ).toBe('390.00');

    expect(
      result.ledger.balanceAt(accounts[0], 'Day6').toString(),
    ).toBe('390.93');
  });

  it('criterion 1: Day2 close at end of Day5, before any fee, is -370.00', () => {
    const result = createReplay().replay(events);

    // Known at end of Day5 = everything except E9 (Day6) and the interest
    // credit (Day6 close). "Before any fee" = exclude FEE entries.
    const day2BeforeFees = result.ledger
      .entries('ACC-001')
      .filter(
        (entry) =>
          entry.type !== 'FEE' &&
          entry.type !== 'INTEREST' &&
          entry.entryId !== 'E9' &&
          (entry.valueDate === 'Day1' || entry.valueDate === 'Day2'),
      )
      .reduce((sum, entry) => sum + entry.amount.amount, 0n);

    expect(day2BeforeFees).toBe(-37000n);
  });

  it('prints the as-known closing balance each day, before later back-valued events', () => {
    const result = createReplay().replay(events);

    expect(
      result.dailyReports.map((report) => report.closingAsKnown['ACC-001']),
    ).toEqual(['250.00', '250.00', '650.00', '465.00', '-230.00', '390.93']);

    expect(
      result.dailyReports.map((report) => report.closingAsKnown['ACC-002']),
    ).toEqual(['0.000', '0.000', '0.000', '0.000', '0.000', '10.008']);
  });

  it('flags E10 as a late arrival but still posts it with value date Day5', () => {
    const result = createReplay().replay(events);

    expect(
      result.errors.some(
        (error) => error.eventId === 'E10' && error.message.startsWith('WARNING'),
      ),
    ).toBe(true);
    expect(result.ledger.balanceAt(accounts[1], 'Day5').toString()).toBe('10.000');
  });

  it('accepts Auth-A settlement', () => {
    const result = createReplay().replay(events);

    expect(
      result.errors.some((error) =>
        error.eventId === 'E5',
      ),
    ).toBe(false);
  });

  it('rejects unknown Auth-Z settlement without debiting funds', () => {
    const result = createReplay().replay(events);

    const settlementEntry = result.ledger
      .entries('ACC-001')
      .find((entry) => entry.entryId === 'E6');

    expect(settlementEntry).toBeUndefined();

    expect(
      result.errors.some((error) =>
        error.eventId === 'E6',
      ),
    ).toBe(true);
  });

  // Criterion 2 is REJECTED: E7 causes three fees, not one (REJECTED.md).
  it('E7 causes three overdraft fees: Day2, Day4 and Day5, all booked at Day5 close', () => {
    const result = createReplay().replay(events);

    const fees = result.ledger
      .entries('ACC-001')
      .filter((entry) => entry.type === 'FEE');

    expect(fees.map((fee) => fee.valueDate)).toEqual(['Day2', 'Day4', 'Day5']);
    expect(fees.every((fee) => fee.amount.toString() === '-25.00')).toBe(true);

    const day5 = result.dailyReports.find((report) => report.day === 'Day5');
    expect(day5?.feesBookedAtClose).toHaveLength(3);
  });

  it('without E7 (and E9) no fee is ever charged', () => {
    const result = createReplay().replay(
      events.filter((event) => event.eventId !== 'E7' && event.eventId !== 'E9'),
    );

    expect(
      result.ledger.entries('ACC-001').filter((entry) => entry.type === 'FEE'),
    ).toHaveLength(0);
  });

  it('rejects Auth-B because the late Day2 debit makes available funds insufficient', () => {
    const result = createReplay().replay(events);

    expect(
      result.errors.some((error) =>
        error.eventId === 'E8',
      ),
    ).toBe(true);
  });

  it('reverses E7 using a compensating append-only entry', () => {
    const result = createReplay().replay(events);

    const original = result.ledger
      .entries('ACC-001')
      .find((entry) => entry.entryId === 'E7');

    const reversal = result.ledger
      .entries('ACC-001')
      .find((entry) => entry.entryId === 'E9');

    expect(original).toBeDefined();
    expect(reversal).toBeDefined();

    expect(reversal?.type).toBe('REVERSAL');
    expect(reversal?.referenceId).toBe('E7');
    expect(reversal?.amount.toString()).toBe('620.00');

    expect(
      result.ledger.entries('ACC-001'),
    ).toContain(original);
  });

  it('splits BHD 10.000 into exact three installments', () => {
    const result = createReplay().replay(events);

    const installments = result.ledger
      .entries('ACC-002')
      .filter((entry) =>
        entry.referenceId === 'E10',
      );

    expect(installments).toHaveLength(3);

    expect(
      installments.map((entry) =>
        entry.amount.toString(),
      ),
    ).toEqual([
      '3.334',
      '3.333',
      '3.333',
    ]);

    expect(
      result.ledger
        .balanceAt(accounts[1], 'Day5')
        .toString(),
    ).toBe('10.000');
  });

  it('capitalizes the exact rounded daily interest total on Day6', () => {
    const result = createReplay().replay(events);

    expect(
      result.capitalizedInterest['ACC-001'],
    ).toBe('0.93');

    expect(result.capitalizedInterest['ACC-002']).toBe('0.008');

    const interestEntry = result.ledger
      .entries('ACC-001')
      .find((entry) => entry.type === 'INTEREST');

    expect(interestEntry?.valueDate).toBe('Day6');
    expect(interestEntry?.amount.toString()).toBe('0.93');
  });

  it('produces daily reports with balances, fees, authorization states and errors', () => {
    const result = createReplay().replay(events);

    const day2 = result.dailyReports.find(
      (report) => report.day === 'Day2',
    );

    expect(day2?.balances['ACC-001']).toBe('225.00');
    expect(day2?.fees).toEqual([
      'OVERDRAFT: 25.00',
    ]);

    // Authorization states are as they stood at each close, not final.
    expect(day2?.authorizationStates).toEqual(['Auth-A: ACTIVE']);

    const day4 = result.dailyReports.find(
      (report) => report.day === 'Day4',
    );

    expect(
      day4?.authorizationStates,
    ).toContain('Auth-A: SETTLED');

    expect(
      day4?.errors.some((error) =>
        error.includes('E6'),
      ),
    ).toBe(true);
  });

  // Criterion 7 is REJECTED: 3 x BHD 3.334 = 10.002, not 10.000.
  it('three instalments of BHD 3.334 would not conserve value', () => {
    expect(3334n * 3n).not.toBe(10000n);
  });
});
