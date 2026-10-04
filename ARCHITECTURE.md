# Architecture

## The big picture

```text
SCENARIO_EVENTS (in stream order)
        |
        v
LedgerReplay.replay()            the clock runs Day1 to Day6 and never goes back
   |  for each event: close any days we've moved past, then handle the event
   |  late event (E10)? flag it, handle it today, keep its value date
   |
   +--> AppendOnlyLedger         money entries: CREDIT, DEBIT, FEE, INTEREST, REVERSAL
   +--> AuthorizationService     holds: ACTIVE / DECLINED / SETTLED (kept outside the ledger)
   +--> SettlementService        posts a DEBIT and marks the hold SETTLED
   +--> ReversalService          posts an opposite REVERSAL entry
   |
   +--> closeDay(day)
          1. fees: check every value date from Day1 to today, oldest first
          2. last day only: work out interest for every day, pay the total
          3. snapshot balances, authorization states and fees for the report
        |
        v
DailyReport[]  ->  src/run.ts prints it (npm run replay)
```

Below are the main decisions and what each one costs.

## 1. Balances are worked out, not stored

`balanceAt(account, valueDate)` adds the opening balance to every entry with a value date on or before the date asked for.

**Why:** a back-dated entry like E7 (arrives Day5, counts from Day2) changes every balance from Day2 onwards. A balance that's always recalculated can't go out of date.

**Cost:** every lookup goes through every entry. That's nothing with the 14 entries in this replay, but it would hurt at bank scale. At scale I'd cache a balance per account per day and throw the cache away from the value date of any back-dated entry onwards. The entries would stay the source of truth.

## 2. Entries have a value date but no arrival date

Each entry knows which day it counts for, but not which day it arrived.

**Why:** it keeps the entry model small.

**Cost:** you can't ask the ledger afterwards what Day2 looked like as of Day5. The replay gets round this by taking a snapshot at each day's close. Criterion 1's test has to rebuild that view by hand, leaving out E9 and the fees. With more time I'd add an arrival date (`postedOn`) to each entry, so both views come straight from the ledger.

## 3. Holds live outside the ledger

**Why:** "A hold reduces available balance but not ledger balance." If holds aren't in the ledger, that's true automatically.

**Cost:** a hold's status is changed in place (ACTIVE → SETTLED), so authorizations don't have the same append-only history as money. That's also why the report has to snapshot states at each close. A list of hold events (approved, settled, released) would fix both.

## 4. Fees: check every day, every close

**Why:** the fee rule is defined per day, on "all entries with value_date ≤ that day", and the fee carries that day's value date. So a back-dated debit has to be able to cause a fee for an earlier day. Days are checked oldest first because a fee on one day is part of the next day's balance. Fees are tracked per account and day, so checking again never charges twice.

**Cost:**
- It's slower: every close checks every day against every entry.
- One late debit can trigger several fees at once. Here, three at Day5's close.
- A fee knows which day it's for, but not which entry caused it. So when E9 cancels E7, nothing can tell which fees E7 was responsible for. `tests/known-gap.test.ts` shows the outcome: AED 75.00 charged for a debit the bank took back.

**What I tried first:** only checking days touched by that day's debits. It missed Day4 and Day5.

## 5. Interest is calculated once, at the end

**Why:** nothing gets paid until Day6, and by then E7, E9 and the fees have rewritten Day2 to Day5. Booking interest daily would mean correcting it afterwards. The amount paid is defined as the sum of the rounded daily amounts, so the two always match.

**Cost:** there's no final interest figure until Day6. And rounding each day separately (0.93) gives a different answer from rounding the total once (0.92). The brief asks for the day-by-day version.

## 6. Stream order wins

**Why:** the brief says to replay "in this order". E10 (labelled Day5) arrives after E9 (Day6). Reopening Day5 would rewrite something already reported, and refusing E10 would lose money.

**Cost:** ACC-002's Day5 reads 0.000 as known at the time and 10.000 in the final history. That's deliberate, and the report flags it.

## 7. Money as whole fils (bigint)

**Why:** the arithmetic is exact, and the scales (100 for AED, 1000 for BHD) are spelled out. There's no floating point anywhere.

**Cost:** rounding has to be written by hand (`roundHalfUp` in InterestService). Mixing currencies is caught when the code runs, not by the type checker.

## 8. Only the customer side of the books

Only customer accounts are modelled. A real core banking system would be double-entry: a fee would also credit a fee-income account, interest would debit an interest-expense account, and an unknown settlement would sit in a suspense account, so every posting balances. I left that out because the brief only asks about customer balances, fees, authorizations and errors.

## 9. Not built

- saving anything to disk
- concurrency
- durable duplicate protection (the current checks only live in memory)
- hold expiry and release
- fee caps
- fee refunds
- chargebacks
- currency exchange
