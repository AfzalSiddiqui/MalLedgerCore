export type Currency = 'AED' | 'BHD';

const CURRENCY_SCALE: Record<Currency, bigint> = {
  AED: 100n,
  BHD: 1000n,
};

const CURRENCY_DECIMALS: Record<Currency, number> = {
  AED: 2,
  BHD: 3,
};

const MAJOR_UNITS_FORMAT = /^-?\d+(\.\d+)?$/;

export class Money {
  readonly amount: bigint;
  readonly currency: Currency;

  constructor(amount: bigint, currency: Currency) {
    this.amount = amount;
    this.currency = currency;
  }

  static zero(currency: Currency): Money {
    return new Money(0n, currency);
  }

  static fromMajorUnits(value: string, currency: Currency): Money {
    const scale = CURRENCY_SCALE[currency];

    if (!MAJOR_UNITS_FORMAT.test(value)) {
      throw new Error(
        `Invalid ${currency} amount "${value}": expected digits with an optional decimal part, e.g. 1200.50`,
      );
    }

    const [whole, fraction = ''] = value.split('.');

    const requiredDigits = CURRENCY_DECIMALS[currency];

    if (fraction.length > requiredDigits) {
      throw new Error(
        `${currency} supports ${requiredDigits} decimal places`,
      );
    }

    const paddedFraction = fraction.padEnd(requiredDigits, '0');
    const sign = whole.startsWith('-') ? -1n : 1n;
    const absoluteWhole = whole.replace('-', '');

    const minorUnits =
      BigInt(absoluteWhole) * scale + BigInt(paddedFraction || '0');

    return new Money(sign * minorUnits, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);

    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);

    return new Money(this.amount - other.amount, this.currency);
  }

  isPositive(): boolean {
    return this.amount > 0n;
  }

  isNegative(): boolean {
    return this.amount < 0n;
  }

  isZero(): boolean {
    return this.amount === 0n;
  }

  toString(): string {
    const scale = CURRENCY_SCALE[this.currency];
    const negative = this.amount < 0n;
    const absolute = negative ? -this.amount : this.amount;

    const whole = absolute / scale;
    const fraction = absolute % scale;

    const digits = CURRENCY_DECIMALS[this.currency];

    return `${negative ? '-' : ''}${whole}.${fraction
      .toString()
      .padStart(digits, '0')}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Currency mismatch: ${this.currency} vs ${other.currency}`,
      );
    }
  }
}
