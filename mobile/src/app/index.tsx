import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { useDialog } from '@/components/Dialog';
import { Icon, type IconName } from '@/components/Icon';
import { colors, floatShadow, fonts, radius, space, type } from '@/components/theme';
import { Badge, BalanceLabel, Button, IconButton, T1, T2, styles as ui } from '@/components/ui';
import { fetchGroups, fetchMyBalances } from '@/data/repository';
import type { Group } from '@/data/types';
import { formatCents } from '@/domain/money';
import { userMessage } from '@/lib/supabase';

const openSheet = (mode: 'create' | 'join') => router.push({ pathname: '/new-group', params: { mode } });

export default function GroupsScreen() {
  const { userId } = useAuth();
  const dialog = useDialog();
  const insets = useSafeAreaInsets();
  const [groups, setGroups] = useState<Group[]>([]);
  const [balances, setBalances] = useState(new Map<string, number>());
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [g, b] = await Promise.all([fetchGroups(), fetchMyBalances(userId)]);
      setGroups(g);
      setBalances(b);
    } catch (error) {
      await dialog.alert('Something went wrong', userMessage(error));
    } finally {
      setLoaded(true);
    }
  }, [userId, dialog]);

  // Reload whenever the screen is shown again (e.g. coming back from a group).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.nav, { marginTop: insets.top }]}>
        <IconButton icon="user" label="Settings" onPress={() => router.push('/settings')} />
        <IconButton icon="plus" label="Add group" active={menuOpen} onPress={() => setMenuOpen(true)} />
      </View>

      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        contentContainerStyle={groups.length === 0 ? { flexGrow: 1 } : { paddingBottom: insets.bottom + space.l }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.text}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          <Text style={styles.largeTitle} accessibilityRole="header">
            Groups
          </Text>
        }
        renderItem={({ item, index }) => (
          <GroupRow group={item} balance={balances.get(item.id) ?? 0} first={index === 0} last={index === groups.length - 1} />
        )}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Icon name="users" size={28} color={colors.accent} />
              </View>
              <Text style={styles.emptyTitle}>No groups yet</Text>
              <T2 style={{ textAlign: 'center', maxWidth: 260 }}>Create a group, or join one with an invite code</T2>
              <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 20 }}>
                <Button title="Create Group" icon="plus" onPress={() => openSheet('create')} />
                <Button title="Join with Code" variant="secondary" onPress={() => openSheet('join')} />
              </View>
            </View>
          ) : null
        }
      />

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuScrim} onPress={() => setMenuOpen(false)} accessible={false}>
          <View
            style={[styles.menu, { top: insets.top + 60 }]}
            accessibilityRole="menu"
            accessibilityViewIsModal
            onAccessibilityEscape={() => setMenuOpen(false)}
          >
            <MenuItem icon="plus" title="Create Group" onPress={() => { setMenuOpen(false); openSheet('create'); }} />
            <MenuItem icon="users" title="Join with Code" onPress={() => { setMenuOpen(false); openSheet('join'); }} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function MenuItem({ icon, title, onPress }: { icon: IconName; title: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.selected }]}
    >
      <Icon name={icon} size={20} />
      <Text style={styles.menuText}>{title}</Text>
    </Pressable>
  );
}

function GroupRow({ group, balance, first, last }: { group: Group; balance: number; first: boolean; last: boolean }) {
  const settled = group.status === 'settled';
  const label = [
    group.name,
    group.status === 'settled' ? 'settled' : group.status === 'settling' ? 'settling up' : null,
    balance === 0 ? (settled ? null : 'settled up') : balance > 0 ? `you are owed ${formatCents(balance)}` : `you owe ${formatCents(-balance)}`,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <View style={[styles.cardSlice, first && styles.cardFirst, last && styles.cardLast]}>
      {!first ? <View style={ui.hairline} /> : null}
      <Pressable
        onPress={() => router.push({ pathname: '/group/[id]', params: { id: group.id, name: group.name } })}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [ui.row, { minHeight: 60 }, pressed && { backgroundColor: colors.raised }]}
      >
        <View style={{ flex: 1, gap: 6, alignItems: 'flex-start' }}>
          <T1 numberOfLines={2}>{group.name}</T1>
          {group.status !== 'active' ? <Badge status={group.status === 'settled' ? 'settled' : 'settling'} /> : null}
        </View>
        <BalanceLabel cents={balance} style="summary" />
        <Icon name="chev-r" size={18} color={colors.textDisabled} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.m },
  largeTitle: { ...type.largeTitle, color: colors.text, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 },
  cardSlice: {
    marginHorizontal: space.m,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
  },
  cardFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card },
  cardLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.s, paddingHorizontal: 28, paddingBottom: 72 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  emptyTitle: { ...type.title, color: colors.text },
  menuScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  menu: {
    position: 'absolute',
    right: space.m,
    width: 232,
    padding: 6,
    gap: 2,
    borderRadius: radius.card,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
    ...floatShadow,
  },
  menuItem: { minHeight: 48, paddingHorizontal: space.s, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: space.s },
  menuText: { fontFamily: fonts.medium, fontSize: 17, color: colors.text },
});
