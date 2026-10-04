import { describe, expect, it } from 'vitest';

import { Account } from '../src/domain/account.js';
import { AppendOnlyLedger } from '../src/domain/append-only-ledger.js';
import { InterestService } from '../src/domain/interest-service.js';
import { Money } from '../src/domain/money.js';

describe('InterestService', () => {
  it('calculates rounded daily interest for a positive AED balance', () => {
    const ledger = new AppendOnlyLedger();
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('0.00', 'AED'),
    );

    ledger.append(account, {
      entryId: 'E1',
      accountId: account.id,
      type: 'CREDIT',
      amount: Money.fromMajorUnits('465.00', 'AED'),
      valueDate: 'Day4',
    });

    const service = new InterestService(ledger);
    const accrual = service.accrueForDay(account, 'Day4');

    expect(accrual.baseBalance.toString()).toBe('465.00');
    expect(accrual.amount.toString()).toBe('0.19');
  });

  it('does not accrue interest on a negative balance', () => {
    const ledger = new AppendOnlyLedger();
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('0.00', 'AED'),
    );

    ledger.append(account, {
      entryId: 'E1',
      accountId: account.id,
      type: 'DEBIT',
      amount: Money.fromMajorUnits('-100.00', 'AED'),
      valueDate: 'Day2',
    });

    const service = new InterestService(ledger);
    const accrual = service.accrueForDay(account, 'Day2');

    expect(accrual.amount.toString()).toBe('0.00');
  });

  it('calculates interest using BHD precision', () => {
    const ledger = new AppendOnlyLedger();
    const account = new Account(
      'ACC-002',
      Money.fromMajorUnits('0.000', 'BHD'),
    );

    ledger.append(account, {
      entryId: 'E10',
      accountId: account.id,
      type: 'CREDIT',
      amount: Money.fromMajorUnits('10.000', 'BHD'),
      valueDate: 'Day5',
    });

    const service = new InterestService(ledger);
    const accrual = service.accrueForDay(account, 'Day5');

    expect(accrual.amount.toString()).toBe('0.004');
  });

  it('does not accrue interest on a zero balance', () => {
    const ledger = new AppendOnlyLedger();
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('0.00', 'AED'),
    );

    const service = new InterestService(ledger);
    const accrual = service.accrueForDay(account, 'Day1');

    expect(accrual.amount.toString()).toBe('0.00');
  });

  it('calculates interest across the six assessment days', () => {
    const ledger = new AppendOnlyLedger();
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('0.00', 'AED'),
    );

    ledger.append(account, {
      entryId: 'E1',
      accountId: account.id,
      type: 'CREDIT',
      amount: Money.fromMajorUnits('1200.00', 'AED'),
      valueDate: 'Day1',
    });

    ledger.append(account, {
      entryId: 'E2',
      accountId: account.id,
      type: 'DEBIT',
      amount: Money.fromMajorUnits('-950.00', 'AED'),
      valueDate: 'Day1',
    });

    ledger.append(account, {
      entryId: 'E7',
      accountId: account.id,
      type: 'DEBIT',
      amount: Money.fromMajorUnits('-620.00', 'AED'),
      valueDate: 'Day2',
    });

    ledger.append(account, {
      entryId: 'E4',
      accountId: account.id,
      type: 'CREDIT',
      amount: Money.fromMajorUnits('400.00', 'AED'),
      valueDate: 'Day3',
    });

    ledger.append(account, {
      entryId: 'E5',
      accountId: account.id,
      type: 'DEBIT',
      amount: Money.fromMajorUnits('-185.00', 'AED'),
      valueDate: 'Day4',
    });

    ledger.append(account, {
      entryId: 'E9',
      accountId: account.id,
      type: 'REVERSAL',
      amount: Money.fromMajorUnits('620.00', 'AED'),
      valueDate: 'Day2',
      referenceId: 'E7',
    });

    const service = new InterestService(ledger);

    const accruals = service.accrueForDays(account, [
      'Day1',
      'Day2',
      'Day3',
      'Day4',
      'Day5',
      'Day6',
    ]);

    expect(accruals.map((accrual) => accrual.amount.toString())).toEqual([
      '0.10',
      '0.10',
      '0.26',
      '0.19',
      '0.19',
      '0.19',
    ]);

    expect(
      service
        .totalAccrued(account, [
          'Day1',
          'Day2',
          'Day3',
          'Day4',
          'Day5',
          'Day6',
        ])
        .toString(),
    ).toBe('1.03');
  });

  it('capitalizes the exact sum of rounded daily accruals once', () => {
    const ledger = new AppendOnlyLedger();

    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('0.00', 'AED'),
    );

    ledger.append(account, {
      entryId: 'E1',
      accountId: account.id,
      type: 'CREDIT',
      amount: Money.fromMajorUnits('465.00', 'AED'),
      valueDate: 'Day1',
    });

    const service = new InterestService(ledger);

    const total = service.capitalize(
      account,
      'Day6',
      ['Day1', 'Day2', 'Day3'],
    );

    expect(total.toString()).toBe('0.57');

    const interestEntries = ledger
      .entries(account.id)
      .filter((entry) => entry.type === 'INTEREST');

    expect(interestEntries).toHaveLength(1);
    expect(interestEntries[0]?.amount.toString()).toBe('0.57');
    expect(interestEntries[0]?.valueDate).toBe('Day6');
  });

  it('rejects duplicate interest capitalization for the same date', () => {
    const ledger = new AppendOnlyLedger();

    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('465.00', 'AED'),
    );

    const service = new InterestService(ledger);

    service.capitalize(
      account,
      'Day6',
      ['Day1'],
    );

    expect(() =>
      service.capitalize(
        account,
        'Day6',
        ['Day1'],
      ),
    ).toThrow('Interest already capitalized for Day6');
  });
});
