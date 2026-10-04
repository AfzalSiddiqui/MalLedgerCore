# Numbers and Constants

## Currency precision

| Currency | Decimal places | Minor-unit scale |
|---|---:|---:|
| AED | 2 | 100 |
| BHD | 3 | 1000 |

Money uses integer minor units. Floating-point arithmetic is not used.

## Account opening balances

| Account | Currency | Opening balance |
|---|---|---:|
| ACC-001 | AED | 0.00 |
| ACC-002 | BHD | 0.000 |

## Overdraft fee

AED 25.00 per account per assessed date when the historical closing ledger balance is negative (strictly below 0.00). The brief gives this amount. At half (12.50), the three fees would total 37.50 instead of 75.00. No BHD amount is configured, because the brief gives none.

## Interest

Daily rate: 0.04%.

Implementation ratio:

4 / 10,000

Interest applies only to positive closing balances and uses half-up rounding to the account currency precision.

0.04% = 0.0004 = 4 / 10,000, per day (not per year, so not divided by 365). The easy mistake is 0.004, which is ten times too much. At half the rate (2 / 10,000), ACC-001 would earn 0.47 with half-up rounding: 0.05 + 0.05 (0.045 rounds up) + 0.13 (0.125 rounds up) + 0.08 + 0.08 + 0.08. That is not exactly half of 0.93, because each day is rounded separately. At that rate the rounding mode would matter, since two days land exactly on a half.

## Authorization threshold

Approved when available − hold ≥ 0 ("at or above zero"), so exactly zero is approved.

## BHD installments

E10:

10.000 / 3

Using minor units:

10,000 / 3 = 3,333 remainder 1

Therefore:

3.334 + 3.333 + 3.333 = 10.000

Exact amount preservation takes priority over equal rounded installments.

## Event amounts

| Event | Amount |
|---|---:|
| E1 | AED 1,200.00 credit |
| E2 | AED 950.00 debit |
| E3 | AED 200.00 authorization |
| E4 | AED 400.00 credit |
| E5 | AED 185.00 settlement |
| E6 | AED 180.00 attempted settlement |
| E7 | AED 620.00 late debit |
| E8 | AED 90.00 authorization |
| E10 | BHD 10.000 credit |

## Key derived balances

Before E7:

250.00

After E7 using its Day2 value date:

250.00 - 620.00 = -370.00

After the AED 25.00 overdraft fee:

-395.00

After E9 reverses E7:

-395.00 + 620.00 = 225.00

E7 also makes Day4 (5.00 − 185.00 = −180.00) and Day5 negative, so two more fees are booked for those dates. See the derivation tables below.

## Replay derivation, ACC-001

| Event | Day | Effect | Ledger (value ≤ today) | Holds | Available |
|---|---|---|---:|---:|---:|
| E1 | Day1 | credit 1200.00 | 1200.00 | 0 | 1200.00 |
| E2 | Day1 | debit 950.00 | 250.00 | 0 | 250.00 |
| E3 | Day2 | Auth-A 200.00 approved (250.00 − 200.00 = 50.00 ≥ 0) | 250.00 | 200.00 | 50.00 |
| E4 | Day3 | credit 400.00 | 650.00 | 200.00 | 450.00 |
| E5 | Day4 | settle Auth-A 185.00; hold cleared | 465.00 | 0 | 465.00 |
| E6 | Day4 | Auth-Z unknown: rejected, nothing posted | 465.00 | 0 | 465.00 |
| E7 | Day5 | debit 620.00, value Day2 | −155.00 | 0 | −155.00 |
| E8 | Day5 | Auth-B 90.00: −155.00 − 90.00 = −245.00 < 0, declined | −155.00 | 0 | −155.00 |
| Day5 close | | fees for Day2, Day4, Day5 (3 × 25.00) | −230.00 | | |
| E9 | Day6 | reversal +620.00, value Day2 | 390.00 | | |
| Day6 close | | interest 0.93 capitalized | 390.93 | | |

## Interest derivation (final history)

| Day | ACC-001 base | Raw | Rounded | ACC-002 base | Rounded |
|---|---:|---:|---:|---:|---:|
| Day1 | 250.00 | 0.100 | 0.10 | 0.000 | 0.000 |
| Day2 | 225.00 | 0.090 | 0.09 | 0.000 | 0.000 |
| Day3 | 625.00 | 0.250 | 0.25 | 0.000 | 0.000 |
| Day4 | 415.00 | 0.166 | 0.17 | 0.000 | 0.000 |
| Day5 | 390.00 | 0.156 | 0.16 | 10.000 | 0.004 |
| Day6 | 390.00 | 0.156 | 0.16 | 10.000 | 0.004 |
| Total | | 0.918 | **0.93** | | **0.008** |

The raw total of 0.918 would round to 0.92. The brief requires the rounded daily figures to sum to the credit, so 0.93 is capitalized. Final closes: ACC-001 390.93, ACC-002 10.008.

Comparison figures: using as-known bases, interest would be 0.81. With no fees (if they were refunded), it would be 1.03.
