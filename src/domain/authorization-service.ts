import { Account } from './account.js';
import { AppendOnlyLedger } from './append-only-ledger.js';
import {
  AuthorizationHold,
  AuthorizationHoldStatus,
} from './authorization-hold.js';
import { Money } from './money.js';
import { isOnOrBefore } from './value-date.js';

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

    // Idempotent on authorization ID: a retransmitted request gets the
    // original decision back and never reserves funds a second time.
    const existing = this.find(account.id, authorizationId);

    if (existing) {
      return existing;
    }

    const available = this.availableBalance(account, valueDate);

    const status: AuthorizationHoldStatus =
      available.amount >= amount.amount ? 'ACTIVE' : 'DECLINED';

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
          isOnOrBefore(hold.valueDate, valueDate) &&
          hold.status === 'ACTIVE',
      )
      .reduce(
        (total, hold) => total.add(hold.amount),
        Money.zero(account.currency),
      );

    return ledgerBalance.subtract(activeHolds);
  }

  /**
   * Ends an ACTIVE hold without a settlement: a merchant cancellation, a
   * terminal-timeout reversal, or expiry. The reserved funds become available
   * again immediately. Only an ACTIVE hold can be released.
   */
  release(
    account: Account,
    authorizationId: string,
  ): 'RELEASED' | 'UNKNOWN_AUTHORIZATION' | 'AUTHORIZATION_NOT_ACTIVE' {
    const hold = this.find(account.id, authorizationId);

    if (!hold) {
      return 'UNKNOWN_AUTHORIZATION';
    }

    if (hold.status !== 'ACTIVE') {
      return 'AUTHORIZATION_NOT_ACTIVE';
    }

    hold.status = 'RELEASED';

    return 'RELEASED';
  }

  find(
    accountId: string,
    authorizationId: string,
  ): AuthorizationHold | undefined {
    return this.holds.find(
      (hold) =>
        hold.accountId === accountId &&
        hold.authorizationId === authorizationId,
    );
  }

  holdsFor(accountId: string): readonly AuthorizationHold[] {
    return this.holds.filter((hold) => hold.accountId === accountId);
  }
}
