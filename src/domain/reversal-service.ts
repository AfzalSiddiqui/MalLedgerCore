import { Account } from './account.js';
import { AppendOnlyLedger } from './append-only-ledger.js';
import { Money } from './money.js';
import { Reversal } from './reversal.js';

export class ReversalService {
  constructor(private readonly ledger: AppendOnlyLedger) {}

  reverse(
    account: Account,
    reversalId: string,
    originalEntryId: string,
    valueDate: string,
  ): Reversal {
    const originalEntry = this.ledger
      .entries(account.id)
      .find((entry) => entry.entryId === originalEntryId);

    if (!originalEntry) {
      return {
        reversalId,
        originalEntryId,
        accountId: account.id,
        amount: Money.zero(account.currency),
        valueDate,
        status: 'REJECTED',
      };
    }

    const alreadyReversed = this.ledger
      .entries(account.id)
      .some(
        (entry) =>
          entry.type === 'REVERSAL' &&
          entry.referenceId === originalEntryId,
      );

    if (alreadyReversed) {
      return {
        reversalId,
        originalEntryId,
        accountId: account.id,
        amount: Money.zero(account.currency),
        valueDate,
        status: 'REJECTED',
      };
    }

    const reversalAmount = Money.zero(account.currency).subtract(
      originalEntry.amount,
    );

    this.ledger.append(account, {
      entryId: reversalId,
      accountId: account.id,
      type: 'REVERSAL',
      amount: reversalAmount,
      valueDate: originalEntry.valueDate,
      referenceId: originalEntryId,
    });

    return {
      reversalId,
      originalEntryId,
      accountId: account.id,
      amount: reversalAmount,
      valueDate: originalEntry.valueDate,
      status: 'REVERSED',
    };
  }
}
