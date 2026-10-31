import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { useDialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { colors, fonts, radius, space, type } from '@/components/theme';
import {
  Amount,
  Avatar,
  BalanceLabel,
  Button,
  Card,
  Footnote,
  LinkButton,
  NavBar,
  Row,
  SectionHeader,
  SegmentedControl,
  T1,
  T2,
  Tile,
  styles as ui,
} from '@/components/ui';
import { isLocked, type Expense, type GroupStatus } from '@/data/types';
import { paymentKey, type Payment } from '@/domain/debts';
import { formatCents } from '@/domain/money';
import { groupSummaryText } from '@/domain/summary';
import { useGroupDetail } from '@/features/useGroupDetail';

type Tab = 'expenses' | 'balances';
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' });

export default function GroupScreen() {
  const { id, name: initialName } = useLocalSearchParams<{ id: string; name?: string }>();
  const { userId } = useAuth();
  const dialog = useDialog();
  const detail = useGroupDetail(id);
  const { group, members, expenses, settlements, balances, payments, loaded } = detail;
  // null until the user picks a tab: a group that's settling up opens on who pays whom.
  const [chosenTab, setTab] = useState<Tab | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const locked = group ? isLocked(group) : false;
  const tab: Tab = chosenTab ?? (locked ? 'balances' : 'expenses');

  const name = (personId: string) =>
    personId === userId ? 'You' : (members.find((m) => m.id === personId)?.display_name ?? 'Unknown');
  /** Mid-sentence form: "Alice paid you". */
  const objectName = (personId: string) => (personId === userId ? 'you' : name(personId));

  const shareText = group ? `Join my group "${group.name}" on Tabmates with invite code ${group.invite_code}` : '';
  const share = () => Share.share({ message: shareText });

  /** "Copied" confirmation on the Copy as Text button; cleared after a moment. */
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copySummary() {
    if (!group) return;
    await Clipboard.setStringAsync(groupSummaryText({ group, members, expenses, settlements, myId: userId }));
    setCopied(true);
  }

  async function confirmSettleUp() {
    const ok = await dialog.confirm({
      title: 'Settle up now?',
      message: 'Expenses will be locked and everyone pays each other back. You can reopen the group if something was missed.',
      confirmTitle: 'Settle Up',
      tone: 'amber',
    });
    if (!ok) return;
    setTab('balances');
    // Bring the new "Settling up" banner into view.
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    detail.startSettlement();
  }

  async function confirmReopen() {
    const ok = await dialog.confirm({
      title: 'Reopen this group?',
      message: 'Everyone can add and edit expenses again. Payments already recorded are kept.',
      confirmTitle: 'Reopen',
    });
    if (ok) detail.reopen();
  }

  async function showLockedNotice() {
    const reopen = await dialog.confirm({
      title: 'Expenses are locked',
      message: group?.status === 'settled' ? 'This group is settled. Reopen it to change expenses.' : 'Reopen it to change expenses.',
      cancelTitle: 'OK',
      confirmTitle: 'Reopen Group',
    });
    if (reopen) confirmReopen();
  }

  async function confirmDelete(expense: Expense) {
    const ok = await dialog.confirm({
      title: `Delete "${expense.description}"?`,
      message: "This updates everyone's balances.",
      confirmTitle: 'Delete',
      tone: 'red',
    });
    if (ok) detail.deleteExpense(expense.id);
  }

  async function confirmPaid(payment: Payment) {
    const ok = await dialog.confirm({
      title: 'Record this payment?',
      highlight: formatCents(payment.amountCents),
      message: `${name(payment.from)} paid ${objectName(payment.to)} ${formatCents(payment.amountCents)}. Only confirm once the money has actually been sent.`,
      confirmTitle: 'Mark as Paid',
    });
    if (ok) detail.markPaid(payment);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <NavBar
        left={<LinkButton title="Groups" icon="chev-l" iconSize={22} onPress={() => router.back()} />}
        title={group?.name ?? initialName ?? ''}
        right={<LinkButton title="Invite" icon="share" onPress={share} />}
      />
      <View style={{ paddingHorizontal: space.m, paddingTop: 4, paddingBottom: space.m }}>
        <SegmentedControl
          values={['Expenses', 'Balances']}
          index={tab === 'expenses' ? 0 : 1}
          onChange={(i) => setTab(i === 0 ? 'expenses' : 'balances')}
        />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.body, { paddingBottom: locked ? insets.bottom + space.l : 100 + insets.bottom }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.text}
            onRefresh={async () => {
              setRefreshing(true);
              await detail.reload();
              setRefreshing(false);
            }}
          />
        }
      >
        {group && locked ? (
          <StatusBanner status={group.status} busy={detail.updatingStatus} onReopen={confirmReopen} />
        ) : loaded && members.length < 2 && group ? (
          <InviteBanner code={group.invite_code} onShare={share} />
        ) : null}

        {tab === 'expenses' ? (
          loaded && expenses.length === 0 ? (
            <View style={styles.empty}>
              <Tile icon="receipt" size={56} iconSize={24} background={colors.surface} />
              <Text style={styles.emptyTitle}>No expenses yet</Text>
              <T2 style={{ textAlign: 'center' }}>Tap Add Expense to record who paid for what.</T2>
            </View>
          ) : expenses.length > 0 ? (
            <Card>
              {expenses.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  payerName={name(expense.paid_by)}
                  locked={locked}
                  onPress={() =>
                    locked ? showLockedNotice() : router.push({ pathname: '/group/[id]/expense', params: { id, expenseId: expense.id } })
                  }
                  onDelete={() => confirmDelete(expense)}
                />
              ))}
            </Card>
          ) : null
        ) : (
          <>
            {group?.status === 'settling' ? (
              <>
                <SectionHeader>Pay each other back</SectionHeader>
                <Card>
                  {payments.length === 0 ? (
                    <Row>
                      <T2>Everyone is settled up</T2>
                    </Row>
                  ) : null}
                  {payments.map((payment) => (
                    <Row key={paymentKey(payment)}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={styles.who} accessible accessibilityLabel={`${name(payment.from)} pays ${objectName(payment.to)}`}>
                          <T1>{name(payment.from)}</T1>
                          <Icon name="arrow-r" size={16} color={colors.textMuted} />
                          <T1>{objectName(payment.to)}</T1>
                        </View>
                        <Amount cents={payment.amountCents} />
                      </View>
                      <Button title="Mark as Paid" variant="secondary" size="sm" onPress={() => confirmPaid(payment)} />
                    </Row>
                  ))}
                </Card>
                {payments.length > 0 ? <Footnote>Debts are simplified so the group needs the fewest payments.</Footnote> : null}
              </>
            ) : null}

            {group?.status === 'settling' && settlements.length > 0 ? renderPayments() : null}

            <SectionHeader>Balances</SectionHeader>
            <Card>
              {members.map((member) => (
                <Row key={member.id}>
                  <Avatar name={member.display_name || '?'} me={member.id === userId} />
                  <T1 style={{ flex: 1 }} numberOfLines={1}>
                    {name(member.id)}
                  </T1>
                  <BalanceLabel cents={balances.get(member.id) ?? 0} style={member.id === userId ? 'you' : 'member'} />
                </Row>
              ))}
            </Card>

            {group?.status === 'active' ? (
              <Card style={{ padding: 18, gap: space.m }} separated={false}>
                <Text style={styles.settleText}>
                  <Text style={{ color: colors.text, fontFamily: fonts.medium }}>Done adding expenses? </Text>
                  Settle Up locks the group and shows the fewest payments needed for everyone to pay each other back.
                </Text>
                <Button
                  title="Settle Up"
                  icon="swap"
                  variant="amber"
                  onPress={confirmSettleUp}
                  disabled={expenses.length === 0}
                  busy={detail.updatingStatus}
                />
              </Card>
            ) : null}

            {group?.status !== 'settling' && settlements.length > 0 ? renderPayments() : null}

            {expenses.length > 0 ? (
              <Card style={{ padding: 18, gap: space.m }} separated={false}>
                <Text style={styles.settleText}>
                  <Text style={{ color: colors.text, fontFamily: fonts.medium }}>Double-check the math? </Text>
                  Copy every expense, payment and balance as text, then paste it into ChatGPT or another AI to verify.
                </Text>
                <Button
                  title={copied ? 'Copied' : 'Copy as Text'}
                  icon={copied ? 'check' : 'copy'}
                  variant="secondary"
                  onPress={copySummary}
                />
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Adding expenses is only possible while the group is active (not settling up). */}
      {!locked && group ? (
        <View style={[styles.bar, { paddingBottom: insets.bottom + 6 }]}>
          <Button
            title="Add Expense"
            icon="plus"
            onPress={() => router.push({ pathname: '/group/[id]/expense', params: { id } })}
            disabled={members.length === 0}
          />
        </View>
      ) : null}
    </View>
  );

  function renderPayments() {
    return (
      <>
        <SectionHeader>Payments</SectionHeader>
        <Card>
          {settlements.map((s) => (
            <Row key={s.id}>
              <Tile icon="coin" size={36} iconSize={18} color={colors.green} background={colors.greenTint} />
              <View style={{ flex: 1, gap: 2 }}>
                <T1>
                  {name(s.from_user)} paid {objectName(s.to_user)}
                </T1>
                <T2>{formatDate(s.created_at)}</T2>
              </View>
              <Amount cents={s.amount_cents} color={colors.green} />
            </Row>
          ))}
        </Card>
      </>
    );
  }
}

function ExpenseRow({
  expense,
  payerName,
  locked,
  onPress,
  onDelete,
}: {
  expense: Expense;
  payerName: string;
  locked: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  const swipe = useRef<SwipeableMethods>(null);
  const label = `${expense.description}, ${payerName} paid, ${formatCents(expense.amount_cents)}`;
  const body = (
    <>
      <Tile icon={locked ? 'lock' : 'receipt'} color={locked ? colors.textDisabled : colors.textMuted} iconSize={locked ? 18 : 20} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T1 numberOfLines={2}>{expense.description}</T1>
        <T2>
          {payerName} paid · {formatDate(expense.created_at)}
        </T2>
      </View>
      <Amount cents={expense.amount_cents} />
    </>
  );

  if (locked) {
    // A tap gesture (not a Pressable) that fails as soon as the finger moves, so a swipe on a locked
    // row doesn't count as a tap. There's no swipe action at all while locked.
    const tap = Gesture.Tap().maxDistance(10).runOnJS(true).onEnd((_e, success) => {
      // Open the dialog after the touch finishes: presenting a modal mid-gesture leaves it out of the accessibility tree.
      if (success) setTimeout(onPress, 0);
    });
    return (
      <GestureDetector gesture={tap}>
        <View
          style={[ui.row, { minHeight: 60, backgroundColor: colors.surface }]}
          accessible
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint="Expenses are locked while settling up"
          onAccessibilityTap={onPress}
        >
          {body}
        </View>
      </GestureDetector>
    );
  }

  return (
    <ReanimatedSwipeable
      ref={swipe}
      friction={2}
      rightThreshold={40}
      renderRightActions={() => (
        <Pressable
          onPress={() => {
            // Close first, so a cancelled delete doesn't leave the row open.
            swipe.current?.close();
            onDelete();
          }}
          style={styles.deleteAction}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${expense.description}`}
        >
          <Icon name="trash" size={20} color={colors.white} />
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      )}
    >
      <Row
        onPress={onPress}
        style={{ backgroundColor: colors.surface }}
        accessibilityLabel={label}
        accessibilityActions={[{ name: 'delete', label: 'Delete' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'delete') onDelete();
        }}
      >
        {body}
      </Row>
    </ReanimatedSwipeable>
  );
}

function StatusBanner({ status, busy, onReopen }: { status: GroupStatus; busy: boolean; onReopen: () => void }) {
  if (status === 'settled') return <SettledBanner busy={busy} onReopen={onReopen} />;
  return (
    <View style={[styles.banner, { backgroundColor: colors.amberTint, borderColor: colors.amberLine }]} accessibilityRole="summary">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        <Icon name="lock" size={18} color={colors.amber} />
        <T1 style={{ color: colors.amber, fontFamily: fonts.semibold }}>Settling up</T1>
      </View>
      <Text style={[type.caption, { color: colors.amberText }]}>
        Expenses are locked. Pay each other back using the list in Balances and mark each payment as paid.
      </Text>
      <LinkButton title={busy ? 'Reopening…' : 'Reopen group'} onPress={onReopen} disabled={busy} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

/** "All settled up": the seal pops in and a few sparkles twinkle. */
function SettledBanner({ busy, onReopen }: { busy: boolean; onReopen: () => void }) {
  const pop = useSharedValue(0.6);
  useEffect(() => {
    pop.value = withSpring(1, { damping: 9, stiffness: 180 });
  }, [pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }], opacity: Math.min(1, pop.value * 1.6 - 0.6) }));
  return (
    <View style={[styles.banner, styles.settled]} accessibilityRole="summary">
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="0%" rx="70%" ry="90%">
            <Stop offset="0" stopColor="#143322" />
            <Stop offset="1" stopColor={colors.greenTint} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#glow)" />
      </Svg>
      <Sparkle style={{ left: 34, top: 26 }} size={16} color={colors.green} delay={0} />
      <Sparkle style={{ right: 38, top: 44 }} size={12} color={colors.amber} delay={700} />
      <Sparkle style={{ left: 70, top: 88 }} size={12} color={colors.green} delay={1100} />
      <Animated.View style={popStyle}>
        <Icon name="seal" size={40} color={colors.green} />
      </Animated.View>
      <Text style={styles.settledTitle}>All settled up</Text>
      <T2>Everyone has been paid back.</T2>
      <LinkButton title={busy ? 'Reopening…' : 'Reopen group'} onPress={onReopen} disabled={busy} />
    </View>
  );
}

function Sparkle({ style, size, color, delay }: { style: object; size: number; color: string; delay: number }) {
  const t = useSharedValue(1);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withSequence(withTiming(0.3, { duration: 900 }), withTiming(1, { duration: 900 })), -1));
  }, [t, delay]);
  const animated = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 0.6 + 0.4 * t.value }] }));
  return (
    <Animated.View style={[{ position: 'absolute' }, style, animated]} pointerEvents="none">
      <Icon name="sparkle" size={size} color={color} />
    </Animated.View>
  );
}

function InviteBanner({ code, onShare }: { code: string; onShare: () => void }) {
  return (
    <Card style={{ padding: space.m, gap: 14 }} separated={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="users" size={20} color={colors.accent} />
        <T1 style={{ fontFamily: fonts.semibold }}>Invite friends to this group</T1>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
        <Text selectable style={styles.code} accessibilityLabel={`Invite code ${code.split('').join(' ')}`}>
          {code}
        </Text>
        <Button title="Share" icon="share" size="sm" onPress={onShare} style={{ minHeight: 54 }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.m, paddingTop: 4, gap: 20 },
  empty: { alignItems: 'center', gap: 10, paddingTop: 80, paddingHorizontal: space.l },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text, marginTop: 6 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  settleText: { ...type.caption, color: colors.textMuted, lineHeight: 22 },
  banner: { borderRadius: radius.card, borderWidth: 1, padding: space.m, gap: 6 },
  settled: {
    backgroundColor: colors.greenTint,
    borderColor: colors.greenLine,
    alignItems: 'center',
    paddingTop: 26,
    paddingBottom: 10,
    overflow: 'hidden',
  },
  settledTitle: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.4, color: colors.text, marginTop: 6 },
  code: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 26,
    letterSpacing: 7,
    textAlign: 'center',
    color: colors.text,
    paddingVertical: space.s,
    paddingLeft: 8,
    borderRadius: 12,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.strongBorder,
    overflow: 'hidden',
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.s,
    paddingHorizontal: space.m,
    borderTopWidth: 1,
    borderTopColor: '#1F2227',
    backgroundColor: colors.bg,
  },
  deleteAction: { width: 88, backgroundColor: colors.redFill, alignItems: 'center', justifyContent: 'center', gap: 4 },
  deleteText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.white },
});
