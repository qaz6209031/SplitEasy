import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { colors, spacing, type } from '@/components/theme';
import { BalanceLabel, Button } from '@/components/ui';
import { fetchGroups, fetchMyBalances } from '@/data/repository';
import type { Group } from '@/data/types';
import { formatCents } from '@/domain/money';
import { userMessage } from '@/lib/supabase';

export default function GroupsScreen() {
  const { userId } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [balances, setBalances] = useState(new Map<string, number>());
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [g, b] = await Promise.all([fetchGroups(), fetchMyBalances(userId)]);
      setGroups(g);
      setBalances(b);
    } catch (error) {
      Alert.alert('Something went wrong', userMessage(error));
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  // Reload whenever the screen is shown again (e.g. coming back from a group).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function showAddMenu() {
    const open = (mode: 'create' | 'join') => router.push({ pathname: '/new-group', params: { mode } });
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Create Group', 'Join with Code', 'Cancel'], cancelButtonIndex: 2 },
        (index) => (index === 0 ? open('create') : index === 1 ? open('join') : undefined),
      );
    } else {
      Alert.alert('Add group', undefined, [
        { text: 'Create Group', onPress: () => open('create') },
        { text: 'Join with Code', onPress: () => open('join') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={() => router.push('/settings')} accessibilityLabel="Settings" hitSlop={8}>
              <Ionicons name="person-circle-outline" size={28} color={colors.accent} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={showAddMenu} accessibilityLabel="Add group" hitSlop={8}>
              <Ionicons name="add" size={28} color={colors.accent} />
            </Pressable>
          ),
        }}
      />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={groups.length === 0 ? styles.emptyContainer : styles.list}
        data={groups}
        keyExtractor={(g) => g.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.secondaryText}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item, index }) => (
          <GroupRow
            group={item}
            balance={balances.get(item.id) ?? 0}
            first={index === 0}
            last={index === groups.length - 1}
          />
        )}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={56} color={colors.secondaryText} />
              <Text style={styles.emptyTitle}>No groups yet</Text>
              <Text style={styles.emptyText}>Create a group, or join one with an invite code from a friend.</Text>
              <Button title="Create Group" onPress={() => router.push({ pathname: '/new-group', params: { mode: 'create' } })} style={{ alignSelf: 'stretch' }} />
              <Button title="Join with Code" variant="plain" onPress={() => router.push({ pathname: '/new-group', params: { mode: 'join' } })} />
            </View>
          ) : null
        }
      />
    </>
  );
}

function GroupRow({ group, balance, first, last }: { group: Group; balance: number; first: boolean; last: boolean }) {
  const settled = group.status === 'settled';
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/group/[id]', params: { id: group.id, name: group.name } })}
      accessibilityRole="button"
      accessibilityLabel={[
        group.name,
        group.status === 'settled' ? 'settled' : group.status === 'settling' ? 'settling up' : null,
        balance === 0 ? (settled ? null : 'settled up') : balance > 0 ? `you are owed ${formatCents(balance)}` : `you owe ${formatCents(-balance)}`,
      ]
        .filter(Boolean)
        .join(', ')}
      style={({ pressed }) => [
        styles.row,
        first && styles.rowFirst,
        last && styles.rowLast,
        pressed && { backgroundColor: colors.cardPressed },
      ]}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.name} numberOfLines={2}>
          {group.name}
        </Text>
        {group.status !== 'active' ? (
          <View style={styles.status}>
            <Ionicons
              name={settled ? 'checkmark-circle' : 'swap-horizontal'}
              size={13}
              color={settled ? colors.green : colors.orange}
            />
            <Text style={[styles.statusText, { color: settled ? colors.green : colors.orange }]}>
              {settled ? 'Settled' : 'Settling up'}
            </Text>
          </View>
        ) : null}
      </View>
      {/* "Settled" already says it all; don't repeat "settled up" beside it. */}
      {settled && balance === 0 ? null : <BalanceLabel cents={balance} style="summary" />}
      <Ionicons name="chevron-forward" size={18} color={colors.tertiaryText} style={{ marginLeft: spacing.s }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.l },
  emptyContainer: { flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    backgroundColor: colors.card,
  },
  rowFirst: { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  rowLast: { borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: spacing.l },
  name: { ...type.headline, color: colors.text },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { ...type.caption, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.m },
  emptyTitle: { ...type.title, color: colors.text, fontSize: 22 },
  emptyText: { ...type.body, color: colors.secondaryText, textAlign: 'center', marginBottom: spacing.s },
});
