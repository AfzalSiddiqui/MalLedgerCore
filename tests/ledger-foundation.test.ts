import { describe, expect, it } from 'vitest';
import { Account } from '../src/domain/account.js';
import { AppendOnlyLedger } from '../src/domain/append-only-ledger.js';
import { Money } from '../src/domain/money.js';

describe('Money', () => {
  it('represents AED using two decimal places', () => {
    const money = Money.fromMajorUnits('1200.00', 'AED');

    expect(money.amount).toBe(120000n);
    expect(money.toString()).toBe('1200.00');
  });

  it('represents BHD using three decimal places', () => {
    const money = Money.fromMajorUnits('10.000', 'BHD');

    expect(money.amount).toBe(10000n);
    expect(money.toString()).toBe('10.000');
  });

  it('rejects excess currency precision', () => {
    expect(() => Money.fromMajorUnits('10.001', 'AED')).toThrow();
  });
});

describe('AppendOnlyLedger', () => {
  it('calculates a value-dated balance', () => {
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('0.00', 'AED'),
    );

    const ledger = new AppendOnlyLedger();

    ledger.append(account, {
      entryId: 'E1',
      accountId: 'ACC-001',
      type: 'CREDIT',
      amount: Money.fromMajorUnits('1200.00', 'AED'),
      valueDate: 'Day1',
    });

    ledger.append(account, {
      entryId: 'E2',
      accountId: 'ACC-001',
      type: 'DEBIT',
      amount: Money.fromMajorUnits('-950.00', 'AED'),
      valueDate: 'Day1',
    });

    expect(ledger.balanceAt(account, 'Day1').toString()).toBe('250.00');
  });

  it('does not allow callers to mutate the stored entry collection', () => {
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('0.00', 'AED'),
    );

    const ledger = new AppendOnlyLedger();

    ledger.append(account, {
      entryId: 'E1',
      accountId: 'ACC-001',
      type: 'CREDIT',
      amount: Money.fromMajorUnits('100.00', 'AED'),
      valueDate: 'Day1',
    });

    const entries = ledger.entries(account.id);

    const mutableCopy = [...entries];
    mutableCopy.pop();

    expect(ledger.entries(account.id)).toHaveLength(1);
  });
});

