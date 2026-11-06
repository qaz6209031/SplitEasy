import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ColorValue } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { useAuth } from '@/auth/AuthProvider';
import { AmountKeypad } from '@/components/AmountKeypad';
import { useDialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { Stamp } from '@/components/postal';
import { assignStampColors, colors, fonts, radius, space, type } from '@/components/theme';
import { Button, LinkButton, List, NavBar, Row, SegmentedControl, T2, TextField } from '@/components/ui';
import * as repo from '@/data/repository';
import type { Profile } from '@/data/types';
import { applyKey, evaluateCents, hasOperator, MAX_WHOLE_DIGITS, spaced, type CalcKey } from '@/domain/calc';
import { currencyOf, editableString, formatMoney, parseCents, stepOf, USD, type Currency } from '@/domain/money';
import { computeSplit, formatHundredths, initialInputs, inputsFromShares, type SplitMethod, type SplitResult } from '@/domain/splits';
import { userMessage } from '@/lib/supabase';

const METHODS: { method: SplitMethod; label: string }[] = [
  { method: 'equal', label: 'Equally' },
  { method: 'exact', label: 'Amounts' },
  { method: 'percent', label: 'Percent' },
  { method: 'shares', label: 'Shares' },
];

/** A money field being typed on the keypad: the total, or one person's amount ("Amounts" split). */
type Editing = { field: 'total' | string; expr: string; fresh: boolean };

/**
 * Add or edit an expense. Amount first, big and centred; one payer; split equally among the ticked
 * people, or by exact amounts, percentages or shares. Money is typed on the app's own keypad, which
 * also adds, subtracts, multiplies and divides.
 */
export default function ExpenseFormScreen() {
  const { id: groupId, expenseId } = useLocalSearchParams<{ id: string; expenseId?: string }>();
  const { userId } = useAuth();
  const dialog = useDialog();
  const isEditing = !!expenseId;

  const [members, setMembers] = useState<Profile[] | null>(null);
  /** The group's currency: every amount on this screen is in it. */
  const [currency, setCurrency] = useState<Currency>(USD);
  const step = stepOf(currency);
  const formatCents = (cents: number) => formatMoney(cents, currency);
  const [description, setDescription] = useState('');
  const [amountText, setAmountText] = useState('');
  const [paidBy, setPaidBy] = useState<string | null>(userId);
  const [method, setMethod] = useState<SplitMethod>('equal');
  /** Who's ticked for an equal split. */
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  /** What's typed per person for each of the other methods, kept while switching between them. */
  const [inputs, setInputs] = useState<Partial<Record<SplitMethod, Record<string, string>>>>({});
  const [saving, setSaving] = useState(false);
  /** A new expense opens on the total with the keypad up. */
  const [editing, setEditing] = useState<Editing | null>(isEditing ? null : { field: 'total', expr: '', fresh: false });
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const scrollY = useRef(0);
  const viewH = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const [group, m, expenses] = await Promise.all([
          repo.fetchGroup(groupId),
          repo.fetchMembers(groupId),
          isEditing ? repo.fetchExpenses(groupId) : Promise.resolve([]),
        ]);
        const groupCurrency = currencyOf(group.currency);
        setCurrency(groupCurrency);
        setMembers(m);
        const existing = expenses.find((e) => e.id === expenseId);
        if (existing) {
          setDescription(existing.description);
          setAmountText(editableString(existing.amount_cents, groupCurrency));
          setPaidBy(existing.paid_by);
          setParticipants(new Set(existing.splits.map((s) => s.user_id)));
          setMethod(existing.split_method);
          if (existing.split_method !== 'equal') {
            setInputs({ [existing.split_method]: inputsFromShares(existing.split_method, existing.splits, groupCurrency) });
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

  const amountCents = parseCents(amountText, currency);
  const amountInvalid = amountText.length > 0 && amountCents == null;
  // Member order decides who gets leftover cents, so the preview matches what's saved.
  const memberIds = useMemo(() => (members ?? []).map((m) => m.id), [members]);
  const methodInputs = inputs[method];
  const split = useMemo(
    () => computeSplit(method, amountCents, memberIds, participants, methodInputs ?? {}, currency),
    [method, amountCents, memberIds, participants, methodInputs, currency],
  );
  const shareOf = (id: string) => split.shares.find((s) => s.userId === id);
  const noneSelected = members != null && method === 'equal' && participants.size === 0;
  const valid = description.trim().length > 0 && amountCents != null && split.ok && paidBy != null;
  const displayName = (p: Profile) => (p.id === userId ? 'You' : p.display_name);
  const stampColors = useMemo(() => assignStampColors(memberIds), [memberIds]);

  /** Switching methods starts from the people already on the expense, split evenly. */
  function switchMethod(next: SplitMethod) {
    if (next === method) return;
    if (editing && editing.field !== 'total') closeEditor();
    const current = split.shares.map((s) => s.userId);
    const included = current.length > 0 ? current : memberIds;
    if (next === 'equal') setParticipants(new Set(included));
    else if (!inputs[next]) setInputs((all) => ({ ...all, [next]: initialInputs(next, amountCents, included, currency) }));
    setMethod(next);
  }

  function setInput(id: string, text: string) {
    setInputs((all) => ({ ...all, [method]: { ...all[method], [id]: text } }));
  }

  /** Puts the keypad away, settling the field on its value written out to the cent ("5" → "5.00"). */
  function closeEditor() {
    if (!editing) return;
    const cents = evaluateCents(editing.expr, step);
    if (cents != null) {
      if (editing.field === 'total') setAmountText(editableString(cents, currency));
      else setInput(editing.field, editableString(cents, currency));
    }
    setEditing(null);
  }

  /** Opens a money field on the keypad with its value selected: a digit replaces it, an operator continues it. */
  function openField(field: string, current: string, row?: View | null) {
    Keyboard.dismiss();
    if (editing && editing.field !== field) closeEditor();
    const expr = /^\d*\.?\d*$/.test(current) ? current : '';
    setEditing({ field, expr, fresh: expr !== '' });
    if (row) setTimeout(() => revealRow(row), 80);
  }

  /** Scrolls a split row clear of the keypad once the keypad has taken its space. */
  function revealRow(row: View) {
    const content = contentRef.current;
    if (!content) return;
    row.measureLayout(content, (_x, y, _w, h) => {
      // Leave room for the split status line under the rows.
      const bottom = y + h + 64;
      if (bottom > scrollY.current + viewH.current) scrollRef.current?.scrollTo({ y: bottom - viewH.current, animated: true });
    });
  }

  /** The field's value follows the keypad as you type: what you typed, or the sum once there's arithmetic. */
  function commit(field: string, expr: string) {
    const cents = evaluateCents(expr, step);
    const text = hasOperator(expr) && cents != null ? editableString(cents, currency) : expr;
    if (field === 'total') setAmountText(text);
    else setInput(field, text);
  }

  function press(key: CalcKey) {
    if (!editing) return;
    const expr = applyKey(editing.expr, key, editing.fresh, currency.decimals === 0 ? MAX_WHOLE_DIGITS + 2 : MAX_WHOLE_DIGITS);
    setEditing({ ...editing, expr, fresh: false });
    commit(editing.field, expr);
  }

  function clearField() {
    if (!editing) return;
    setEditing({ ...editing, expr: '', fresh: false });
    commit(editing.field, '');
  }

  const editingResult = editing && hasOperator(editing.expr) ? evaluateCents(editing.expr, step) : null;
  const keypadResult = editing && hasOperator(editing.expr) ? (editingResult != null ? `= ${formatCents(editingResult)}` : '= —') : null;

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
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={32}
          onLayout={(e) => (viewH.current = e.nativeEvent.layout.height)}
        >
          <View ref={contentRef} collapsable={false} style={styles.body}>
          <View style={styles.hero}>
            <Pressable
              onPress={() => openField('total', amountText)}
              style={styles.amountRow}
              accessibilityRole="button"
              accessibilityLabel="Amount"
              accessibilityValue={{ text: amountCents != null ? formatCents(amountCents) : 'empty' }}
              accessibilityHint="Opens the keypad"
              accessibilityState={{ selected: editing?.field === 'total' }}
            >
              <Text style={styles.dollar}>{currency.symbol}</Text>
              <KeypadValue
                text={editing?.field === 'total' ? spaced(editing.expr) : amountText}
                placeholder={editableString(0, currency)}
                active={editing?.field === 'total'}
                fresh={editing?.field === 'total' && editing.fresh}
                invalid={amountInvalid && editing?.field !== 'total'}
                style={styles.amountText}
                caretHeight={56}
              />
            </Pressable>
            {amountInvalid && editing?.field !== 'total' ? <T2 style={styles.amountError}>
                {currency.decimals === 0 ? `Enter a whole amount greater than ${currency.symbol}0.` : `Enter an amount greater than ${currency.symbol}0.`}
              </T2> : null}
          </View>

          <TextField
            label="Description"
            value={description}
            onChangeText={setDescription}
            onFocus={closeEditor}
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
                    currency={currency}
                    value={methodInputs?.[member.id] ?? ''}
                    onChange={(text) => setInput(member.id, text)}
                    amountCents={amountCents ? shareOf(member.id)?.amountCents : undefined}
                    editing={editing?.field === member.id ? editing : null}
                    onOpen={(row) => openField(member.id, methodInputs?.[member.id] ?? '', row)}
                    onFocusText={closeEditor}
                  />
                ),
              )}
            </List>
            <SplitStatus split={split} method={method} currency={currency} amountCents={amountCents} noneSelected={noneSelected} />
          </FormSection>

          {isEditing ? <Button title="Delete Expense" icon="trash" variant="dangerOutline" onPress={confirmDelete} /> : null}
          </View>
        </ScrollView>
      )}
      {members != null && editing ? (
        <AmountKeypad onKey={press} onClear={clearField} onDone={closeEditor} result={keypadResult} decimals={currency.decimals > 0} />
      ) : null}
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
  currency,
  value,
  onChange,
  amountCents,
  editing,
  onOpen,
  onFocusText,
}: {
  stamp: ReactNode;
  name: string;
  method: SplitMethod;
  currency: Currency;
  value: string;
  onChange: (text: string) => void;
  amountCents: number | undefined;
  /** Set while this row's amount is on the keypad. */
  editing: Editing | null;
  /** Amounts are typed on the keypad. */
  onOpen: (row: View | null) => void;
  /** Percentages and shares use the system number pad. */
  onFocusText: () => void;
}) {
  const unit = method === 'exact' ? 'amount' : method === 'percent' ? 'percent' : 'shares';
  const [focused, setFocused] = useState(false);
  const rowRef = useRef<View>(null);
  if (method === 'exact') {
    return (
      <Row minHeight={64} style={{ paddingHorizontal: 0 }}>
        {stamp}
        <Text style={[type.body, { flex: 1, color: colors.ink }]} numberOfLines={1}>
          {name}
        </Text>
        <Pressable
          ref={rowRef}
          onPress={() => onOpen(rowRef.current)}
          accessibilityRole="button"
          accessibilityLabel={`${name}, ${unit}`}
          accessibilityValue={{ text: value ? `${currency.symbol}${value}` : 'empty' }}
          accessibilityHint="Opens the keypad"
          accessibilityState={{ selected: !!editing }}
          style={[styles.splitInput, editing && { borderColor: colors.ink }]}
        >
          <Text style={styles.splitAffix}>{currency.symbol}</Text>
          <KeypadValue
            text={editing ? spaced(editing.expr) : value}
            placeholder={editableString(0, currency)}
            active={!!editing}
            fresh={!!editing?.fresh}
            style={styles.splitValue}
            caretHeight={20}
            align="right"
          />
        </Pressable>
      </Row>
    );
  }
  return (
    <Row minHeight={64} style={{ paddingHorizontal: 0 }}>
      {stamp}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { color: colors.ink }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[type.amountSm, { color: colors.ink2 }]}>{amountCents != null ? formatMoney(amountCents, currency) : '—'}</Text>
      </View>
      <View style={[styles.splitInput, focused && { borderColor: colors.ink }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="0"
          placeholderTextColor={colors.ink3}
          keyboardType="decimal-pad"
          selectionColor={colors.ink}
          selectTextOnFocus
          onFocus={() => {
            setFocused(true);
            onFocusText();
          }}
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

/**
 * What a keypad field shows: the typed entry with a blinking caret, the value selected when the field
 * has just opened, or a placeholder. Long entries shrink to fit rather than wrap.
 */
function KeypadValue({
  text,
  placeholder,
  active,
  fresh,
  invalid,
  style,
  caretHeight,
  align = 'center',
}: {
  text: string;
  placeholder: string;
  active: boolean;
  fresh: boolean;
  invalid?: boolean;
  style: object;
  caretHeight: number;
  align?: 'center' | 'right';
}) {
  const empty = text === '';
  return (
    <View style={[styles.valueRow, align === 'right' && { flex: 1, justifyContent: 'flex-end' }]}>
      <Text
        style={[
          style,
          empty && { color: colors.ink3 },
          invalid && { color: colors.danger },
          fresh && !empty && styles.selected,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.4}
      >
        {empty ? placeholder : text}
      </Text>
      {/* Keyed to the text so the caret stays solid while you type, as the system caret does. */}
      {active && !fresh ? <Caret key={text} height={caretHeight} /> : null}
    </View>
  );
}

function Caret({ height }: { height: number }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(withSequence(withTiming(1, { duration: 500 }), withTiming(0, { duration: 0 }), withTiming(0, { duration: 500 }), withTiming(1, { duration: 0 })), -1);
    return () => cancelAnimation(opacity);
  }, [reduceMotion, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ width: 2, height, borderRadius: 1, backgroundColor: colors.ink, marginLeft: 2 }, animated]} />;
}

/** "$12.00 left", "10% over", "Adds up to 100%": whether the split is complete. */
function SplitStatus({
  split,
  method,
  currency,
  amountCents,
  noneSelected,
}: {
  split: SplitResult;
  method: SplitMethod;
  currency: Currency;
  amountCents: number | null;
  noneSelected: boolean;
}) {
  const formatCents = (cents: number) => formatMoney(cents, currency);
  const step = stepOf(currency);
  let text: string | null = null;
  let color: ColorValue = colors.ink2;
  const show = (r: number) => (method === 'exact' ? formatCents(r) : `${formatHundredths(r)}%`);
  if (method === 'equal') {
    if (noneSelected) [text, color] = ['Pick at least one person.', colors.danger];
    else {
      const n = split.shares.length;
      // In a whole-unit currency the shares are whole units, so the range is a unit wide.
      const unit = amountCents && amountCents % step === 0 ? step : 1;
      const low = amountCents && n > 0 ? Math.floor(amountCents / unit / n) * unit : 0;
      const each =
        !amountCents || n === 0 ? '' : (amountCents / unit) % n ? ` · ${formatCents(low)}–${formatCents(low + unit)} each` : ` · ${formatCents(low)} each`;
      text = `Split between ${n} ${n === 1 ? 'person' : 'people'}${each}`;
    }
  } else if (split.invalid) {
    const whole = method === 'exact' && currency.decimals === 0;
    [text, color] = [whole ? 'Use whole amounts, without decimals.' : 'Use numbers with up to 2 decimal places.', colors.danger];
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
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 72, maxWidth: '100%' },
  dollar: { fontFamily: fonts.money, fontSize: 36, color: colors.ink2, marginTop: 6 },
  amountText: { ...type.amountHero, fontSize: 64, lineHeight: 72, color: colors.ink, flexShrink: 1 },
  valueRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  /** The opened field's value, shown selected: the next digit replaces it. */
  selected: { backgroundColor: colors.selection, borderRadius: 6, overflow: 'hidden' },
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
  splitValue: { fontFamily: fonts.money, fontSize: 18, lineHeight: 22, color: colors.ink, fontVariant: ['tabular-nums'], flexShrink: 1 },
  splitText: { flex: 1, fontFamily: fonts.money, fontSize: 18, color: colors.ink, textAlign: 'right', padding: 0, fontVariant: ['tabular-nums'] },
});
