# Architecture

## Shape

```text
SCENARIO_EVENTS (stream order)
        |
        v
LedgerReplay.replay()            processing clock: Day1..Day6, only moves forward
   |  for each event: close every day left behind, then process the event
   |  late event (E10)? -> WARNING, processed on the open day, keeps its value date
   |
   +--> AppendOnlyLedger         money entries: CREDIT, DEBIT, FEE, INTEREST, REVERSAL
   +--> AuthorizationService     holds: ACTIVE / DECLINED / SETTLED (not ledger entries)
   +--> SettlementService        DEBIT entry + hold -> SETTLED
   +--> ReversalService          compensating REVERSAL entry
   |
   +--> closeDay(day)
          1. FeeService: re-check every value date Day1..day, ascending
          2. last day only: InterestService accrues Day1..Day6 from final history, capitalizes the sum
          3. snapshot: as-known closing balances, authorization states, fees booked
        |
        v
DailyReport[]  ->  src/run.ts prints it (npm run replay)
```

## Decisions and trade-offs

### 1. Balances are computed from entries, never stored
`balanceAt(account, valueDate)` sums the opening balance plus every entry with `valueDate <= valueDate`.

**Why:** a back-valued entry (E7: arrives Day5, value Day2) changes every closing balance from Day2 onward. A computed balance cannot go stale.

**Cost:** each query is O(entries). That is irrelevant at the 14 entries in this replay, but significant at bank scale. **At scale:** cache a balance per (account, value date) and invalidate it from the value date of any back-valued entry onward. The entries stay the source of truth.

### 2. Value date on entries, but no posting date
Entries carry `valueDate` only. The day each entry was learned about is not stored.

**Why:** that keeps the entry model small.

**Cost:** an "as known on Day N" balance cannot be asked of the ledger later. The replay works around this by taking a snapshot at each day's close (`closingAsKnown`). Criterion 1 (Day2 close as known at end of Day5) has to be reconstructed by excluding E9 and fees by hand in the test. **Next improvement:** add `postedOn` to `LedgerEntry`, making the ledger bitemporal, so both views come from the entries.

### 3. Holds live outside the ledger
**Why:** "A hold reduces available balance but not ledger balance." Keeping holds out of `AppendOnlyLedger` makes that true by construction.

**Cost:** a hold's `status` is mutated in place (ACTIVE → SETTLED), so authorization history is not append-only the way money entries are. The per-day report has to take snapshots of the states to show what they were at each close. An append-only list of hold events (APPROVED, SETTLED, RELEASED) would remove the need for both.

### 4. Fees: re-check every value date at each close
**Why:** the fee rule is defined per day, on "all entries with value_date ≤ that day", and the fee is booked with that day's value date. A back-valued debit must therefore be able to trigger a fee for a past day. Dates are checked in ascending order because a fee for day d is part of day d+1's balance. The (account, date) key makes re-checking safe.

**Cost:** O(days × entries) per close. A single late debit can produce several fees at one close (three at Day5). Fees record the date they are for (`referenceId = valueDate`), not the entry that caused them. So when E9 reverses E7, nothing can tell which fees E7 caused. `tests/known-gap.test.ts` shows the result: AED 75.00 is charged for a reversed debit.

**Rejected alternative:** assess only the value dates touched by that day's debits. It missed Day4 and Day5.

### 5. Interest: once, at the last close, from final history
**Why:** nothing is capitalized before Day6, and by then E7, E9 and the fees have restated Day2–Day5. Daily accrual entries would need corrections. The capitalized credit is defined as the sum of the rounded daily accruals, so the two always agree.

**Cost:** no interest figure is final before Day6. Per-day rounding (0.93) differs from rounding the total (0.92), and the brief requires per-day.

### 6. Stream order is authoritative
**Why:** the brief says "replayed in this order". E10 (labelled Day5) arrives after E9 (Day6). Re-opening a closed day would rewrite what was already reported. Rejecting the event would lose money.

**Cost:** ACC-002's Day5 shows 0.000 as known and 10.000 final. This is intentional and flagged with a WARNING.

### 7. Money as integer minor units (bigint)
**Why:** exact arithmetic, and AED (100) and BHD (1000) scales are explicit. No floating point anywhere.

**Cost:** rounding is written by hand (`roundHalfUp` in InterestService), and currency mismatches are caught at run time, not by the type system.

### 8. Single-entry customer ledger
Only customer accounts are modelled. A production core would be double-entry: a fee credits a fee-income account, interest debits an interest-expense account, and an unknown settlement lands in a suspense account, so every posting balances to zero. This was left out because the brief asks only for customer balances, fees, authorization states and errors.

### 9. Out of scope
Persistence, concurrency, durable idempotency (duplicate guards are in memory only), hold expiry and release, fee caps, fee refunds, chargebacks, FX.
