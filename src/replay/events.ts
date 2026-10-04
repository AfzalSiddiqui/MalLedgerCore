import { Money } from '../domain/money.js';

export type LedgerEvent =
  | {
      readonly eventId: 'E1';
      readonly type: 'CREDIT';
      readonly day: 'Day1';
      readonly accountId: 'ACC-001';
      readonly amount: Money;
      readonly valueDate: 'Day1';
    }
  | {
      readonly eventId: 'E2';
      readonly type: 'DEBIT';
      readonly day: 'Day1';
      readonly accountId: 'ACC-001';
      readonly amount: Money;
      readonly valueDate: 'Day1';
    }
  | {
      readonly eventId: 'E3';
      readonly type: 'AUTHORIZATION';
      readonly day: 'Day2';
      readonly accountId: 'ACC-001';
      readonly authorizationId: 'Auth-A';
      readonly amount: Money;
      readonly valueDate: 'Day2';
    }
  | {
      readonly eventId: 'E4';
      readonly type: 'CREDIT';
      readonly day: 'Day3';
      readonly accountId: 'ACC-001';
      readonly amount: Money;
      readonly valueDate: 'Day3';
    }
  | {
      readonly eventId: 'E5';
      readonly type: 'SETTLEMENT';
      readonly day: 'Day4';
      readonly accountId: 'ACC-001';
      readonly authorizationId: 'Auth-A';
      readonly amount: Money;
      readonly valueDate: 'Day4';
    }
  | {
      readonly eventId: 'E6';
      readonly type: 'SETTLEMENT';
      readonly day: 'Day4';
      readonly accountId: 'ACC-001';
      readonly authorizationId: 'Auth-Z';
      readonly amount: Money;
      readonly valueDate: 'Day4';
    }
  | {
      readonly eventId: 'E7';
      readonly type: 'DEBIT';
      readonly day: 'Day5';
      readonly accountId: 'ACC-001';
      readonly amount: Money;
      readonly valueDate: 'Day2';
    }
  | {
      readonly eventId: 'E8';
      readonly type: 'AUTHORIZATION';
      readonly day: 'Day5';
      readonly accountId: 'ACC-001';
      readonly authorizationId: 'Auth-B';
      readonly amount: Money;
      readonly valueDate: 'Day5';
    }
  | {
      readonly eventId: 'E9';
      readonly type: 'REVERSAL';
      readonly day: 'Day6';
      readonly accountId: 'ACC-001';
      readonly originalEntryId: 'E7';
      readonly valueDate: 'Day2';
    }
  | {
      readonly eventId: 'E10';
      readonly type: 'CREDIT_INSTALLMENTS';
      readonly day: 'Day5';
      readonly accountId: 'ACC-002';
      readonly amount: Money;
      readonly valueDate: 'Day5';
      readonly installments: 3;
    }
  | {
      // Not in the brief's stream: a merchant cancellation, terminal-timeout
      // reversal or expiry that ends a hold without a settlement.
      readonly eventId: string;
      readonly type: 'AUTHORIZATION_RELEASE';
      readonly day: string;
      readonly accountId: string;
      readonly authorizationId: string;
      readonly valueDate: string;
    };
