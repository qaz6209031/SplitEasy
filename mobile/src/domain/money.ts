// The app is US-dollar only. Amounts are integer cents everywhere.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** Plain editable form without symbol or grouping, e.g. 1234 -> "12.34". */
export function editableString(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Parses user input like "12", "12.5", "$1,234.56" into cents.
 * Returns null for invalid input, zero/negative amounts, or more than 2 decimal places.
 * A lone comma is treated as a decimal separator ("12,50"), since some keyboards use it.
 */
export function parseCents(text: string): number | null {
  const trimmed = text.trim();
  const cleaned = trimmed
    .replace(/\$/g, '')
    .replace(/,/g, trimmed.includes('.') ? '' : '.');
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '.') return null;
  const [whole, fraction = ''] = cleaned.split('.');
  if (fraction.length > 2) return null;
  const cents = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'));
  return cents > 0 ? cents : null;
}
