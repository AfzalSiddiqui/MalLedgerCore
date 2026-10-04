# MalLedgerCore

A small in-memory ledger. It takes a stream of banking events (credits, debits, card authorizations, settlements, a reversal), replays them over six days, and works out balances, overdraft fees and interest along the way.

There's no database, API or UI. That was the brief, and it keeps the interesting part, the ledger logic, front and centre.

## What it does

- Keeps an append-only list of ledger entries. Nothing is ever edited or deleted.
- Tracks two dates for every event: the day it arrived and the day it counts for (its value date).
- Handles card authorization holds, which reduce available balance but not the ledger balance. A repeated authorization ID gets the original decision, not a second hold.
- Settles authorizations, releases them (cancellation, reversal or expiry), and rejects settlements it can't match.
- Reverses entries by adding an opposite entry, never by removing the original.
- Charges a daily overdraft fee when a day closes negative.
- Accrues daily interest and pays it as a single credit on the last day.
- Splits amounts into instalments without losing a fils.
- Prints a report for each day.

## How it fits together

```text
Event Stream
     |
     v
Ledger Replay
     |
     +--> AppendOnlyLedger
     +--> AuthorizationService
     +--> SettlementService
     +--> ReversalService
     +--> FeeService
     +--> InterestService
     |
     v
Daily Report
```

ARCHITECTURE.md has the longer version, including what each choice costs.

## Money

All amounts are stored as whole numbers of the smallest unit: fils for both currencies, so 100 per AED and 1000 per BHD. That means no floating point anywhere. AED has 2 decimal places and BHD has 3.

## Arrival day vs value date

These are two different things, and keeping them apart is the heart of this exercise. E7 arrives on Day5, but its value date is Day2. The ledger records it when it arrives, and from then on it counts toward every balance from Day2 onwards.

## Append-only

Entries are never changed. A reversal is just a new entry pointing back at the original:

```text
E7  DEBIT     -620.00
E9  REVERSAL  +620.00  -> references E7
```

## Running it

You need Node 22 (see `.nvmrc`).

```bash
npm install
npm run replay
npm test
```

`npm run replay` compiles the project, replays E1 to E10 and prints a report for each day. `npm test` runs the test suite.

**One test fails on purpose.** That's `tests/known-gap.test.ts`. The brief asked for a failing test against my own design, and this one shows a real weakness: the customer keeps paying fees for a debit the bank reversed. The comments in the test explain it. Everything else should pass.

## Reading the replay output

For each day you'll see:

| Line | What it means |
|---|---|
| `closing (as known)` | The balance as it looked when that day was closed. Day2 shows 250.00 because E7 hadn't arrived yet. |
| `closing (final)` | The same day's balance once the whole stream has been replayed, including late entries, fees and the reversal. |
| `fees booked at this close` | Any overdraft fees charged by that day's end-of-day run, and which day each one is for. `(back-valued)` means a late event turned an earlier day negative. |
| `authorization states` | Each authorization as it stood at that day's close: ACTIVE, SETTLED or DECLINED. |
| `error` | Anything that was refused, such as an unknown authorization or a declined authorization. A line starting `WARNING (accepted)` went through but deserves a look. Here that's the late E10. |

The last block lists each day's interest accrual and the total paid on Day6.

## What you should see

| | ACC-001 (AED) | ACC-002 (BHD) |
|---|---|---|
| Closing as known, Day1–Day6 | 250.00, 250.00, 650.00, 465.00, −230.00, 390.93 | 0.000 ×5, 10.008 |
| Closing final, Day1–Day6 | 250.00, 225.00, 625.00, 415.00, 390.00, 390.93 | 0, 0, 0, 0, 10.000, 10.008 |
| Overdraft fees | 3 × 25.00, for Day2, Day4 and Day5, all charged at Day5's close | none |
| Authorizations | Auth-A approved, then settled for 185.00. Auth-B declined. | — |
| Errors | E6 (Auth-Z doesn't exist), E8 (Auth-B declined) | E10 arrived late (warning) |
| Interest paid | 0.93 | 0.008 |

NUMBERS.md shows where every one of these comes from.
