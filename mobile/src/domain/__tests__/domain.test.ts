import { equalSplit, netBalances } from '../balances';
import { simplifyDebts } from '../debts';
import { formatCents, parseCents } from '../money';
import type { Expense, Settlement } from '@/data/types';

let nextId = 0;
const expense = (amount: number, paidBy: string, among: string[]): Expense => {
  const shares = equalSplit(amount, among.length);
  return {
    id: `e${nextId++}`,
    group_id: 'g',
    description: 'x',
    amount_cents: amount,
    paid_by: paidBy,
    created_at: '2026-01-01',
    splits: among.map((user_id, i) => ({ user_id, amount_cents: shares[i] })),
  };
};
const settlement = (amount: number, from: string, to: string): Settlement => ({
  id: `s${nextId++}`,
  group_id: 'g',
  from_user: from,
  to_user: to,
  amount_cents: amount,
  created_at: '2026-01-01',
});

describe('equal split', () => {
  it('splits evenly', () => expect(equalSplit(900, 3)).toEqual([300, 300, 300]));

  it('gives leftover cents to the first people', () => {
    expect(equalSplit(1000, 3)).toEqual([334, 333, 333]);
    expect(equalSplit(101, 4)).toEqual([26, 25, 25, 25]);
  });

  it('always adds up to the total', () => {
    for (const amount of [1, 7, 99, 1001, 123_457]) {
      for (let count = 1; count <= 7; count++) {
        expect(equalSplit(amount, count).reduce((a, b) => a + b, 0)).toBe(amount);
      }
    }
  });
});

describe('net balances', () => {
  it('credits the payer with the others’ shares', () => {
    const b = netBalances([expense(3000, 'a', ['a', 'b', 'c'])], []);
    expect([b.get('a'), b.get('b'), b.get('c')]).toEqual([2000, -1000, -1000]);
  });

  it('reduces debt with settlements', () => {
    const b = netBalances([expense(3000, 'a', ['a', 'b', 'c'])], [settlement(1000, 'b', 'a')]);
    expect([b.get('a'), b.get('b'), b.get('c')]).toEqual([1000, 0, -1000]);
  });

  it('sums to zero', () => {
    const b = netBalances(
      [expense(1001, 'a', ['a', 'b', 'c']), expense(250, 'c', ['b', 'd'])],
      [settlement(100, 'd', 'c')],
    );
    expect([...b.values()].reduce((x, y) => x + y, 0)).toBe(0);
  });
});

describe('debt simplification', () => {
  it('collapses a chain into one payment', () => {
    // a owes b $10, b owes c $10 → a pays c $10.
    const b = netBalances([expense(1000, 'b', ['a']), expense(1000, 'c', ['b'])], []);
    expect(simplifyDebts(b)).toEqual([{ from: 'a', to: 'c', amountCents: 1000 }]);
  });

  it('needs no payments when settled', () => {
    expect(simplifyDebts(new Map([['a', 0], ['b', 0]]))).toEqual([]);
    expect(simplifyDebts(new Map())).toEqual([]);
  });

  it('settles every balance with at most n−1 payments', () => {
    const balances = new Map([['a', 5000], ['b', -2000], ['c', -2500], ['d', -500]]);
    const payments = simplifyDebts(balances);
    const remaining = new Map(balances);
    for (const p of payments) {
      expect(p.amountCents).toBeGreaterThan(0);
      remaining.set(p.from, remaining.get(p.from)! + p.amountCents);
      remaining.set(p.to, remaining.get(p.to)! - p.amountCents);
    }
    expect([...remaining.values()].every((v) => v === 0)).toBe(true);
    expect(payments.length).toBeLessThanOrEqual(3);
  });

  it('needs fewer payments than pairwise debts', () => {
    const people = ['a', 'b', 'c', 'd'];
    const expenses = [
      expense(4000, 'a', people),
      expense(2000, 'b', people),
      expense(1200, 'c', people),
      expense(800, 'd', people),
    ];
    expect(simplifyDebts(netBalances(expenses, [])).length).toBeLessThanOrEqual(3);
  });
});

describe('money', () => {
  it('formats as USD', () => {
    expect(formatCents(1234)).toBe('$12.34');
    expect(formatCents(123_456)).toBe('$1,234.56');
    expect(formatCents(5)).toBe('$0.05');
  });

  it('parses dollar input', () => {
    expect(parseCents('12')).toBe(1200);
    expect(parseCents('12.5')).toBe(1250);
    expect(parseCents('$1,234.56')).toBe(123_456);
    expect(parseCents('0.01')).toBe(1);
    expect(parseCents('12,50')).toBe(1250);
  });

  it('rejects invalid input', () => {
    for (const bad of ['', '0', 'abc', '1.234', '1.2.3', '-5']) expect(parseCents(bad)).toBeNull();
  });
});
