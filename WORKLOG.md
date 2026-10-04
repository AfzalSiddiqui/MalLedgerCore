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

### 12:27 +0400
- Replaced the worklog's placeholder times with real commit timestamps.

### 12:28 +0400
- Documented the rejected "three equal BHD instalments" criterion in REJECTED.md.

### ~16:00–17:44 +0400
- Correctness fixes, made with an AI tool and committed as ae0434c.
  - Negative or zero settlement amounts rejected, with named rejection reasons.
  - Duplicate ledger entry IDs rejected; instalments posted all-or-nothing.
  - Value dates compared as day numbers (value-date.ts), so Day10 sorts after Day2.
  - Overdraft fee decided on the closing balance, not intraday; settlements can trigger it.
  - DECLINED kept separate from RELEASED; replay made one-shot; duplicate events ignored.
  - 17 tests in tests/correctness-fixes.test.ts.

## Design decisions, in short

- Ledger entries are append-only.
- Reversals add an opposite entry; nothing is edited.
- Every event keeps two dates: when it arrived and which day it counts for.
- Holds lower available balance, not ledger balance.
- A settlement with no matching authorization is rejected, and the customer isn't charged.
- At most one overdraft fee per account per day.
- Only positive balances earn interest.
- Money is stored in whole fils, at each currency's own precision.
- The exact total matters more than identical instalments, so BHD 10.000 becomes 3.334 + 3.333 + 3.333.
- The interest paid is exactly the sum of the rounded daily amounts.
- Fees stay after a reversal because the brief has no refund rule. A refund would just be new entries.

## 2026-10-04 (correctness review)

### 18:09–18:15 +0400
- Reviewed the replay with AI help (Claude), checking it against figures worked out separately. Found five problems:
  - Fees were only checked on days that had a debit that day, so E7 caused 1 fee instead of 3. It even missed Day5, the day being closed, which was negative.
  - The late E10 made the replay close Day6, then close Day5 a second time.
  - The report showed each authorization's final state on every day, so Auth-A appeared SETTLED on Day2.
  - There was no script to run the replay.
  - The only "failing" test used `it.fails`, which means it actually passed.
- Fixed all five:
  - every day up to the one being closed is checked for fees;
  - the clock only moves forward, and late events are flagged;
  - each day's balances and authorization states are snapshotted at close;
  - added `npm run replay`;
  - added a real failing test (`tests/known-gap.test.ts`).
- Updated the tests to the corrected numbers: 3 fees (Day2, Day4, Day5), interest 0.93 (was 0.98), Day4 final 415.00 (was 440.00). Updated README, AMBIGUITIES, REJECTED and NUMBERS to match.

### 18:20–18:25 +0400
- Went through the docs again with AI help (Claude):
  - Fixed an unclosed code block that made half the README render as code.
  - Corrected three places that said fees can't be refunded because of append-only. The real reason is that there's no refund rule.
  - Made the Auth-Z wording in REJECTED.md match AMBIGUITIES.md.
  - Added ARCHITECTURE.md.

### 18:25–18:30 +0400
- Rewrote README, AMBIGUITIES, NUMBERS, REJECTED and ARCHITECTURE in plainer language, with AI help (Claude). The numbers and decisions are unchanged; only the wording is different.

### 18:38–18:50 +0400
- With AI help (Claude), closed two authorization gaps found while writing the Part 2 document:
  - A repeated authorization ID used to create a second hold. Authorizing is now idempotent on the ID, and the replay flags the retry.
  - RELEASED was declared but nothing could reach it. Added an `AUTHORIZATION_RELEASE` event and `AuthorizationService.release`.
- Added `tests/authorization-lifecycle.test.ts` (5 tests). The suite is now 63 tests with exactly 1 intended failure. Replay output is unchanged.
- Added the reasoning for criteria 1, 3, 4 and 5 to REJECTED.md, and updated AMBIGUITIES, README and ARCHITECTURE.
- Measured how authorization cost grows with volume, for the Part 2 document. With 100 accounts: 1,000 authorize+settle pairs took 31 ms, 10,000 took 1.4 s and 30,000 took 12.5 s. Per-pair cost grows linearly with history, so total cost grows quadratically.

## 2026-10-04 (verification-command cleanup)

### 18:49:01 +0400
- Split the passing verification suite (`npm test`) from the intentionally failing design-gap demonstration (`npm run test:known-gap`).
- Added `npm run test:all` for reviewers who want to observe the complete suite, including the required failure.
- Kept the design-gap test as a plain failing test; it is not skipped, inverted, or hidden.
