import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, type } from '@/components/theme';
import { Button, ErrorCard, LinkButton, TextField } from '@/components/ui';
import { createGroup, joinGroup } from '@/data/repository';
import { userMessage } from '@/lib/supabase';

/** Bottom sheet with one field: create a group by name, or join one with a 6-character invite code. */
export default function NewGroupSheet() {
  const { mode } = useLocalSearchParams<{ mode?: 'create' | 'join' }>();
  const isJoin = mode === 'join';
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = text.trim();
  const valid = isJoin ? trimmed.length === 6 : trimmed.length > 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const group = isJoin ? await joinGroup(trimmed) : await createGroup(trimmed);
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
      {error ? <ErrorCard title={isJoin ? "Couldn't join group" : "Couldn't create group"} message={error} /> : null}
      <Button title={isJoin ? 'Join' : 'Create'} onPress={submit} disabled={!valid} busy={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surface, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 46, gap: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...type.title, color: colors.text },
  code: { height: 64, textAlign: 'center', fontFamily: fonts.mono, fontSize: 28, letterSpacing: 9, paddingLeft: 28 },
});
