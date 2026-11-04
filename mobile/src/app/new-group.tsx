import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, type } from '@/components/theme';
import { Button, ErrorNote, LinkButton, SegmentedControl, T2, TextField, styles as ui } from '@/components/ui';
import { createGroup, joinGroup } from '@/data/repository';
import { CURRENCIES } from '@/domain/money';
import { userMessage } from '@/lib/supabase';

const LAST_CURRENCY_KEY = 'tabmates.lastCurrency';

/** The currency you used for your last new group; on a first group, NT$ in Taiwan and $ elsewhere. */
function defaultCurrency(): string {
  try {
    const last = localStorage.getItem(LAST_CURRENCY_KEY);
    if (last && CURRENCIES.some((c) => c.code === last)) return last;
  } catch {}
  try {
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Taipei') return 'TWD';
  } catch {}
  return 'USD';
}

/**
 * Bottom sheet: create a group by name and currency, or join one with a 6-character invite code.
 */
export default function NewGroupSheet() {
  const { mode } = useLocalSearchParams<{ mode?: 'create' | 'join' }>();
  const isJoin = mode === 'join';
  const [text, setText] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const currencyIndex = Math.max(0, CURRENCIES.findIndex((c) => c.code === currency));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = text.trim();
  const valid = isJoin ? trimmed.length === 6 : trimmed.length > 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const group = isJoin ? await joinGroup(trimmed) : await createGroup(trimmed, currency);
      if (!isJoin) {
        try {
          localStorage.setItem(LAST_CURRENCY_KEY, currency);
        } catch {}
      }
      router.back();
      router.push({ pathname: '/group/[id]', params: { id: group.id, name: group.name } });
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {isJoin ? 'Join with Code' : 'Create Group'}
        </Text>
        <LinkButton title="Cancel" onPress={() => router.back()} />
      </View>
      <TextField
        // Separate inputs per mode so the code field's letter-spacing never leaks into the name placeholder.
        key={isJoin ? 'join' : 'create'}
        label={isJoin ? '6-character invite code' : 'Group name'}
        value={text}
        onChangeText={(value) => {
          setError(null);
          setText(isJoin ? value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : value);
        }}
        placeholder={isJoin ? 'K7Q2ZX' : 'Group name, e.g. Tahoe Trip'}
        autoFocus
        autoCapitalize={isJoin ? 'characters' : 'words'}
        autoCorrect={!isJoin}
        maxLength={isJoin ? 6 : 60}
        returnKeyType="done"
        onSubmitEditing={submit}
        error={!!error}
        inputStyle={isJoin ? styles.code : null}
      />
      {isJoin ? null : (
        <View>
          <Text style={ui.fieldLabel}>Currency</Text>
          <SegmentedControl
            values={CURRENCIES.map((c) => `${c.code}  ${c.symbol}`)}
            index={currencyIndex}
            onChange={(i) => setCurrency(CURRENCIES[i].code)}
          />
          <T2 style={styles.hint}>Every amount in the group is in {CURRENCIES[currencyIndex].name}s. You can’t change it later.</T2>
        </View>
      )}
      {error ? <ErrorNote title={isJoin ? "Couldn't join group" : "Couldn't create group"} message={error} /> : null}
      <Button title={isJoin ? 'Join' : 'Create'} onPress={submit} disabled={!valid} busy={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.bg, paddingTop: 18, paddingHorizontal: 20, paddingBottom: 46, gap: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...type.title, color: colors.ink },
  hint: { marginTop: 8 },
  code: { height: 64, textAlign: 'center', fontFamily: fonts.moneyBold, fontSize: 30, letterSpacing: 9, paddingLeft: 28 },
});
