# MalLedgerCore — Architecture & Trade-offs

Part 2 of the ledger exercise. This document describes the TypeScript implementation in this repository: `AppendOnlyLedger`, `AuthorizationService`, `SettlementService`, `FeeService`, `InterestService`, and `LedgerReplay`.

`npm run test:all` runs 63 tests. Exactly one intentionally fails: `tests/known-gap.test.ts`.

## 1. Append-only at scale

### What breaks first at 100× volume

The authorization path breaks first because its cost grows with the square of volume, not linearly. Every authorization calls `availableBalance`, which:

- calls `balanceAt`, copying and scanning every entry for the account;
- calls `holdsFor`, filtering one global array of all holds, including settled and declined ones.

Each authorization therefore gets slower as history grows, and the total cost grows quadratically. Measurements taken against this implementation with 100 accounts and authorize-plus-settle pairs:

| Pairs processed | Total time | Time per pair |
|---:|---:|---:|
| 1,000 | 31 ms | 31 µs |
| 10,000 (10×) | 1.4 s | 142 µs |
| 30,000 (30×) | 12.5 s | 418 µs |

At 100×, an authorization pair would take more than a millisecond and a daily batch would take minutes rather than milliseconds. Card schemes require an issuer response within a fixed window; timeouts and stand-in or declined transactions would begin here.

The end-of-day fee sweep is next. Every close re-checks every value date since Day 1 for every account, and every check runs a full `balanceAt` scan. Its cost is accounts × days open × entries per account. It grows indefinitely even at constant transaction volume.

### Where state grows without limit

| Structure | Why it never shrinks |
|---|---|
| `entriesByAccount` | The ledger is append-only by design. It is the source of truth, but every read scans it. |
| `AuthorizationService.holds` | One global hold array; settled and declined holds are neither removed nor indexed. |
| `AppendOnlyLedger.entryIds` | Global set of every entry ID, retained for duplicate checks. |
| `processedEventIds`, `FeeService.assessments` | Duplicate and fee guards retain every key forever. |
| Per-day snapshots and EOD range | One snapshot per closed day; the fee sweep starts at the first day. |

### Cheapest structural change that defers it

Keep a per-account daily balance bucket (`valueDate → net movement`) updated on every append, plus an earliest-dirty-value-date watermark per account.

- `balanceAt` then sums day buckets rather than entries, so cost depends on days rather than transaction history.
- The fee sweep re-checks only from the watermark forward instead of from Day 1.
- Holds move to a map keyed by account and authorization ID; terminal holds leave the active set.

Entries remain the source of truth and buckets can be rebuilt from them. With a back-value limit, dates older than the limit can be frozen and never rechecked.

## 2. Value-dated entries in production

A value date changes history that may already have been reported. In a UAE-licensed bank this affects customer statements, fees, reporting periods, AML records, and fraud controls.

- **Customer statements and errors.** Under the CBUAE Consumer Protection Standards, customers receive at least monthly statements, errors must be corrected and communicated, and a bank must not benefit from an amount caused by its error. This implementation intentionally does not meet that last production requirement: when E9 reverses E7, the three overdraft fees and the lost interest remain. That is the deliberately failing test, and in production would require a refund workflow.
- **Fees charged for past days.** A back-valued fee must use the fee schedule that applied on its value date. A single hard-coded AED amount cannot support that; a production fee schedule must be versioned by effective date.
- **Reporting and accounting periods.** A back-dated entry crossing a closed period cannot silently rewrite a filed regulatory return or month-end general ledger. It must post as a dated adjustment in an open period and report the prior-period effect.
- **AML and record keeping.** Records need both posting date and value date to reconstruct activity and to understand monitoring windows. Entries here carry only value date; “what was known on day N” comes from snapshots rather than a durable posting-date field.
- **Internal fraud.** Back-valuing can avoid fees, earn extra interest, or hide an overdraft at a reporting date.

### One control before go-live: a back-value approval gate

Any entry valued more than one business day before its posting date, or falling in a closed accounting period, should remain pending until a second authorised user approves it with a reason code. The approved entry records posting date, value date, maker, checker, and reason.

Approval recalculates fees and interest from the value date, refunds amounts the bank is not entitled to keep, and queues a customer notification. Small recent corrections can flow straight through; history-rewriting entries get a clear owner and audit trail.

## 3. Authorization lifecycle

The model has `ACTIVE`, `DECLINED`, `SETTLED`, and `RELEASED` holds. A repeated authorization ID returns the original decision rather than adding a second hold. The implemented release event makes `RELEASED` reachable.

| Path in this model | Real-world scenario | Production behaviour to mandate |
|---|---|---|
| Declined at request | Insufficient funds at till or online | Terminal state, no funds reserved, with a scheme decline code. Later clearing is handled as an unmatched settlement. |
| Never settled | Hotel, car-hire, or fuel pre-authorisation | Scheme/category expiry timer; append `ACTIVE → RELEASED`, free funds, and match any later clearing afterwards. |
| Released before settlement | Customer cancellation, merchant void, terminal reversal | Implemented for an active hold. Still needed: append-only hold-event history and logged no-ops for unknown or ended holds. |
| Partially settled | Partial shipment, split clearing, fuel pre-auth | Support multiple clearings; release remainder only on final-clearing or expiry, with a release amount. |
| Settlement over hold or wrong currency | Tips, incremental charges, cross-currency clearing | Use category tolerance and scheme FX; otherwise post and flag for review. A hold must end consumed or released. |
| Duplicate authorization ID | Network retransmission | Implemented idempotency. In production key it durably on authorization ID plus scheme trace ID. |
| Settled then reversed | Refund or chargeback | A separate credit linked to settlement; do not rewrite settled authorization history. |
| Settlement with no authorization | Offline transaction or force post | Post to suspense and open an exception. Rejecting it only hides money that may have already left the bank. |

## 4. What I cut and why

Ordered by production risk, highest first.

| # | Cut | Why | Production risk deferred |
|---:|---|---|---|
| 1 | Fee cause and refund on reversal | The brief gives no refund rule. | High: fees caused by the bank’s own reversed error remain, demonstrated by the failing test. |
| 2 | Concurrency control | Replay is deterministic and single-threaded. | High: two authorizations can both pass against the same funds. |
| 3 | Durable idempotency | Duplicate guards are in-memory sets. | High: retries after restart can post or reserve twice. |
| 4 | Posting date on entries | The exercise is value-date focused. | High: audit and AML reconstruction rely on snapshots. |
| 5 | Persistence, recovery, checkpoints | The brief explicitly requires in-memory only. | High: a crash loses state. |
| 6 | Limit on how far back an entry can go | The stream includes a late event. | Medium: history can be rewritten indefinitely. |
| 7 | Double-entry general ledger and suspense | Only customer balances are in scope. | Medium: the books cannot be proven balanced and unmatched settlements lack a home. |
| 8 | Hold expiry and append-only hold history | Release exists, but no timer or hold-event ledger exists. | Medium: abandoned holds can reserve funds forever without an audit trail. |
| 9 | Settlement tolerance, FX, and force posts | Strict matching is the safe exercise default. | Medium: legitimate clearing can be refused and scheme/customer records can drift. |
| 10 | Fee schedule by currency/date and caps | The brief supplies only AED 25.00. | Medium: BHD has no fee, old schedules cannot be honoured, and back-valued fees can burst. |
| 11 | Customer notification and statement restatement | Out of scope. | Medium: errors may not be communicated or reflected in statements. |
| 12 | Business calendar | Days are labels, not dates. | Lower: no weekends, holidays, cut-offs, or time-zone rules. |
| 13 | Daily accrual entries, configurable rounding, debit interest | Interest is needed only at the window end. | Lower: reporting lacks daily accrual entries and rounding bias cannot be configured. |

## 5. Deterministic policy decisions in this exercise

These choices are deliberate rather than unresolved:

- **Late values and fees:** every close rechecks historical value dates through the current day. This follows the explicit fee definition: a day is assessed from all entries with `value_date ≤ that day`. E7 therefore makes Days 2, 4, and 5 negative and produces three once-per-day fees, each tagged with its assessed date.
- **Interest:** interest is computed and capitalized only on Day 6 from the final restated value-dated history. This prevents paying an amount that later reversals and restated fees have changed, while still capitalizing exactly the sum of the separately rounded daily accruals.
- **Stream order:** stream order is authoritative. E10 is accepted on Day 6 with a Day 5 value date and a warning; the closed Day 5 reporting snapshot is not reopened.

The full numerical derivations are in [NUMBERS.md](NUMBERS.md), and the remaining specification ambiguities are recorded with their resolutions in [AMBIGUITIES.md](AMBIGUITIES.md).
