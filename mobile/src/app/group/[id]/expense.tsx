import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { useDialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { colors, fonts, radius, space, type } from '@/components/theme';
import { Avatar, Button, Card, Checkbox, LinkButton, NavBar, Row, SectionHeader, SegmentedControl, T2, TextField } from '@/components/ui';
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
        right={saving ? <ActivityIndicator color={colors.text} /> : <LinkButton title="Save" bold onPress={save} disabled={!valid} />}
      />
      {members == null ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>Amount</Text>
            <View style={styles.amountRow}>
              <Text style={styles.dollar}>$</Text>
              <TextInput
                value={amountText}
                onChangeText={setAmountText}
                placeholder="0.00"
                placeholderTextColor={colors.strongBorder}
                keyboardType="decimal-pad"
                keyboardAppearance="dark"
                selectionColor={colors.accent}
                autoFocus={!isEditing}
                style={[styles.amountInput, { width: amountWidth(amountText) }, amountInvalid && { color: colors.red }]}
                accessibilityLabel="Amount"
              />
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

          <SectionHeader>Paid by</SectionHeader>
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
                  <Avatar name={member.display_name || '?'} me={member.id === userId} size={30} />
                  <Text style={styles.chipText}>{displayName(member)}</Text>
                  {selected ? <Icon name="check" size={16} color={colors.accent} /> : null}
                </Pressable>
              );
            })}
          </View>

          <View style={{ gap: 10 }}>
            <SectionHeader>Split</SectionHeader>
            <SegmentedControl
              values={METHODS.map((m) => m.label)}
              index={METHODS.findIndex((m) => m.method === method)}
              onChange={(i) => switchMethod(METHODS[i].method)}
            />
          </View>
          <Card style={splitHasError(split, method, noneSelected) ? { borderColor: colors.redLine } : undefined}>
            {members.map((member) =>
              method === 'equal' ? (
                <Row
                  key={member.id}
                  minHeight={72}
                  onPress={() => toggle(member.id)}
                  selected={participants.has(member.id)}
                  accessibilityLabel={
                    shareOf(member.id) ? `${displayName(member)}, ${formatCents(shareOf(member.id)!.amountCents)}` : displayName(member)
                  }
                >
                  <Checkbox checked={participants.has(member.id)} error={noneSelected} />
                  <Text style={[type.body, { flex: 1, color: participants.has(member.id) ? colors.text : colors.textMuted }]}>
                    {displayName(member)}
                  </Text>
                  <Text style={[type.amount, { color: shareOf(member.id) ? colors.text : colors.textMuted }]}>
                    {shareOf(member.id) && amountCents ? formatCents(shareOf(member.id)!.amountCents) : '—'}
                  </Text>
                </Row>
              ) : (
                <SplitInputRow
                  key={member.id}
                  name={displayName(member)}
                  method={method}
                  value={methodInputs?.[member.id] ?? ''}
                  onChange={(text) => setInput(member.id, text)}
                  amountCents={amountCents ? shareOf(member.id)?.amountCents : undefined}
                />
              ),
            )}
          </Card>
          <SplitStatus split={split} method={method} amountCents={amountCents} noneSelected={noneSelected} />

          {isEditing ? <Button title="Delete Expense" icon="trash" variant="redOutline" onPress={confirmDelete} /> : null}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

/**
 * The input doesn't grow with its text on iOS, so size it from the (monospaced) text: wide enough
 * not to cut off "86.40", and no wider, so "$" + amount stays centred. Empty, it fits the "0.00" placeholder.
 */
function amountWidth(text: string) {
  const glyph = type.amountXL.fontSize * 0.6 + type.amountXL.letterSpacing;
  return Math.ceil((text.length || 4) * glyph) + 6;
}

function splitHasError(split: SplitResult, method: SplitMethod, noneSelected: boolean) {
  if (method === 'equal') return noneSelected;
  return split.invalid || (split.remaining != null && split.remaining < 0);
}

/** One person's amount, percentage or share count, with the resulting amount next to it. */
function SplitInputRow({
  name,
  method,
  value,
  onChange,
  amountCents,
}: {
  name: string;
  method: SplitMethod;
  value: string;
  onChange: (text: string) => void;
  amountCents: number | undefined;
}) {
  const unit = method === 'exact' ? 'amount' : method === 'percent' ? 'percent' : 'shares';
  const [focused, setFocused] = useState(false);
  return (
    <Row minHeight={72}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { color: colors.text }]} numberOfLines={1}>
          {name}
        </Text>
        {method !== 'exact' ? <T2 style={type.amount}>{amountCents != null ? formatCents(amountCents) : '—'}</T2> : null}
      </View>
      <View style={[styles.splitInput, focused && { borderColor: colors.accent }]}>
        {method === 'exact' ? <Text style={styles.splitAffix}>$</Text> : null}
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={method === 'exact' ? '0.00' : '0'}
          placeholderTextColor={colors.placeholder}
          keyboardType="decimal-pad"
          keyboardAppearance="dark"
          selectionColor={colors.accent}
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
  let color: string = colors.textMuted;
  const show = (r: number) => (method === 'exact' ? formatCents(r) : `${formatHundredths(r)}%`);
  if (method === 'equal') {
    if (noneSelected) [text, color] = ['Pick at least one person.', colors.red];
    else {
      const n = split.shares.length;
      const low = amountCents && n > 0 ? Math.floor(amountCents / n) : 0;
      const each = !amountCents || n === 0 ? '' : amountCents % n ? ` · ${formatCents(low)}–${formatCents(low + 1)} each` : ` · ${formatCents(low)} each`;
      text = `Split between ${n} ${n === 1 ? 'person' : 'people'}${each}`;
    }
  } else if (split.invalid) {
    [text, color] = ['Use numbers with up to 2 decimal places.', colors.red];
  } else if (split.shares.length === 0) {
    text = method === 'shares' ? 'Give at least one person a share.' : 'Enter at least one person.';
  } else if (method === 'shares') {
    const total = split.shares.reduce((sum, s) => sum + Math.round((s.value ?? 0) * 100), 0);
    text = `${formatHundredths(total)} shares in total`;
  } else if (method === 'exact' && amountCents == null) {
    text = 'Enter the total amount first.';
  } else if (split.remaining != null && split.remaining > 0) {
    [text, color] = [`${show(split.remaining)} left to split`, colors.amber];
  } else if (split.remaining != null && split.remaining < 0) {
    [text, color] = [`${show(-split.remaining)} over`, colors.red];
  } else {
    [text, color] = [method === 'exact' ? `Adds up to ${formatCents(amountCents ?? 0)}` : 'Adds up to 100%', colors.green];
  }
  if (!text) return null;
  return (
    <Text style={[type.caption, { color, marginTop: -12, marginHorizontal: 4 }]} accessibilityLiveRegion="polite">
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: space.m, paddingTop: 4, paddingBottom: 40, gap: 20 },
  hero: { alignItems: 'center', gap: 6, paddingTop: space.xs, paddingBottom: 4 },
  eyebrow: { ...type.label, color: colors.textMuted },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4 },
  // Baseline alignment against a TextInput leaves the "$" (which also hangs below the baseline) about
  // 7pt low; measured on device. Lift it so its bottom lines up with the bottom of the digits.
  dollar: { fontFamily: fonts.mono, fontSize: 32, color: colors.textMuted, transform: [{ translateY: -7 }] },
  amountInput: { ...type.amountXL, height: 58, color: colors.text, maxWidth: 300, padding: 0, textAlign: 'center' },
  amountError: { color: colors.red, textAlign: 'center', marginTop: 6, marginHorizontal: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    height: 44,
    paddingLeft: 6,
    paddingRight: 14,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  splitInput: {
    width: 116,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.raised,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 4,
  },
  splitAffix: { fontFamily: fonts.mono, fontSize: 15, color: colors.textMuted },
  splitText: { flex: 1, fontFamily: fonts.mono, fontSize: 16, color: colors.text, textAlign: 'right', padding: 0 },
});
