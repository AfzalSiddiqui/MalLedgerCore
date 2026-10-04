# Worklog

## Project setup

- Established the TypeScript/Node.js project.
- Added the domain model and test setup.

## Ledger foundation

- Added currency-aware money representation.
- Added integer minor-unit calculations.
- Added append-only ledger entries.
- Added value-dated historical balance calculation.

## Authorization and settlement

- Added authorization holds and available balance.
- Added settlement validation.
- Rejected settlement against unknown authorization without creating a debit.

## Reversal

- Added append-only compensating reversals.
- Original ledger entries remain immutable.

## Fees

- Added daily overdraft fee assessment.
- Fee assessment is limited to once per account/date.

## Interest

- Added 0.04% daily interest.
- Added positive-balance-only calculation.
- Added currency-aware half-up rounding.
- Added end-of-period capitalization.
- Added duplicate-capitalization protection.

## Event replay

- Added E1-E10 event model.
- Added arrival-order replay with independent value dates.
- Added late E7 processing.
- Added E9 reversal.
- Added exact BHD installment splitting.
- Added daily reporting.

## Verification

Current implementation:

35 tests passing.

TypeScript build passing.

## Important design decisions

- Money is represented with integer minor units.
- Value date is independent from arrival day.
- Reversals append compensating entries.
- Fees remain after later reversals.
- Exact monetary conservation takes priority over equal rounded installments.
- Rounded daily interest accruals are summed exactly.

Exact commit timestamps are available in Git history and are intentionally not fabricated here.
