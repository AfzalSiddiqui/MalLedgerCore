import { Money } from './money.js';

export type ReversalStatus = 'REVERSED' | 'REJECTED';

export interface Reversal {
  readonly reversalId: string;
  readonly originalEntryId: string;
  readonly accountId: string;
  readonly amount: Money;
  readonly valueDate: string;
  readonly status: ReversalStatus;
}
