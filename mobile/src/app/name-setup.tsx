import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { colors, type } from '@/components/theme';
import { Button, HeaderButton, Row, Section } from '@/components/ui';
import { userMessage } from '@/lib/supabase';

/** Shown once when we don't have a display name (Apple only shares it on first sign-in). */
export default function NameSetupScreen() {
  const { setDisplayName, signOut } = useAuth();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const valid = name.trim().length > 0;

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await setDisplayName(name);
    } catch (error) {
      Alert.alert("Couldn't save", userMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{ headerLeft: () => <HeaderButton title="Sign Out" onPress={signOut} /> }}
      />
      <Section footer="Friends in your groups will see this name.">
        <Row>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.tertiaryText}
            autoFocus
            autoComplete="name"
            textContentType="name"
            returnKeyType="done"
            onSubmitEditing={save}
            style={styles.input}
            accessibilityLabel="Your name"
          />
        </Row>
      </Section>
      <Button title="Continue" onPress={save} disabled={!valid} busy={saving} style={styles.button} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: { ...type.body, color: colors.text, flex: 1, paddingVertical: 2 },
  button: { marginHorizontal: 16, marginTop: 24 },
});
