export interface Payment {
  from: string;
  to: string;
  amountCents: number;
}

export const paymentKey = (p: Payment) => `${p.from}-${p.to}-${p.amountCents}`;

/**
 * Reduces net balances to a small set of payments: repeatedly match the person who owes the most
 * with the person owed the most. Produces at most (people with non-zero balance − 1) payments.
 */
export function simplifyDebts(balances: Map<string, number>): Payment[] {
  type Entry = { id: string; amount: number };
  // Sorting by id as a tie-breaker keeps the output stable between reloads.
  const order = (a: Entry, b: Entry) => (a.amount !== b.amount ? b.amount - a.amount : a.id < b.id ? -1 : 1);
  let creditors: Entry[] = [...balances].filter(([, v]) => v > 0).map(([id, v]) => ({ id, amount: v }));
  let debtors: Entry[] = [...balances].filter(([, v]) => v < 0).map(([id, v]) => ({ id, amount: -v }));

  const payments: Payment[] = [];
  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(order);
    debtors.sort(order);
    const amount = Math.min(creditors[0].amount, debtors[0].amount);
    payments.push({ from: debtors[0].id, to: creditors[0].id, amountCents: amount });
    creditors[0].amount -= amount;
    debtors[0].amount -= amount;
    creditors = creditors.filter((e) => e.amount > 0);
    debtors = debtors.filter((e) => e.amount > 0);
  }
  return payments;
}
