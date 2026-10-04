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
import { isOnOrBefore } from '../domain/value-date.js';
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
  /** Final value-dated closing balance: every entry with valueDate <= day, after the whole stream. */
  readonly balances: Readonly<Record<string, string>>;
  /** Closing balance as it stood when this day was closed (before later back-valued events). */
  readonly closingAsKnown: Readonly<Record<string, string>>;
  /** Fees whose value date is this day. */
  readonly fees: readonly string[];
  /** Fees booked by this day's end-of-day run, with the value date each one is for. */
  readonly feesBookedAtClose: readonly string[];
  /** Authorization states as they stood at this day's close. */
  readonly authorizationStates: readonly string[];
  readonly errors: readonly string[];
}

interface DaySnapshot {
  readonly closingAsKnown: Record<string, string>;
  readonly feesBookedAtClose: string[];
  readonly authorizationStates: string[];
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
  private readonly snapshots = new Map<string, DaySnapshot>();
  private readonly interestAccruals: InterestAccrual[] = [];
  private readonly capitalizedInterest: Record<string, string> = {};
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

    // The processing clock. It only moves forward, and every day it leaves
    // behind is closed exactly once, in order, including days with no events.
    let openDayIndex = 0;

    for (const event of events) {
      const eventDayIndex = DAYS.indexOf(event.day as (typeof DAYS)[number]);

      if (eventDayIndex === -1) {
        errors.push({
          eventId: event.eventId,
          day: DAYS[openDayIndex],
          message: `Event day ${event.day} is outside the replay window; ignored`,
        });
        continue;
      }

      while (openDayIndex < eventDayIndex) {
        this.closeDay(DAYS[openDayIndex], errors);
        openDayIndex += 1;
      }

      if (eventDayIndex < openDayIndex) {
        // Late arrival (E10: labelled Day5, arrives after E9 on Day6). The
        // stream order is authoritative, so it is processed now, during the
        // open day, and keeps its own value date. Day5 is not re-closed.
        errors.push({
          eventId: event.eventId,
          day: DAYS[openDayIndex],
          message: `WARNING (accepted): ${event.eventId} is labelled ${event.day} but arrived after ${event.day} was closed; processed on ${DAYS[openDayIndex]} with value date ${event.valueDate}`,
        });
      }

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

    // Close the open day and any remaining days of the window. Interest is
    // capitalized inside the last day's close.
    while (openDayIndex < DAYS.length) {
      this.closeDay(DAYS[openDayIndex], errors);
      openDayIndex += 1;
    }

    return {
      ledger: this.ledger,
      errors,
      interestAccruals: this.interestAccruals,
      capitalizedInterest: this.capitalizedInterest,
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

        // No balance check: the brief applies the available-balance test to
        // authorizations only. The fee is decided at end of day.
        this.appendSignedEntry(account, event, debitAmount);

        return;
      }

      case 'AUTHORIZATION': {
        const existing = this.authorizationService.find(
          account.id,
          event.authorizationId,
        );

        if (existing) {
          errors.push({
            eventId: event.eventId,
            day: event.day,
            message: `WARNING (ignored): duplicate authorization ${event.authorizationId}; original decision ${existing.status} kept, no second hold`,
          });

          return;
        }

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

      case 'AUTHORIZATION_RELEASE': {
        const outcome = this.authorizationService.release(
          account,
          event.authorizationId,
        );

        if (outcome !== 'RELEASED') {
          errors.push({
            eventId: event.eventId,
            day: event.day,
            message: `Release of ${event.authorizationId} ignored: ${
              outcome === 'UNKNOWN_AUTHORIZATION'
                ? 'authorization does not exist'
                : 'authorization is not active'
            }`,
          });
        }

        return;
      }

      case 'CREDIT_INSTALLMENTS':
        this.appendInstallments(account, event);
        return;
    }
  }

  /**
   * End-of-day processing for one day.
   *
   * Overdraft fees: every value date from Day1 up to and including the day
   * being closed is checked, in ascending order, and any date whose closing
   * balance is negative and has no fee yet gets one. Checking every date (not
   * only dates touched by today's debits) is what the rule says: a fee is due
   * for each day whose closing balance is negative. It also catches back-valued
   * entries: E7 (posted Day5, value Day2) makes Day2, Day4 and Day5 negative,
   * so Day5's close books three fees. Ascending order matters because a fee
   * booked for day d is part of day d+1's closing balance. FeeService keys
   * fees by (account, date), so re-checking a date never charges it twice.
   *
   * Then, on the last day, interest is accrued from the final value-dated
   * history and capitalized. Finally the day's state is snapshotted for the
   * report, because later back-valued events change the history.
   */
  private closeDay(day: string, errors: ReplayError[]): void {
    const closingIndex = DAYS.indexOf(day as (typeof DAYS)[number]);
    const feesBookedAtClose: string[] = [];

    for (const account of this.accounts) {
      const feeService = this.feeServices.get(account.id)!;

      for (const valueDate of DAYS.slice(0, closingIndex + 1)) {
        try {
          const fee = feeService.assessOverdraft(account, valueDate);

          if (fee) {
            feesBookedAtClose.push(
              `${account.id} ${fee.type} ${fee.amount.toString()} for ${valueDate}${valueDate === day ? '' : ' (back-valued)'}`,
            );
          }
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

    if (closingIndex === DAYS.length - 1) {
      for (const account of this.accounts) {
        const interestService = this.interestServices.get(account.id)!;

        this.interestAccruals.push(
          ...interestService.accrueForDays(account, DAYS),
        );

        this.capitalizedInterest[account.id] = interestService
          .capitalize(account, day, DAYS)
          .toString();
      }
    }

    const closingAsKnown: Record<string, string> = {};
    const authorizationStates: string[] = [];

    for (const account of this.accounts) {
      closingAsKnown[account.id] = this.ledger
        .balanceAt(account, day)
        .toString();

      for (const hold of this.authorizationService.holdsFor(account.id)) {
        if (isOnOrBefore(hold.valueDate, day)) {
          authorizationStates.push(`${hold.authorizationId}: ${hold.status}`);
        }
      }
    }

    this.snapshots.set(day, {
      closingAsKnown,
      feesBookedAtClose,
      authorizationStates,
    });
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
      const snapshot = this.snapshots.get(day);

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
      }

      return {
        day,
        balances,
        closingAsKnown: snapshot?.closingAsKnown ?? {},
        fees,
        feesBookedAtClose: snapshot?.feesBookedAtClose ?? [],
        authorizationStates: snapshot?.authorizationStates ?? [],
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
