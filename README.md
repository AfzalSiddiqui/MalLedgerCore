# MalLedgerCore

An in-memory financial ledger core for value-dated transactions, authorization holds, settlements, reversals, fees, and interest accrual.

## What this implements

The system replays an ordered event stream against in-memory accounts and produces:

- append-only ledger entries
- historical value-dated balances
- authorization holds and available balance
- settlement validation
- append-only reversals
- daily overdraft fee assessments
- daily interest accrual
- end-of-period interest capitalization
- exact currency-aware installment splitting
- daily operational reports
- rejected-event errors

No database, HTTP API, UI, persistence layer, or external service is used.

## Design

```text
Event Stream
     |
     v
Ledger Replay
     |
     +--> AppendOnlyLedger
     |
     +--> AuthorizationService
     |
     +--> SettlementService
     |
     +--> ReversalService
     |
     +--> FeeService
     |
     +--> InterestService
     |
     v
Daily Report
The implementation intentionally keeps the domain small. The assessment is focused on ledger correctness and reasoning rather than infrastructure.

## Money representation

Money is represented using integer minor units with currency-specific precision.

- AED: 2 decimal places
- BHD: 3 decimal places

No floating-point arithmetic is used for monetary calculations.

## Value dates

Events have an arrival day and a value date.

These are deliberately different concepts.

E7 arrives on Day5 but has value date Day2. The ledger records the event when it arrives while its monetary effect participates in historical balances from Day2.

## Append-only behavior

Ledger entries are never updated or deleted.

A reversal creates a compensating entry referencing the original entry.

```text
E7  DEBIT     -620.00
E9  REVERSAL  +620.00  -> references E7
```

## How to run

Requires Node 22 (see `.nvmrc`).

```bash
npm install
npm run replay   # compile, replay E1–E10, print the per-day report
npm test         # run the test suite
```

**Expected test result: exactly 1 failing test**, `tests/known-gap.test.ts`. It is the deliberately failing test the brief asks for. It is written against this design and annotated inline with what it reveals. Every other test must pass.

## Reading the replay output

For each day, `npm run replay` prints:

| Line | Meaning |
|---|---|
| `closing (as known)` | The closing ledger balance as it stood when that day was closed, before any later back-valued event. The Day2 figure is 250.00 because E7 had not arrived yet. |
| `closing (final)` | The same day's closing balance after the whole stream: every entry with value date ≤ that day, including later back-valued events, fees and reversals. |
| `fees booked at this close` | Each overdraft fee booked by that day's end-of-day run, with the value date it is for. `(back-valued)` marks a fee for an earlier day that a late event turned negative. |
| `authorization states` | Each authorization as it stood at that day's close: ACTIVE, SETTLED or DECLINED. |
| `error` | Rejected events (unknown authorization, declined authorization). Lines starting `WARNING (accepted)` are events that were posted but need attention (a late arrival). |

The final block lists each day's interest accrual (base balance and rounded accrual) and the single amount capitalized on Day6.

## Expected results

| | ACC-001 (AED) | ACC-002 (BHD) |
|---|---|---|
| Closing as known, Day1–Day6 | 250.00, 250.00, 650.00, 465.00, −230.00, 390.93 | 0.000 ×5, 10.008 |
| Closing final, Day1–Day6 | 250.00, 225.00, 625.00, 415.00, 390.00, 390.93 | 0, 0, 0, 0, 10.000, 10.008 |
| Overdraft fees | 3 × 25.00, for Day2, Day4 and Day5, all booked at Day5's close | none |
| Authorizations | Auth-A approved, settled for 185.00; Auth-B declined | — |
| Errors | E6 (Auth-Z unknown), E8 (Auth-B declined) | E10 late-arrival warning |
| Interest capitalized | 0.93 | 0.008 |

See NUMBERS.md for how each number is derived.
