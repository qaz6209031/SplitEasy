import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { colors, spacing, type } from '@/components/theme';
import { HeaderButton, Label, Row, Section } from '@/components/ui';
import * as repo from '@/data/repository';
import type { Profile } from '@/data/types';
import { equalSplit } from '@/domain/balances';
import { editableString, formatCents, parseCents } from '@/domain/money';
import { userMessage } from '@/lib/supabase';

/** Add or edit an expense. One payer; the amount is split equally among the selected people. */
export default function ExpenseFormScreen() {
  const { id: groupId, expenseId } = useLocalSearchParams<{ id: string; expenseId?: string }>();
  const { userId } = useAuth();
  const isEditing = !!expenseId;

  const [members, setMembers] = useState<Profile[] | null>(null);
  const [description, setDescription] = useState('');
  const [amountText, setAmountText] = useState('');
  const [paidBy, setPaidBy] = useState<string | null>(userId);
  const [participants, setParticipants] = useState<Set<string>>(new Set());
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
        } else {
          setParticipants(new Set(m.map((p) => p.id)));
        }
      } catch (error) {
        Alert.alert('Something went wrong', userMessage(error));
        router.back();
      }
    })();
  }, [groupId, expenseId, isEditing]);

  const amountCents = parseCents(amountText);
  // Participants in member order, so leftover cents are assigned predictably (same as the server).
  const ordered = useMemo(() => (members ?? []).map((m) => m.id).filter((id) => participants.has(id)), [members, participants]);
  const shares = amountCents ? equalSplit(amountCents, ordered.length) : [];
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
      Alert.alert("Couldn't save", userMessage(error));
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!expenseId) return;
    Alert.alert('Delete this expense?', "This updates everyone's balances.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await repo.deleteExpense(expenseId);
            router.back();
          } catch (error) {
            Alert.alert("Couldn't delete", userMessage(error));
          }
        },
      },
    ]);
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
    <>
      <Stack.Screen
        options={{
          title: isEditing ? 'Edit Expense' : 'Add Expense',
          headerLeft: () => <HeaderButton title="Cancel" onPress={() => router.back()} />,
          headerRight: () =>
            saving ? <ActivityIndicator style={{ paddingHorizontal: 10 }} /> : <HeaderButton title="Save" bold onPress={save} disabled={!valid} />,
          gestureEnabled: !saving,
        }}
      />
      {members == null ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView style={{ backgroundColor: colors.background }} keyboardShouldPersistTaps="handled">
          <Section
            footer={
              amountText.length > 0 && amountCents == null ? (
                <Text style={styles.hint}>Enter an amount greater than $0, with up to 2 decimal places (e.g. 12.50).</Text>
              ) : undefined
            }
          >
            <Row>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Description, e.g. Dinner"
                placeholderTextColor={colors.tertiaryText}
                autoFocus={!isEditing}
                autoCapitalize="sentences"
                style={styles.input}
                accessibilityLabel="Description"
              />
            </Row>
            <Row>
              <Text style={styles.dollar}>$</Text>
              <TextInput
                value={amountText}
                onChangeText={setAmountText}
                placeholder="0.00"
                placeholderTextColor={colors.tertiaryText}
                keyboardType="decimal-pad"
                style={[styles.input, styles.amount]}
                accessibilityLabel="Amount"
              />
            </Row>
          </Section>

          <Section header="Paid by">
            {members.map((member) => (
              <Row
                key={member.id}
                onPress={() => setPaidBy(member.id)}
                accessibilityLabel={`Paid by ${displayName(member)}`}
                selected={paidBy === member.id}
              >
                <Label style={{ flex: 1 }}>{displayName(member)}</Label>
                {paidBy === member.id ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
              </Row>
            ))}
          </Section>

          <Section header="Split equally between" footer={ordered.length === 0 ? 'Pick at least one person.' : undefined}>
            {members.map((member) => {
              const checked = participants.has(member.id);
              const index = ordered.indexOf(member.id);
              return (
                <Row
                  key={member.id}
                  onPress={() => toggle(member.id)}
                  accessibilityLabel={checked && index >= 0 && shares[index] != null ? `${displayName(member)}, ${formatCents(shares[index])}` : displayName(member)}
                  selected={checked}
                >
                  <Ionicons
                    name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={checked ? colors.accent : colors.secondaryText}
                    style={{ marginRight: spacing.m }}
                  />
                  <Label style={{ flex: 1 }}>{displayName(member)}</Label>
                  {checked && index >= 0 && shares[index] != null ? (
                    <Text style={styles.share}>{formatCents(shares[index])}</Text>
                  ) : null}
                </Row>
              );
            })}
          </Section>

          {isEditing ? (
            <Section style={{ marginBottom: 40 }}>
              <Pressable onPress={confirmDelete} style={styles.deleteRow} accessibilityRole="button">
                <Text style={styles.deleteText}>Delete Expense</Text>
              </Pressable>
            </Section>
          ) : (
            <View style={{ height: 40 }} />
          )}
        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  input: { ...type.body, color: colors.text, flex: 1, paddingVertical: 2 },
  amount: { fontSize: 24, fontVariant: ['tabular-nums'] },
  dollar: { fontSize: 24, color: colors.secondaryText, marginRight: 4 },
  hint: { ...type.footnote, color: colors.orange, marginHorizontal: spacing.l, marginTop: 6 },
  share: { ...type.body, color: colors.secondaryText, fontVariant: ['tabular-nums'] },
  deleteRow: { minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  deleteText: { ...type.body, color: colors.red },
});
