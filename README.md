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
