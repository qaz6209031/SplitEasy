import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DEV_USERS, GoogleNotConfiguredError, useAuth } from '@/auth/AuthProvider';
import { colors, spacing, type } from '@/components/theme';
import { userMessage } from '@/lib/supabase';

export default function SignInScreen() {
  const { signInWithApple, signInWithGoogle, devSignIn } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      if (error instanceof GoogleNotConfiguredError) Alert.alert('Google sign-in unavailable', error.message);
      else Alert.alert('Sign in failed', userMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Ionicons name="people" size={72} color={colors.accent} accessibilityElementsHidden />
        <Text style={styles.title}>SplitEasy</Text>
        <Text style={styles.tagline}>Share expenses with friends.{'\n'}Settle up with the fewest payments.</Text>
      </View>

      <View style={styles.buttons}>
        {appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={8}
            style={styles.providerButton}
            onPress={() => run(signInWithApple)}
          />
        ) : null}

        {/* Styled to match the Apple button: same height, corners and white fill. */}
        <Pressable
          onPress={() => run(signInWithGoogle)}
          accessibilityRole="button"
          accessibilityLabel="Sign in with Google"
          style={({ pressed }) => [styles.providerButton, styles.googleButton, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="logo-google" size={18} color="#4285F4" accessibilityElementsHidden />
          <Text style={styles.googleText}>Sign in with Google</Text>
        </Pressable>

        {__DEV__ ? (
          <View style={styles.dev}>
            <Text style={styles.devTitle}>Developer sign-in</Text>
            <View style={styles.devRow}>
              {DEV_USERS.map((name) => (
                <Pressable
                  key={name}
                  onPress={() => run(() => devSignIn(name))}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.devButton, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.devButtonText}>{name}</Text>
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
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.l },
  title: { ...type.largeTitle, color: colors.text },
  tagline: { ...type.body, color: colors.secondaryText, textAlign: 'center' },
  buttons: { gap: spacing.m, paddingBottom: spacing.xl },
  providerButton: { height: 50, width: '100%' },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
    backgroundColor: colors.white,
    borderRadius: 8,
  },
  googleText: { fontSize: 19, fontWeight: '500', color: colors.black },
  dev: { marginTop: spacing.s, gap: spacing.s },
  devTitle: { ...type.caption, color: colors.secondaryText, textAlign: 'center' },
  devRow: { flexDirection: 'row', gap: spacing.s },
  devButton: { flex: 1, height: 36, borderRadius: 18, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  devButtonText: { ...type.subheadline, color: colors.accent, fontWeight: '600' },
});
