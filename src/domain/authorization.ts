import { Money } from './money.js';

export type AuthorizationStatus = 'APPROVED' | 'REJECTED';

export interface Authorization {
  readonly authorizationId: string;
  readonly accountId: string;
  readonly amount: Money;
  readonly valueDate: string;
  readonly status: AuthorizationStatus;
}
