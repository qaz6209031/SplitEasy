import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DEV_USERS, GoogleNotConfiguredError, useAuth } from '@/auth/AuthProvider';
import { useDialog } from '@/components/Dialog';
import { DotGrid } from '@/components/DotGrid';
import { Icon } from '@/components/Icon';
import { colors, fonts, radius, space, type } from '@/components/theme';
import { Button } from '@/components/ui';
import { userMessage } from '@/lib/supabase';

export default function SignInScreen() {
  const { signInWithApple, signInWithGoogle, devSignIn } = useAuth();
  const dialog = useDialog();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  async function run(key: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    try {
      await action();
    } catch (error) {
      if (error instanceof GoogleNotConfiguredError) await dialog.alert('Google sign-in unavailable', error.message);
      else await dialog.alert('Sign in failed', userMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <DotGrid />
      <View style={styles.hero}>
        <View style={styles.mark}>
          <Icon name="logo" size={48} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Tabmates
        </Text>
        <Text style={styles.tagline}>Share expenses with friends. Settle up with the fewest payments.</Text>
      </View>

      <View style={styles.buttons}>
        {appleAvailable ? (
          <Button title="Sign in with Apple" icon="apple" busy={busy === 'apple'} onPress={() => run('apple', signInWithApple)} />
        ) : null}
        <Pressable
          onPress={() => run('google', signInWithGoogle)}
          disabled={!!busy}
          accessibilityRole="button"
          accessibilityLabel="Sign in with Google"
          style={({ pressed }) => [styles.google, pressed && { transform: [{ scale: 0.98 }], opacity: 0.85 }]}
        >
          <Icon name="google" size={20} />
          <Text style={styles.googleText}>Sign in with Google</Text>
        </Pressable>

        {__DEV__ ? (
          <View style={styles.dev}>
            <Text style={styles.devLabel}>Debug · developer sign-in</Text>
            <View style={{ flexDirection: 'row', gap: space.xs }}>
              {DEV_USERS.map((name) => (
                <Pressable
                  key={name}
                  onPress={() => run(name, () => devSignIn(name))}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.chip, pressed && { backgroundColor: colors.raised }]}
                >
                  <Text style={styles.chipText}>{name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: space.xl },
  mark: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...type.largeTitle, color: colors.text, marginTop: space.xs },
  tagline: { ...type.body, color: colors.textMuted, textAlign: 'center', maxWidth: 280, lineHeight: 25 },
  buttons: { paddingHorizontal: 20, paddingBottom: space.m, gap: space.s },
  google: {
    minHeight: 52,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  googleText: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text, letterSpacing: -0.2 },
  dev: { opacity: 0.45, alignItems: 'center', gap: 10, marginTop: 14 },
  devLabel: { ...type.label, fontSize: 12, color: colors.textMuted },
  chip: {
    height: 44,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
});
