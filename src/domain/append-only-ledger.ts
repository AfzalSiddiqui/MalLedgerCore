import { Account } from './account.js';
import { LedgerEntry } from './ledger-entry.js';
import { Money } from './money.js';

export class AppendOnlyLedger {
  private readonly entriesByAccount = new Map<string, LedgerEntry[]>();

  append(account: Account, entry: LedgerEntry): void {
    if (entry.accountId !== account.id) {
      throw new Error(
        `Entry account ${entry.accountId} does not match account ${account.id}`,
      );
    }

    if (entry.amount.currency !== account.currency) {
      throw new Error(
        `Entry currency ${entry.amount.currency} does not match account currency ${account.currency}`,
      );
    }

    const entries = this.entriesByAccount.get(account.id) ?? [];

    entries.push(entry);

    this.entriesByAccount.set(account.id, entries);
  }

  entries(accountId: string): readonly LedgerEntry[] {
    return [...(this.entriesByAccount.get(accountId) ?? [])];
  }

  balanceAt(account: Account, valueDate: string): Money {
    return this.entries(account.id)
      .filter((entry) => entry.valueDate <= valueDate)
      .reduce(
        (balance, entry) => balance.add(entry.amount),
        account.openingBalance,
      );
  }
}

