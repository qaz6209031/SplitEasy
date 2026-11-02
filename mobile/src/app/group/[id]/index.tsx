import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { useDialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { CancelLines, Postmark, postmarkDate, Stamp } from '@/components/postal';
import { assignStampColors, colors, radius, space, type } from '@/components/theme';
import {
  Amount,
  Button,
  Footnote,
  LinkButton,
  List,
  NavBar,
  Row,
  SectionHeader,
  SegmentedControl,
  T1,
  T2,
  styles as ui,
} from '@/components/ui';
import { isLocked, type Expense, type Group } from '@/data/types';
import { paymentKey, type Payment } from '@/domain/debts';
import { formatCents } from '@/domain/money';
import { groupSummaryText } from '@/domain/summary';
import { useGroupDetail } from '@/features/useGroupDetail';

type Tab = 'expenses' | 'balances';
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' });
const formatDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const dayKey = (iso: string) => new Date(iso).toDateString();
/** Members who left or deleted their account have no stamp colour of their own. */
const NO_STAMP = '#8E929B';

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
  const tab: Tab | null = chosenTab ?? (group ? (locked ? 'balances' : 'expenses') : null);
  const [scrolled, setScrolled] = useState(false);

  const name = (personId: string) =>
    personId === userId ? 'You' : (members.find((m) => m.id === personId)?.display_name ?? 'Unknown');
  /** Mid-sentence form: "Alice paid you". */
  const objectName = (personId: string) => (personId === userId ? 'you' : name(personId));
  /** Each member keeps one stamp colour, in the order they joined. */
  const stampColors = assignStampColors(members.map((m) => m.id));
  const colorOf = (personId: string) => stampColors.get(personId) ?? NO_STAMP;
  const stampName = (personId: string) => members.find((m) => m.id === personId)?.display_name || name(personId);

  // Payments and the settled mark recorded while this screen is open get stamped in; ones that were
  // already there when it loaded just sit on the page.
  const [seenSettlements, setSeenSettlements] = useState<Set<string> | null>(null);
  if (loaded && seenSettlements == null) setSeenSettlements(new Set(settlements.map((s) => s.id)));
  const [initialStatus, setInitialStatus] = useState<Group['status'] | null>(null);
  if (group && initialStatus == null) setInitialStatus(group.status);

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
    });
    if (!ok) return;
    setTab('balances');
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

  // Expenses grouped by day, newest first (the list already arrives newest first).
  const days: { key: string; label: string; total: number; items: Expense[] }[] = [];
  for (const expense of expenses) {
    const key = dayKey(expense.created_at);
    let day = days[days.length - 1];
    if (!day || day.key !== key) days.push((day = { key, label: formatDay(expense.created_at), total: 0, items: [] }));
    day.items.push(expense);
    day.total += expense.amount_cents;
  }
  const myBalance = userId ? (balances.get(userId) ?? 0) : 0;
  const maxAbs = Math.max(0, ...members.map((m) => Math.abs(balances.get(m.id) ?? 0)));
  const allSquare = maxAbs === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <NavBar
        left={<LinkButton title="Groups" icon="chev-l" iconSize={24} onPress={() => router.back()} style={{ marginLeft: -4 }} />}
        title={group?.name ?? initialName ?? ''}
        right={<LinkButton title="Invite" icon="share" onPress={share} />}
      />
      <View style={[styles.tabs, scrolled && styles.tabsScrolled]}>
        <SegmentedControl
          values={['Expenses', 'Balances']}
          index={tab === 'expenses' ? 0 : tab === 'balances' ? 1 : -1}
          onChange={(i) => setTab(i === 0 ? 'expenses' : 'balances')}
        />
      </View>

      <ScrollView
        ref={scrollRef}
        scrollEventThrottle={32}
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 2)}
        contentContainerStyle={{ paddingTop: space.xs, paddingBottom: locked ? insets.bottom + space.xl : 100 + insets.bottom }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.ink2}
            onRefresh={async () => {
              setRefreshing(true);
              await detail.reload();
              setRefreshing(false);
            }}
          />
        }
      >
        {group && group.status === 'settling' ? (
          <SettlingLine busy={detail.updatingStatus} onReopen={confirmReopen} />
        ) : loaded && members.length < 2 && group ? (
          <InviteBlock code={group.invite_code} onShare={share} />
        ) : null}

        {tab == null ? null : tab === 'expenses' ? (
          loaded && expenses.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No expenses yet</Text>
              <T2 style={{ textAlign: 'center' }}>Tap Add Expense to record who paid for what.</T2>
            </View>
          ) : (
            days.map((day) => (
              <View key={day.key} style={{ marginBottom: space.s }}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayLabel} accessibilityRole="header">
                    {day.label}
                  </Text>
                  <Amount cents={day.total} small color={colors.ink2} />
                </View>
                <List inset={58}>
                  {day.items.map((expense) => (
                    <ExpenseRow
                      key={expense.id}
                      expense={expense}
                      payerName={name(expense.paid_by)}
                      stamp={<Stamp name={stampName(expense.paid_by)} color={colorOf(expense.paid_by)} />}
                      locked={locked}
                      onPress={() =>
                        locked ? showLockedNotice() : router.push({ pathname: '/group/[id]/expense', params: { id, expenseId: expense.id } })
                      }
                      onDelete={() => confirmDelete(expense)}
                    />
                  ))}
                </List>
              </View>
            ))
          )
        ) : (
          <View style={{ gap: space.xl }}>
            {group?.status === 'settled' ? (
              <SettledBlock
                group={group}
                date={settlements[0]?.created_at ?? new Date().toISOString()}
                stamped={initialStatus != null && initialStatus !== 'settled'}
                busy={detail.updatingStatus}
                onReopen={confirmReopen}
              />
            ) : (
              <MyBalance cents={myBalance} />
            )}

            {group?.status === 'settling' ? (
              <View style={{ gap: space.xs }}>
                <SectionHeader detail={payments.length > 0 ? `${payments.length} left` : undefined}>Pay each other back</SectionHeader>
                {payments.length === 0 && settlements.length === 0 ? (
                  <Footnote>Everyone is settled up.</Footnote>
                ) : (
                  <List inset={space.m}>
                    {payments.map((payment) => (
                      <Row key={paymentKey(payment)} minHeight={72} style={{ alignItems: 'flex-start', paddingTop: 12 }}>
                        <StampPair from={payment.from} to={payment.to} stampName={stampName} colorOf={colorOf} />
                        <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
                          <T1 numberOfLines={2}>
                            {name(payment.from)} pays {objectName(payment.to)}
                          </T1>
                          <Button
                            title="Mark as Paid"
                            variant="secondary"
                            size="sm"
                            onPress={() => confirmPaid(payment)}
                            style={{ alignSelf: 'flex-start' }}
                            accessibilityLabel={`Mark as paid: ${name(payment.from)} pays ${objectName(payment.to)} ${formatCents(payment.amountCents)}`}
                          />
                        </View>
                        <Amount cents={payment.amountCents} style={[styles.moneyColumn, { marginTop: 1 }]} />
                      </Row>
                    ))}
                    {settlements.map((s) => paidRow(s))}
                  </List>
                )}
                {payments.length > 0 ? <Footnote style={{ marginTop: 4 }}>Debts are simplified so the group needs the fewest payments.</Footnote> : null}
              </View>
            ) : null}

            <View style={{ gap: space.xs }}>
              <SectionHeader>Balances</SectionHeader>
              <List inset={58}>
                {members.map((member) => {
                  const cents = balances.get(member.id) ?? 0;
                  const me = member.id === userId;
                  return (
                    <View
                      key={member.id}
                      style={[ui.row, { minHeight: 56 }]}
                      accessible
                      accessibilityLabel={`${name(member.id)}, ${cents === 0 ? 'all square' : `${cents > 0 ? (me ? 'get back' : 'gets back') : me ? 'owe' : 'owes'} ${formatCents(Math.abs(cents))}`}`}
                    >
                      <Stamp name={member.display_name || '?'} color={colorOf(member.id)} />
                      <Text style={[type.body, styles.memberName]} numberOfLines={1}>
                        {name(member.id)}
                      </Text>
                      {allSquare ? (
                        <T2 style={{ flex: 1, textAlign: 'right' }}>all square</T2>
                      ) : (
                        <>
                          <BalanceBar cents={cents} max={maxAbs} color={colorOf(member.id)} />
                          <Amount
                            cents={cents}
                            signed
                            color={cents > 0 ? colors.pos : cents < 0 ? colors.neg : colors.ink3}
                            style={styles.moneyColumn}
                          />
                        </>
                      )}
                    </View>
                  );
                })}
              </List>
            </View>

            {group?.status === 'active' ? (
              <View style={styles.block}>
                <Text style={styles.blockText}>
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>Done adding expenses? </Text>
                  Settle Up locks the group and works out the fewest payments for everyone to pay each other back.
                </Text>
                <Button
                  title="Settle Up"
                  icon="swap"
                  variant="secondary"
                  onPress={confirmSettleUp}
                  disabled={expenses.length === 0}
                  busy={detail.updatingStatus}
                />
              </View>
            ) : null}

            {group?.status !== 'settling' && settlements.length > 0 ? renderPayments() : null}

            {expenses.length > 0 ? (
              <View style={[styles.block, styles.blockRuled]}>
                <Text style={styles.blockText}>
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>Double-check the math? </Text>
                  Copy every expense, payment and balance as text, then paste it into ChatGPT or another AI to verify.
                </Text>
                <Button
                  title={copied ? 'Copied' : 'Copy as Text'}
                  icon={copied ? 'check' : 'copy'}
                  variant="secondary"
                  onPress={copySummary}
                />
              </View>
            ) : null}
          </View>
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

  /** A recorded payment: its stamps cancelled with a postmark, the row faded back. */
  function paidRow(s: (typeof settlements)[number]) {
    return (
      <Row key={s.id} minHeight={64} accessibilityLabel={`${name(s.from_user)} paid ${objectName(s.to_user)} ${formatCents(s.amount_cents)}, ${formatDate(s.created_at)}`}>
        <View>
          <StampPair from={s.from_user} to={s.to_user} stampName={stampName} colorOf={colorOf} cancelled />
          <CancelLines width={50} top={22} stamped={seenSettlements != null && !seenSettlements.has(s.id)} style={{ zIndex: 10 }} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T1 numberOfLines={2} style={{ color: colors.ink2 }}>
            {name(s.from_user)} paid {objectName(s.to_user)}
          </T1>
          <Text style={styles.payer}>{formatDate(s.created_at)}</Text>
        </View>
        <Amount cents={s.amount_cents} color={colors.ink2} style={styles.moneyColumn} />
      </Row>
    );
  }

  function renderPayments() {
    return (
      <View style={{ gap: space.xs }}>
        <SectionHeader>Paid</SectionHeader>
        <List inset={space.m}>
          {settlements.map((s) => paidRow(s))}
        </List>
      </View>
    );
  }
}

function StampPair({
  from,
  to,
  stampName,
  colorOf,
  cancelled,
}: {
  from: string;
  to: string;
  stampName: (id: string) => string;
  colorOf: (id: string) => string;
  cancelled?: boolean;
}) {
  // A cancelled pair overlaps like stamps on one envelope; the postmark over them says they're done.
  if (cancelled) {
    return (
      <View style={styles.pair} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Stamp name={stampName(from)} color={colorOf(from)} style={{ transform: [{ rotate: '-4deg' }] }} />
        <Stamp name={stampName(to)} color={colorOf(to)} style={{ marginLeft: -10, transform: [{ rotate: '3deg' }] }} />
      </View>
    );
  }
  return (
    <View style={styles.pair} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Stamp name={stampName(from)} color={colorOf(from)} />
      <Icon name="arrow-r" size={14} color={colors.ink3} />
      <Stamp name={stampName(to)} color={colorOf(to)} />
    </View>
  );
}

/** Your position in this group: the one large number on the Balances tab. */
function MyBalance({ cents }: { cents: number }) {
  const owed = cents > 0;
  return (
    <View style={{ paddingHorizontal: space.m, paddingTop: space.xs }} accessible>
      <T2>{cents === 0 ? 'You’re all square' : owed ? 'You get back' : 'You owe'}</T2>
      <Text style={[type.amountHero, { color: colors.ink }]}>
        {formatCents(Math.abs(cents))}
      </Text>
    </View>
  );
}

/** A diverging bar: right of centre for what someone gets back, left for what they owe. */
function BalanceBar({ cents, max, color }: { cents: number; max: number; color: string }) {
  const share = `${(Math.abs(cents) / max) * 50}%` as const;
  return (
    <View style={styles.barTrack} accessibilityElementsHidden>
      <View style={styles.barAxis} />
      {cents !== 0 ? (
        <View style={[styles.barFill, { backgroundColor: color, width: share }, cents > 0 ? { left: '50%' } : { right: '50%' }]} />
      ) : null}
    </View>
  );
}

function ExpenseRow({
  expense,
  payerName,
  stamp,
  locked,
  onPress,
  onDelete,
}: {
  expense: Expense;
  payerName: string;
  stamp: ReactNode;
  locked: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  const swipe = useRef<SwipeableMethods>(null);
  const label = `${expense.description}, ${payerName} paid, ${formatCents(expense.amount_cents)}`;
  const body = (
    <>
      {stamp}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T1 numberOfLines={2}>{expense.description}</T1>
        <Text style={styles.payer}>{payerName} paid</Text>
      </View>
      <Amount cents={expense.amount_cents} style={styles.moneyColumn} />
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
          style={[ui.row, { minHeight: 56, backgroundColor: colors.bg }]}
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
        minHeight={56}
        style={{ backgroundColor: colors.bg }}
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

function SettlingLine({ busy, onReopen }: { busy: boolean; onReopen: () => void }) {
  return (
    <View style={styles.settling} accessibilityRole="summary">
      <View style={styles.settlingDot} />
      <Text style={styles.settlingText}>
        <Text style={{ fontWeight: '600', color: colors.warn }}>Settling up</Text> · expenses are locked
      </Text>
      <LinkButton title={busy ? 'Reopening…' : 'Reopen'} onPress={onReopen} disabled={busy} />
    </View>
  );
}

/** The whole group, cancelled: a large postmark with the group's name round the ring. */
function SettledBlock({
  group,
  date,
  stamped,
  busy,
  onReopen,
}: {
  group: Group;
  date: string;
  stamped: boolean;
  busy: boolean;
  onReopen: () => void;
}) {
  return (
    <View style={styles.settled}>
      {/* The summary is one VoiceOver stop; Reopen stays outside it so it can be focused and activated. */}
      <View
        style={styles.settledSummary}
        accessibilityRole="summary"
        accessible
        accessibilityLabel={`${group.name} is settled. Everyone has been paid back.`}
      >
        <Postmark word="Settled" date={postmarkDate(date)} ring={group.name} size={116} rotate={-8} stamped={stamped} />
        <Text style={styles.settledTitle}>All settled up</Text>
        <T2 style={{ textAlign: 'center' }}>Everyone has been paid back.</T2>
      </View>
      <LinkButton title={busy ? 'Reopening…' : 'Reopen group'} onPress={onReopen} disabled={busy} />
    </View>
  );
}

function InviteBlock({ code, onShare }: { code: string; onShare: () => void }) {
  return (
    <View style={styles.invite}>
      <Text style={styles.inviteTitle}>Invite friends to this group</Text>
      <T2>They tap + → Join with Code and enter:</T2>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch', marginTop: space.xs }}>
        <Text selectable style={styles.code} accessibilityLabel={`Invite code ${code.split('').join(' ')}`}>
          {code}
        </Text>
        <Button title="Share" icon="share" size="sm" onPress={onShare} style={{ minHeight: 56, borderRadius: radius.group }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: 6, paddingTop: 96, paddingHorizontal: space.l },
  emptyTitle: { ...type.title, color: colors.ink },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: space.m,
    paddingTop: space.s,
    paddingBottom: 2,
  },
  dayLabel: { ...type.footnote, fontWeight: '600', color: colors.ink2 },
  payer: { ...type.footnote, color: colors.ink2, marginTop: 1 },
  memberName: { color: colors.ink, width: 84 },
  moneyColumn: { minWidth: 76, textAlign: 'right' },
  barTrack: { flex: 1, height: 8, justifyContent: 'center' },
  barAxis: { position: 'absolute', left: '50%', width: StyleSheet.hairlineWidth * 2, height: 14, top: -3, backgroundColor: colors.strongRule },
  barFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 2 },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 78 },
  // Crosses both stamps; "paid" and the date are in the row text beside it.
  tabs: { paddingHorizontal: space.m, paddingTop: 4, paddingBottom: space.s, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'transparent' },
  tabsScrolled: { borderBottomColor: colors.strongRule },
  block: { paddingHorizontal: space.m, gap: space.m },
  blockRuled: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.strongRule, paddingTop: space.l, marginHorizontal: space.m, paddingHorizontal: 0 },
  blockText: { ...type.subhead, lineHeight: 21, color: colors.ink2 },
  settling: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginHorizontal: space.m,
    marginBottom: space.s,
    paddingLeft: space.s,
    paddingRight: space.xs,
    borderRadius: 12,
    backgroundColor: colors.warnTint,
  },
  settlingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.warn },
  settlingText: { ...type.subhead, color: colors.ink, flex: 1 },
  settled: { alignItems: 'center', gap: 6, paddingTop: space.m, paddingHorizontal: space.l },
  settledTitle: { ...type.title, color: colors.ink, marginTop: space.s },
  settledSummary: { alignItems: 'center', gap: 6 },
  invite: { marginHorizontal: space.m, marginBottom: space.l, gap: 2 },
  inviteTitle: { ...type.headline, color: colors.ink },
  code: {
    flex: 1,
    fontFamily: type.amountHero.fontFamily,
    fontSize: 30,
    letterSpacing: 8,
    textAlign: 'center',
    color: colors.ink,
    paddingVertical: space.s,
    paddingLeft: 8,
    borderRadius: radius.group,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.strongRule,
    overflow: 'hidden',
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.s,
    paddingHorizontal: space.m,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.strongRule,
    backgroundColor: colors.bg,
  },
  deleteAction: { width: 88, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', gap: 4 },
  deleteText: { fontSize: 13, fontWeight: '600', color: colors.white },
});
