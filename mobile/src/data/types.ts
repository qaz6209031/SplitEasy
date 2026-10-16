// Row shapes as returned by Supabase (snake_case, same as the database).

import type { SplitMethod } from '@/domain/splits';

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
  /** Percentage or share count typed for this person; null for equal and exact splits. */
  split_value: number | null;
}

export interface Expense {
  id: string;
  group_id: string;
  description: string;
  amount_cents: number;
  paid_by: string;
  created_at: string;
  split_method: SplitMethod;
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
