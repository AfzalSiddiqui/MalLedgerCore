import { Money } from './money.js';

export type SettlementStatus = 'SETTLED' | 'REJECTED';

export type SettlementRejectionReason =
  | 'CURRENCY_MISMATCH'
  | 'NON_POSITIVE_AMOUNT'
  | 'UNKNOWN_AUTHORIZATION'
  | 'AUTHORIZATION_NOT_ACTIVE'
  | 'AMOUNT_EXCEEDS_HOLD';

export interface Settlement {
  readonly settlementId: string;
  readonly authorizationId: string;
  readonly accountId: string;
  readonly amount: Money;
  readonly valueDate: string;
  readonly status: SettlementStatus;
  readonly rejectionReason?: SettlementRejectionReason;
}
