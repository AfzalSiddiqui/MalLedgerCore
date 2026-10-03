import { describe, expect, it } from 'vitest';
import { Account } from '../src/domain/account.js';
import { AppendOnlyLedger } from '../src/domain/append-only-ledger.js';
import { FeeService } from '../src/domain/fee-service.js';
import { Money } from '../src/domain/money.js';

describe('FeeService', () => {
  it('assesses an overdraft fee when the closing balance is negative', () => {
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('250.00', 'AED'),
    );

    const ledger = new AppendOnlyLedger();

    ledger.append(account, {
      entryId: 'E7',
      accountId: 'ACC-001',
      type: 'DEBIT',
      amount: Money.fromMajorUnits('-620.00', 'AED'),
      valueDate: 'Day2',
    });

    const service = new FeeService(
      ledger,
      Money.fromMajorUnits('25.00', 'AED'),
    );

    const assessment = service.assessOverdraft(
      account,
      'Day2',
    );

    expect(assessment?.status).toBe('ASSESSED');
    expect(assessment?.amount.toString()).toBe('25.00');

    expect(ledger.balanceAt(account, 'Day2').toString()).toBe(
      '-395.00',
    );
  });

  it('assesses at most one overdraft fee per account per day', () => {
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('250.00', 'AED'),
    );

    const ledger = new AppendOnlyLedger();

    ledger.append(account, {
      entryId: 'E7',
      accountId: 'ACC-001',
      type: 'DEBIT',
      amount: Money.fromMajorUnits('-620.00', 'AED'),
      valueDate: 'Day2',
    });

    const service = new FeeService(
      ledger,
      Money.fromMajorUnits('25.00', 'AED'),
    );

    const first = service.assessOverdraft(account, 'Day2');
    const second = service.assessOverdraft(account, 'Day2');

    expect(first?.status).toBe('ASSESSED');
    expect(second).toBeNull();

    expect(service.assessmentsFor(account.id)).toHaveLength(1);
  });

  it('does not assess a fee when the closing balance is zero or positive', () => {
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('250.00', 'AED'),
    );

    const ledger = new AppendOnlyLedger();

    const service = new FeeService(
      ledger,
      Money.fromMajorUnits('25.00', 'AED'),
    );

    const assessment = service.assessOverdraft(
      account,
      'Day1',
    );

    expect(assessment).toBeNull();
    expect(ledger.entries(account.id)).toHaveLength(0);
  });
});

