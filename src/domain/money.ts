export type Currency = 'AED' | 'BHD';

const CURRENCY_SCALE: Record<Currency, bigint> = {
  AED: 100n,
  BHD: 1000n,
};

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
    const [whole, fraction = ''] = value.split('.');

    const requiredDigits = currency === 'AED' ? 2 : 3;

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

    const digits = this.currency === 'AED' ? 2 : 3;

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
