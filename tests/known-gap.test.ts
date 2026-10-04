import { describe, expect, it } from 'vitest';

import { LedgerReplay } from '../src/replay/ledger-replay.js';
import {
  SCENARIO_ACCOUNTS,
  SCENARIO_EVENTS,
  SCENARIO_OVERDRAFT_FEES,
} from '../src/replay/scenario.js';

// THE ONE DELIBERATELY FAILING TEST.
// It is written against this design and is expected to FAIL. It is a plain
// `it`, not `it.fails` or `it.skip`, because a hidden failure hides the gap.

describe('Known gap: fees caused by a reversed entry', () => {
  it('does not charge the customer for an entry the bank reversed', () => {
    const result = new LedgerReplay(
      SCENARIO_ACCOUNTS,
      SCENARIO_OVERDRAFT_FEES,
    ).replay(SCENARIO_EVENTS);

    const account = SCENARIO_ACCOUNTS[0];

    // After E9 cancels E7, the corrected history never goes negative
    // (ignoring fees): 250, 250, 650, 465, 465, 465.
    const entries = result.ledger.entries(account.id);
    const correctedCloses = ['Day1', 'Day2', 'Day3', 'Day4', 'Day5', 'Day6'].map(
      (day, index) =>
        entries
          .filter(
            (entry) =>
              entry.type !== 'FEE' &&
              entry.type !== 'INTEREST' &&
              Number(entry.valueDate.slice(3)) <= index + 1,
          )
          .reduce((sum, entry) => sum + entry.amount.amount, 0n),
    );
    expect(correctedCloses.every((close) => close >= 0n)).toBe(true); // passes

    const netFees = entries
      .filter((entry) => entry.type === 'FEE')
      .reduce((sum, entry) => sum + entry.amount.amount, 0n);

    // FAILS: netFees is -7500n (AED -75.00), not 0.
    //
    // WHAT THIS REVEALS:
    // 1. The fee rule only looks at a day's closing balance when an
    //    end-of-day run happens. It does not know WHY the balance was
    //    negative. E7 made Day2, Day4 and Day5 negative at Day5's close, three
    //    fees were booked, and when E9 cancelled E7 on Day6 nothing
    //    reconsidered them.
    // 2. Append-only is NOT the reason. A refund would be three new +25.00
    //    entries; nothing would be edited or deleted. The gap is a missing
    //    policy, not the storage model.
    // 3. A fee records the date it is for (referenceId = value date), not
    //    the entry that caused it, so even with a refund rule the ledger could
    //    not tell which fees E9 "un-caused". Fixing it means recording the
    //    cause when the fee is booked.
    // 4. It is a business decision: refunding on reversal is customer-fair
    //    but can be gamed (debit, reverse, repeat). The brief has no refund
    //    rule, so none was invented. The price is visible here: AED 75.00 in
    //    fees, plus AED 0.10 less interest (0.93 capitalized instead of 1.03,
    //    because the fees lower the Day2-Day6 interest bases).
    expect(netFees).toBe(0n);
  });
});
