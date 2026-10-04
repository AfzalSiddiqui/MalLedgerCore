# Numbers

Every constant in the code, why it's that value and not half of it, and how each number in the output is worked out.

## Currency precision

| Currency | Decimal places | Smallest units per 1 |
|---|---:|---:|
| AED | 2 | 100 |
| BHD | 3 | 1000 |

Money is stored in whole smallest units (fils), never as floating point. These figures come from the currencies themselves: a dinar really does have 1000 fils. With only 2 decimals, BHD's daily interest of 0.004 would round to 0.00 and vanish.

## Opening balances

| Account | Currency | Opening |
|---|---|---:|
| ACC-001 | AED | 0.00 |
| ACC-002 | BHD | 0.000 |

## Overdraft fee

AED 25.00, charged once per account per day when that day closes below 0.00. The amount comes from the brief. If it were half (12.50), the three fees here would come to 37.50 instead of 75.00. There's no BHD fee, because the brief doesn't give one.

## Interest rate

0.04% a day, which is 0.0004, or 4 / 10,000. In the code it's written as a fraction so it stays exact.

It's per day, not per year, so there's no dividing by 365. The easy slip is writing 0.004, which is ten times too much.

Half the rate (2 / 10,000) doesn't give half the interest. ACC-001 would get 0.47, not 0.465, because each day is rounded on its own:

- 0.05
- 0.05 (0.045 rounds up)
- 0.13 (0.125 rounds up)
- 0.08, 0.08, 0.08

Two of those days land exactly on a half, so at that rate the rounding mode would actually matter.

Rounding is half-up. Only positive balances earn interest.

## Authorization threshold

An authorization is approved if available balance minus the hold is zero or more. The brief says "at or above zero", so exactly zero gets approved.

## BHD instalments

10.000 split three ways is 10,000 fils ÷ 3 = 3,333 with 1 fil left over. That fil goes on the first payment:

3.334 + 3.333 + 3.333 = 10.000

Getting the total exactly right matters more than making the three payments identical.

## The events

| Event | Amount |
|---|---:|
| E1 | AED 1,200.00 credit |
| E2 | AED 950.00 debit |
| E3 | AED 200.00 authorization |
| E4 | AED 400.00 credit |
| E5 | AED 185.00 settlement |
| E6 | AED 180.00 settlement (rejected) |
| E7 | AED 620.00 debit (arrives late) |
| E8 | AED 90.00 authorization |
| E10 | BHD 10.000 credit |

## Day2, step by step

- Before E7: 250.00
- Add E7 (value Day2): 250.00 − 620.00 = −370.00
- Add the overdraft fee: −395.00
- Add E9's reversal: −395.00 + 620.00 = 225.00

E7 also drags Day4 down (5.00 − 185.00 = −180.00) and Day5, so those two days get fees as well. The tables below show the rest.

## ACC-001, event by event

| Event | Day | What happens | Ledger (value ≤ today) | Holds | Available |
|---|---|---|---:|---:|---:|
| E1 | Day1 | credit 1200.00 | 1200.00 | 0 | 1200.00 |
| E2 | Day1 | debit 950.00 | 250.00 | 0 | 250.00 |
| E3 | Day2 | Auth-A 200.00 approved (250.00 − 200.00 = 50.00) | 250.00 | 200.00 | 50.00 |
| E4 | Day3 | credit 400.00 | 650.00 | 200.00 | 450.00 |
| E5 | Day4 | Auth-A settles for 185.00, hold cleared | 465.00 | 0 | 465.00 |
| E6 | Day4 | Auth-Z doesn't exist: rejected, nothing posted | 465.00 | 0 | 465.00 |
| E7 | Day5 | debit 620.00, value Day2 | −155.00 | 0 | −155.00 |
| E8 | Day5 | Auth-B 90.00: −155.00 − 90.00 = −245.00, declined | −155.00 | 0 | −155.00 |
| Day5 close | | fees for Day2, Day4 and Day5 (3 × 25.00) | −230.00 | | |
| E9 | Day6 | reversal +620.00, value Day2 | 390.00 | | |
| Day6 close | | interest of 0.93 paid | 390.93 | | |

## Interest, day by day (final history)

| Day | ACC-001 balance | Raw | Rounded | ACC-002 balance | Rounded |
|---|---:|---:|---:|---:|---:|
| Day1 | 250.00 | 0.100 | 0.10 | 0.000 | 0.000 |
| Day2 | 225.00 | 0.090 | 0.09 | 0.000 | 0.000 |
| Day3 | 625.00 | 0.250 | 0.25 | 0.000 | 0.000 |
| Day4 | 415.00 | 0.166 | 0.17 | 0.000 | 0.000 |
| Day5 | 390.00 | 0.156 | 0.16 | 10.000 | 0.004 |
| Day6 | 390.00 | 0.156 | 0.16 | 10.000 | 0.004 |
| Total | | 0.918 | **0.93** | | **0.008** |

The raw total of 0.918 would round to 0.92, but the brief says the rounded daily amounts must add up to what's paid, so it's 0.93.

That leaves ACC-001 on 390.93 and ACC-002 on 10.008.

Two figures for comparison:
- Accruing on each day's balance as it looked at the time would give 0.81.
- With no fees (if they'd been refunded), interest would be 1.03.
