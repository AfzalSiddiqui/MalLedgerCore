import { Money } from './money.js';

export type FeeType = 'OVERDRAFT';

export interface FeeAssessment {
  readonly feeId: string;
  readonly accountId: string;
  readonly type: FeeType;
  readonly amount: Money;
  readonly assessedDate: string;
  readonly status: 'ASSESSED';
}
