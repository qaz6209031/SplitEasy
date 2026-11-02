import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ColorValue } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { useDialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { Stamp } from '@/components/postal';
import { assignStampColors, colors, fonts, radius, space, type } from '@/components/theme';
import { Button, LinkButton, List, NavBar, Row, SegmentedControl, T2, TextField } from '@/components/ui';
import * as repo from '@/data/repository';
import type { Profile } from '@/data/types';
import { editableString, formatCents, parseCents } from '@/domain/money';
import { computeSplit, formatHundredths, initialInputs, inputsFromShares, type SplitMethod, type SplitResult } from '@/domain/splits';
import { userMessage } from '@/lib/supabase';

const METHODS: { method: SplitMethod; label: string }[] = [
  { method: 'equal', label: 'Equally' },
  { method: 'exact', label: 'Amounts' },
  { method: 'percent', label: 'Percent' },
  { method: 'shares', label: 'Shares' },
];

/**
 * Add or edit an expense. Amount first, big and centred; one payer; split equally among the ticked
 * people, or by exact amounts, percentages or shares.
 */
export default function ExpenseFormScreen() {
  const { id: groupId, expenseId } = useLocalSearchParams<{ id: string; expenseId?: string }>();
  const { userId } = useAuth();
  const dialog = useDialog();
  const isEditing = !!expenseId;

  const [members, setMembers] = useState<Profile[] | null>(null);
  const [description, setDescription] = useState('');
  const [amountText, setAmountText] = useState('');
  const [paidBy, setPaidBy] = useState<string | null>(userId);
  const [method, setMethod] = useState<SplitMethod>('equal');
  /** Who's ticked for an equal split. */
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  /** What's typed per person for each of the other methods, kept while switching between them. */
  const [inputs, setInputs] = useState<Partial<Record<SplitMethod, Record<string, string>>>>({});
  const [saving, setSaving] = useState(false);
  const [amountW, setAmountW] = useState(120);

  useEffect(() => {
    (async () => {
      try {
        const [m, expenses] = await Promise.all([
          repo.fetchMembers(groupId),
          isEditing ? repo.fetchExpenses(groupId) : Promise.resolve([]),
        ]);
        setMembers(m);
        const existing = expenses.find((e) => e.id === expenseId);
        if (existing) {
          setDescription(existing.description);
          setAmountText(editableString(existing.amount_cents));
          setPaidBy(existing.paid_by);
          setParticipants(new Set(existing.splits.map((s) => s.user_id)));
          setMethod(existing.split_method);
          if (existing.split_method !== 'equal') {
            setInputs({ [existing.split_method]: inputsFromShares(existing.split_method, existing.splits) });
          }
        } else {
          setParticipants(new Set(m.map((p) => p.id)));
        }
      } catch (error) {
        await dialog.alert('Something went wrong', userMessage(error));
        router.back();
      }
    })();
  }, [groupId, expenseId, isEditing, dialog]);

  const amountCents = parseCents(amountText);
  const amountInvalid = amountText.length > 0 && amountCents == null;
  // Member order decides who gets leftover cents, so the preview matches what's saved.
  const memberIds = useMemo(() => (members ?? []).map((m) => m.id), [members]);
  const methodInputs = inputs[method];
  const split = useMemo(
    () => computeSplit(method, amountCents, memberIds, participants, methodInputs ?? {}),
    [method, amountCents, memberIds, participants, methodInputs],
  );
  const shareOf = (id: string) => split.shares.find((s) => s.userId === id);
  const noneSelected = members != null && method === 'equal' && participants.size === 0;
  const valid = description.trim().length > 0 && amountCents != null && split.ok && paidBy != null;
  const displayName = (p: Profile) => (p.id === userId ? 'You' : p.display_name);
  const stampColors = useMemo(() => assignStampColors(memberIds), [memberIds]);

  /** Switching methods starts from the people already on the expense, split evenly. */
  function switchMethod(next: SplitMethod) {
    if (next === method) return;
    const current = split.shares.map((s) => s.userId);
    const included = current.length > 0 ? current : memberIds;
    if (next === 'equal') setParticipants(new Set(included));
    else if (!inputs[next]) setInputs((all) => ({ ...all, [next]: initialInputs(next, amountCents, included) }));
    setMethod(next);
  }

  function setInput(id: string, text: string) {
    setInputs((all) => ({ ...all, [method]: { ...all[method], [id]: text } }));
  }

  async function save() {
    if (!valid || saving || amountCents == null || paidBy == null) return;
    setSaving(true);
    try {
      await repo.saveExpense({
        expenseId: expenseId ?? null,
        groupId,
        description: description.trim(),
        amountCents,
        paidBy,
        method,
        shares: split.shares,
      });
      router.back();
    } catch (error) {
      await dialog.alert("Couldn't save", userMessage(error));
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!expenseId) return;
    const ok = await dialog.confirm({
      title: `Delete "${description.trim() || 'this expense'}"?`,
      message: "This updates everyone's balances.",
      confirmTitle: 'Delete',
      tone: 'red',
    });
    if (!ok) return;
    try {
      await repo.deleteExpense(expenseId);
      router.back();
    } catch (error) {
      await dialog.alert("Couldn't delete", userMessage(error));
    }
  }

  function toggle(id: string) {
    setParticipants((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      <NavBar
        inSheet
        left={<LinkButton title="Cancel" onPress={() => router.back()} />}
        title={isEditing ? 'Edit Expense' : 'Add Expense'}
        right={saving ? <ActivityIndicator color={colors.ink} /> : <LinkButton title="Save" bold onPress={save} disabled={!valid} />}
      />
      {members == null ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.amountRow}>
              <Text style={styles.dollar}>$</Text>
              <View>
                {/* Sizes the input to its text, so "$" + amount stays centred as you type. The measuring box
                    is wide and unrelated to the input's width, so the text is measured unwrapped. */}
                <View style={styles.measureBox} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Text
                    style={[styles.amountInput, styles.measure]}
                    numberOfLines={1}
                    onLayout={(e) => setAmountW(Math.ceil(e.nativeEvent.layout.width) + 4)}
                  >
                    {amountText || '0.00'}
                  </Text>
                </View>
                <TextInput
                  value={amountText}
                  onChangeText={setAmountText}
                  placeholder="0.00"
                  placeholderTextColor={colors.ink3}
                  keyboardType="decimal-pad"
                  selectionColor={colors.ink}
                  autoFocus={!isEditing}
                  style={[styles.amountInput, { width: amountW }, amountInvalid && { color: colors.danger }]}
                  accessibilityLabel="Amount"
                />
              </View>
            </View>
            {amountInvalid ? (
              <T2 style={styles.amountError}>Enter an amount greater than $0, with up to 2 decimal places (e.g. 12.50).</T2>
            ) : null}
          </View>

          <TextField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Description, e.g. Dinner"
            autoCapitalize="sentences"
          />

          <FormSection title="Paid by">
            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Paid by">
              {members.map((member) => {
                const selected = paidBy === member.id;
                return (
                  <Pressable
                    key={member.id}
                    onPress={() => setPaidBy(member.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`Paid by ${displayName(member)}`}
                    style={[styles.chip, selected && styles.chipOn]}
                  >
                    <Stamp name={member.display_name || '?'} color={stampColors.get(member.id) ?? '#8E929B'} size="sm" />
                    <Text style={[styles.chipText, selected && { fontWeight: '600' }]}>{displayName(member)}</Text>
                    {selected ? <Icon name="check" size={16} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </FormSection>

          <FormSection title="Split">
            <SegmentedControl
              values={METHODS.map((m) => m.label)}
              index={METHODS.findIndex((m) => m.method === method)}
              onChange={(i) => switchMethod(METHODS[i].method)}
            />
            <List inset={42} style={{ marginTop: 4 }}>
              {members.map((member) =>
                method === 'equal' ? (
                  <Row
                    key={member.id}
                    minHeight={56}
                    style={{ paddingHorizontal: 0 }}
                    onPress={() => toggle(member.id)}
                    selected={participants.has(member.id)}
                    accessibilityLabel={
                      shareOf(member.id) ? `${displayName(member)}, ${formatCents(shareOf(member.id)!.amountCents)}` : displayName(member)
                    }
                  >
                    <Stamp name={member.display_name || '?'} color={stampColors.get(member.id) ?? '#8E929B'} dimmed={!participants.has(member.id)} />
                    <Text style={[type.body, { flex: 1, color: participants.has(member.id) ? colors.ink : colors.ink2 }]}>
                      {displayName(member)}
                    </Text>
                    <Text style={[type.amount, { color: shareOf(member.id) ? colors.ink : colors.ink3 }]}>
                      {shareOf(member.id) && amountCents ? formatCents(shareOf(member.id)!.amountCents) : '—'}
                    </Text>
                    <View style={{ width: 22, alignItems: 'flex-end' }}>
                      {participants.has(member.id) ? <Icon name="check" size={20} /> : null}
                    </View>
                  </Row>
                ) : (
                  <SplitInputRow
                    key={member.id}
                    stamp={<Stamp name={member.display_name || '?'} color={stampColors.get(member.id) ?? '#8E929B'} />}
                    name={displayName(member)}
                    method={method}
                    value={methodInputs?.[member.id] ?? ''}
                    onChange={(text) => setInput(member.id, text)}
                    amountCents={amountCents ? shareOf(member.id)?.amountCents : undefined}
                  />
                ),
              )}
            </List>
            <SplitStatus split={split} method={method} amountCents={amountCents} noneSelected={noneSelected} />
          </FormSection>

          {isEditing ? <Button title="Delete Expense" icon="trash" variant="dangerOutline" onPress={confirmDelete} /> : null}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.formHeading} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** One person's amount, percentage or share count, with the resulting amount next to it. */
function SplitInputRow({
  stamp,
  name,
  method,
  value,
  onChange,
  amountCents,
}: {
  stamp: ReactNode;
  name: string;
  method: SplitMethod;
  value: string;
  onChange: (text: string) => void;
  amountCents: number | undefined;
}) {
  const unit = method === 'exact' ? 'amount' : method === 'percent' ? 'percent' : 'shares';
  const [focused, setFocused] = useState(false);
  return (
    <Row minHeight={64} style={{ paddingHorizontal: 0 }}>
      {stamp}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { color: colors.ink }]} numberOfLines={1}>
          {name}
        </Text>
        {method !== 'exact' ? <Text style={[type.amountSm, { color: colors.ink2 }]}>{amountCents != null ? formatCents(amountCents) : '—'}</Text> : null}
      </View>
      <View style={[styles.splitInput, focused && { borderColor: colors.ink }]}>
        {method === 'exact' ? <Text style={styles.splitAffix}>$</Text> : null}
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={method === 'exact' ? '0.00' : '0'}
          placeholderTextColor={colors.ink3}
          keyboardType="decimal-pad"
          selectionColor={colors.ink}
          selectTextOnFocus
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.splitText}
          accessibilityLabel={`${name}, ${unit}`}
        />
        {method === 'percent' ? <Text style={styles.splitAffix}>%</Text> : null}
        {method === 'shares' ? <Text style={styles.splitAffix}>×</Text> : null}
      </View>
    </Row>
  );
}

/** "$12.00 left", "10% over", "Adds up to 100%": whether the split is complete. */
function SplitStatus({
  split,
  method,
  amountCents,
  noneSelected,
}: {
  split: SplitResult;
  method: SplitMethod;
  amountCents: number | null;
  noneSelected: boolean;
}) {
  let text: string | null = null;
  let color: ColorValue = colors.ink2;
  const show = (r: number) => (method === 'exact' ? formatCents(r) : `${formatHundredths(r)}%`);
  if (method === 'equal') {
    if (noneSelected) [text, color] = ['Pick at least one person.', colors.danger];
    else {
      const n = split.shares.length;
      const low = amountCents && n > 0 ? Math.floor(amountCents / n) : 0;
      const each = !amountCents || n === 0 ? '' : amountCents % n ? ` · ${formatCents(low)}–${formatCents(low + 1)} each` : ` · ${formatCents(low)} each`;
      text = `Split between ${n} ${n === 1 ? 'person' : 'people'}${each}`;
    }
  } else if (split.invalid) {
    [text, color] = ['Use numbers with up to 2 decimal places.', colors.danger];
  } else if (split.shares.length === 0) {
    text = method === 'shares' ? 'Give at least one person a share.' : 'Enter at least one person.';
  } else if (method === 'shares') {
    const total = split.shares.reduce((sum, s) => sum + Math.round((s.value ?? 0) * 100), 0);
    text = `${formatHundredths(total)} shares in total`;
  } else if (method === 'exact' && amountCents == null) {
    text = 'Enter the total amount first.';
  } else if (split.remaining != null && split.remaining > 0) {
    [text, color] = [`${show(split.remaining)} left to split`, colors.warn];
  } else if (split.remaining != null && split.remaining < 0) {
    [text, color] = [`${show(-split.remaining)} over`, colors.danger];
  } else {
    [text, color] = [method === 'exact' ? `Adds up to ${formatCents(amountCents ?? 0)}` : 'Adds up to 100%', colors.pos];
  }
  if (!text) return null;
  return (
    <Text style={[type.footnote, { color, marginTop: 2 }]} accessibilityLiveRegion="polite">
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: space.m, paddingTop: 4, paddingBottom: 40, gap: space.l },
  hero: { alignItems: 'center', paddingTop: space.m, paddingBottom: space.xs },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  dollar: { fontFamily: fonts.money, fontSize: 36, color: colors.ink2, marginTop: 6 },
  amountInput: { ...type.amountHero, fontSize: 64, lineHeight: 72, height: 72, color: colors.ink, maxWidth: 300, padding: 0, textAlign: 'center' },
  measureBox: { position: 'absolute', top: 0, left: 0, width: 1000, opacity: 0, alignItems: 'flex-start' },
  measure: { width: undefined, maxWidth: undefined },
  amountError: { color: colors.danger, textAlign: 'center', marginTop: 6, marginHorizontal: space.xs },
  formHeading: { ...type.headline, color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    minHeight: 44,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipOn: { backgroundColor: colors.bg, borderColor: colors.ink },
  chipText: { ...type.subhead, color: colors.ink },
  splitInput: {
    width: 116,
    height: 42,
    borderRadius: radius.field,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 4,
  },
  splitAffix: { fontFamily: fonts.money, fontSize: 16, color: colors.ink2 },
  splitText: { flex: 1, fontFamily: fonts.money, fontSize: 18, color: colors.ink, textAlign: 'right', padding: 0, fontVariant: ['tabular-nums'] },
});
