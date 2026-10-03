import { describe, expect, it } from 'vitest';
import { Account } from '../src/domain/account.js';
import { AppendOnlyLedger } from '../src/domain/append-only-ledger.js';
import { Money } from '../src/domain/money.js';
import { ReversalService } from '../src/domain/reversal-service.js';

describe('ReversalService', () => {
  it('reverses an existing entry without changing the original entry', () => {
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('0.00', 'AED'),
    );

    const ledger = new AppendOnlyLedger();

    ledger.append(account, {
      entryId: 'E7',
      accountId: 'ACC-001',
      type: 'DEBIT',
      amount: Money.fromMajorUnits('-620.00', 'AED'),
      valueDate: 'Day2',
    });

    const service = new ReversalService(ledger);

    const reversal = service.reverse(
      account,
      'E9',
      'E7',
      'Day6',
    );

    expect(reversal.status).toBe('REVERSED');
    expect(reversal.amount.toString()).toBe('620.00');

    expect(ledger.balanceAt(account, 'Day2').toString()).toBe('0.00');

    const entries = ledger.entries(account.id);

    expect(entries).toHaveLength(2);

    expect(entries[0]).toMatchObject({
      entryId: 'E7',
      type: 'DEBIT',
      valueDate: 'Day2',
    });

    expect(entries[0].amount.toString()).toBe('-620.00');

    expect(entries[1]).toMatchObject({
      entryId: 'E9',
      type: 'REVERSAL',
      valueDate: 'Day2',
      referenceId: 'E7',
    });

    expect(entries[1].amount.toString()).toBe('620.00');
  });

  it('rejects a reversal when the original entry does not exist', () => {
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('0.00', 'AED'),
    );

    const ledger = new AppendOnlyLedger();
    const service = new ReversalService(ledger);

    const reversal = service.reverse(
      account,
      'E9',
      'UNKNOWN',
      'Day6',
    );

    expect(reversal.status).toBe('REJECTED');
    expect(ledger.entries(account.id)).toHaveLength(0);
  });

  it('rejects a duplicate reversal', () => {
    const account = new Account(
      'ACC-001',
      Money.fromMajorUnits('0.00', 'AED'),
    );

    const ledger = new AppendOnlyLedger();

    ledger.append(account, {
      entryId: 'E7',
      accountId: 'ACC-001',
      type: 'DEBIT',
      amount: Money.fromMajorUnits('-620.00', 'AED'),
      valueDate: 'Day2',
    });

    const service = new ReversalService(ledger);

    const first = service.reverse(
      account,
      'E9',
      'E7',
      'Day6',
    );

    const second = service.reverse(
      account,
      'E10',
      'E7',
      'Day6',
    );

    expect(first.status).toBe('REVERSED');
    expect(second.status).toBe('REJECTED');
    expect(ledger.entries(account.id)).toHaveLength(2);
  });
});
