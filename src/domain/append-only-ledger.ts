import { Account } from './account.js';
import { LedgerEntry } from './ledger-entry.js';
import { Money } from './money.js';
import { isOnOrBefore } from './value-date.js';

export class AppendOnlyLedger {
  private readonly entriesByAccount = new Map<string, LedgerEntry[]>();
  private readonly entryIds = new Set<string>();

  append(account: Account, entry: LedgerEntry): void {
    this.appendAll(account, [entry]);
  }

  /**
   * Appends entries all-or-nothing: every entry is validated before any is
   * written, so a failure never leaves a partially posted event behind.
   */
  appendAll(account: Account, entries: readonly LedgerEntry[]): void {
    const batchIds = new Set<string>();

    for (const entry of entries) {
      this.validate(account, entry);

      if (batchIds.has(entry.entryId)) {
        throw new Error(`Duplicate entry ${entry.entryId} in batch`);
      }

      batchIds.add(entry.entryId);
    }

    const accountEntries = this.entriesByAccount.get(account.id) ?? [];

    for (const entry of entries) {
      accountEntries.push(entry);
      this.entryIds.add(entry.entryId);
    }

    this.entriesByAccount.set(account.id, accountEntries);
  }

  hasEntry(entryId: string): boolean {
    return this.entryIds.has(entryId);
  }

  entries(accountId: string): readonly LedgerEntry[] {
    return [...(this.entriesByAccount.get(accountId) ?? [])];
  }

  balanceAt(account: Account, valueDate: string): Money {
    return this.entries(account.id)
      .filter((entry) => isOnOrBefore(entry.valueDate, valueDate))
      .reduce(
        (balance, entry) => balance.add(entry.amount),
        account.openingBalance,
      );
  }

  private validate(account: Account, entry: LedgerEntry): void {
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

    if (this.entryIds.has(entry.entryId)) {
      throw new Error(
        `Duplicate entry ${entry.entryId}: ledger entry IDs must be unique`,
      );
    }
  }
}
