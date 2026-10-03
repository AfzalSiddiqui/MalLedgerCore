import { Account } from './account.js';
import { AppendOnlyLedger } from './append-only-ledger.js';
import {
  AuthorizationHold,
  AuthorizationHoldStatus,
} from './authorization-hold.js';
import { Money } from './money.js';

export class AuthorizationService {
  private readonly holds: AuthorizationHold[] = [];

  constructor(private readonly ledger: AppendOnlyLedger) {}

  authorize(
    account: Account,
    authorizationId: string,
    amount: Money,
    valueDate: string,
  ): AuthorizationHold {
    if (amount.currency !== account.currency) {
      throw new Error(
        `Authorization currency ${amount.currency} does not match account currency ${account.currency}`,
      );
    }

    if (amount.isNegative() || amount.isZero()) {
      throw new Error('Authorization amount must be positive');
    }

    const available = this.availableBalance(account, valueDate);

    const status: AuthorizationHoldStatus =
      available.amount >= amount.amount ? 'ACTIVE' : 'RELEASED';

    const hold: AuthorizationHold = {
      authorizationId,
      accountId: account.id,
      amount,
      valueDate,
      status,
    };

    this.holds.push(hold);

    return hold;
  }

  availableBalance(account: Account, valueDate: string): Money {
    const ledgerBalance = this.ledger.balanceAt(account, valueDate);

    const activeHolds = this.holds
      .filter(
        (hold) =>
          hold.accountId === account.id &&
          hold.valueDate <= valueDate &&
          hold.status === 'ACTIVE',
      )
      .reduce(
        (total, hold) => total.add(hold.amount),
        Money.zero(account.currency),
      );

    return ledgerBalance.subtract(activeHolds);
  }

  holdsFor(accountId: string): readonly AuthorizationHold[] {
    return this.holds.filter((hold) => hold.accountId === accountId);
  }
}
