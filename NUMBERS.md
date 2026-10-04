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

AED 25.00 per account per assessed date when the historical closing ledger balance is negative.

## Interest

Daily rate: 0.04%.

Implementation ratio:

4 / 10,000

Interest applies only to positive closing balances and uses half-up rounding to the account currency precision.

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
