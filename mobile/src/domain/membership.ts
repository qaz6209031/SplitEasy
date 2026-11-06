// Who can leave a group, mirroring leave_group in the database (which has the final say).
import type { Expense, GroupStatus, Profile, Settlement } from '@/data/types';

import { netBalances } from './balances';

/**
 * - `delete`: you're the only member left, so leaving deletes the group.
 * - `leave`: you can leave now.
 * - `settle-first`: you're in the group's expenses or payments and it isn't settled yet.
 */
export type LeaveOption = 'delete' | 'leave' | 'settle-first';

export function leaveOption({
  userId,
  status,
  members,
  expenses,
  settlements,
}: {
  userId: string;
  status: GroupStatus;
  members: Profile[];
  expenses: Expense[];
  settlements: Settlement[];
}): LeaveOption {
  // Deleted accounts stay listed as members but aren't people who could still use the group.
  if (!members.some((m) => m.id !== userId && !m.is_deleted)) return 'delete';
  if (!peopleInHistory(expenses, settlements).has(userId)) return 'leave';
  const square = (netBalances(expenses, settlements).get(userId) ?? 0) === 0;
  return status === 'settled' && square ? 'leave' : 'settle-first';
}

/** Everyone who paid for, shares in, or sent or received a payment in the group. */
export function peopleInHistory(expenses: Expense[], settlements: Settlement[]): Set<string> {
  const ids = new Set<string>();
  for (const e of expenses) {
    ids.add(e.paid_by);
    for (const s of e.splits) ids.add(s.user_id);
  }
  for (const s of settlements) {
    ids.add(s.from_user);
    ids.add(s.to_user);
  }
  return ids;
}
