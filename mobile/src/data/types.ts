// Row shapes as returned by Supabase (snake_case, same as the database).

export interface Profile {
  id: string;
  display_name: string;
  is_deleted: boolean;
}

export type GroupStatus = 'active' | 'settling' | 'settled';

export interface Group {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
  /** Settle up happens once, at the end: active → settling (locked) → settled. Reopen → active. */
  status: GroupStatus;
}

export interface ExpenseSplit {
  user_id: string;
  amount_cents: number;
}

export interface Expense {
  id: string;
  group_id: string;
  description: string;
  amount_cents: number;
  paid_by: string;
  created_at: string;
  splits: ExpenseSplit[];
}

export interface Settlement {
  id: string;
  group_id: string;
  from_user: string;
  to_user: string;
  amount_cents: number;
  created_at: string;
}

export const isLocked = (group: Pick<Group, 'status'>) => group.status !== 'active';
