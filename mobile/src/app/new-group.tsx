import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, space, type } from '@/components/theme';
import { Button, ErrorNote, LinkButton, T2, TextField, styles as ui } from '@/components/ui';
import { createGroup, joinGroup } from '@/data/repository';
import { CURRENCIES } from '@/domain/money';
import { userMessage } from '@/lib/supabase';

const LAST_CURRENCY_KEY = 'tabmates.lastCurrency';

/** A first group's currency, from where the phone is: NT$ in Taiwan, ¥ in Japan, and so on. */
const CURRENCY_BY_TIME_ZONE: Record<string, string> = {
  'Asia/Taipei': 'TWD',
  'Asia/Tokyo': 'JPY',
  'Asia/Seoul': 'KRW',
  'Asia/Bangkok': 'THB',
};

/** The currency you used for your last new group; on a first group, the local one, else $. */
function defaultCurrency(): string {
  try {
    const last = localStorage.getItem(LAST_CURRENCY_KEY);
    if (last && CURRENCIES.some((c) => c.code === last)) return last;
  } catch {}
  try {
    return CURRENCY_BY_TIME_ZONE[Intl.DateTimeFormat().resolvedOptions().timeZone] ?? 'USD';
  } catch {
    return 'USD';
  }
}

/**
 * Bottom sheet: create a group by name and currency, or join one with a 6-character invite code.
 */
export default function NewGroupSheet() {
  // `code` comes from an invite link, so the sheet opens ready to join.
  const { mode, code } = useLocalSearchParams<{ mode?: 'create' | 'join'; code?: string }>();
  const isJoin = mode === 'join';
  const [text, setText] = useState(isJoin && code ? cleanCode(code) : '');
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
          setText(isJoin ? cleanCode(value) : value);
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
          <View style={styles.currencies} accessibilityRole="radiogroup" accessibilityLabel="Currency">
            {CURRENCIES.map((c) => {
              const selected = c.code === currency;
              return (
                <Pressable
                  key={c.code}
                  onPress={() => setCurrency(c.code)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={c.plural}
                  style={[styles.currency, selected && styles.currencyOn]}
                >
                  <Text style={[styles.currencySymbol, !selected && { color: colors.ink2 }]} allowFontScaling={false}>
                    {c.symbol}
                  </Text>
                  <Text style={[styles.currencyCode, selected && { fontWeight: '600' }]}>{c.code}</Text>
                </Pressable>
              );
            })}
          </View>
          <T2 style={styles.hint}>Every amount in the group is in {CURRENCIES[currencyIndex].plural}. You can’t change it later.</T2>
        </View>
      )}
      {error ? <ErrorNote title={isJoin ? "Couldn't join group" : "Couldn't create group"} message={error} /> : null}
      <Button title={isJoin ? 'Join' : 'Create'} onPress={submit} disabled={!valid} busy={busy} />
    </View>
  );
}

/** Invite codes are 6 capital letters and digits; anything else typed or pasted is dropped. */
const cleanCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

const styles = StyleSheet.create({
  container: { backgroundColor: colors.bg, paddingTop: 18, paddingHorizontal: 20, paddingBottom: 46, gap: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...type.title, color: colors.ink },
  hint: { marginTop: 8 },
  currencies: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  currency: {
    // Three to a row.
    flexBasis: '30%',
    flexGrow: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  currencyOn: { backgroundColor: colors.bg, borderColor: colors.ink },
  currencySymbol: { fontFamily: fonts.moneyBold, fontSize: 17, color: colors.ink },
  currencyCode: { ...type.subhead, color: colors.ink },
  code: { height: 64, textAlign: 'center', fontFamily: fonts.moneyBold, fontSize: 30, letterSpacing: 9, paddingLeft: 28 },
});
