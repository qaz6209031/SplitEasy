import Ionicons from '@expo/vector-icons/Ionicons';
import * as Application from 'expo-application';
import { router, Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { colors, type } from '@/components/theme';
import { HeaderButton, Label, Row, Secondary, Section } from '@/components/ui';
import { AppLinks } from '@/lib/links';
import { userMessage } from '@/lib/supabase';
import { checkAndDownloadUpdate, describeCurrentUpdate, Updates, updatesSupported } from '@/lib/updates';

export default function SettingsScreen() {
  const { profile, setDisplayName, signOut, deleteAccount, usesAppleSignIn } = useAuth();
  // null = not edited yet, so the field shows the saved name.
  const [nameDraft, setName] = useState<string | null>(null);
  const name = nameDraft ?? profile?.display_name ?? '';
  const [deleting, setDeleting] = useState(false);
  const [checking, setChecking] = useState(false);
  const { isUpdatePending } = Updates.useUpdates();

  const nameChanged = name.trim().length > 0 && name.trim() !== profile?.display_name;

  async function saveName() {
    try {
      await setDisplayName(name);
      setName(null);
    } catch (error) {
      Alert.alert("Couldn't save", userMessage(error));
    }
  }

  async function checkForUpdates() {
    setChecking(true);
    try {
      const result = await checkAndDownloadUpdate();
      if (result === 'up-to-date') Alert.alert('Up to date', 'You have the latest version of SplitEasy.');
    } catch (error) {
      Alert.alert("Couldn't check for updates", userMessage(error));
    } finally {
      setChecking(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      usesAppleSignIn
        ? "Apple will ask you to confirm, then SplitEasy's access to your Apple ID is revoked. This can't be undone."
        : "This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
            } catch (error) {
              Alert.alert("Couldn't delete account", userMessage(error));
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{ headerRight: () => <HeaderButton title="Done" bold onPress={() => router.back()} /> }}
      />

      <Section header="Your name">
        <Row>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor={colors.tertiaryText}
            style={styles.input}
            autoComplete="name"
            accessibilityLabel="Your name"
          />
        </Row>
        {nameChanged ? (
          <Row onPress={saveName}>
            <Label style={{ color: colors.accent }}>Save Name</Label>
          </Row>
        ) : null}
      </Section>

      <Section header="About">
        <Row onPress={() => WebBrowser.openBrowserAsync(AppLinks.privacyPolicy)} accessibilityLabel="Privacy Policy">
          <Ionicons name="hand-left-outline" size={20} color={colors.accent} style={styles.icon} />
          <Label style={{ flex: 1 }}>Privacy Policy</Label>
        </Row>
        <Row onPress={() => WebBrowser.openBrowserAsync(AppLinks.support)} accessibilityLabel="Support">
          <Ionicons name="help-circle-outline" size={20} color={colors.accent} style={styles.icon} />
          <Label style={{ flex: 1 }}>Support</Label>
        </Row>
      </Section>

      <Section
        header="App version"
        footer="SplitEasy updates itself in the background. New versions apply the next time you open the app."
      >
        <Row>
          <Label style={{ flex: 1 }}>Version</Label>
          <Secondary>
            {Application.nativeApplicationVersion ?? '1.0.0'} ({Application.nativeBuildVersion ?? '1'})
          </Secondary>
        </Row>
        <Row>
          <Label style={{ flex: 1 }}>Running</Label>
          <Secondary>{describeCurrentUpdate()}</Secondary>
        </Row>
        {updatesSupported ? (
          isUpdatePending ? (
            <Row onPress={() => Updates.reloadAsync()}>
              <Label style={{ color: colors.accent }}>Restart to Update</Label>
            </Row>
          ) : (
            <Row onPress={checking ? undefined : checkForUpdates}>
              <Label style={{ color: checking ? colors.secondaryText : colors.accent }}>
                {checking ? 'Checking…' : 'Check for Updates'}
              </Label>
            </Row>
          )
        ) : null}
      </Section>

      <Section>
        <Row onPress={signOut}>
          <Label style={{ color: colors.accent }}>Sign Out</Label>
        </Row>
      </Section>

      <Section
        footer={
          <Text style={styles.footer}>
            {'Your sign-in is removed. Expenses you shared stay in your groups under "Deleted user" so everyone\'s balances still add up.'}
          </Text>
        }
      >
        <Row onPress={deleting ? undefined : confirmDelete}>
          <Label style={{ color: deleting ? colors.secondaryText : colors.red }}>
            {deleting ? 'Deleting account…' : 'Delete Account'}
          </Label>
        </Row>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: { ...type.body, color: colors.text, flex: 1, paddingVertical: 2 },
  icon: { marginRight: 12 },
  footer: { ...type.footnote, color: colors.secondaryText, marginHorizontal: 16, marginTop: 6, marginBottom: 40 },
});
