# Rejected Criteria and Approaches

## Verdicts

| # | Criterion | Verdict |
|---|---|---|
| 1 | Day2 close at end of Day5, before fees = −370.00 | Accepted: 1200.00 − 950.00 − 620.00 |
| 2 | E7 causes exactly one fee, on Day2 | **Rejected** |
| 3 | Auth-A Day4 settlement accepted | Accepted |
| 4 | Unknown-auth settlement rejected, funds don't leave | Accepted with a qualification (see AMBIGUITIES.md) |
| 5 | If Auth-B approved, hold hits available not ledger | Accepted, but it never applies: Auth-B is declined |
| 6 | After E9, balances and fees return to pre-E7 | **Rejected** |
| 7 | Each BHD instalment is 3.334 | **Rejected** |
| 8 | Accrual remainder is discarded | **Rejected** |

Criterion 5 is accepted even though it never fires, because it correctly describes how holds work. Criterion 8 is rejected even though it never fires either, because it tells the ledger to discard money, which the "must sum exactly" rule forbids.

## Acceptance criterion 2

Rejected. E7 causes three fees, not one.

| Value day | Balance before fee | Fee | Close |
|---|---:|---|---:|
| Day1 | 250.00 | no | 250.00 |
| Day2 | −370.00 | yes | −395.00 |
| Day3 | 5.00 | no | 5.00 |
| Day4 | −180.00 | yes | −205.00 |
| Day5 | −205.00 | yes | −230.00 |

Without E7, Day2, Day4 and Day5 close at 250.00, 465.00 and 465.00, so E7 causes all three fees.

The criterion is wrong under the alternative model too. If only the closing day were assessed, E7 would cause one fee on Day5, not Day2.

The criterion could also be read as "Day2 is charged once, not twice". The implementation satisfies that reading, since the (account, date) key prevents a double charge. But the sentence is about what E7 causes, and E7 causes three fees.

## Acceptance criterion 6

Rejected.

The fees are not refunded because the brief has no refund rule, not because of append-only. A refund would be appended as new entries.

E9 compensates E7 with a new entry and leaves both E7 and the three fees intact.

Final balances compared with pre-E7: Day2 225.00 vs 250.00, Day3 625.00 vs 650.00, Day4 415.00 vs 465.00, Day5 390.00 vs 465.00. Interest falls from 1.03 to 0.93.

Even with a refund policy, the fee records would remain, with refund entries appended next to them. The cost of having no refund rule is shown by the deliberately failing test (`tests/known-gap.test.ts`).

## Acceptance criterion 7

Rejected.

Three BHD 3.334 installments equal BHD 10.002, not BHD 10.000.

The implementation preserves exact monetary value.

## Acceptance criterion 8

Rejected.

Discarding a monetary remainder would create an unexplained accounting difference.

The implementation preserves the exact sum of rounded daily interest accruals.

# Abandoned approaches

## Assessing fees only for value dates touched by that day's debits

This was the first version of end-of-day fee assessment. It was dropped because it gave one fee (Day2) for E7, and missed Day5 even though Day5 was the day being closed and closed negative. Every date up to the closing day is now re-checked.

## Closing a day again for a late event

The first replay loop closed Day6 when E10 (labelled Day5) arrived, then closed Day5 a second time at the end. Dropped: the clock now only moves forward, and E10 is a late arrival processed during Day6.

## Reporting final authorization states on every day

Dropped because Day2 showed Auth-A as SETTLED before it settled. States are now captured at each day's close.

## `it.fails` as the failing test

Dropped. `it.fails` passes when its body fails, so the suite had no failing test at all, and the test checked arithmetic rather than the design. It is replaced by a plain failing test against the design.

## Floating-point money

Rejected because binary floating point is unsuitable for exact financial amounts.

## Mutating entries during reversal

Rejected because it violates append-only auditability.

## Treating authorization holds as ledger debits

Rejected because a hold reserves available balance without posting a ledger transaction.

## Posting unknown settlements to the customer account

Rejected for this core: Auth-Z is refused, and nothing is posted to ACC-001. A production system would post it to a suspense account instead, because clearing records without an authorization (force posts, offline transactions) are normal and the money has usually already left the bank. See AMBIGUITIES.md.

## Database

Rejected for this assessment because the requirement explicitly calls for an in-memory implementation.

## Kafka or distributed event infrastructure

Rejected as unnecessary for the assessment scope.

## HTTP API

Rejected because the assessment evaluates the ledger core through tests/replay.

## UI

Rejected because it does not contribute to proving ledger correctness.

## Generic rules engine

Rejected because the supplied rules are small and explicit; a generic engine would add complexity without improving this implementation.
