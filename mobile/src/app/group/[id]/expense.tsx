import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { useDialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { colors, fonts, radius, space, type } from '@/components/theme';
import { Avatar, Button, Card, Checkbox, LinkButton, NavBar, Row, SectionHeader, T2, TextField } from '@/components/ui';
import * as repo from '@/data/repository';
import type { Profile } from '@/data/types';
import { equalSplit } from '@/domain/balances';
import { editableString, formatCents, parseCents } from '@/domain/money';
import { userMessage } from '@/lib/supabase';

/** Add or edit an expense. Amount first, big and centred; one payer; split equally among the ticked people. */
export default function ExpenseFormScreen() {
  const { id: groupId, expenseId } = useLocalSearchParams<{ id: string; expenseId?: string }>();
  const { userId } = useAuth();
  const dialog = useDialog();
  const isEditing = !!expenseId;

  const [members, setMembers] = useState<Profile[] | null>(null);
  const [description, setDescription] = useState('');
  const [amountText, setAmountText] = useState('');
  const [paidBy, setPaidBy] = useState<string | null>(userId);
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [amountFocused, setAmountFocused] = useState(!expenseId);

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
  // Participants in member order, so leftover cents are assigned predictably (same as the server).
  const ordered = useMemo(() => (members ?? []).map((m) => m.id).filter((id) => participants.has(id)), [members, participants]);
  const shares = amountCents ? equalSplit(amountCents, ordered.length) : [];
  const noneSelected = members != null && ordered.length === 0;
  const valid = description.trim().length > 0 && amountCents != null && ordered.length > 0 && paidBy != null;
  const displayName = (p: Profile) => (p.id === userId ? 'You' : p.display_name);

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
        participantIds: ordered,
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
            <View
              style={[
                styles.amountRow,
                { borderBottomColor: amountInvalid ? colors.red : amountFocused ? colors.accent : colors.border },
              ]}
            >
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
                onFocus={() => setAmountFocused(true)}
                onBlur={() => setAmountFocused(false)}
                style={[styles.amountInput, amountInvalid && { color: colors.red }]}
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

          <SectionHeader>Split equally between</SectionHeader>
          <Card style={noneSelected ? { borderColor: colors.redLine } : undefined}>
            {members.map((member) => {
              const checked = participants.has(member.id);
              const index = ordered.indexOf(member.id);
              const share = checked && index >= 0 ? shares[index] : undefined;
              return (
                <Row
                  key={member.id}
                  minHeight={56}
                  onPress={() => toggle(member.id)}
                  selected={checked}
                  accessibilityLabel={share != null ? `${displayName(member)}, ${formatCents(share)}` : displayName(member)}
                >
                  <Checkbox checked={checked} error={noneSelected} />
                  <Text style={[type.body, { flex: 1, color: checked ? colors.text : colors.textMuted }]}>{displayName(member)}</Text>
                  <Text style={[type.amount, { color: share != null ? colors.text : colors.textMuted }]}>
                    {share != null ? formatCents(share) : '—'}
                  </Text>
                </Row>
              );
            })}
          </Card>
          {noneSelected ? <T2 style={{ color: colors.red, marginTop: -12, marginHorizontal: 4 }}>Pick at least one person.</T2> : null}

          {isEditing ? <Button title="Delete Expense" icon="trash" variant="redOutline" onPress={confirmDelete} /> : null}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: space.m, paddingTop: 4, paddingBottom: 40, gap: 20 },
  hero: { alignItems: 'center', gap: 6, paddingTop: space.xs, paddingBottom: 4 },
  eyebrow: { ...type.label, color: colors.textMuted },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
    minWidth: 200,
  },
  dollar: { fontFamily: fonts.mono, fontSize: 32, color: colors.textMuted },
  amountInput: { ...type.amountXL, height: 58, color: colors.text, minWidth: 140, padding: 0 },
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
});
