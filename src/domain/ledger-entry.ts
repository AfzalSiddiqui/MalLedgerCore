import { Money } from './money.js';

export type LedgerEntryType =
  | 'CREDIT'
  | 'DEBIT'
  | 'FEE'
  | 'INTEREST'
  | 'REVERSAL';

export interface LedgerEntry {
  readonly entryId: string;
  readonly accountId: string;
  readonly type: LedgerEntryType;
  readonly amount: Money;
  readonly valueDate: string;
  readonly referenceId?: string;
}
