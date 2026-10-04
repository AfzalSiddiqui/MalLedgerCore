import { Account } from '../domain/account.js';
import { AppendOnlyLedger } from '../domain/append-only-ledger.js';
import { AuthorizationService } from '../domain/authorization-service.js';
import { FeeService } from '../domain/fee-service.js';
import { InterestAccrual } from '../domain/interest.js';
import { InterestService } from '../domain/interest-service.js';
import { Money } from '../domain/money.js';
import { ReversalService } from '../domain/reversal-service.js';
import { SettlementService } from '../domain/settlement-service.js';
import { SettlementRejectionReason } from '../domain/settlement.js';
import { compareValueDates, isOnOrBefore } from '../domain/value-date.js';
import { LedgerEntry } from '../domain/ledger-entry.js';
import { LedgerEvent } from './events.js';

export const DAYS = [
  'Day1',
  'Day2',
  'Day3',
  'Day4',
  'Day5',
  'Day6',
] as const;

export interface ReplayError {
  readonly eventId: string;
  readonly day: string;
  readonly message: string;
}

export interface DailyReport {
  readonly day: string;
  readonly balances: Readonly<Record<string, string>>;
  readonly fees: readonly string[];
  readonly authorizationStates: readonly string[];
  readonly errors: readonly string[];
}

export interface ReplayResult {
  readonly ledger: AppendOnlyLedger;
  readonly errors: readonly ReplayError[];
  readonly interestAccruals: readonly InterestAccrual[];
  readonly capitalizedInterest: Readonly<Record<string, string>>;
  readonly dailyReports: readonly DailyReport[];
}

export class LedgerReplay {
  private readonly ledger: AppendOnlyLedger;
  private readonly authorizationService: AuthorizationService;
  private readonly settlementService: SettlementService;
  private readonly reversalService: ReversalService;
  private readonly feeServices: Map<string, FeeService>;
  private readonly interestServices: Map<string, InterestService>;
  private readonly pendingOverdraftDates = new Map<string, Set<string>>();
  private replayed = false;

  constructor(
    private readonly accounts: readonly Account[],
    overdraftFees: Readonly<Record<string, Money>>,
  ) {
    this.ledger = new AppendOnlyLedger();

    this.authorizationService = new AuthorizationService(this.ledger);

    this.settlementService = new SettlementService(
      this.ledger,
      this.authorizationService,
    );

    this.reversalService = new ReversalService(this.ledger);

    this.feeServices = new Map(
      accounts.map((account) => [
        account.id,
        new FeeService(
          this.ledger,
          overdraftFees[account.id] ?? Money.zero(account.currency),
        ),
      ]),
    );

    this.interestServices = new Map(
      accounts.map((account) => [
        account.id,
        new InterestService(this.ledger),
      ]),
    );
  }

  replay(events: readonly LedgerEvent[]): ReplayResult {
    // The ledger, holds and fee state live on this instance. Replaying a
    // second stream into the same state would double-post, so a replay is
    // one-shot: reject before touching anything.
    if (this.replayed) {
      throw new Error(
        'LedgerReplay has already replayed a stream; create a new instance to replay again',
      );
    }

    this.replayed = true;

    const errors: ReplayError[] = [];
    const processedEventIds = new Set<string>();
    let currentDay: string | undefined;

    for (const event of events) {
      if (currentDay !== undefined && event.day !== currentDay) {
        this.closeDay(currentDay, errors);
      }

      currentDay = event.day;

      // Idempotency: a redelivered event is reported and has no effect.
      if (processedEventIds.has(event.eventId)) {
        errors.push({
          eventId: event.eventId,
          day: event.day,
          message: `Duplicate event ${event.eventId} ignored`,
        });
        continue;
      }

      processedEventIds.add(event.eventId);

      const account = this.findAccount(event.accountId);

      if (!account) {
        errors.push({
          eventId: event.eventId,
          day: event.day,
          message: `Unknown account ${event.accountId}`,
        });
        continue;
      }

      try {
        this.processEvent(account, event, errors);
      } catch (error) {
        errors.push({
          eventId: event.eventId,
          day: event.day,
          message:
            error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (currentDay !== undefined) {
      this.closeDay(currentDay, errors);
    }

    const interestAccruals: InterestAccrual[] = [];
    const capitalizedInterest: Record<string, string> = {};

    for (const account of this.accounts) {
      const interestService = this.interestServices.get(account.id)!;

      const accruals = interestService.accrueForDays(
        account,
        DAYS,
      );

      interestAccruals.push(...accruals);

      const total = interestService.capitalize(
        account,
        'Day6',
        DAYS,
      );

      capitalizedInterest[account.id] = total.toString();
    }

    return {
      ledger: this.ledger,
      errors,
      interestAccruals,
      capitalizedInterest,
      dailyReports: this.buildDailyReports(errors),
    };
  }

  private processEvent(
    account: Account,
    event: LedgerEvent,
    errors: ReplayError[],
  ): void {
    switch (event.type) {
      case 'CREDIT':
        assertPositive(event.eventId, event.amount);
        this.appendSignedEntry(account, event, event.amount);
        return;

      case 'DEBIT': {
        // Same guard as settlement: a negative "debit" would credit the account.
        assertPositive(event.eventId, event.amount);

        const debitAmount = Money.zero(account.currency).subtract(
          event.amount,
        );

        this.appendSignedEntry(account, event, debitAmount);

        // The fee is decided on the closing balance at end of day, not on
        // the intraday balance straight after this debit.
        this.markForOverdraftAssessment(account, event.valueDate);

        return;
      }

      case 'AUTHORIZATION': {
        const hold = this.authorizationService.authorize(
          account,
          event.authorizationId,
          event.amount,
          event.valueDate,
        );

        if (hold.status !== 'ACTIVE') {
          errors.push({
            eventId: event.eventId,
            day: event.day,
            message: `Authorization ${event.authorizationId} rejected: insufficient available balance`,
          });
        }

        return;
      }

      case 'SETTLEMENT': {
        const settlement = this.settlementService.settle(
          account,
          event.eventId,
          event.authorizationId,
          event.amount,
          event.valueDate,
        );

        if (settlement.status === 'REJECTED') {
          errors.push({
            eventId: event.eventId,
            day: event.day,
            message: `Settlement ${event.eventId} rejected: ${describeSettlementRejection(
              settlement.rejectionReason,
              event.authorizationId,
            )}`,
          });

          return;
        }

        // A settlement is a ledger debit too, so it can cause an overdraft.
        this.markForOverdraftAssessment(account, event.valueDate);

        return;
      }

      case 'REVERSAL': {
        const reversal = this.reversalService.reverse(
          account,
          event.eventId,
          event.originalEntryId,
          event.valueDate,
        );

        if (reversal.status === 'REJECTED') {
          errors.push({
            eventId: event.eventId,
            day: event.day,
            message: `Reversal ${event.eventId} rejected: original entry ${event.originalEntryId} not found or already reversed`,
          });
        }

        return;
      }

      case 'CREDIT_INSTALLMENTS':
        this.appendInstallments(account, event);
        return;
    }
  }

  private markForOverdraftAssessment(
    account: Account,
    valueDate: string,
  ): void {
    const dates =
      this.pendingOverdraftDates.get(account.id) ?? new Set<string>();

    dates.add(valueDate);

    this.pendingOverdraftDates.set(account.id, dates);
  }

  /**
   * End-of-day processing for one arrival day: every value date touched by a
   * debit or settlement that day is assessed once, on its closing balance as
   * it stands after all of the day's events.
   */
  private closeDay(day: string, errors: ReplayError[]): void {
    for (const account of this.accounts) {
      const dates = this.pendingOverdraftDates.get(account.id);

      if (!dates) {
        continue;
      }

      const feeService = this.feeServices.get(account.id)!;

      for (const valueDate of [...dates].sort(compareValueDates)) {
        try {
          feeService.assessOverdraft(account, valueDate);
        } catch (error) {
          errors.push({
            eventId: `EOD-${account.id}-${valueDate}`,
            day,
            message:
              error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    this.pendingOverdraftDates.clear();
  }

  private appendSignedEntry(
    account: Account,
    event: LedgerEvent,
    amount: Money,
  ): void {
    this.ledger.append(account, {
      entryId: event.eventId,
      accountId: account.id,
      type: event.type === 'CREDIT' ? 'CREDIT' : 'DEBIT',
      amount,
      valueDate: event.valueDate,
    });
  }

  private appendInstallments(
    account: Account,
    event: Extract<LedgerEvent, { type: 'CREDIT_INSTALLMENTS' }>,
  ): void {
    const installments = splitMoney(
      event.amount,
      event.installments,
    );

    // All installments post together or none do.
    this.ledger.appendAll(
      account,
      installments.map((amount, index) => ({
        entryId: `${event.eventId}-${index + 1}`,
        accountId: account.id,
        type: 'CREDIT' as const,
        amount,
        valueDate: event.valueDate,
        referenceId: event.eventId,
      })),
    );
  }

  private buildDailyReports(
    errors: readonly ReplayError[],
  ): DailyReport[] {
    return DAYS.map((day) => {
      const balances: Record<string, string> = {};
      const fees: string[] = [];
      const authorizationStates: string[] = [];

      for (const account of this.accounts) {
        balances[account.id] = this.ledger
          .balanceAt(account, day)
          .toString();

        const feeService = this.feeServices.get(account.id)!;

        for (const fee of feeService.assessmentsFor(account.id)) {
          if (fee.assessedDate === day) {
            fees.push(
              `${fee.type}: ${fee.amount.toString()}`,
            );
          }
        }

        const holds = this.authorizationService
          .holdsFor(account.id)
          .filter((hold) => isOnOrBefore(hold.valueDate, day));

        for (const hold of holds) {
          authorizationStates.push(
            `${hold.authorizationId}: ${hold.status}`,
          );
        }
      }

      return {
        day,
        balances,
        fees,
        authorizationStates,
        errors: errors
          .filter((error) => error.day === day)
          .map(
            (error) =>
              `${error.eventId}: ${error.message}`,
          ),
      };
    });
  }

  private findAccount(accountId: string): Account | undefined {
    return this.accounts.find(
      (account) => account.id === accountId,
    );
  }
}

function assertPositive(eventId: string, amount: Money): void {
  if (!amount.isPositive()) {
    throw new Error(
      `Event ${eventId} amount must be positive; direction comes from the event type`,
    );
  }
}

function describeSettlementRejection(
  reason: SettlementRejectionReason | undefined,
  authorizationId: string,
): string {
  switch (reason) {
    case 'CURRENCY_MISMATCH':
      return 'settlement currency does not match the account currency';
    case 'NON_POSITIVE_AMOUNT':
      return 'settlement amount must be positive';
    case 'UNKNOWN_AUTHORIZATION':
      return `authorization ${authorizationId} does not exist`;
    case 'AUTHORIZATION_NOT_ACTIVE':
      return `authorization ${authorizationId} is not active`;
    case 'AMOUNT_EXCEEDS_HOLD':
      return `amount exceeds the hold for authorization ${authorizationId}`;
    default:
      return `authorization ${authorizationId} could not be settled`;
  }
}

function splitMoney(
  amount: Money,
  count: number,
): Money[] {
  if (count <= 0) {
    throw new Error('Installment count must be positive');
  }

  if (amount.isNegative() || amount.isZero()) {
    throw new Error('Installment amount must be positive');
  }

  const quotient = amount.amount / BigInt(count);
  const remainder = amount.amount % BigInt(count);

  return Array.from({ length: count }, (_, index) => {
    const extra = BigInt(index) < remainder ? 1n : 0n;

    return new Money(
      quotient + extra,
      amount.currency,
    );
  });
}
