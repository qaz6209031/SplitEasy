import type { Expense, Settlement } from '@/data/types';

/** Net balance per user in cents. Positive means the group owes them; negative means they owe. */
export function netBalances(expenses: Expense[], settlements: Settlement[]): Map<string, number> {
  const balances = new Map<string, number>();
  const add = (id: string, cents: number) => balances.set(id, (balances.get(id) ?? 0) + cents);
  for (const expense of expenses) {
    add(expense.paid_by, expense.amount_cents);
    for (const split of expense.splits) add(split.user_id, -split.amount_cents);
  }
  for (const settlement of settlements) {
    add(settlement.from_user, settlement.amount_cents);
    add(settlement.to_user, -settlement.amount_cents);
  }
  return balances;
}

/**
 * Equal split: leftover cents go to the first people, as `save_expense` in the database does. With
 * a `step` of 100 (a whole-unit currency) the shares are whole units and the leftover units go first.
 */
export function equalSplit(amountCents: number, count: number, step = 1): number[] {
  if (count <= 0) return [];
  if (amountCents % step !== 0) step = 1;
  const units = amountCents / step;
  const base = Math.floor(units / count);
  const remainder = units - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i < remainder ? 1 : 0)) * step);
}
