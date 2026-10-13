import { useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { useDialog } from '@/components/Dialog';
import { colors, space, type } from '@/components/theme';
import { Button, Footnote, LinkButton, NavBar, TextField } from '@/components/ui';
import { userMessage } from '@/lib/supabase';

/** Shown once when we don't have a display name (Apple only shares it on first sign-in). */
export default function NameSetupScreen() {
  const { setDisplayName, signOut } = useAuth();
  const dialog = useDialog();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const valid = name.trim().length > 0;

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await setDisplayName(name);
    } catch (error) {
      await dialog.alert("Couldn't save", userMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <NavBar left={<LinkButton title="Sign Out" onPress={signOut} />} />
      <View style={styles.body}>
        <View style={{ gap: space.xs }}>
          <Text style={styles.eyebrow}>Step 1 of 1</Text>
          <Text style={styles.title} accessibilityRole="header">
            What&apos;s your name?
          </Text>
        </View>
        <View>
          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            autoFocus
            autoComplete="name"
            textContentType="name"
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <Footnote style={{ marginTop: 10, marginHorizontal: 2 }}>Friends in your groups will see this name.</Footnote>
        </View>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: space.s }}>
        <Button title="Continue" onPress={save} disabled={!valid} busy={saving} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingTop: space.l, paddingHorizontal: 20, gap: 28 },
  eyebrow: { ...type.label, color: colors.textMuted },
  title: { ...type.largeTitle, fontSize: 28, lineHeight: 32, color: colors.text },
});
