import { Money } from './money.js';

export type AuthorizationHoldStatus = 'ACTIVE' | 'SETTLED' | 'RELEASED';

export interface AuthorizationHold {
  readonly authorizationId: string;
  readonly accountId: string;
  readonly amount: Money;
  readonly valueDate: string;
  readonly status: AuthorizationHoldStatus;
}

