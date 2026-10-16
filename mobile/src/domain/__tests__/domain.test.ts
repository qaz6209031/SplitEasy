import { equalSplit, netBalances } from '../balances';
import { simplifyDebts } from '../debts';
import { formatCents, parseCents } from '../money';
import { computeSplit, formatHundredths, initialInputs, inputsFromShares, splitByWeights } from '../splits';
import { groupSummaryText } from '../summary';
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
    split_method: 'equal',
    splits: among.map((user_id, i) => ({ user_id, amount_cents: shares[i], split_value: null })),
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

describe('group summary text', () => {
  const members = [
    { id: 'a', display_name: 'Alice', is_deleted: false },
    { id: 'b', display_name: 'Bob', is_deleted: false },
    { id: 'c', display_name: 'Carol', is_deleted: false },
  ];

  it('lists expenses, payments, balances and repayments', () => {
    const text = groupSummaryText({
      group: { name: 'Trip', status: 'settling' },
      members,
      // Splits listed out of member order, as the database may return them.
      expenses: [
        {
          ...expense(1000, 'a', ['a', 'b', 'c']),
          splits: [
            { user_id: 'c', amount_cents: 333, split_value: null },
            { user_id: 'a', amount_cents: 334, split_value: null },
            { user_id: 'b', amount_cents: 333, split_value: null },
          ],
        },
        expense(600, 'b', ['b', 'c']),
      ],
      settlements: [settlement(100, 'c', 'a')],
      myId: 'a',
    });
    expect(text).toContain('Members (3): Alice (me), Bob, Carol');
    expect(text).toContain('Expenses (2, total $16.00):');
    expect(text).toContain('$10.00 paid by Alice | split equally: Alice $3.34, Bob $3.33, Carol $3.33');
    expect(text).toContain('1. 2026-01-01 | Carol paid Alice $1.00');
    // Alice +10 - 3.34 - 1 = +5.66; Bob +6 - 3.33 - 3 = -0.33; Carol -3.33 - 3 + 1 = -5.33
    expect(text).toContain('- Alice: gets back $5.66');
    expect(text).toContain('- Bob: owes $0.33');
    expect(text).toContain('- Carol: owes $5.33');
    expect(text).toContain('Carol pays Alice $5.33');
    expect(text).toContain('Bob pays Alice $0.33');
  });

  it('shows the percentages or shares typed for an expense', () => {
    const byShares = {
      ...expense(900, 'a', ['a', 'b']),
      split_method: 'shares' as const,
      splits: [
        { user_id: 'a', amount_cents: 600, split_value: 2 },
        { user_id: 'b', amount_cents: 300, split_value: 1 },
      ],
    };
    const text = groupSummaryText({ group: { name: 'Trip', status: 'active' }, members, expenses: [byShares], settlements: [], myId: 'a' });
    expect(text).toContain('$9.00 paid by Alice | split by shares: Alice $6.00 (2 shares), Bob $3.00 (1 share)');
  });

  it('says when there is nothing to repay', () => {
    const text = groupSummaryText({ group: { name: 'Empty', status: 'active' }, members, expenses: [], settlements: [], myId: null });
    expect(text).toContain('Expenses (0, total $0.00):\nNone');
    expect(text).toContain('None, everyone is settled up.');
    expect(text).toContain('- Bob: settled up ($0.00)');
  });
});

describe('split methods', () => {
  const ids = ['a', 'b', 'c'];
  const everyone = new Set(ids);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  it('splits by weights with exact integer math, leftover cents to the largest remainders', () => {
    expect(splitByWeights(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(splitByWeights(10000, [2, 1])).toEqual([6667, 3333]);
    expect(splitByWeights(100, [0, 1, 1])).toEqual([0, 50, 50]);
    for (const total of [1, 99, 1001, 123_457]) {
      for (const weights of [[1, 2, 3], [3333, 3333, 3334], [150, 50], [7, 0, 13, 1]]) {
        expect(sum(splitByWeights(total, weights))).toBe(total);
      }
    }
  });

  it('equal: only the ticked people', () => {
    const r = computeSplit('equal', 1000, ids, new Set(['a', 'c']), {});
    expect(r.ok).toBe(true);
    expect(r.shares.map((s) => [s.userId, s.amountCents])).toEqual([['a', 500], ['c', 500]]);
  });

  it('exact: must add up to the total; blank or zero leaves someone out', () => {
    const under = computeSplit('exact', 6000, ids, everyone, { a: '20', b: '10.50', c: '' });
    expect(under).toMatchObject({ ok: false, remaining: 2950 });
    const done = computeSplit('exact', 6000, ids, everyone, { a: '40', b: '20', c: '0' });
    expect(done.ok).toBe(true);
    expect(done.shares.map((s) => s.amountCents)).toEqual([4000, 2000]);
    expect(computeSplit('exact', 6000, ids, everyone, { a: '70' })).toMatchObject({ ok: false, remaining: -1000 });
    expect(computeSplit('exact', 6000, ids, everyone, { a: '1.234' })).toMatchObject({ ok: false, invalid: true });
  });

  it('percent: must add up to 100%', () => {
    const r = computeSplit('percent', 1000, ids, everyone, { a: '50', b: '33.33', c: '16.67' });
    expect(r.ok).toBe(true);
    expect(r.shares.map((s) => s.amountCents)).toEqual([500, 333, 167]);
    expect(r.shares.map((s) => s.value)).toEqual([50, 33.33, 16.67]);
    expect(computeSplit('percent', 1000, ids, everyone, { a: '60', b: '30' })).toMatchObject({ ok: false, remaining: 1000 });
    expect(computeSplit('percent', 1000, ids, everyone, { a: '120' })).toMatchObject({ ok: false, invalid: true });
    // Not at 100% yet: each amount is that percentage of the total, not rescaled.
    const over = computeSplit('percent', 6000, ids, everyone, { a: '80', b: '30' });
    expect(over).toMatchObject({ ok: false, remaining: -1000 });
    expect(over.shares.map((s) => s.amountCents)).toEqual([4800, 1800]);
  });

  it('shares: proportional, decimals allowed', () => {
    const r = computeSplit('shares', 9000, ids, everyone, { a: '2', b: '1', c: '' });
    expect(r.ok).toBe(true);
    expect(r.shares.map((s) => [s.userId, s.amountCents, s.value])).toEqual([['a', 6000, 2], ['b', 3000, 1]]);
    expect(computeSplit('shares', 1000, ids, everyone, { a: '1.5', b: '0.5' }).shares.map((s) => s.amountCents)).toEqual([750, 250]);
  });

  it('starts a new method from the people already on the expense, split evenly', () => {
    expect(initialInputs('exact', 1000, ['a', 'b', 'c'])).toEqual({ a: '3.34', b: '3.33', c: '3.33' });
    expect(initialInputs('percent', 1000, ['a', 'b', 'c'])).toEqual({ a: '33.34', b: '33.33', c: '33.33' });
    expect(initialInputs('shares', 1000, ['a', 'b'])).toEqual({ a: '1', b: '1' });
    expect(formatHundredths(5000)).toBe('50');
    expect(formatHundredths(150)).toBe('1.5');
  });

  it('restores the typed values when editing', () => {
    const splits = [
      { user_id: 'a', amount_cents: 667, split_value: 2 },
      { user_id: 'b', amount_cents: 333, split_value: 1 },
    ];
    expect(inputsFromShares('shares', splits)).toEqual({ a: '2', b: '1' });
    expect(inputsFromShares('exact', splits)).toEqual({ a: '6.67', b: '3.33' });
  });
});
