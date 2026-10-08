import Ionicons from '@expo/vector-icons/Ionicons';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { colors, spacing, type } from '@/components/theme';
import { BalanceLabel, Button, Label, Row, Secondary, Section, styles as uiStyles } from '@/components/ui';
import { isLocked, type Expense, type GroupStatus } from '@/data/types';
import { paymentKey, type Payment } from '@/domain/debts';
import { formatCents } from '@/domain/money';
import { useGroupDetail } from '@/features/useGroupDetail';

type Tab = 'expenses' | 'balances';

export default function GroupScreen() {
  const { id, name: initialName } = useLocalSearchParams<{ id: string; name?: string }>();
  const { userId } = useAuth();
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

  const shareText = group
    ? `Join my group "${group.name}" on SplitEasy with invite code ${group.invite_code}`
    : '';

  function confirmSettleUp() {
    Alert.alert(
      'Settle up now?',
      'Expenses will be locked, and everyone pays each other back using the list in Balances. You can reopen the group if something was missed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Settle Up',
          onPress: () => {
            setTab('balances');
            // Bring the new "Settling up" banner into view.
            scrollRef.current?.scrollTo({ y: 0, animated: true });
            detail.startSettlement();
          },
        },
      ],
    );
  }

  function confirmReopen() {
    Alert.alert('Reopen this group?', 'Everyone can add and edit expenses again. Payments already recorded are kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reopen', onPress: () => detail.reopen() },
    ]);
  }

  function showLockedNotice() {
    Alert.alert(
      'Expenses are locked',
      group?.status === 'settled'
        ? 'This group is settled. Reopen it to change expenses.'
        : 'This group is settling up. Reopen it to change expenses.',
      [
        { text: 'OK', style: 'cancel' },
        { text: 'Reopen Group', onPress: confirmReopen },
      ],
    );
  }

  function confirmDelete(expense: Expense) {
    Alert.alert(`Delete "${expense.description}"?`, "This updates everyone's balances.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => detail.deleteExpense(expense.id) },
    ]);
  }

  function confirmPaid(payment: Payment) {
    Alert.alert(
      'Record this payment?',
      `${name(payment.from)} paid ${objectName(payment.to)} ${formatCents(payment.amountCents)}.\nOnly confirm once the money has actually been sent.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark as Paid', onPress: () => detail.markPaid(payment) },
      ],
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: group?.name ?? initialName ?? '',
          headerRight: () => (
            <Pressable onPress={() => Share.share({ message: shareText })} accessibilityLabel="Invite" hitSlop={8}>
              <Ionicons name="person-add-outline" size={22} color={colors.accent} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        ref={scrollRef}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: locked ? insets.bottom + spacing.xl : 110 + insets.bottom }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.secondaryText}
            onRefresh={async () => {
              setRefreshing(true);
              await detail.reload();
              setRefreshing(false);
            }}
          />
        }
      >
        <SegmentedControl
          values={['Expenses', 'Balances']}
          selectedIndex={tab === 'expenses' ? 0 : 1}
          onChange={(e) => setTab(e.nativeEvent.selectedSegmentIndex === 0 ? 'expenses' : 'balances')}
          style={styles.segmented}
          appearance="dark"
        />

        {group && locked ? (
          <StatusBanner status={group.status} busy={detail.updatingStatus} onReopen={confirmReopen} />
        ) : loaded && members.length < 2 && group ? (
          <InviteBanner code={group.invite_code} onShare={() => Share.share({ message: shareText })} />
        ) : null}

        {tab === 'expenses' ? (
          loaded && expenses.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={48} color={colors.secondaryText} />
              <Text style={styles.emptyTitle}>No expenses yet</Text>
              <Secondary style={{ textAlign: 'center' }}>Tap Add Expense to record who paid for what.</Secondary>
            </View>
          ) : expenses.length > 0 ? (
            <Section>
              {expenses.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  payerName={name(expense.paid_by)}
                  locked={locked}
                  onPress={() =>
                    locked
                      ? showLockedNotice()
                      : router.push({ pathname: '/group/[id]/expense', params: { id, expenseId: expense.id } })
                  }
                  onDelete={() => confirmDelete(expense)}
                />
              ))}
            </Section>
          ) : null
        ) : (
          <>
            <Section header="Balances">
              {members.map((member) => (
                <Row key={member.id}>
                  <Label style={{ flex: 1 }}>{name(member.id)}</Label>
                  <BalanceLabel cents={balances.get(member.id) ?? 0} style={member.id === userId ? 'you' : 'member'} />
                </Row>
              ))}
            </Section>

            {group?.status === 'active' ? (
              <Section>
                <View style={styles.settleCard}>
                  <Text style={styles.cardTitle}>Done adding expenses?</Text>
                  <Secondary>
                    Settle Up locks the group and shows the fewest payments needed for everyone to pay each other back.
                  </Secondary>
                  <Button
                    title="Settle Up"
                    onPress={confirmSettleUp}
                    disabled={expenses.length === 0}
                    busy={detail.updatingStatus}
                    style={{ marginTop: spacing.s }}
                  />
                </View>
              </Section>
            ) : null}

            {group?.status === 'settling' ? (
              <Section
                header="Pay each other back"
                footer={
                  payments.length > 0
                    ? 'Debts are simplified so the group needs the fewest payments. Mark each one once the money is sent.'
                    : undefined
                }
              >
                {payments.length === 0 ? (
                  <Row>
                    <Secondary>Everyone is settled up</Secondary>
                  </Row>
                ) : null}
                {payments.map((payment) => (
                  <Row key={paymentKey(payment)}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Label>
                        {name(payment.from)} → {objectName(payment.to)}
                      </Label>
                      <Text style={styles.amount}>{formatCents(payment.amountCents)}</Text>
                    </View>
                    <Button title="Mark as Paid" variant="secondary" onPress={() => confirmPaid(payment)} style={styles.smallButton} />
                  </Row>
                ))}
              </Section>
            ) : null}

            {settlements.length > 0 ? (
              <Section header="Payments">
                {settlements.map((s) => (
                  <Row key={s.id}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Label style={type.subheadline}>
                        {name(s.from_user)} paid {objectName(s.to_user)}
                      </Label>
                      <Text style={styles.caption}>{new Date(s.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}</Text>
                    </View>
                    <Text style={styles.money}>{formatCents(s.amount_cents)}</Text>
                  </Row>
                ))}
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Adding expenses is only possible while the group is active (not settling up). */}
      {!locked && group ? (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.s }]}>
          <Button
            title="+  Add Expense"
            onPress={() => router.push({ pathname: '/group/[id]/expense', params: { id } })}
            disabled={members.length === 0}
          />
        </View>
      ) : null}
    </View>
  );
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
  const date = new Date(expense.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' });
  const label = `${expense.description}, ${payerName} paid, ${formatCents(expense.amount_cents)}`;
  const body = (
    <>
      <View style={{ flex: 1, gap: 2 }}>
        <Label numberOfLines={2}>{expense.description}</Label>
        <Text style={styles.caption}>
          {payerName} paid · {date}
        </Text>
      </View>
      <Text style={styles.money}>{formatCents(expense.amount_cents)}</Text>
    </>
  );

  if (locked) {
    // A tap gesture (not a Pressable) that fails as soon as the finger moves, so a swipe on a locked
    // row doesn't count as a tap. There's no swipe action at all while locked.
    const tap = Gesture.Tap().maxDistance(10).runOnJS(true).onEnd((_e, success) => {
      if (success) onPress();
    });
    return (
      <GestureDetector gesture={tap}>
        <View
          style={uiStyles.row}
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

  const content = (
    <Row
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityActions={[{ name: 'delete', label: 'Delete' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'delete') onDelete();
      }}
    >
      {body}
    </Row>
  );
  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      renderRightActions={() => (
        <Pressable onPress={onDelete} style={styles.deleteAction} accessibilityLabel={`Delete ${expense.description}`}>
          <Ionicons name="trash" size={20} color={colors.white} />
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      )}
    >
      {content}
    </ReanimatedSwipeable>
  );
}

function StatusBanner({ status, busy, onReopen }: { status: GroupStatus; busy: boolean; onReopen: () => void }) {
  const settled = status === 'settled';
  const tint = settled ? colors.green : colors.orange;
  return (
    <Section cardStyle={{ backgroundColor: settled ? 'rgba(48,209,88,0.14)' : 'rgba(255,159,10,0.14)' }}>
      <View style={styles.banner}>
        <Ionicons name={settled ? 'checkmark-circle' : 'swap-horizontal'} size={26} color={tint} style={{ width: 28 }} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.cardTitle}>{settled ? 'All settled up' : 'Settling up'}</Text>
          <Secondary>
            {settled
              ? 'Everyone has been paid back.'
              : 'Expenses are locked. Pay each other back using the list in Balances and mark each payment as paid.'}
          </Secondary>
          <Button title={busy ? 'Reopening…' : 'Reopen group'} variant="plain" onPress={onReopen} disabled={busy} style={{ alignSelf: 'flex-start' }} />
        </View>
      </View>
    </Section>
  );
}

function InviteBanner({ code, onShare }: { code: string; onShare: () => void }) {
  return (
    <Section>
      <View style={{ padding: spacing.l, gap: spacing.s }}>
        <Text style={styles.cardTitle}>Invite friends to this group</Text>
        <Secondary>Share this code. Friends enter it with Join with Code.</Secondary>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text selectable style={styles.code}>
            {code}
          </Text>
          <Button title="Share" onPress={onShare} style={{ minHeight: 36, paddingHorizontal: spacing.l }} />
        </View>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  segmented: { marginHorizontal: spacing.l, marginTop: spacing.m },
  empty: { alignItems: 'center', gap: spacing.s, paddingTop: 80, paddingHorizontal: spacing.xl },
  emptyTitle: { ...type.headline, color: colors.text, fontSize: 20 },
  settleCard: { padding: spacing.l, gap: spacing.s },
  cardTitle: { ...type.headline, color: colors.text },
  amount: { ...type.headline, color: colors.text, fontVariant: ['tabular-nums'] },
  money: { ...type.body, color: colors.text, fontVariant: ['tabular-nums'], marginLeft: spacing.s },
  caption: { ...type.caption, color: colors.secondaryText },
  smallButton: { minHeight: 34, paddingHorizontal: spacing.m },
  banner: { flexDirection: 'row', padding: spacing.l, gap: spacing.m },
  code: { flex: 1, fontSize: 28, fontWeight: '700', fontFamily: 'Menlo', color: colors.text },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.s,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  deleteAction: {
    backgroundColor: colors.red,
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    gap: 2,
  },
  deleteText: { ...type.caption, color: colors.white, fontWeight: '600' },
});
