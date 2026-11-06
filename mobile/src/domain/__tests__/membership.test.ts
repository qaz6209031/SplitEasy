import { equalSplit } from '../balances';
import { leaveOption, peopleInHistory } from '../membership';
import { groupSummaryText } from '../summary';
import type { Expense, GroupStatus, Profile, Settlement } from '@/data/types';

const person = (id: string, is_deleted = false): Profile => ({ id, display_name: id.toUpperCase(), is_deleted });
const expense = (amount: number, paidBy: string, among: string[]): Expense => {
  const shares = equalSplit(amount, among.length);
  return {
    id: `e-${paidBy}-${amount}`,
    group_id: 'g',
    description: 'Dinner',
    amount_cents: amount,
    paid_by: paidBy,
    created_at: '2026-11-01',
    split_method: 'equal',
    splits: among.map((user_id, i) => ({ user_id, amount_cents: shares[i], split_value: null })),
  };
};
const settlement = (amount: number, from: string, to: string): Settlement => ({
  id: `s-${from}-${to}`,
  group_id: 'g',
  from_user: from,
  to_user: to,
  amount_cents: amount,
  created_at: '2026-11-02',
});

const option = (status: GroupStatus, members: Profile[], expenses: Expense[] = [], settlements: Settlement[] = []) =>
  leaveOption({ userId: 'a', status, members, expenses, settlements });

describe('leaving a group', () => {
  const ab = [person('a'), person('b')];
  const dinner = expense(1000, 'b', ['a', 'b']);
  const repaid = settlement(500, 'a', 'b');

  it('deletes the group when you are the only member', () => {
    expect(option('active', [person('a')])).toBe('delete');
    expect(option('active', [person('a')], [dinner])).toBe('delete');
  });

  it("doesn't count deleted accounts as people left", () => {
    expect(option('settling', [person('a'), person('b', true)], [dinner])).toBe('delete');
  });

  it('lets you leave a group you have no expenses in, whatever its state', () => {
    expect(option('active', ab)).toBe('leave');
    expect(option('active', ab, [expense(1000, 'b', ['b'])])).toBe('leave');
  });

  it('asks you to settle first while you are in expenses and the group is not settled', () => {
    expect(option('active', ab, [dinner])).toBe('settle-first');
    // Square already, but the group is still open: an edit could change your share.
    expect(option('active', ab, [dinner], [repaid])).toBe('settle-first');
    expect(option('settling', ab, [dinner])).toBe('settle-first');
  });

  it('lets you leave once the group is settled', () => {
    expect(option('settled', ab, [dinner], [repaid])).toBe('leave');
  });

  it('collects everyone in expenses and payments', () => {
    expect([...peopleInHistory([dinner, expense(300, 'c', ['c', 'd'])], [settlement(100, 'e', 'b')])].sort()).toEqual([
      'a', 'b', 'c', 'd', 'e',
    ]);
  });

  it('names people who left in the copied summary', () => {
    const text = groupSummaryText({
      group: { name: 'Trip', status: 'settled' },
      members: [person('b')],
      formerMembers: [person('a')],
      expenses: [dinner],
      settlements: [repaid],
      myId: 'b',
    });
    expect(text).toContain('Members (1): B (me)');
    expect(text).toContain('Left the group (1): A');
    expect(text).toContain('paid by B | split equally: B $5.00, A $5.00');
    expect(text).toContain('- A (left the group): settled up ($0.00)');
    expect(text).not.toContain('Unknown');
  });
});
