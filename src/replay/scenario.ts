import { Account } from '../domain/account.js';
import { Money } from '../domain/money.js';
import { LedgerEvent } from './events.js';

// The brief's accounts and event stream, in the brief's replay order.
// E10 (Day5) deliberately comes after E9 (Day6): "replayed in this order".

export const SCENARIO_ACCOUNTS: readonly Account[] = [
  new Account(
    'ACC-001',
    Money.fromMajorUnits('0.00', 'AED'),
  ),
  new Account(
    'ACC-002',
    Money.fromMajorUnits('0.000', 'BHD'),
  ),
];

export const SCENARIO_EVENTS: readonly LedgerEvent[] = [
  {
    eventId: 'E1',
    type: 'CREDIT',
    day: 'Day1',
    accountId: 'ACC-001',
    amount: Money.fromMajorUnits('1200.00', 'AED'),
    valueDate: 'Day1',
  },
  {
    eventId: 'E2',
    type: 'DEBIT',
    day: 'Day1',
    accountId: 'ACC-001',
    amount: Money.fromMajorUnits('950.00', 'AED'),
    valueDate: 'Day1',
  },
  {
    eventId: 'E3',
    type: 'AUTHORIZATION',
    day: 'Day2',
    accountId: 'ACC-001',
    authorizationId: 'Auth-A',
    amount: Money.fromMajorUnits('200.00', 'AED'),
    valueDate: 'Day2',
  },
  {
    eventId: 'E4',
    type: 'CREDIT',
    day: 'Day3',
    accountId: 'ACC-001',
    amount: Money.fromMajorUnits('400.00', 'AED'),
    valueDate: 'Day3',
  },
  {
    eventId: 'E5',
    type: 'SETTLEMENT',
    day: 'Day4',
    accountId: 'ACC-001',
    authorizationId: 'Auth-A',
    amount: Money.fromMajorUnits('185.00', 'AED'),
    valueDate: 'Day4',
  },
  {
    eventId: 'E6',
    type: 'SETTLEMENT',
    day: 'Day4',
    accountId: 'ACC-001',
    authorizationId: 'Auth-Z',
    amount: Money.fromMajorUnits('180.00', 'AED'),
    valueDate: 'Day4',
  },
  {
    eventId: 'E7',
    type: 'DEBIT',
    day: 'Day5',
    accountId: 'ACC-001',
    amount: Money.fromMajorUnits('620.00', 'AED'),
    valueDate: 'Day2',
  },
  {
    eventId: 'E8',
    type: 'AUTHORIZATION',
    day: 'Day5',
    accountId: 'ACC-001',
    authorizationId: 'Auth-B',
    amount: Money.fromMajorUnits('90.00', 'AED'),
    valueDate: 'Day5',
  },
  {
    eventId: 'E9',
    type: 'REVERSAL',
    day: 'Day6',
    accountId: 'ACC-001',
    originalEntryId: 'E7',
    valueDate: 'Day2',
  },
  {
    eventId: 'E10',
    type: 'CREDIT_INSTALLMENTS',
    day: 'Day5',
    accountId: 'ACC-002',
    amount: Money.fromMajorUnits('10.000', 'BHD'),
    valueDate: 'Day5',
    installments: 3,
  },
];

// The brief only defines an AED overdraft fee. There is no BHD amount and no
// FX rate, so ACC-002 has no fee configured (see AMBIGUITIES.md).
export const SCENARIO_OVERDRAFT_FEES: Readonly<Record<string, Money>> = {
  'ACC-001': Money.fromMajorUnits('25.00', 'AED'),
  'ACC-002': Money.fromMajorUnits('0.000', 'BHD'),
};
