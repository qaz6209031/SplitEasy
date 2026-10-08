// All reads go through Row Level Security; writes go through the RPCs in supabase/migrations.

import { supabase } from '@/lib/supabase';
import { netBalances } from '@/domain/balances';
import type { Payment } from '@/domain/debts';
import type { Expense, Group, Profile, Settlement } from './types';

const expenseColumns = 'id, group_id, description, amount_cents, paid_by, created_at, splits:expense_splits(user_id, amount_cents)';

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

// Groups

export async function fetchGroups(): Promise<Group[]> {
  return check(await supabase.from('groups').select().order('created_at', { ascending: false }));
}

export async function fetchGroup(id: string): Promise<Group> {
  return check(await supabase.from('groups').select().eq('id', id).single());
}

export async function createGroup(name: string): Promise<Group> {
  return check(await supabase.rpc('create_group', { p_name: name }));
}

export async function joinGroup(code: string): Promise<Group> {
  return check(await supabase.rpc('join_group', { p_code: code }));
}

/** Your net balance in every group you belong to, keyed by group id. */
export async function fetchMyBalances(userId: string): Promise<Map<string, number>> {
  const [expenses, settlements] = await Promise.all([
    supabase.from('expenses').select(expenseColumns).then(check<Expense[]>),
    supabase.from('settlements').select().then(check<Settlement[]>),
  ]);
  const groupIds = new Set([...expenses.map((e) => e.group_id), ...settlements.map((s) => s.group_id)]);
  const result = new Map<string, number>();
  for (const groupId of groupIds) {
    const balances = netBalances(
      expenses.filter((e) => e.group_id === groupId),
      settlements.filter((s) => s.group_id === groupId),
    );
    result.set(groupId, balances.get(userId) ?? 0);
  }
  return result;
}

// Group detail

export async function fetchMembers(groupId: string): Promise<Profile[]> {
  const result = await supabase.from('group_members').select('profile:profiles(*)').eq('group_id', groupId).order('joined_at');
  // profiles is a to-one relation; the untyped client infers an array, so narrow it here.
  const rows = check(result) as unknown as { profile: Profile }[];
  return rows.map((r) => r.profile);
}

export async function fetchExpenses(groupId: string): Promise<Expense[]> {
  return check(
    await supabase.from('expenses').select(expenseColumns).eq('group_id', groupId).order('created_at', { ascending: false }),
  );
}

export async function fetchSettlements(groupId: string): Promise<Settlement[]> {
  return check(
    await supabase.from('settlements').select().eq('group_id', groupId).order('created_at', { ascending: false }),
  );
}

// Expenses

/** Creates the expense when `expenseId` is null, otherwise updates it. Splits equally. */
export async function saveExpense(input: {
  expenseId: string | null;
  groupId: string;
  description: string;
  amountCents: number;
  paidBy: string;
  participantIds: string[];
}): Promise<void> {
  check(
    await supabase.rpc('save_expense', {
      p_expense_id: input.expenseId,
      p_group_id: input.groupId,
      p_description: input.description,
      p_amount_cents: input.amountCents,
      p_paid_by: input.paidBy,
      p_participant_ids: input.participantIds,
    }),
  );
}

export async function deleteExpense(id: string): Promise<void> {
  check(await supabase.from('expenses').delete().eq('id', id));
}

// Settle up (once, at the end)

export async function startSettlement(groupId: string): Promise<void> {
  check(await supabase.rpc('start_settlement', { p_group_id: groupId }));
}

export async function reopenGroup(groupId: string): Promise<void> {
  check(await supabase.rpc('reopen_group', { p_group_id: groupId }));
}

export async function recordSettlement(groupId: string, payment: Payment): Promise<void> {
  check(
    await supabase.rpc('record_settlement', {
      p_group_id: groupId,
      p_from_user: payment.from,
      p_to_user: payment.to,
      p_amount_cents: payment.amountCents,
    }),
  );
}

// Profile

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select().eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateDisplayName(userId: string, name: string): Promise<void> {
  check(await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', userId));
}
