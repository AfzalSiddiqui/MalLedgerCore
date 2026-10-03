import { Money } from './money.js';

export type SettlementStatus = 'SETTLED' | 'REJECTED';

export interface Settlement {
  readonly settlementId: string;
  readonly authorizationId: string;
  readonly accountId: string;
  readonly amount: Money;
  readonly valueDate: string;
  readonly status: SettlementStatus;
}
