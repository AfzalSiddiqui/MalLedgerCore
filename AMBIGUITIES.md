# Ambiguities

The brief leaves quite a few things open. Here's each one I ran into, what I decided and why. Where a decision changes a number, I've given the number.

## Arrival day vs value date

E7 arrives on Day5 but its value date is Day2.

**Decision:** events are processed in the order they arrive. Their effect on balances uses the value date they carry.

## Charging fees for past days

The brief doesn't say what happens when a late event turns an earlier day negative. Does that day get a fee?

**Decision:** yes. At the end of every day, I go back through every value date from Day1 up to that day, oldest first. Any date that closes negative and hasn't been charged yet gets a fee. A fee is tracked per account and date, so no date can be charged twice.

**Why:** the rule says a fee is due when "that day's closing ledger balance (all entries with value_date ≤ that day) is negative", and that the fee is booked "with value_date equal to the day assessed". Both phrases only make sense if past days can be charged.

**What it does here:** E7 turns three days negative, so Day5's close charges three fees.
- Day2 goes to −370.00.
- Day4 goes to −180.00, once the Day2 fee is counted.
- Day5 goes to −205.00.

Day3 just about survives at 5.00, because the 400.00 credit covers the −395.00.

**What I tried first:** only checking dates that had a debit that day. That charged Day2 and nothing else. It even missed Day5, which was the day being closed and was clearly negative. REJECTED.md has more on this.

## Fees affecting later days

Dates are checked oldest first, because a fee on one day is part of the next day's balance. So a fee can push the following day negative. It doesn't happen here: Day3 stays at 5.00.

## No fee for the BHD account

The brief only gives an AED 25.00 fee. There's no BHD amount and no exchange rate.

**Decision:** ACC-002 has no fee set, so it never gets charged. Charging 25.000 BHD would be about ten times too much, and I didn't want to make up an exchange rate. It doesn't matter in practice, because ACC-002 never goes negative.

## Is zero negative?

No. A balance of exactly 0.00 doesn't get a fee, and it doesn't earn interest either. Interest needs a balance above zero.

## Fees after the reversal

You could read the brief as saying E9 should put everything back the way it was before E7, fees included.

**Decision:** E9 adds an entry that cancels E7, but the three fees stay. The reason isn't the append-only rule: a refund would just be three new +25.00 entries. The real reason is that the brief has no refund rule, and whether to refund is a business decision, not a coding one. `tests/known-gap.test.ts` shows what this costs the customer.

## Before or after the fee?

The −370.00 for Day2 is the balance straight after E7 and before the fee. After the fee it's −395.00. After E9 reverses E7, it's 225.00.

## The authorization after the late debit

E8 (Auth-B) arrives after E7 has already been posted.

**Decision:** the authorization check uses whatever the ledger knows at that moment, including E7. On Day5 that's −155.00. Fees only get charged at the end of the day, so they aren't counted yet. Taking the 90.00 hold would leave −245.00, so Auth-B is declined. Counting the fees it would be −320.00, so it's declined either way.

## Debits aren't checked against the balance

The brief only applies the available-balance check to authorizations, so E7 goes through even though it overdraws the account. The overdraft fee is the consequence.

## Settling for less, or more, than the hold

Auth-A held 200.00 and settled for 185.00. The whole hold is cleared, so the leftover 15.00 is free again.

A settlement for more than the hold is rejected. That's my choice, and it's stricter than real card schemes, which allow some overshoot (tips, for example).

## A settlement with no authorization (Auth-Z)

**Decision:** it's rejected with an error, and nothing touches the customer's account.

In real card processing these turn up all the time: offline transactions, force posts. By the time the clearing file arrives, the money has usually already left the bank. So a real system would park it in a suspense account and investigate. This project doesn't have a suspense account, so rejecting it is the safe option here.

## E10 arrives out of order

E10 is labelled Day5 but turns up after E9, which is Day6. The brief says to replay "in this order".

**Decision:** the clock only moves forward. E10 is processed on Day6, keeps its Day5 value date and gets flagged with a `WARNING (accepted)`. Day5 isn't reopened. So ACC-002 shows 0.000 for Day5 as known at the time, and 10.000 for Day5 in the final history.

The first version of the code got this wrong: it closed Day6 when E10 arrived, then closed Day5 a second time at the end.

## Which balance the report shows

If the report only showed final balances, you couldn't see what was known on each day. If it only showed as-known balances, you couldn't see how history was corrected. So it shows both.

## Authorization states in the report

Each authorization is shown as it was at that day's close. The earlier version showed the final state every day, so Auth-A appeared SETTLED on Day2, two days before it actually settled.

## Quiet days

Every day gets closed in order, even if nothing happened, so its fee check and report still run.

## Splitting BHD 10.000 into three

Three payments of 3.334 would add up to 10.002.

**Decision:** 3.334 + 3.333 + 3.333, which adds up to exactly 10.000.

## When interest is worked out

**Decision:** at Day6's close, interest for every day is calculated from the final history and paid as one total.

The alternative was to accrue each day on the balance as it looked that evening (250, 250, 650, 465, −230 → 0, 390). That gives 0.81 instead of 0.93. I didn't do that, because nothing gets paid until Day6, and by then E7, E9 and the fees have changed Day2 to Day5.

Day6's interest is worked out on the balance before the interest credit, so the credit doesn't earn interest on itself.

## Rounding mode

The brief doesn't specify one, so I used half-up. None of the daily amounts here land exactly on a half (0.166 and 0.156 are the closest), so the choice doesn't change any number.

## Round each day, or round the total?

The brief says the rounded daily amounts must add up to the credit. The raw daily amounts for ACC-001 add up to 0.918, which would round to 0.92. Rounded day by day they add up to 0.93, so 0.93 is what gets paid.

## Discarding a rounding remainder

One of the criteria says any rounding remainder can be thrown away.

**Decision:** nothing is thrown away. The credit is simply the sum of the rounded daily amounts.

## The same event twice

The brief doesn't say what to do with a duplicate.

**Decision:** a repeated event ID is reported and ignored, and the ledger refuses a repeated entry ID. Both checks only live in memory. A real system would need something durable.

## Declined vs released

A declined authorization never held any money, so it's marked DECLINED. RELEASED is kept for holds that were active and then given back. Mixing the two up would confuse an audit.

## The authorization lifecycle

This stream only uses approve and settle. A real system would also need expiry, cancellation, release and partial capture.
