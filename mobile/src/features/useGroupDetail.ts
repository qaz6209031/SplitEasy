import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import * as repo from '@/data/repository';
import type { Expense, Group, Profile, Settlement } from '@/data/types';
import { netBalances } from '@/domain/balances';
import { simplifyDebts, type Payment } from '@/domain/debts';
import { userMessage } from '@/lib/supabase';

/** Loads one group (members, expenses, payments) and exposes the settle-up actions. */
export function useGroupDetail(groupId: string) {
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loaded, setLoaded] = useState(false);
  /** True while Settle Up / Reopen is saving, to show progress and prevent double taps. */
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, m, e, s] = await Promise.all([
        repo.fetchGroup(groupId),
        repo.fetchMembers(groupId),
        repo.fetchExpenses(groupId),
        repo.fetchSettlements(groupId),
      ]);
      setGroup(g);
      setMembers(m);
      setExpenses(e);
      setSettlements(s);
    } catch (error) {
      Alert.alert('Something went wrong', userMessage(error));
    } finally {
      setLoaded(true);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const balances = useMemo(() => netBalances(expenses, settlements), [expenses, settlements]);
  const payments = useMemo(() => simplifyDebts(balances), [balances]);

  async function run(action: () => Promise<void>, trackStatus = false) {
    if (trackStatus) setUpdatingStatus(true);
    try {
      await action();
    } catch (error) {
      Alert.alert('Something went wrong', userMessage(error));
    } finally {
      if (trackStatus) setUpdatingStatus(false);
      await load();
    }
  }

  return {
    group,
    members,
    expenses,
    settlements,
    loaded,
    balances,
    payments,
    updatingStatus,
    reload: load,
    deleteExpense: (id: string) => run(() => repo.deleteExpense(id)),
    startSettlement: () => run(() => repo.startSettlement(groupId), true),
    reopen: () => run(() => repo.reopenGroup(groupId), true),
    markPaid: (payment: Payment) => run(() => repo.recordSettlement(groupId, payment)),
  };
}
