// Money is integer hundredths of the group's currency everywhere ("cents", as the database columns
// say), whatever the currency. A currency without minor units in everyday use (the New Taiwan dollar)
// keeps the same scale but is only ever entered and split in whole units, so its amounts are always
// multiples of 100. Keeping one scale means a build that predates currencies still shows the right
// number for such a group, only with a "$" in front.

export interface Currency {
  /** ISO 4217 code, as stored on the group. */
  code: string;
  /** What goes in front of an amount: "$", "NT$". */
  symbol: string;
  name: string;
  /** Decimal places people actually use: 2 for USD, 0 for TWD. */
  decimals: 0 | 2;
}

/** The currencies a new group can use, in the order the picker shows them. */
export const CURRENCIES: readonly Currency[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2 },
  { code: 'TWD', symbol: 'NT$', name: 'New Taiwan Dollar', decimals: 0 },
];

export const USD = CURRENCIES[0];

/** The group's currency. Groups from before currencies existed have none and are US dollars. */
export function currencyOf(code: string | null | undefined): Currency {
  if (!code) return USD;
  // A code this build doesn't know (added in a later version) still reads sensibly: "EUR 12.00".
  return CURRENCIES.find((c) => c.code === code) ?? { code, symbol: `${code} `, name: code, decimals: 2 };
}

/** The smallest amount an expense is split into, in cents: 1 for USD, 100 for TWD. */
export const stepOf = (currency: Currency) => (currency.decimals === 0 ? 100 : 1);

/** 123456 -> "$1,234.56"; in TWD 120000 -> "NT$1,200". Negative amounts get a leading "-". */
export function formatMoney(cents: number, currency: Currency): string {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = abs % 100;
  // A whole-unit currency shows decimals only for an odd amount entered by an older build.
  const tail = currency.decimals === 2 || fraction !== 0 ? `.${String(fraction).padStart(2, '0')}` : '';
  return `${cents < 0 ? '-' : ''}${currency.symbol}${whole}${tail}`;
}

/** Plain editable form without symbol or grouping: 1234 -> "12.34" (USD), 120000 -> "1200" (TWD). */
export function editableString(cents: number, currency: Currency = USD): string {
  if (currency.decimals === 0 && cents % 100 === 0) return String(cents / 100);
  return (cents / 100).toFixed(2);
}

/**
 * Parses user input like "12", "12.5", "$1,234.56" into cents.
 * Returns null for invalid input, zero/negative amounts, more than 2 decimal places, or any
 * fraction at all in a whole-unit currency ("12.00" is still fine there).
 * A lone comma is treated as a decimal separator ("12,50"), since some keyboards use it.
 */
export function parseCents(text: string, currency: Currency = USD): number | null {
  const cents = parseHundredths(text.replace(/NT\$|\$/g, ''));
  if (cents == null) return null;
  return cents % stepOf(currency) === 0 ? cents : null;
}

/** "33.33" -> 3333. Positive, at most 2 decimals. Also used for percentages and share counts. */
export function parseHundredths(text: string): number | null {
  const trimmed = text.trim();
  const cleaned = trimmed.replace(/,/g, trimmed.includes('.') ? '' : '.');
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '.') return null;
  const [whole, fraction = ''] = cleaned.split('.');
  if (fraction.length > 2) return null;
  const cents = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'));
  return cents > 0 ? cents : null;
}
