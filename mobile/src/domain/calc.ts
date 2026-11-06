// The amount keypad's arithmetic: a typed expression like "12+8.5×2" and its value in cents.
// Each number holds at most two decimal places; × and ÷ bind tighter than + and −, as on a calculator.

export type CalcKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | '.' | '+' | '−' | '×' | '÷' | 'del';

export const OPERATORS = ['+', '−', '×', '÷'] as const;
type Operator = (typeof OPERATORS)[number];
const isOperator = (c: string): c is Operator => (OPERATORS as readonly string[]).includes(c);

/**
 * Longest whole-number part a single number may have, so a stray tap can't build a trillion. A
 * currency without decimals (₩2,500,000 for a hotel) gets two more digits.
 */
export const MAX_WHOLE_DIGITS = 7;
const MAX_LENGTH = 40;

/** The number being typed at the end of the expression ("" right after an operator). */
function lastNumber(expr: string): string {
  let i = expr.length;
  while (i > 0 && !isOperator(expr[i - 1])) i--;
  return expr.slice(i);
}

/**
 * The expression after one key press. `fresh` means the current value is selected, as when a field
 * opens: a digit or point replaces it, an operator continues from it, delete clears it.
 */
export function applyKey(expr: string, key: CalcKey, fresh = false, maxWhole = MAX_WHOLE_DIGITS): string {
  // "00" (on the keypad of a currency without decimals, in place of the point) is two zeros.
  if (key === '00') return applyKey(applyKey(expr, '0', fresh, maxWhole), '0', false, maxWhole);
  if (fresh && key !== 'del' && !isOperator(key)) expr = '';
  if (fresh && key === 'del') return '';

  if (key === 'del') return expr.slice(0, -1);
  if (expr.length >= MAX_LENGTH) return expr;

  const current = lastNumber(expr);
  if (isOperator(key)) {
    if (expr === '') return expr;
    // A second operator replaces the first; a number ending in "." loses the point.
    if (isOperator(expr[expr.length - 1])) return expr.slice(0, -1) + key;
    if (current.endsWith('.')) return expr.slice(0, -1) + key;
    return expr + key;
  }
  if (key === '.') {
    if (current.includes('.')) return expr;
    return expr + (current === '' ? '0.' : '.');
  }
  // A digit.
  const [whole, fraction] = current.split('.');
  if (fraction != null && fraction.length >= 2) return expr;
  if (fraction == null && whole === '0') return expr.slice(0, -1) + key;
  if (fraction == null && whole.length >= maxWhole) return expr;
  return expr + key;
}

/** Whether the expression has arithmetic in it (so its result is worth showing separately). */
export const hasOperator = (expr: string) => [...expr.slice(1)].some(isOperator);

/**
 * The expression's value in cents, rounded half up, or null when it's empty, divides by zero, or
 * comes to zero or less. A trailing operator or point is ignored while you're still typing.
 * With a `step` of 100 (a currency without decimals) the value is rounded to a whole unit.
 */
export function evaluateCents(expr: string, step = 1): number | null {
  let text = expr;
  while (text && (isOperator(text[text.length - 1]) || text.endsWith('.'))) text = text.slice(0, -1);
  if (!text) return null;

  // Work in hundredths so 0.1 + 0.2 is exactly 30, then scale each product or quotient back down.
  const tokens = text.split(/([+−×÷])/).filter((t) => t !== '');
  if (tokens.length % 2 === 0 || isOperator(tokens[0])) return null;
  const terms: number[] = [];
  let value = toHundredths(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i] as Operator;
    const next = toHundredths(tokens[i + 1]);
    if (value == null || next == null) return null;
    if (op === '×') value = (value * next) / 100;
    else if (op === '÷') {
      if (next === 0) return null;
      value = (value / next) * 100;
    } else {
      terms.push(value);
      value = op === '−' ? -next : next;
    }
  }
  if (value == null) return null;
  terms.push(value);
  const cents = Math.round((terms.reduce((sum, t) => sum + t, 0) + 1e-9) / step) * step;
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}

function toHundredths(number: string): number | null {
  if (!/^\d*\.?\d{0,2}$/.test(number) || number === '' || number === '.') return null;
  const [whole, fraction = ''] = number.split('.');
  return Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'));
}

/** "12+8.5×2" → "12 + 8.5 × 2", for display. */
export const spaced = (expr: string) => expr.replace(/([+−×÷])/g, ' $1 ');
