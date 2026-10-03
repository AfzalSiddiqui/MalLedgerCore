import { Account } from './account.js';
import { AppendOnlyLedger } from './append-only-ledger.js';
import { FeeAssessment } from './fee.js';
import { Money } from './money.js';

export class FeeService {
  private readonly assessments = new Map<string, FeeAssessment>();

  constructor(
    private readonly ledger: AppendOnlyLedger,
    private readonly overdraftFee: Money,
  ) {}

  assessOverdraft(
    account: Account,
    assessedDate: string,
  ): FeeAssessment | null {
    const assessmentKey = `${account.id}:${assessedDate}`;

    if (this.assessments.has(assessmentKey)) {
      return null;
    }

    const closingBalance = this.ledger.balanceAt(
      account,
      assessedDate,
    );

    if (!closingBalance.isNegative()) {
      return null;
    }

    if (this.overdraftFee.currency !== account.currency) {
      throw new Error(
        `Fee currency ${this.overdraftFee.currency} does not match account currency ${account.currency}`,
      );
    }

    const feeId = `FEE-${account.id}-${assessedDate}`;

    this.ledger.append(account, {
      entryId: feeId,
      accountId: account.id,
      type: 'FEE',
      amount: Money.zero(account.currency).subtract(this.overdraftFee),
      valueDate: assessedDate,
      referenceId: assessedDate,
    });

    const assessment: FeeAssessment = {
      feeId,
      accountId: account.id,
      type: 'OVERDRAFT',
      amount: this.overdraftFee,
      assessedDate,
      status: 'ASSESSED',
    };

    this.assessments.set(assessmentKey, assessment);

    return assessment;
  }

  assessmentsFor(accountId: string): readonly FeeAssessment[] {
    return [...this.assessments.values()].filter(
      (assessment) => assessment.accountId === accountId,
    );
  }
}
