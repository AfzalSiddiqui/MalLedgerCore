import { describe, expect, it } from 'vitest';

import { Account } from '../src/domain/account.js';
import { AppendOnlyLedger } from '../src/domain/append-only-ledger.js';
import { AuthorizationService } from '../src/domain/authorization-service.js';
import { Money } from '../src/domain/money.js';
import { SettlementService } from '../src/domain/settlement-service.js';
import { LedgerEvent } from '../src/replay/events.js';
import { LedgerReplay } from '../src/replay/ledger-replay.js';

const aed = (value: string) => Money.fromMajorUnits(value, 'AED');

function setup(opening = '100.00') {
  const account = new Account('ACC-001', aed(opening));
  const ledger = new AppendOnlyLedger();
  const authorizations = new AuthorizationService(ledger);
  const settlements = new SettlementService(ledger, authorizations);

  return { account, ledger, authorizations, settlements };
}

describe('Authorization lifecycle', () => {
  it('a duplicate authorization ID returns the original decision and reserves nothing twice', () => {
    const { account, authorizations } = setup();

    const first = authorizations.authorize(account, 'AUTH', aed('60.00'), 'Day1');
    const second = authorizations.authorize(account, 'AUTH', aed('60.00'), 'Day1');

    expect(second).toBe(first);
    expect(authorizations.holdsFor(account.id)).toHaveLength(1);
    expect(authorizations.availableBalance(account, 'Day1').toString()).toBe('40.00');
  });

  it('releasing an active hold frees the funds and leaves the ledger untouched', () => {
    const { account, ledger, authorizations } = setup();

    authorizations.authorize(account, 'AUTH', aed('60.00'), 'Day1');

    expect(authorizations.release(account, 'AUTH')).toBe('RELEASED');
    expect(authorizations.find(account.id, 'AUTH')?.status).toBe('RELEASED');
    expect(authorizations.availableBalance(account, 'Day1').toString()).toBe('100.00');
    expect(ledger.entries(account.id)).toHaveLength(0);
  });

  it('only an active hold can be released', () => {
    const { account, authorizations } = setup('10.00');

    authorizations.authorize(account, 'DECLINED', aed('60.00'), 'Day1');

    expect(authorizations.release(account, 'NOPE')).toBe('UNKNOWN_AUTHORIZATION');
    expect(authorizations.release(account, 'DECLINED')).toBe('AUTHORIZATION_NOT_ACTIVE');
  });

  it('a released hold can no longer be settled', () => {
    const { account, ledger, authorizations, settlements } = setup();

    authorizations.authorize(account, 'AUTH', aed('60.00'), 'Day1');
    authorizations.release(account, 'AUTH');

    const settlement = settlements.settle(account, 'S1', 'AUTH', aed('60.00'), 'Day2');

    expect(settlement.status).toBe('REJECTED');
    expect(settlement.rejectionReason).toBe('AUTHORIZATION_NOT_ACTIVE');
    expect(ledger.entries(account.id)).toHaveLength(0);
  });

  it('the replay handles release events and flags duplicate authorization requests', () => {
    const account = new Account('ACC-001', aed('100.00'));

    const result = new LedgerReplay([account], { 'ACC-001': aed('25.00') }).replay([
      { eventId: 'A1', type: 'AUTHORIZATION', day: 'Day1', accountId: 'ACC-001', authorizationId: 'AUTH', amount: aed('60.00'), valueDate: 'Day1' },
      { eventId: 'A1-retry', type: 'AUTHORIZATION', day: 'Day1', accountId: 'ACC-001', authorizationId: 'AUTH', amount: aed('60.00'), valueDate: 'Day1' },
      { eventId: 'R1', type: 'AUTHORIZATION_RELEASE', day: 'Day2', accountId: 'ACC-001', authorizationId: 'AUTH', valueDate: 'Day2' },
    ] as unknown as readonly LedgerEvent[]);

    expect(
      result.errors.some((error) => error.eventId === 'A1-retry' && error.message.startsWith('WARNING')),
    ).toBe(true);
    expect(result.dailyReports[0].authorizationStates).toEqual(['AUTH: ACTIVE']);
    expect(result.dailyReports[1].authorizationStates).toEqual(['AUTH: RELEASED']);
  });
});
