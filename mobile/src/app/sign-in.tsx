import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DEV_USERS, GoogleNotConfiguredError, useAuth } from '@/auth/AuthProvider';
import { useDialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { Postmark, postmarkDate, Stamp } from '@/components/postal';
import { colors, radius, space, stampColor, type } from '@/components/theme';
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
      <View style={styles.hero}>
        <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Stamp name="Y" color={stampColor(0)} size="lg" style={{ transform: [{ rotate: '-7deg' }, { translateY: 8 }] }} />
          <Stamp name="A" color={stampColor(1)} size="lg" style={{ transform: [{ rotate: '3deg' }], marginLeft: -8 }} />
          <Stamp name="B" color={stampColor(2)} size="lg" style={{ transform: [{ rotate: '-2deg' }, { translateY: 6 }], marginLeft: -8 }} />
          <Postmark word="Settled" date={postmarkDate(new Date().toISOString())} size={92} style={styles.markPostmark} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Tabmates
        </Text>
        <Text style={styles.tagline}>Track what the group spends. Settle up once at the end, with the fewest payments.</Text>
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
          style={({ pressed }) => [styles.google, pressed && { opacity: 0.7 }]}
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
                  style={({ pressed }) => [styles.chip, pressed && { backgroundColor: colors.fill }]}
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
  hero: { flex: 1, justifyContent: 'center', gap: space.m, paddingHorizontal: 28 },
  mark: { flexDirection: 'row', alignItems: 'flex-start', height: 96, marginBottom: space.m },
  markPostmark: { position: 'absolute', left: 120, top: 2 },
  title: { ...type.largeTitle, fontSize: 44, lineHeight: 50, letterSpacing: -1.2, color: colors.ink },
  tagline: { ...type.body, fontSize: 19, lineHeight: 26, color: colors.ink2, maxWidth: 320 },
  buttons: { paddingHorizontal: 20, paddingBottom: space.m, gap: space.s },
  google: {
    minHeight: 52,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  googleText: { fontSize: 17, fontWeight: '600', color: colors.ink },
  dev: { opacity: 0.6, alignItems: 'center', gap: 10, marginTop: 14 },
  devLabel: { ...type.footnote, color: colors.ink2 },
  chip: {
    minHeight: 44,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { ...type.subhead, color: colors.ink },
});
