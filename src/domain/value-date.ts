const DAY_LABEL = /^Day(\d+)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Orders value dates chronologically.
 *
 * Supports the assessment's `DayN` labels and ISO `YYYY-MM-DD` dates.
 * Plain string comparison is unsafe for labels: 'Day10' < 'Day2'.
 */
export function compareValueDates(left: string, right: string): number {
  const leftDay = DAY_LABEL.exec(left);
  const rightDay = DAY_LABEL.exec(right);

  if (leftDay && rightDay) {
    return Number(leftDay[1]) - Number(rightDay[1]);
  }

  if (ISO_DATE.test(left) && ISO_DATE.test(right)) {
    return left < right ? -1 : left > right ? 1 : 0;
  }

  throw new Error(
    `Cannot compare value dates ${left} and ${right}: use DayN labels or YYYY-MM-DD consistently`,
  );
}

export function isOnOrBefore(valueDate: string, asOf: string): boolean {
  return compareValueDates(valueDate, asOf) <= 0;
}
