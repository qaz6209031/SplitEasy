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

/** Equal split used for previews in the expense form; mirrors `save_expense` in the database. */
export function equalSplit(amountCents: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(amountCents / count);
  const remainder = amountCents - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}
