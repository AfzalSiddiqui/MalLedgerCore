# Ambiguities and Resolutions

## Arrival day vs value date

E7 arrives on Day5 but has value date Day2.

Resolution: events are processed in arrival order, while their accounting effect uses the supplied value date.

## Late overdraft fee

The requirements do not say when a fee is created when a late event changes a historical day.

Resolution: at the end of every day, the replay re-checks every value date from Day1 up to the day being closed, in ascending order. Any date whose closing balance is negative and has no fee yet is charged one. The (account, date) key means a date is never charged twice.

Why: the rule is "assessed once per day per account when that day's closing ledger balance (all entries with value_date ≤ that day) is negative", and the fee is "booked with value_date equal to the day assessed". Both phrases only matter if past days can be assessed.

Effect: E7 (posted Day5, value Day2) makes Day2 (−370.00), Day4 (−180.00 after the Day2 fee) and Day5 (−205.00) negative, so Day5's close books three fees. Day3 stays positive at 5.00: the 400.00 credit covers −395.00.

Alternative considered and dropped: assessing only the value dates touched by that day's debits (the earlier version of this code). It charged Day2 only, and missed Day5 even though Day5 was the day being closed and closed negative. See REJECTED.md.

## Fee order and cascading

Dates are checked in ascending order because a fee booked for day d is part of day d+1's closing balance. A fee can therefore push the next day negative. In this stream it does not: Day3 is 5.00.

## Fees for the BHD account

The brief gives an AED 25.00 fee only. There is no BHD amount and no FX rate.

Resolution: ACC-002 has no fee configured, so no fee is booked. Charging 25.000 BHD would be roughly ten times too much, and inventing an FX rate is not supported by the brief. ACC-002 never goes negative in this stream.

## Zero balance

0.00 is not negative, so no fee. Interest also requires a balance strictly greater than zero.

## Reversal and fees

The requirements suggest E9 could return balances and fees to the pre-E7 state.

Resolution: rejected because the ledger is append-only. E9 compensates E7 but does not remove an already-booked fee.

## Closing balance vs pre-fee balance

The stated Day2 -370.00 value is the historical balance immediately after E7 and before the fee.

The final ledger balance after the fee is -395.00 before reversal, and 225.00 after E9.

## Authorization after late debit

E8 is processed after E7 has arrived.

Resolution: authorization uses the ledger state available at processing time, including value-dated effects already replayed. At E8 the Day5 balance is −155.00. Fees are only booked at the day's close, so they are not counted yet. Available after the hold would be −245.00, so Auth-B is declined. With the fees it would be −320.00, declined either way.

## Debits are not balance-checked

The brief applies the available-balance test to authorizations only. E7 is posted even though it overdraws. The overdraft fee is the consequence.

## Partial and over-settlement

Auth-A held 200.00 and settled for 185.00. The hold is cleared in full and the unused 15.00 is no longer reserved. A settlement above the hold is rejected (AMOUNT_EXCEEDS_HOLD). That is a choice: real card schemes allow some over-settlement, for example tips.

## Settlement without an authorization (Auth-Z)

Rejected with an error, and nothing is posted to the customer account. In real card processing, clearing records without a matching authorization (offline transactions, force posts) are normal. The money has usually already left the bank, so a production system would post it to a suspense account and investigate. For a customer-ledger core with no suspense account in scope, rejecting it is the safe choice.

## Stream order vs day label (E10)

E10 is labelled Day5 but arrives after E9 (Day6). The brief says "replayed in this order".

Resolution: the processing clock only moves forward. E10 is processed during Day6 and keeps value date Day5, and a `WARNING (accepted)` line is reported. Day5 is not re-closed. ACC-002's Day5 as-known close is 0.000 and its final Day5 close is 10.000. The earlier version of this code re-opened Day5 for E10 and then closed it a second time after Day6.

## As-known vs final balances in the report

Printing only final balances would hide what was known each day. Printing only as-known balances would hide the restatement. Both are printed.

## Authorization states in the report

The report shows each authorization's state as it stood at that day's close. The earlier version showed the final state on every day, so Day2 reported Auth-A as SETTLED two days before E5 settled it.

## Days with no events

Every day in the window is closed in order, even a day with no events, so its fee check and report still run.

## BHD installments

Three installments of 3.334 would total 10.002.

Resolution: preserve the original amount exactly using 3.334, 3.333 and 3.333.

## Interest timing

Resolution: at Day6's close, calculate each day's interest from the final value-dated history, then capitalize the total on Day6.

The alternative was to accrue on each day's balance as known at its close (250, 250, 650, 465, −230 → 0, 390), which gives 0.81 instead of 0.93. It was not used because nothing is capitalized before Day6, and by then Day2–Day5 have been restated by E7, E9 and the fees.

The Day6 accrual uses the balance before the capitalization credit, so the credit does not earn interest on itself.

## Rounding mode

The brief does not specify one. Half-up is used. No daily accrual in this stream lands exactly on a half (0.166 and 0.156), so the choice changes no number here.

## Per-day rounding vs rounding the total

The brief requires the rounded daily accruals to sum to the credit. The raw ACC-001 accruals sum to 0.918, which would round to 0.92. The rounded daily figures sum to 0.93, and 0.93 is capitalized.

## Interest remainder

The wording says a rounding remainder may be discarded.

Resolution: no monetary remainder is discarded. The exact sum of rounded daily accruals is capitalized.

## Duplicate events

The assessment does not define duplicate event delivery.

Resolution: a repeated event ID within a replay is reported and ignored, and the ledger rejects a repeated entry ID. Both guards are in memory only; production would require a durable idempotency store.

## Declined vs released authorizations

Resolution: a refused authorization is recorded as DECLINED and never reserves funds. RELEASED is reserved for holds that were active and later given back.

## Authorization lifecycle

The supplied stream only demonstrates approval and settlement.

Production would additionally need expiry, cancellation, release and partial-capture semantics.
