import * as Application from 'expo-application';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { useDialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { colors, fonts, space, type } from '@/components/theme';
import { Button, Card, Footnote, LinkButton, NavBar, Row, SectionHeader, TextField } from '@/components/ui';
import { AppLinks } from '@/lib/links';
import { userMessage } from '@/lib/supabase';
import { checkAndDownloadUpdate, describeCurrentUpdate, Updates, updatesSupported } from '@/lib/updates';

const openLink = (url: string) =>
  WebBrowser.openBrowserAsync(url, { controlsColor: colors.accent, toolbarColor: colors.bg, dismissButtonStyle: 'done' });

export default function SettingsScreen() {
  const { profile, setDisplayName, signOut, deleteAccount, usesAppleSignIn } = useAuth();
  const dialog = useDialog();
  const insets = useSafeAreaInsets();
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
      await dialog.alert("Couldn't save", userMessage(error));
    }
  }

  async function checkForUpdates() {
    setChecking(true);
    try {
      const result = await checkAndDownloadUpdate();
      if (result === 'up-to-date') await dialog.alert('Up to date', 'You have the latest version of SplitEasy.');
    } catch (error) {
      await dialog.alert("Couldn't check for updates", userMessage(error));
    } finally {
      setChecking(false);
    }
  }

  async function confirmDelete() {
    const ok = await dialog.confirm({
      title: 'Delete your account?',
      message: usesAppleSignIn
        ? "Apple will ask you to confirm, then SplitEasy's access to your Apple ID is revoked. This can't be undone."
        : "This can't be undone.",
      confirmTitle: 'Delete',
      tone: 'red',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteAccount();
    } catch (error) {
      await dialog.alert("Couldn't delete account", userMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <NavBar inSheet title="Settings" right={<LinkButton title="Done" bold onPress={() => router.back()} />} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
        <SectionHeader>Your name</SectionHeader>
        <Card style={styles.nameCard} separated={false}>
          <TextField
            value={name}
            onChangeText={setName}
            placeholder="Name"
            autoComplete="name"
            accessibilityLabel="Your name"
            style={{ flex: 1 }}
            inputStyle={{ height: 44 }}
          />
          <Button title="Save Name" variant="secondary" size="sm" onPress={saveName} disabled={!nameChanged} />
        </Card>

        <SectionHeader>About</SectionHeader>
        <Card>
          <Row onPress={() => openLink(AppLinks.privacyPolicy)} accessibilityLabel="Privacy Policy" minHeight={56}>
            <Text style={styles.rowText}>Privacy Policy</Text>
            <Icon name="chev-r" size={18} color={colors.textDisabled} />
          </Row>
          <Row onPress={() => openLink(AppLinks.support)} accessibilityLabel="Support" minHeight={56}>
            <Text style={styles.rowText}>Support</Text>
            <Icon name="chev-r" size={18} color={colors.textDisabled} />
          </Row>
        </Card>

        <SectionHeader>App version</SectionHeader>
        <Card>
          <Row minHeight={56}>
            <Text style={styles.rowText}>Version</Text>
            <Text style={[type.amount, { color: colors.textMuted }]}>
              {Application.nativeApplicationVersion ?? '1.0.0'} ({Application.nativeBuildVersion ?? '1'})
            </Text>
          </Row>
          <Row minHeight={56}>
            <Text style={styles.rowText}>Running</Text>
            <Text style={[type.caption, { color: colors.textMuted }]}>{describeCurrentUpdate()}</Text>
          </Row>
          {updatesSupported ? (
            isUpdatePending ? (
              <Row onPress={() => Updates.reloadAsync()} minHeight={56} accessibilityLabel="Restart to Update">
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={styles.dot} />
                  <Text style={[styles.rowAction, { color: colors.green }]}>Restart to Update</Text>
                </View>
                <Icon name="refresh" size={18} color={colors.green} />
              </Row>
            ) : (
              <Row onPress={checking ? undefined : checkForUpdates} minHeight={56} accessibilityLabel="Check for Updates">
                <Text style={[styles.rowAction, { flex: 1, color: checking ? colors.textMuted : colors.accent }]}>
                  {checking ? 'Checking…' : 'Check for Updates'}
                </Text>
                <Icon name="refresh" size={18} color={checking ? colors.textMuted : colors.accent} />
              </Row>
            )
          ) : null}
        </Card>
        <Footnote>SplitEasy updates itself in the background.</Footnote>

        <Card>
          <Row onPress={signOut} minHeight={56} style={{ justifyContent: 'center' }} accessibilityLabel="Sign Out">
            <Text style={[styles.rowAction, { color: colors.text }]}>Sign Out</Text>
          </Row>
        </Card>

        <Card>
          <Row onPress={deleting ? undefined : confirmDelete} minHeight={56} style={{ justifyContent: 'center' }} accessibilityLabel="Delete Account">
            <Text style={[styles.rowAction, { color: deleting ? colors.textMuted : colors.red }]}>
              {deleting ? 'Deleting account…' : 'Delete Account'}
            </Text>
          </Row>
        </Card>
        <Footnote>
          {'Your sign-in is removed. Expenses you shared stay in your groups under "Deleted user" so everyone\'s balances still add up.'}
        </Footnote>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.m, paddingTop: 4, gap: 20 },
  nameCard: { padding: space.xs, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  rowText: { ...type.body, color: colors.text, flex: 1 },
  rowAction: { fontFamily: fonts.medium, fontSize: 17 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
});
