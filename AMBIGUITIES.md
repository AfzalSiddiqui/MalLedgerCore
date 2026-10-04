# Ambiguities and Resolutions

## Arrival day vs value date

E7 arrives on Day5 but has value date Day2.

Resolution: events are processed in arrival order, while their accounting effect uses the supplied value date.

## Late overdraft fee

The requirements do not explicitly define when a fee is created when a late event changes a historical day.

Resolution: overdraft fees are assessed at end of each arrival day, on the closing balance. Every value date touched that day by a debit or a settlement is assessed once; a debit followed by a same-day credit that keeps the close positive is not charged.

A late event can also turn later, untouched days negative (after E7 and before E9, Day4 and Day5 close at -180.00). These are deliberately not re-assessed automatically: charging fees for restated days is a back-value decision that belongs to an approval workflow, not to the replay engine.

## Reversal and fees

The requirements suggest E9 could return balances and fees to the pre-E7 state.

Resolution: rejected because the ledger is append-only. E9 compensates E7 but does not remove an already-booked fee.

## Closing balance vs pre-fee balance

The stated Day2 -370.00 value is the historical balance immediately after E7 and before the fee.

The final ledger balance after the fee is -395.00 before reversal, and 225.00 after E9.

## Authorization after late debit

E8 is processed after E7 has arrived.

Resolution: authorization uses the ledger state available at processing time, including value-dated effects already replayed.

## BHD installments

Three installments of 3.334 would total 10.002.

Resolution: preserve the original amount exactly using 3.334, 3.333 and 3.333.

## Interest timing

Resolution: replay the complete event stream first, then calculate historical daily interest from the resulting ledger state, then capitalize the total on Day6.

## Interest remainder

The wording says a rounding remainder may be discarded.

Resolution: no monetary remainder is discarded. The exact sum of rounded daily accruals is capitalized.

## Duplicate events

The assessment does not define duplicate event delivery.

Resolution: a repeated event ID within a replay is reported and ignored, and the ledger rejects a repeated entry ID. Both guards are in memory only; production would require a durable idempotency store.

## Declined vs released authorizations

Resolution: a refused authorization is recorded as DECLINED and never reserves funds. RELEASED is reserved for holds that were active and later given back.

## Authorization lifecycle

The supplied stream only demonstrates approval and settlement.

Production would additionally need expiry, cancellation, release and partial-capture semantics.
