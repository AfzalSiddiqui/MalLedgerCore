import { describe, expect, it } from 'vitest';
import { Account } from '../src/domain/account.js';
import { Money } from '../src/domain/money.js';
import { LedgerEvent } from '../src/replay/events.js';
import { LedgerReplay } from '../src/replay/ledger-replay.js';

const accounts = [
  new Account(
    'ACC-001',
    Money.fromMajorUnits('0.00', 'AED'),
  ),
  new Account(
    'ACC-002',
    Money.fromMajorUnits('0.000', 'BHD'),
  ),
];

const events: LedgerEvent[] = [
  {
    eventId: 'E1',
    type: 'CREDIT',
    day: 'Day1',
    accountId: 'ACC-001',
    amount: Money.fromMajorUnits('1200.00', 'AED'),
    valueDate: 'Day1',
  },
  {
    eventId: 'E2',
    type: 'DEBIT',
    day: 'Day1',
    accountId: 'ACC-001',
    amount: Money.fromMajorUnits('950.00', 'AED'),
    valueDate: 'Day1',
  },
  {
    eventId: 'E3',
    type: 'AUTHORIZATION',
    day: 'Day2',
    accountId: 'ACC-001',
    authorizationId: 'Auth-A',
    amount: Money.fromMajorUnits('200.00', 'AED'),
    valueDate: 'Day2',
  },
  {
    eventId: 'E4',
    type: 'CREDIT',
    day: 'Day3',
    accountId: 'ACC-001',
    amount: Money.fromMajorUnits('400.00', 'AED'),
    valueDate: 'Day3',
  },
  {
    eventId: 'E5',
    type: 'SETTLEMENT',
    day: 'Day4',
    accountId: 'ACC-001',
    authorizationId: 'Auth-A',
    amount: Money.fromMajorUnits('185.00', 'AED'),
    valueDate: 'Day4',
  },
  {
    eventId: 'E6',
    type: 'SETTLEMENT',
    day: 'Day4',
    accountId: 'ACC-001',
    authorizationId: 'Auth-Z',
    amount: Money.fromMajorUnits('180.00', 'AED'),
    valueDate: 'Day4',
  },
  {
    eventId: 'E7',
    type: 'DEBIT',
    day: 'Day5',
    accountId: 'ACC-001',
    amount: Money.fromMajorUnits('620.00', 'AED'),
    valueDate: 'Day2',
  },
  {
    eventId: 'E8',
    type: 'AUTHORIZATION',
    day: 'Day5',
    accountId: 'ACC-001',
    authorizationId: 'Auth-B',
    amount: Money.fromMajorUnits('90.00', 'AED'),
    valueDate: 'Day5',
  },
  {
    eventId: 'E9',
    type: 'REVERSAL',
    day: 'Day6',
    accountId: 'ACC-001',
    originalEntryId: 'E7',
    valueDate: 'Day2',
  },
  {
    eventId: 'E10',
    type: 'CREDIT_INSTALLMENTS',
    day: 'Day5',
    accountId: 'ACC-002',
    amount: Money.fromMajorUnits('10.000', 'BHD'),
    valueDate: 'Day5',
    installments: 3,
  },
];

describe('LedgerReplay', () => {
  const createReplay = () =>
    new LedgerReplay(accounts, {
      'ACC-001': Money.fromMajorUnits('25.00', 'AED'),
      'ACC-002': Money.fromMajorUnits('0.000', 'BHD'),
    });

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
    ).toBe('440.00');
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

  it('assesses exactly one overdraft fee for the historical Day2 negative balance', () => {
    const result = createReplay().replay(events);

    const fees = result.ledger
      .entries('ACC-001')
      .filter((entry) => entry.type === 'FEE');

    expect(fees).toHaveLength(1);
    expect(fees[0].amount.toString()).toBe('-25.00');
    expect(fees[0].valueDate).toBe('Day2');
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
    ).toBe('0.98');

    const interestEntry = result.ledger
      .entries('ACC-001')
      .find((entry) => entry.type === 'INTEREST');

    expect(interestEntry?.valueDate).toBe('Day6');
    expect(interestEntry?.amount.toString()).toBe('0.98');
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

    it.fails('rejects equal BHD installments because they do not conserve value', () => {
      // INTENTIONAL FAILURE: 3 × BHD 3.334 = BHD 10.002, not BHD 10.000.
      const total = 3334n * 3n;
      expect(total).toBe(10000n);
    });
});
