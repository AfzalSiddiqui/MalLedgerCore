import { Money } from './money.js';

export class Account {
  readonly id: string;
  readonly currency: Money['currency'];
  readonly openingBalance: Money;

  constructor(id: string, openingBalance: Money) {
    this.id = id;
    this.currency = openingBalance.currency;
    this.openingBalance = openingBalance;
  }
}
