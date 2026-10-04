# Rejected Criteria and Approaches

## Acceptance criterion 2

The literal wording around the overdraft fee is rejected because it does not distinguish the historical pre-fee balance from the final post-fee balance.

The implementation records the negative Day2 balance and then appends one AED 25.00 fee.

## Acceptance criterion 6

Rejected.

A reversal cannot remove the already-assessed fee because the ledger is append-only.

E9 compensates E7 with a new entry and leaves both E7 and the fee intact.

## Acceptance criterion 7

Rejected.

Three BHD 3.334 installments equal BHD 10.002, not BHD 10.000.

The implementation preserves exact monetary value.

## Acceptance criterion 8

Rejected.

Discarding a monetary remainder would create an unexplained accounting difference.

The implementation preserves the exact sum of rounded daily interest accruals.

# Abandoned approaches

## Floating-point money

Rejected because binary floating point is unsuitable for exact financial amounts.

## Mutating entries during reversal

Rejected because it violates append-only auditability.

## Treating authorization holds as ledger debits

Rejected because a hold reserves available balance without posting a ledger transaction.

## Allowing unknown settlements

Rejected because funds must not leave the account without a valid authorization.

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
