import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, findNodeHandle, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { useDialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { CancelLines, Stamp } from '@/components/postal';
import { useSplitView } from '@/components/ScreenColumn';
import { assignStampColors, colors, space, stampColor, type } from '@/components/theme';
import { BalanceLabel, Button, IconButton, StatusLine, T2, styles as ui } from '@/components/ui';
import { fetchGroups, fetchMembersByGroup, fetchMyBalances } from '@/data/repository';
import type { Group, Profile } from '@/data/types';
import { currencyOf, formatMoney, type Currency } from '@/domain/money';
import { GroupDetail } from '@/features/GroupDetail';
import { useInvites } from '@/lib/invite';
import { userMessage } from '@/lib/supabase';

const openSheet = (mode: 'create' | 'join', code?: string) =>
  router.push({ pathname: '/new-group', params: code ? { mode, code } : { mode } });
/** An invite link someone tapped: the Join sheet with its code filled in. */
const openInvite = (code: string) => openSheet('join', code);

/**
 * The system action sheet for "+": create a group or join one. On a wide screen (iPhone Duo open,
 * iPad) it becomes a popover, so it points at the button.
 */
function showAddMenu(anchor: View | null) {
  const options = ['Create Group', 'Join with Code'] as const;
  const pick = (i: number) => (i === 0 ? openSheet('create') : i === 1 ? openSheet('join') : undefined);
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...options, 'Cancel'], cancelButtonIndex: 2, anchor: (anchor && findNodeHandle(anchor)) || undefined },
      pick,
    );
  } else {
    Alert.alert('Add a group', undefined, [
      { text: options[0], onPress: () => pick(0) },
      { text: options[1], onPress: () => pick(1) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
}

export default function GroupsScreen() {
  const { userId } = useAuth();
  const dialog = useDialog();
  const insets = useSafeAreaInsets();
  const plusRef = useRef<View>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [balances, setBalances] = useState(new Map<string, number>());
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState(new Map<string, Profile[]>());
  // On a wide screen (iPhone Duo open, iPad) the list keeps a group open beside it instead of pushing one.
  const split = useSplitView();
  const [picked, setPicked] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [g, b, m] = await Promise.all([fetchGroups(), fetchMyBalances(userId), fetchMembersByGroup()]);
      setGroups(g);
      setBalances(b);
      setMembers(m);
    } catch (error) {
      await dialog.alert('Something went wrong', userMessage(error));
    } finally {
      setLoaded(true);
    }
  }, [userId, dialog]);

  // An invite link opens the Join sheet, whether it arrived before sign-in or while the app was open.
  useInvites(openInvite);

  // Reload whenever the screen is shown again (e.g. coming back from a group).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Amounts in different currencies never add up, so the overall position is kept per currency,
  // in the order the currencies first appear in the list (newest group first).
  const totals: Total[] = [];
  for (const g of groups) {
    const currency = currencyOf(g.currency);
    let total = totals.find((t) => t.currency.code === currency.code);
    if (!total) totals.push((total = { currency, cents: 0 }));
    total.cents += balances.get(g.id) ?? 0;
  }
  // The open group: the one picked, else the first, so the right pane is never blank.
  const open = split ? (groups.find((g) => g.id === picked) ?? groups[0] ?? null) : null;

  const list = (
    <>
      <View style={[styles.nav, { marginTop: insets.top }]}>
        <IconButton icon="user" label="Settings" onPress={() => router.push('/settings')} />
        <IconButton ref={plusRef} icon="plus" label="Add group" size={26} onPress={() => showAddMenu(plusRef.current)} />
      </View>

      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        contentContainerStyle={groups.length === 0 ? { flexGrow: 1 } : { paddingBottom: insets.bottom + space.l }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.ink2}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.largeTitle} accessibilityRole="header">
              Groups
            </Text>
            {groups.length > 0 ? <Overall totals={totals} /> : null}
          </View>
        }
        ItemSeparatorComponent={() => <View style={[ui.hairline, { marginLeft: 102 }]} />}
        renderItem={({ item }) => (
          <GroupRow
            group={item}
            balance={balances.get(item.id) ?? 0}
            members={members.get(item.id) ?? []}
            selected={open?.id === item.id}
            onPress={open ? () => setPicked(item.id) : undefined}
          />
        )}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <View style={styles.emptyStamps} accessibilityElementsHidden>
                <Stamp name="T" color={stampColor(0)} size="lg" style={{ transform: [{ rotate: '-8deg' }, { translateY: 6 }] }} />
                <Stamp name="A" color={stampColor(1)} size="lg" style={{ transform: [{ rotate: '4deg' }], marginLeft: -10 }} />
                <Stamp name="B" color={stampColor(2)} size="lg" style={{ transform: [{ rotate: '-3deg' }, { translateY: 4 }], marginLeft: -10 }} />
              </View>
              <Text style={styles.emptyTitle}>No groups yet</Text>
              <T2 style={{ textAlign: 'center', maxWidth: 280 }}>Start one for a trip, a house or a dinner, or join a friend’s with their invite code.</T2>
              <View style={{ alignSelf: 'stretch', gap: 10, marginTop: space.l }}>
                <Button title="Create Group" icon="plus" onPress={() => openSheet('create')} />
                <Button title="Join with Code" variant="secondary" onPress={() => openSheet('join')} />
              </View>
            </View>
          ) : null
        }
      />
    </>
  );

  if (!open) {
    // One pane. With no groups yet on a wide screen, the empty state keeps the usual column width.
    return <View style={[{ flex: 1, backgroundColor: colors.bg }, split && styles.narrow]}>{list}</View>;
  }
  return (
    <View style={styles.panes}>
      <View style={styles.listPane}>{list}</View>
      <View style={styles.paneRule} />
      <View style={{ flex: 1 }}>
        <GroupDetail key={open.id} id={open.id} initialName={open.name} embedded onChange={load} />
      </View>
    </View>
  );
}

type Total = { currency: Currency; cents: number };

/**
 * Your net position across every group: the one large number on this screen. With groups in more
 * than one currency, one smaller figure per currency.
 */
function Overall({ totals }: { totals: Total[] }) {
  const open = totals.filter((t) => t.cents !== 0);
  if (open.length === 0) return <T2 style={{ marginTop: 6 }}>You’re all square across your groups.</T2>;
  const say = (t: Total) => `${t.cents > 0 ? 'you’re owed' : 'you owe'} ${formatMoney(Math.abs(t.cents), t.currency)}`;
  if (open.length === 1) {
    const [only] = open;
    return (
      <View style={{ marginTop: space.s }} accessible accessibilityLabel={`Overall, ${say(only)}`}>
        <T2>{only.cents > 0 ? 'Overall, you’re owed' : 'Overall, you owe'}</T2>
        <Text style={[type.amountHero, { fontSize: 44, lineHeight: 50, color: colors.ink }]}>{formatMoney(Math.abs(only.cents), only.currency)}</Text>
      </View>
    );
  }
  return (
    <View style={{ marginTop: space.s, gap: space.s }} accessible accessibilityLabel={`Overall, ${open.map(say).join(', and ')}`}>
      <T2>Overall</T2>
      {open.map((t) => (
        <View key={t.currency.code}>
          <T2>{t.cents > 0 ? 'You’re owed' : 'You owe'}</T2>
          <Text style={[type.amountHero, { fontSize: 34, lineHeight: 40, color: colors.ink }]}>{formatMoney(Math.abs(t.cents), t.currency)}</Text>
        </View>
      ))}
    </View>
  );
}

/** The group's members as a small overlapping run of stamps; a settled group's run is cancelled. */
function StampRun({ members, settled }: { members: Profile[]; settled: boolean }) {
  const colors = assignStampColors(members.map((m) => m.id));
  const shown = members.slice(0, 3);
  const tilt = ['-6deg', '4deg', '-2deg'];
  return (
    <View style={styles.run} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {shown.map((m, i) => (
        <Stamp
          key={m.id}
          name={m.display_name || '?'}
          color={colors.get(m.id) ?? stampColor(i)}
          style={{ marginLeft: i === 0 ? 0 : -8, transform: [{ rotate: tilt[i] }], zIndex: i }}
        />
      ))}
      {members.length > 3 ? <Text style={styles.more}>+{members.length - 3}</Text> : null}
      {settled ? <CancelLines width={30 + (shown.length - 1) * 22} top={26} style={{ zIndex: 10 }} /> : null}
    </View>
  );
}

function GroupRow({
  group,
  balance,
  members,
  selected,
  onPress,
}: {
  group: Group;
  balance: number;
  members: Profile[];
  /** The group open in the pane beside the list. */
  selected: boolean;
  /** Given in two panes, where a tap opens the group beside the list rather than pushing it. */
  onPress?: () => void;
}) {
  const settled = group.status === 'settled';
  const currency = currencyOf(group.currency);
  const formatCents = (cents: number) => formatMoney(cents, currency);
  const label = [
    group.name,
    group.status === 'settled' ? 'settled' : group.status === 'settling' ? 'settling up' : null,
    balance === 0 ? (settled ? null : 'all square') : balance > 0 ? `you’re owed ${formatCents(balance)}` : `you owe ${formatCents(-balance)}`,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Pressable
      onPress={onPress ?? (() => router.push({ pathname: '/group/[id]', params: { id: group.id, name: group.name } }))}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={onPress ? { selected } : undefined}
      style={({ pressed }) => [ui.row, { minHeight: 68, paddingRight: onPress ? space.m : 10 }, (pressed || selected) && { backgroundColor: colors.fill }]}
    >
      <StampRun members={members} settled={settled} />
      <View style={{ flex: 1, gap: 3, alignItems: 'flex-start' }}>
        <Text style={styles.groupName} numberOfLines={2}>
          {group.name}
        </Text>
        {group.status !== 'active' ? <StatusLine status={settled ? 'settled' : 'settling'} /> : null}
      </View>
      {settled && balance === 0 ? null : <BalanceLabel cents={balance} currency={currency} />}
      {onPress ? null : <Icon name="chev-r" size={18} color={colors.ink3} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6 },
  header: { paddingHorizontal: space.m, paddingTop: 2, paddingBottom: space.l },
  largeTitle: { ...type.largeTitle, color: colors.ink },
  groupName: { ...type.headline, color: colors.ink },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.s, paddingHorizontal: 28, paddingBottom: 72 },
  emptyStamps: { flexDirection: 'row', marginBottom: space.m },
  emptyTitle: { ...type.title, color: colors.ink },
  run: { width: 74, height: 44, flexDirection: 'row', alignItems: 'center' },
  more: { ...type.footnote, fontWeight: '600', color: colors.ink2, marginLeft: 4 },
  panes: { flex: 1, flexDirection: 'row', backgroundColor: colors.bg },
  listPane: { width: 360 },
  paneRule: { width: StyleSheet.hairlineWidth, backgroundColor: colors.strongRule },
  narrow: { width: '100%', maxWidth: 640, alignSelf: 'center' },
});
