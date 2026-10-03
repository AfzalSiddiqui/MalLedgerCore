import { Account } from './account.js';
import { AppendOnlyLedger } from './append-only-ledger.js';
import {
  AuthorizationHold,
} from './authorization-hold.js';
import { AuthorizationService } from './authorization-service.js';
import { Money } from './money.js';
import {  Settlement } from './settlement.js';

export class SettlementService {
  constructor(
    private readonly ledger: AppendOnlyLedger,
    private readonly authorizationService: AuthorizationService,
  ) {}

  settle(
    account: Account,
    settlementId: string,
    authorizationId: string,
    amount: Money,
    valueDate: string,
  ): Settlement {
    const hold = this.findActiveHold(
      account.id,
      authorizationId,
    );

    if (!hold) {
      return {
        settlementId,
        authorizationId,
        accountId: account.id,
        amount,
        valueDate,
        status: 'REJECTED',
      };
    }

    if (amount.currency !== account.currency) {
      throw new Error(
        `Settlement currency ${amount.currency} does not match account currency ${account.currency}`,
      );
    }

    if (amount.amount > hold.amount.amount) {
      return {
        settlementId,
        authorizationId,
        accountId: account.id,
        amount,
        valueDate,
        status: 'REJECTED',
      };
    }

    this.ledger.append(account, {
      entryId: settlementId,
      accountId: account.id,
      type: 'DEBIT',
      amount: Money.zero(account.currency).subtract(amount),
      valueDate,
      referenceId: authorizationId,
    });

    this.releaseHold(hold);

    return {
      settlementId,
      authorizationId,
      accountId: account.id,
      amount,
      valueDate,
      status: 'SETTLED',
    };
  }

  private findActiveHold(
    accountId: string,
    authorizationId: string,
  ): AuthorizationHold | undefined {
    return this.authorizationService
      .holdsFor(accountId)
      .find(
        (hold) =>
          hold.authorizationId === authorizationId &&
          hold.status === 'ACTIVE',
      );
  }

  private releaseHold(hold: AuthorizationHold): void {
    hold.status = 'SETTLED';
  }
}
