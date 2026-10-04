import { Account } from './account.js';
import { AppendOnlyLedger } from './append-only-ledger.js';
import { InterestAccrual } from './interest.js';
import { Money } from './money.js';

const DAILY_RATE_NUMERATOR = 4n;
const DAILY_RATE_DENOMINATOR = 10_000n;

const roundHalfUp = (numerator: bigint, denominator: bigint): bigint => {
  return (numerator + denominator / 2n) / denominator;
};

export class InterestService {
  constructor(private readonly ledger: AppendOnlyLedger) {}

  accrueForDay(
    account: Account,
    valueDate: string,
  ): InterestAccrual {
    const closingBalance = this.ledger.balanceAt(
      account,
      valueDate,
    );

    if (closingBalance.amount <= 0n) {
      return {
        accountId: account.id,
        valueDate,
        baseBalance: closingBalance,
        amount: Money.zero(account.currency),
      };
    }

    const rawInterest =
      closingBalance.amount * DAILY_RATE_NUMERATOR;

    const roundedInterest = roundHalfUp(
      rawInterest,
      DAILY_RATE_DENOMINATOR,
    );

    return {
      accountId: account.id,
      valueDate,
      baseBalance: closingBalance,
      amount: new Money(
        roundedInterest,
        account.currency,
      ),
    };
  }

  accrueForDays(
    account: Account,
    valueDates: readonly string[],
  ): readonly InterestAccrual[] {
    return valueDates.map((valueDate) =>
      this.accrueForDay(account, valueDate),
    );
  }

  totalAccrued(
    account: Account,
    valueDates: readonly string[],
  ): Money {
    return this.accrueForDays(account, valueDates).reduce(
      (total, accrual) => total.add(accrual.amount),
      Money.zero(account.currency),
    );
  }

  capitalize(
    account: Account,
    capitalizationDate: string,
    valueDates: readonly string[],
  ): Money {
    const total = this.totalAccrued(account, valueDates);

    if (total.isZero()) {
      return total;
    }

    const existingInterest = this.ledger
      .entries(account.id)
      .some(
        (entry) =>
          entry.type === 'INTEREST' &&
          entry.valueDate === capitalizationDate,
      );

    if (existingInterest) {
      throw new Error(
        `Interest already capitalized for ${capitalizationDate}`,
      );
    }

    this.ledger.append(account, {
      entryId: `INTEREST-${account.id}-${capitalizationDate}`,
      accountId: account.id,
      type: 'INTEREST',
      amount: total,
      valueDate: capitalizationDate,
    });

    return total;
  }
}
