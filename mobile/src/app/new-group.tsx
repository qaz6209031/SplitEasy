import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, spacing, type } from '@/components/theme';
import { Button } from '@/components/ui';
import { createGroup, joinGroup } from '@/data/repository';
import { userMessage } from '@/lib/supabase';

/** Small sheet with one field: create a group by name, or join one with a 6-character invite code. */
export default function NewGroupSheet() {
  const { mode } = useLocalSearchParams<{ mode?: 'create' | 'join' }>();
  const isJoin = mode === 'join';
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmed = text.trim();
  const valid = isJoin ? trimmed.length === 6 : trimmed.length > 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const group = isJoin ? await joinGroup(trimmed) : await createGroup(trimmed);
      router.back();
      router.push({ pathname: '/group/[id]', params: { id: group.id, name: group.name } });
    } catch (error) {
      Alert.alert(isJoin ? "Couldn't join group" : "Couldn't create group", userMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{isJoin ? 'Join Group' : 'New Group'}</Text>
      <TextInput
        // Separate inputs per mode so the code field's letter-spacing never leaks into the name placeholder.
        key={isJoin ? 'join' : 'create'}
        value={text}
        onChangeText={(value) =>
          setText(isJoin ? value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : value)
        }
        placeholder={isJoin ? '6-character code' : 'Group name, e.g. Tahoe Trip'}
        placeholderTextColor={colors.tertiaryText}
        autoFocus
        autoCapitalize={isJoin ? 'characters' : 'words'}
        autoCorrect={!isJoin}
        maxLength={isJoin ? 6 : 60}
        returnKeyType="done"
        onSubmitEditing={submit}
        style={[styles.input, isJoin && styles.codeInput]}
        accessibilityLabel={isJoin ? 'Invite code' : 'Group name'}
      />
      <Button title={isJoin ? 'Join' : 'Create'} onPress={submit} disabled={!valid} busy={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card, padding: spacing.xl, gap: spacing.l },
  title: { ...type.headline, color: colors.text, textAlign: 'center' },
  input: {
    ...type.body,
    color: colors.text,
    backgroundColor: colors.fill,
    borderRadius: 10,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    // Explicit 0: recycled native text fields otherwise keep the code field's spacing in the placeholder.
    letterSpacing: 0,
  },
  codeInput: { fontSize: 24, fontFamily: 'Menlo', letterSpacing: 4, textAlign: 'center' },
});
