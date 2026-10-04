// Replays the brief's event stream and prints, per day: closing ledger
// balance, fee assessments, authorization states and errors.
//
//   npm run replay
import { LedgerReplay } from './replay/ledger-replay.js';
import {
  SCENARIO_ACCOUNTS,
  SCENARIO_EVENTS,
  SCENARIO_OVERDRAFT_FEES,
} from './replay/scenario.js';

const result = new LedgerReplay(
  SCENARIO_ACCOUNTS,
  SCENARIO_OVERDRAFT_FEES,
).replay(SCENARIO_EVENTS);

const line = (label: string, value: string) =>
  console.log(`  ${label.padEnd(30)} ${value}`);

for (const report of result.dailyReports) {
  console.log(`\n=== ${report.day} close ===`);

  for (const account of SCENARIO_ACCOUNTS) {
    line(
      `${account.id} closing (as known)`,
      `${account.currency} ${report.closingAsKnown[account.id]}`,
    );
    line(
      `${account.id} closing (final)`,
      `${account.currency} ${report.balances[account.id]}`,
    );
  }

  line(
    'fees booked at this close',
    report.feesBookedAtClose.length ? report.feesBookedAtClose.join('; ') : 'none',
  );
  line(
    'authorization states',
    report.authorizationStates.length ? report.authorizationStates.join(', ') : 'none',
  );

  if (report.errors.length === 0) {
    line('errors', 'none');
  }

  for (const error of report.errors) {
    line('error', error);
  }
}

console.log('\n=== Interest (final value-dated history) ===');

for (const account of SCENARIO_ACCOUNTS) {
  const accruals = result.interestAccruals.filter(
    (accrual) => accrual.accountId === account.id,
  );

  for (const accrual of accruals) {
    line(
      `${account.id} ${accrual.valueDate}`,
      `base ${accrual.baseBalance.toString()} -> accrual ${accrual.amount.toString()}`,
    );
  }

  line(
    `${account.id} capitalized on Day6`,
    `${account.currency} ${result.capitalizedInterest[account.id]}`,
  );
}
