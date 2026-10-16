// How an expense is divided: equally, by exact amounts, by percentages or by shares.
// Percentages and share counts are handled as integer hundredths (33.33% -> 3333), so all the
// math is exact integer arithmetic and the preview always matches what is saved.

import { equalSplit } from './balances';
import { editableString, parseCents } from './money';

export type SplitMethod = 'equal' | 'exact' | 'percent' | 'shares';

export interface SplitShare {
  userId: string;
  amountCents: number;
  /** The percentage or share count typed for this person; null for equal and exact splits. */
  value: number | null;
}

export interface SplitResult {
  shares: SplitShare[];
  /** True when the split is complete and can be saved. */
  ok: boolean;
  /** Some input isn't a valid number. */
  invalid: boolean;
  /** Exact: cents still to assign. Percent: hundredths of a percent still to assign. Negative = over. */
  remaining: number | null;
}

/**
 * Splits a total in proportion to integer weights. Each share is rounded down, then the leftover
 * cents go to the largest remainders (ties: earlier people), so the shares add up to the total.
 */
export function splitByWeights(totalCents: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const remainders = weights.map((w) => (totalCents * w) % sum);
  const amounts = weights.map((w, i) => (totalCents * w - remainders[i]) / sum);
  let left = totalCents - amounts.reduce((a, b) => a + b, 0);
  const order = weights.map((_, i) => i).sort((a, b) => remainders[b] - remainders[a] || a - b);
  for (const i of order) {
    if (left <= 0) break;
    if (weights[i] > 0) {
      amounts[i] += 1;
      left -= 1;
    }
  }
  return amounts;
}

/** "33.33" -> 3333. Same rules as money input: positive, at most 2 decimals. */
const parseHundredths = parseCents;

/** 3333 -> "33.33", 5000 -> "50", 150 -> "1.5". */
export function formatHundredths(hundredths: number): string {
  return (hundredths / 100).toFixed(2).replace(/\.?0+$/, '');
}

/** Empty or zero means "not part of this expense". */
const isBlank = (text: string | undefined) => !text || /^[\s0.,$]*$/.test(text);

/**
 * Works out each person's share. `memberIds` sets the order (it decides who gets leftover cents);
 * `participants` is used by the equal split, `inputs` (text typed per person) by the others.
 */
export function computeSplit(
  method: SplitMethod,
  totalCents: number | null,
  memberIds: string[],
  participants: Set<string>,
  inputs: Record<string, string>,
): SplitResult {
  if (method === 'equal') {
    const ids = memberIds.filter((id) => participants.has(id));
    const amounts = totalCents ? equalSplit(totalCents, ids.length) : ids.map(() => 0);
    const shares = ids.map((userId, i) => ({ userId, amountCents: amounts[i], value: null }));
    return { shares, ok: totalCents != null && ids.length > 0, invalid: false, remaining: null };
  }

  let invalid = false;
  const entries: { userId: string; parsed: number }[] = [];
  for (const userId of memberIds) {
    const text = inputs[userId];
    if (isBlank(text)) continue;
    const parsed = parseHundredths(text);
    if (parsed == null || (method === 'percent' && parsed > 10000)) invalid = true;
    else entries.push({ userId, parsed });
  }

  if (method === 'exact') {
    const shares = entries.map((e) => ({ userId: e.userId, amountCents: e.parsed, value: null }));
    const assigned = entries.reduce((sum, e) => sum + e.parsed, 0);
    const remaining = totalCents == null ? null : totalCents - assigned;
    return { shares, ok: !invalid && shares.length > 0 && remaining === 0, invalid, remaining };
  }

  const weights = entries.map((e) => e.parsed);
  const toShares = (amounts: number[]) =>
    entries.map((e, i) => ({ userId: e.userId, amountCents: amounts[i], value: e.parsed / 100 }));
  if (method === 'percent') {
    const remaining = 10000 - weights.reduce((a, b) => a + b, 0);
    // Until the percentages reach 100%, show what each percentage is of the total, not a rescaled amount.
    const amounts = !totalCents
      ? weights.map(() => 0)
      : remaining === 0
        ? splitByWeights(totalCents, weights)
        : weights.map((w) => Math.round((totalCents * w) / 10000));
    const shares = toShares(amounts);
    return { shares, ok: !invalid && totalCents != null && shares.length > 0 && remaining === 0, invalid, remaining };
  }
  const shares = toShares(totalCents ? splitByWeights(totalCents, weights) : weights.map(() => 0));
  return { shares, ok: !invalid && totalCents != null && shares.length > 0, invalid, remaining: null };
}

/** Starting inputs when switching to a method: the people currently on the expense, split evenly. */
export function initialInputs(method: SplitMethod, totalCents: number | null, userIds: string[]): Record<string, string> {
  let texts: string[];
  if (method === 'exact') texts = totalCents ? equalSplit(totalCents, userIds.length).map(editableString) : userIds.map(() => '');
  else if (method === 'percent') texts = splitByWeights(10000, userIds.map(() => 1)).map(formatHundredths);
  else texts = userIds.map(() => '1');
  return Object.fromEntries(userIds.map((id, i) => [id, texts[i]]));
}

/** Inputs that reproduce a saved split, for editing it. */
export function inputsFromShares(method: SplitMethod, shares: { user_id: string; amount_cents: number; split_value: number | null }[]) {
  return Object.fromEntries(
    shares.map((s) => [
      s.user_id,
      method === 'exact' || s.split_value == null ? editableString(s.amount_cents) : formatHundredths(Math.round(s.split_value * 100)),
    ]),
  );
}
