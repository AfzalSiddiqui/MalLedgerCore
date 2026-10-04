# Rejected

Two parts here: which acceptance criteria I didn't accept and why, and the approaches I tried or considered and then dropped.

## The criteria at a glance

| # | Criterion | Verdict |
|---|---|---|
| 1 | Day2 closes at −370.00 at the end of Day5, before fees | Accepted: 1200.00 − 950.00 − 620.00 |
| 2 | E7 causes exactly one fee, on Day2 | **Rejected** |
| 3 | Auth-A's Day4 settlement is accepted | Accepted |
| 4 | A settlement for an unknown authorization is rejected and no money leaves | Accepted, with a caveat (see AMBIGUITIES.md) |
| 5 | If Auth-B is approved, its hold lowers available balance but not ledger balance | Accepted, though it never comes up: Auth-B is declined |
| 6 | After E9, balances and fees go back to their pre-E7 values | **Rejected** |
| 7 | Each BHD instalment is 3.334 | **Rejected** |
| 8 | Any interest rounding remainder is discarded | **Rejected** |

Criteria 5 and 8 both describe things that never happen in this stream, so why accept one and reject the other? Criterion 5 is a correct description of how holds work. Criterion 8 tells the ledger to throw money away, which breaks the "must add up exactly" rule. A rule that never fires is fine if it's right. It's still wrong if it would break another rule when it did fire.

## Criterion 2: E7 causes three fees, not one

Walking through the days after E7:

| Day | Balance before fee | Fee? | Close |
|---|---:|---|---:|
| Day1 | 250.00 | no | 250.00 |
| Day2 | −370.00 | yes | −395.00 |
| Day3 | 5.00 | no | 5.00 |
| Day4 | −180.00 | yes | −205.00 |
| Day5 | −205.00 | yes | −230.00 |

Without E7, Day2, Day4 and Day5 would close at 250.00, 465.00 and 465.00. So all three fees are down to E7.

The criterion doesn't hold up under the simpler model either. If only the day being closed were checked, E7 would cause one fee, but on Day5, not Day2.

You could read it as "Day2 is only charged once", meaning no double charging. That part is true, because fees are tracked per account and day. But the sentence is about what E7 causes, and E7 causes three fees.

## Criterion 6: the fees don't disappear

E9 adds an entry that cancels E7. The three fees stay, though. That isn't because of append-only, since a refund would simply be new entries. It's because the brief doesn't give any refund rule.

Final balances against pre-E7:

| Day | Pre-E7 | After E9 |
|---|---:|---:|
| Day2 | 250.00 | 225.00 |
| Day3 | 650.00 | 625.00 |
| Day4 | 465.00 | 415.00 |
| Day5 | 465.00 | 390.00 |

Interest drops from 1.03 to 0.93.

Even if I added a refund rule, the original fee entries would still be there, with refund entries next to them. The failing test (`tests/known-gap.test.ts`) puts a number on what having no refund rule costs.

## Criterion 7: 3 × 3.334 isn't 10.000

It's 10.002. Paying it out that way would create 0.002 BHD from nothing. The ledger pays 3.334 + 3.333 + 3.333 instead, which comes to exactly 10.000.

## Criteria 1, 3, 4 and 5: why they're accepted

- **1.** At the end of Day5, the entries counting for Day2 or earlier are E1, E2 and E7: 1200.00 − 950.00 − 620.00 = −370.00. Auth-A's hold isn't a ledger entry, and no fee has been booked yet, so the figure stands.
- **3.** When E5 arrives, Auth-A is an ACTIVE hold of 200.00 on the same account, in the same currency. The 185.00 is positive and not above the hold, so it settles. 185.00 is debited and the hold is cleared. It isn't re-checked against available balance, because the hold already reserved that money.
- **4.** Auth-Z was never authorized, so it's rejected with an error and nothing is posted. The caveat is that real card systems post these to a suspense account (AMBIGUITIES.md).
- **5.** True as a rule. An approved hold lowers available balance only, and the tests prove it. In this stream, though, Auth-B is declined (−155.00 − 90.00 = −245.00), so there's no hold for the rule to apply to.

## Criterion 8: nothing gets discarded

Throwing away a remainder leaves a gap in the books that nobody can explain. In this design there's never a remainder anyway, because the interest paid is defined as the sum of the rounded daily amounts.

# Approaches I dropped

## Only checking fees for days that had a debit

This was my first version of the end-of-day fee check. For E7 it charged Day2 only. It missed Day4, and it missed Day5 even though Day5 was the very day being closed and it was negative. Now every day up to the one being closed is checked.

## Closing a day twice when a late event arrives

The first replay loop closed Day6 when E10 (labelled Day5) came in, then closed Day5 again at the end. Now the clock only moves forward, and E10 is treated as a late arrival on Day6.

## Showing final authorization states every day

That made Day2 show Auth-A as SETTLED before it had settled. States are now captured at each day's close.

## Using `it.fails` for the failing test

I dropped this because `it.fails` passes when its body fails. So the suite had no failing test at all, and the test was only checking arithmetic, not my design. It's been replaced by a plain test that genuinely fails against the design.

## Floating-point money

Floating point can't represent amounts like 0.10 exactly, so I never used it.

## Editing entries to reverse them

That would break the audit trail. Reversals are new entries.

## Treating holds as ledger debits

A hold reserves money without moving it, so it belongs outside the ledger.

## Posting unknown settlements to the customer's account

Not for this project: Auth-Z is rejected and nothing touches ACC-001. A real system would post it to a suspense account instead, because settlements without an authorization are normal in card processing and the money has usually already left the bank. See AMBIGUITIES.md.

## Things I didn't build

- **A database:** the brief asks for in-memory.
- **Kafka or other event infrastructure:** far more than this needs.
- **An HTTP API:** the ledger is checked through tests and the replay script.
- **A UI:** it wouldn't help prove the ledger is correct.
- **A generic rules engine:** the rules are few and specific, and an engine would add complexity for nothing.
