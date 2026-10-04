import { describe, expect, it } from 'vitest';
import { Account } from '../src/domain/account.js';
import { AppendOnlyLedger } from '../src/domain/append-only-ledger.js';
import { AuthorizationService } from '../src/domain/authorization-service.js';
import { Money } from '../src/domain/money.js';

describe('AuthorizationService', () => {
  it('approves a hold when sufficient available balance exists', () => {
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('250.00', 'AED'),
    );

    const ledger = new AppendOnlyLedger();
    const service = new AuthorizationService(ledger);

    const hold = service.authorize(
      account,
      'Auth-A',
      Money.fromMajorUnits('200.00', 'AED'),
      'Day1',
    );

    expect(hold.status).toBe('ACTIVE');
    expect(service.availableBalance(account, 'Day1').toString()).toBe(
      '50.00',
    );
  });

  it('does not change the ledger balance when a hold is created', () => {
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('250.00', 'AED'),
    );

    const ledger = new AppendOnlyLedger();
    const service = new AuthorizationService(ledger);

    service.authorize(
      account,
      'Auth-A',
      Money.fromMajorUnits('200.00', 'AED'),
      'Day1',
    );

    expect(ledger.balanceAt(account, 'Day1').toString()).toBe('250.00');
  });

  it('rejects a hold when available balance is insufficient', () => {
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('250.00', 'AED'),
    );

    const ledger = new AppendOnlyLedger();
    const service = new AuthorizationService(ledger);

    const hold = service.authorize(
      account,
      'Auth-A',
      Money.fromMajorUnits('250.01', 'AED'),
      'Day1',
    );

    // Declined, not released: nothing was ever reserved.
    expect(hold.status).toBe('DECLINED');
    expect(service.availableBalance(account, 'Day1').toString()).toBe(
      '250.00',
    );
  });

  it('considers multiple active holds when calculating available balance', () => {
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('500.00', 'AED'),
    );

    const ledger = new AppendOnlyLedger();
    const service = new AuthorizationService(ledger);

    service.authorize(
      account,
      'Auth-A',
      Money.fromMajorUnits('200.00', 'AED'),
      'Day1',
    );

    service.authorize(
      account,
      'Auth-B',
      Money.fromMajorUnits('150.00', 'AED'),
      'Day1',
    );

    expect(service.availableBalance(account, 'Day1').toString()).toBe(
      '150.00',
    );
  });
});

