import { describe, expect, it } from 'vitest';
import { Account } from '../src/domain/account.js';
import { AppendOnlyLedger } from '../src/domain/append-only-ledger.js';
import { AuthorizationService } from '../src/domain/authorization-service.js';
import { Money } from '../src/domain/money.js';
import { SettlementService } from '../src/domain/settlement-service.js';

describe('SettlementService', () => {
  it('settles a valid authorization and releases the hold', () => {
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('850.00', 'AED'),
    );

    const ledger = new AppendOnlyLedger();
    const authorizationService = new AuthorizationService(ledger);
    const settlementService = new SettlementService(
      ledger,
      authorizationService,
    );

    authorizationService.authorize(
      account,
      'Auth-A',
      Money.fromMajorUnits('200.00', 'AED'),
      'Day2',
    );

    const settlement = settlementService.settle(
      account,
      'E5',
      'Auth-A',
      Money.fromMajorUnits('185.00', 'AED'),
      'Day4',
    );

    expect(settlement.status).toBe('SETTLED');
    expect(ledger.balanceAt(account, 'Day4').toString()).toBe('665.00');
    expect(
      authorizationService.availableBalance(account, 'Day4').toString(),
    ).toBe('665.00');
  });

  it('rejects settlement when authorization does not exist', () => {
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('850.00', 'AED'),
    );

    const ledger = new AppendOnlyLedger();
    const authorizationService = new AuthorizationService(ledger);
    const settlementService = new SettlementService(
      ledger,
      authorizationService,
    );

    const settlement = settlementService.settle(
      account,
      'E6',
      'Auth-Z',
      Money.fromMajorUnits('180.00', 'AED'),
      'Day4',
    );

    expect(settlement.status).toBe('REJECTED');
    expect(ledger.balanceAt(account, 'Day4').toString()).toBe('850.00');
  });

  it('rejects settlement greater than the authorization hold', () => {
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('850.00', 'AED'),
    );

    const ledger = new AppendOnlyLedger();
    const authorizationService = new AuthorizationService(ledger);
    const settlementService = new SettlementService(
      ledger,
      authorizationService,
    );

    authorizationService.authorize(
      account,
      'Auth-A',
      Money.fromMajorUnits('100.00', 'AED'),
      'Day2',
    );

    const settlement = settlementService.settle(
      account,
      'E5',
      'Auth-A',
      Money.fromMajorUnits('120.00', 'AED'),
      'Day4',
    );

    expect(settlement.status).toBe('REJECTED');
    expect(ledger.balanceAt(account, 'Day4').toString()).toBe('850.00');
    expect(
      authorizationService.availableBalance(account, 'Day4').toString(),
    ).toBe('750.00');
  });
});
