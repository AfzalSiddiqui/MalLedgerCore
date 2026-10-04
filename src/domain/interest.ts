import { Money } from './money.js';

export interface InterestAccrual {
  readonly accountId: string;
  readonly valueDate: string;
  readonly baseBalance: Money;
  readonly amount: Money;
}
