# Worklog

## 2026-10-03

### 18:47:54 +0400
- Initialized the repository.

### 19:14:36 +0400
- Initialized the MalLedgerCore TypeScript project.

### 20:01:20 +0400
- Implemented the value-dated append-only ledger foundation.

### 20:06:38 +0400
- Merged the value-dated ledger foundation.

## 2026-10-04

### 01:13:54 +0400
- Added authorization holds and available-balance calculation.

### 01:15:50 +0400
- Merged authorization hold integrity changes.

### 01:24:45 +0400
- Added settlement handling for authorization holds.

### 01:29:26 +0400
- Merged settlement handling changes.

### 01:36:52 +0400
- Added append-only reversal handling.

### 01:38:59 +0400
- Merged append-only reversal changes.

### 01:46:34 +0400
- Added daily overdraft fee assessment.

### 01:50:32 +0400
- Merged daily overdraft fee changes.

### 11:57:36 +0400
- Added daily interest accrual and capitalization.

### 11:59:43 +0400
- Merged daily interest accrual changes.

### 12:04:23 +0400
- Added E1–E10 event replay and daily ledger reporting.

### 12:18:56 +0400
- Documented ledger decisions, numbers, ambiguities, rejected criteria and assessment trade-offs.

## Design Decisions

- Ledger entries are append-only.
- Reversals use compensating entries instead of mutating existing entries.
- Value dates are preserved independently from event arrival days.
- Authorization holds reduce available balance but do not change ledger balance.
- Unknown authorization settlements are rejected without debiting funds.
- Overdraft fees are assessed once per account and assessed date.
- Daily interest is calculated on positive closing balances only.
- Monetary values use integer minor units with currency-specific precision.
- Exact monetary conservation takes priority over equal rounded installments.
- BHD 10.000 is split as 3.334 + 3.333 + 3.333 to conserve the exact amount.
- Rounded daily interest accruals are summed exactly before capitalization.
- Fees remain after later reversals because the ledger is append-only.

## 2026-10-04 (correctness review)

### 18:09–18:15 +0400
- AI-assisted review (Claude): checked the replay against independently derived figures and found five problems.
  - Overdraft fees were only assessed for value dates touched by that day's debits, so E7 produced 1 fee instead of 3. Day5 was missed even though Day5 was the day being closed and closed negative.
  - A late event (E10) made the replay close Day6, then close Day5 again.
  - The daily report showed final authorization states on every day (Auth-A SETTLED on Day2).
  - There was no runnable replay script.
  - The only "failing" test used `it.fails`, so it passed.
- Fixed: every value date up to the closing day is re-checked at each close; the clock only moves forward, with a late-arrival warning; authorization states and as-known balances are snapshotted at each close; added `npm run replay`; added one real failing test (`tests/known-gap.test.ts`).
- Updated the tests to the corrected figures: 3 fees (Day2, Day4, Day5), interest 0.93 (was 0.98), Day4 final 415.00 (was 440.00).
- Updated README, AMBIGUITIES, REJECTED and NUMBERS to match.
