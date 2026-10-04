
import { Money } from './money.js';

/**
 * DECLINED: the request was refused and never reserved funds.
 * RELEASED: funds were reserved and later given back.
 * The two are kept distinct so reports and audits do not conflate them.
 */
export type AuthorizationHoldStatus =
  | 'ACTIVE'
  | 'SETTLED'
  | 'RELEASED'
  | 'DECLINED';

export interface AuthorizationHold {
  readonly authorizationId: string;
  readonly accountId: string;
  readonly amount: Money;
  readonly valueDate: string;
   status: AuthorizationHoldStatus;
}

