import { describe, expect, it } from 'vitest';

import { Account } from '../src/domain/account.js';
import { AppendOnlyLedger } from '../src/domain/append-only-ledger.js';
import { AuthorizationService } from '../src/domain/authorization-service.js';
import { FeeService } from '../src/domain/fee-service.js';
import { Money } from '../src/domain/money.js';
import { SettlementService } from '../src/domain/settlement-service.js';
import { compareValueDates } from '../src/domain/value-date.js';
import { LedgerEvent } from '../src/replay/events.js';
import { LedgerReplay } from '../src/replay/ledger-replay.js';

const aed = (value: string) => Money.fromMajorUnits(value, 'AED');

// The fixture event union only admits E1–E10; these tests need other shapes.
const events = (list: readonly object[]) =>
  list as unknown as readonly LedgerEvent[];

function fundedAccount(balance = '100.00') {
  const account = new Account('ACC-001', aed('0.00'));
  const ledger = new AppendOnlyLedger();

  ledger.append(account, {
    entryId: 'OPEN',
    accountId: account.id,
    type: 'CREDIT',
    amount: aed(balance),
    valueDate: 'Day1',
  });

  const authorizations = new AuthorizationService(ledger);
  const settlements = new SettlementService(ledger, authorizations);

  return { account, ledger, authorizations, settlements };
}

describe('Correctness fixes', () => {
  // 1
  it('rejects a negative settlement instead of crediting the account', () => {
    const { account, ledger, authorizations, settlements } = fundedAccount();

    authorizations.authorize(account, 'AUTH', aed('50.00'), 'Day1');

    const settlement = settlements.settle(
      account,
      'S1',
      'AUTH',
      aed('-500.00'),
      'Day1',
    );

    expect(settlement.status).toBe('REJECTED');
    expect(settlement.rejectionReason).toBe('NON_POSITIVE_AMOUNT');
    expect(ledger.balanceAt(account, 'Day1').toString()).toBe('100.00');
    expect(authorizations.holdsFor(account.id)[0].status).toBe('ACTIVE');
  });

  // 2
  it('rejects a duplicate ledger entry ID', () => {
    const { account, ledger } = fundedAccount();
    const entry = {
      entryId: 'E1',
      accountId: account.id,
      type: 'CREDIT' as const,
      amount: aed('10.00'),
      valueDate: 'Day1',
    };

    ledger.append(account, entry);

    expect(() => ledger.append(account, entry)).toThrow('Duplicate entry E1');
    expect(ledger.balanceAt(account, 'Day1').toString()).toBe('110.00');
  });

  it('ignores a redelivered event during replay', () => {
    const account = new Account('ACC-001', aed('0.00'));
    const credit = {
      eventId: 'E1',
      type: 'CREDIT',
      day: 'Day1',
      accountId: 'ACC-001',
      amount: aed('100.00'),
      valueDate: 'Day1',
    };

    const result = new LedgerReplay([account], {}).replay(
      events([credit, credit]),
    );

    expect(result.ledger.balanceAt(account, 'Day1').toString()).toBe('100.00');
    expect(result.errors[0].message).toBe('Duplicate event E1 ignored');
  });

  // 3
  it('rejects a zero settlement and keeps the hold active', () => {
    const { account, authorizations, settlements } = fundedAccount();

    authorizations.authorize(account, 'AUTH', aed('50.00'), 'Day1');

    const settlement = settlements.settle(
      account,
      'S1',
      'AUTH',
      aed('0.00'),
      'Day1',
    );

    expect(settlement.status).toBe('REJECTED');
    expect(authorizations.holdsFor(account.id)[0].status).toBe('ACTIVE');
  });

  it('rejects a negative debit event instead of crediting the account', () => {
    const account = new Account('ACC-001', aed('100.00'));

    const result = new LedgerReplay([account], {}).replay(
      events([
        {
          eventId: 'D1',
          type: 'DEBIT',
          day: 'Day1',
          accountId: 'ACC-001',
          amount: aed('-50.00'),
          valueDate: 'Day1',
        },
      ]),
    );

    expect(result.ledger.balanceAt(account, 'Day1').toString()).toBe('100.00');
    expect(result.errors[0].message).toContain('must be positive');
  });

  // 4
  it('orders value dates chronologically, not as strings', () => {
    const { account, ledger } = fundedAccount();

    ledger.append(account, {
      entryId: 'LATE',
      accountId: account.id,
      type: 'CREDIT',
      amount: aed('5.00'),
      valueDate: 'Day10',
    });

    expect(compareValueDates('Day10', 'Day2')).toBe(8);
    expect(ledger.balanceAt(account, 'Day2').toString()).toBe('100.00');
    expect(ledger.balanceAt(account, 'Day10').toString()).toBe('105.00');
    expect(() => compareValueDates('Day1', '2026-10-01')).toThrow();
  });

  // 5
  it('assesses the overdraft fee on the closing balance, not intraday', () => {
    const account = new Account('ACC-001', aed('0.00'));

    const result = new LedgerReplay([account], {
      'ACC-001': aed('25.00'),
    }).replay(
      events([
        {
          eventId: 'D1',
          type: 'DEBIT',
          day: 'Day1',
          accountId: 'ACC-001',
          amount: aed('100.00'),
          valueDate: 'Day1',
        },
        {
          eventId: 'C1',
          type: 'CREDIT',
          day: 'Day1',
          accountId: 'ACC-001',
          amount: aed('500.00'),
          valueDate: 'Day1',
        },
      ]),
    );

    const fees = result.ledger
      .entries('ACC-001')
      .filter((entry) => entry.type === 'FEE');

    expect(fees).toHaveLength(0);
  });

  // 6 is a documented policy decision (AMBIGUITIES.md), pinned here.
  it('re-checks every value date at each close, so a back-valued debit is charged', () => {
    const account = new Account('ACC-001', aed('0.00'));

    const result = new LedgerReplay([account], {
      'ACC-001': aed('25.00'),
    }).replay(
      events([
        { eventId: 'C1', type: 'CREDIT', day: 'Day1', accountId: 'ACC-001', amount: aed('100.00'), valueDate: 'Day1' },
        { eventId: 'D1', type: 'DEBIT', day: 'Day2', accountId: 'ACC-001', amount: aed('80.00'), valueDate: 'Day2' },
        { eventId: 'D2', type: 'DEBIT', day: 'Day3', accountId: 'ACC-001', amount: aed('50.00'), valueDate: 'Day1' },
      ]),
    );

    const feeDates = result.ledger
      .entries('ACC-001')
      .filter((entry) => entry.type === 'FEE')
      .map((entry) => entry.valueDate);

    // D2 (posted Day3, value Day1) leaves Day1 at 50.00 but turns Day2 into
    // -30.00. Day3's close re-checks Day1..Day3 and charges Day2 (back-valued)
    // and Day3; each later close charges its own day while it stays negative.
    expect(feeDates).toEqual(['Day2', 'Day3', 'Day4', 'Day5', 'Day6']);
    expect(result.ledger.balanceAt(account, 'Day1').toString()).toBe('50.00');
  });

  // 7
  it('assesses an overdraft caused by a settlement', () => {
    const account = new Account('ACC-001', aed('0.00'));

    const result = new LedgerReplay([account], {
      'ACC-001': aed('25.00'),
    }).replay(
      events([
        { eventId: 'C1', type: 'CREDIT', day: 'Day1', accountId: 'ACC-001', amount: aed('100.00'), valueDate: 'Day1' },
        { eventId: 'A1', type: 'AUTHORIZATION', day: 'Day1', accountId: 'ACC-001', authorizationId: 'AUTH', amount: aed('100.00'), valueDate: 'Day1' },
        { eventId: 'D1', type: 'DEBIT', day: 'Day2', accountId: 'ACC-001', amount: aed('60.00'), valueDate: 'Day1' },
        { eventId: 'S1', type: 'SETTLEMENT', day: 'Day3', accountId: 'ACC-001', authorizationId: 'AUTH', amount: aed('100.00'), valueDate: 'Day3' },
      ]),
    );

    const fees = result.ledger
      .entries('ACC-001')
      .filter((entry) => entry.type === 'FEE');

    // Day3 goes negative (-60.00) and stays negative to the end of the
    // window, so every close from Day3 to Day6 charges one fee.
    expect(fees.map((fee) => fee.valueDate)).toEqual(['Day3', 'Day4', 'Day5', 'Day6']);
  });

  // 8
  it('never books a zero-value fee when no fee is configured', () => {
    const account = new Account('ACC-002', Money.zero('BHD'));

    const result = new LedgerReplay([account], {}).replay(
      events([
        {
          eventId: 'D1',
          type: 'DEBIT',
          day: 'Day1',
          accountId: 'ACC-002',
          amount: Money.fromMajorUnits('1.000', 'BHD'),
          valueDate: 'Day1',
        },
      ]),
    );

    expect(
      result.ledger.entries('ACC-002').map((entry) => entry.type),
    ).toEqual(['DEBIT']);
    expect(result.dailyReports[0].fees).toEqual([]);
  });

  it('skips a zero fee directly in FeeService', () => {
    const { account, ledger } = fundedAccount('0.00');

    ledger.append(account, {
      entryId: 'D1',
      accountId: account.id,
      type: 'DEBIT',
      amount: aed('-1.00'),
      valueDate: 'Day1',
    });

    expect(
      new FeeService(ledger, aed('0.00')).assessOverdraft(account, 'Day1'),
    ).toBeNull();
  });

  // 9
  it('records a refused authorization as DECLINED, distinct from RELEASED', () => {
    const { account, authorizations } = fundedAccount('10.00');

    const hold = authorizations.authorize(account, 'BIG', aed('50.00'), 'Day1');

    expect(hold.status).toBe('DECLINED');
    expect(authorizations.availableBalance(account, 'Day1').toString()).toBe(
      '10.00',
    );
  });

  // 10
  it('gives each settlement rejection its own reason', () => {
    const { account, authorizations, settlements } = fundedAccount('1000.00');

    authorizations.authorize(account, 'A1', aed('100.00'), 'Day1');

    expect(
      settlements.settle(account, 'S1', 'A1', aed('150.00'), 'Day1')
        .rejectionReason,
    ).toBe('AMOUNT_EXCEEDS_HOLD');
    expect(
      settlements.settle(account, 'S2', 'NOPE', aed('10.00'), 'Day1')
        .rejectionReason,
    ).toBe('UNKNOWN_AUTHORIZATION');
    expect(
      settlements.settle(
        account,
        'S3',
        'A1',
        Money.fromMajorUnits('1.000', 'BHD'),
        'Day1',
      ).rejectionReason,
    ).toBe('CURRENCY_MISMATCH');

    settlements.settle(account, 'S4', 'A1', aed('100.00'), 'Day1');

    expect(
      settlements.settle(account, 'S5', 'A1', aed('10.00'), 'Day1')
        .rejectionReason,
    ).toBe('AUTHORIZATION_NOT_ACTIVE');
  });

  it('reports the real reason for an over-capture during replay', () => {
    const account = new Account('ACC-001', aed('0.00'));

    const result = new LedgerReplay([account], {}).replay(
      events([
        { eventId: 'C1', type: 'CREDIT', day: 'Day1', accountId: 'ACC-001', amount: aed('1000.00'), valueDate: 'Day1' },
        { eventId: 'A1', type: 'AUTHORIZATION', day: 'Day1', accountId: 'ACC-001', authorizationId: 'AUTH', amount: aed('100.00'), valueDate: 'Day1' },
        { eventId: 'S1', type: 'SETTLEMENT', day: 'Day1', accountId: 'ACC-001', authorizationId: 'AUTH', amount: aed('150.00'), valueDate: 'Day1' },
      ]),
    );

    expect(result.errors[0].message).toBe(
      'Settlement S1 rejected: amount exceeds the hold for authorization AUTH',
    );
  });

  // 11
  it('refuses a second replay on the same instance without touching state', () => {
    const account = new Account('ACC-001', aed('0.00'));
    const replay = new LedgerReplay([account], {});
    const stream = events([
      { eventId: 'E1', type: 'CREDIT', day: 'Day1', accountId: 'ACC-001', amount: aed('100.00'), valueDate: 'Day1' },
    ]);

    const first = replay.replay(stream);
    const entriesBefore = first.ledger.entries('ACC-001').length;

    expect(() => replay.replay(stream)).toThrow('already replayed');
    expect(first.ledger.entries('ACC-001')).toHaveLength(entriesBefore);
  });

  // 12
  it('posts a batch all-or-nothing', () => {
    const { account, ledger } = fundedAccount();

    expect(() =>
      ledger.appendAll(account, [
        { entryId: 'X-1', accountId: account.id, type: 'CREDIT', amount: aed('1.00'), valueDate: 'Day1' },
        { entryId: 'X-2', accountId: account.id, type: 'CREDIT', amount: Money.fromMajorUnits('1.000', 'BHD'), valueDate: 'Day1' },
      ]),
    ).toThrow('currency');

    expect(ledger.hasEntry('X-1')).toBe(false);
    expect(ledger.balanceAt(account, 'Day1').toString()).toBe('100.00');
  });

  // 13
  it('rejects malformed money strings', () => {
    for (const value of ['1.2.3', '1.-5', '.5', '12abc', '', '1,000.00']) {
      expect(() => Money.fromMajorUnits(value, 'AED')).toThrow('Invalid AED amount');
    }

    expect(Money.fromMajorUnits('-0.50', 'AED').toString()).toBe('-0.50');
    expect(Money.fromMajorUnits('10', 'BHD').toString()).toBe('10.000');
  });
});
