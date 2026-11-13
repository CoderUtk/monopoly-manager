/**
 * Format an integer currency amount with locale grouping and minus sign before the symbol.
 */
export function formatCurrency(amount: number, symbol: string, locale: string): string {
  const safeAmount = Number.isFinite(amount) ? Math.round(amount) : 0;
  const normalized = safeAmount === 0 ? 0 : safeAmount;
  const absValue = Math.abs(normalized);

  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(locale || 'en-IN', {
      maximumFractionDigits: 0,
    }).format(absValue);
  } catch {
    formatted = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
    }).format(absValue);
  }

  return normalized < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
}

function snapToNiceDenomination(raw: number): number {
  if (!Number.isFinite(raw) || raw < 1) {
    return 1;
  }
  const exponent = Math.floor(Math.log10(raw));
  const magnitude = Math.pow(10, exponent);
  const normalized = raw / magnitude;

  let niceMantissa = 1;
  if (normalized >= 7.5) {
    niceMantissa = 10;
  } else if (normalized >= 3.5) {
    niceMantissa = 5;
  } else if (normalized >= 1.5) {
    niceMantissa = 2;
  }

  return Math.max(1, Math.round(niceMantissa * magnitude));
}

/**
 * Derive 4-5 intuitive ascending quick-pay chip amounts from the table's economy.
 */
export function computeQuickChips(startingCash: number, passStartAmount: number): number[] {
  const validPassStart = Number.isFinite(passStartAmount) && passStartAmount > 0 ? Math.round(passStartAmount) : 0;
  const validStarting = Number.isFinite(startingCash) && startingCash > 0 ? Math.round(startingCash) : 0;

  const anchor = validPassStart > 0
    ? validPassStart
    : validStarting > 0
      ? Math.max(10, Math.round(validStarting / 8))
      : 1000;

  const multipliers = [0.05, 0.25, 0.5, 1, 2.5];
  const chipSet = new Set<number>();

  for (const mult of multipliers) {
    if (mult === 1 && validPassStart > 0) {
      chipSet.add(validPassStart);
    } else {
      chipSet.add(snapToNiceDenomination(anchor * mult));
    }
  }

  return Array.from(chipSet)
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((a, b) => a - b);
}
