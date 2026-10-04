import { Account } from './account.js';
import { AppendOnlyLedger } from './append-only-ledger.js';
import { AuthorizationHold } from './authorization-hold.js';
import { AuthorizationService } from './authorization-service.js';
import { Money } from './money.js';
import { Settlement, SettlementRejectionReason } from './settlement.js';

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
    const reject = (
      rejectionReason: SettlementRejectionReason,
    ): Settlement => ({
      settlementId,
      authorizationId,
      accountId: account.id,
      amount,
      valueDate,
      status: 'REJECTED',
      rejectionReason,
    });

    if (amount.currency !== account.currency) {
      return reject('CURRENCY_MISMATCH');
    }

    // A non-positive amount would turn the "debit" into a credit or a no-op
    // that still consumes the hold.
    if (!amount.isPositive()) {
      return reject('NON_POSITIVE_AMOUNT');
    }

    const holds = this.authorizationService
      .holdsFor(account.id)
      .filter((hold) => hold.authorizationId === authorizationId);

    if (holds.length === 0) {
      return reject('UNKNOWN_AUTHORIZATION');
    }

    const hold = holds.find((candidate) => candidate.status === 'ACTIVE');

    if (!hold) {
      return reject('AUTHORIZATION_NOT_ACTIVE');
    }

    if (amount.amount > hold.amount.amount) {
      return reject('AMOUNT_EXCEEDS_HOLD');
    }

    this.ledger.append(account, {
      entryId: settlementId,
      accountId: account.id,
      type: 'DEBIT',
      amount: Money.zero(account.currency).subtract(amount),
      valueDate,
      referenceId: authorizationId,
    });

    this.markSettled(hold);

    return {
      settlementId,
      authorizationId,
      accountId: account.id,
      amount,
      valueDate,
      status: 'SETTLED',
    };
  }

  private markSettled(hold: AuthorizationHold): void {
    hold.status = 'SETTLED';
  }
}
