import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { fetchProfile, updateDisplayName } from '@/data/repository';
import type { Profile } from '@/data/types';
import { supabase, supabaseKey, supabaseUrl } from '@/lib/supabase';

const OAUTH_REDIRECT = 'spliteasy://auth-callback';

export class GoogleNotConfiguredError extends Error {
  constructor() {
    super("Google sign-in isn't configured yet. Use Sign in with Apple for now.");
  }
}

interface AuthContextValue {
  /** True until the stored session (if any) has been restored. */
  isLoading: boolean;
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  /** Signed in with Apple: account deletion revokes the Apple token first. */
  usesAppleSignIn: boolean;
  signInWithApple(): Promise<void>;
  signInWithGoogle(): Promise<void>;
  devSignIn(name: string): Promise<void>;
  refreshProfile(): Promise<void>;
  setDisplayName(name: string): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const DEV_USERS = ['Alice', 'Bob', 'Carol'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [loadedProfile, setLoadedProfile] = useState<Profile | null>(null);
  const userId = session?.user.id ?? null;
  // Never show a previous user's profile after switching accounts.
  const profile = userId && loadedProfile?.id === userId ? loadedProfile : null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => data.subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (userId) setLoadedProfile(await fetchProfile(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchProfile(userId)
      .then((p) => {
        if (!cancelled) setLoadedProfile(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const signInWithApple = useCallback(async () => {
    // Apple receives the SHA-256 of a random nonce; Supabase checks the raw value against the token.
    const rawNonce = Crypto.randomUUID() + Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
        nonce: hashedNonce,
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      throw error;
    }
    if (!credential.identityToken) throw new Error('Apple did not return an identity token.');
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) throw error;

    // Apple only shares the name on the very first sign-in, so save it right away.
    const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
    if (name && data.user) {
      const existing = await fetchProfile(data.user.id);
      if (!existing?.display_name) await updateDisplayName(data.user.id, name);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // A disabled provider would otherwise show an error page inside the browser sheet.
    const settings = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabaseKey } })
      .then((r) => r.json())
      .catch(() => null);
    if (!settings?.external?.google) throw new GoogleNotConfiguredError();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: OAUTH_REDIRECT, skipBrowserRedirect: true },
    });
    if (error) throw error;
    const result = await WebBrowser.openAuthSessionAsync(data.url, OAUTH_REDIRECT);
    if (result.type !== 'success') return; // cancelled or dismissed
    const code = new URL(result.url).searchParams.get('code');
    if (!code) throw new Error('Google sign-in did not complete.');
    const exchange = await supabase.auth.exchangeCodeForSession(code);
    if (exchange.error) throw exchange.error;
  }, []);

  const devSignIn = useCallback(async (name: string) => {
    // Debug-only test accounts. The base password comes from the git-ignored .env.development.local,
    // which production builds and `eas update` never load; the __DEV__ branch is stripped from them too.
    const base = __DEV__ ? process.env.EXPO_PUBLIC_DEV_ACCOUNT_PASSWORD : undefined;
    if (!base) throw new Error('Add EXPO_PUBLIC_DEV_ACCOUNT_PASSWORD to mobile/.env.development.local.');
    const email = `dev-${name.toLowerCase()}@spliteasy.dev`;
    const password = `${base}-${name.toLowerCase()}`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return;
    const signUp = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
    if (signUp.error) throw signUp.error;
  }, []);

  const setDisplayName = useCallback(
    async (name: string) => {
      if (!userId) return;
      await updateDisplayName(userId, name);
      await refreshProfile();
    },
    [userId, refreshProfile],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const providers: string[] = (session?.user.app_metadata?.providers as string[] | undefined) ?? [
    session?.user.app_metadata?.provider as string,
  ];
  const usesAppleSignIn = providers.includes('apple');

  const deleteAccount = useCallback(async () => {
    let authorizationCode: string | null = null;
    if (usesAppleSignIn && (await AppleAuthentication.isAvailableAsync())) {
      // A fresh authorization code lets the server revoke the Apple token (App Review 5.1.1(v)).
      try {
        const credential = await AppleAuthentication.signInAsync({});
        authorizationCode = credential.authorizationCode;
      } catch (error) {
        if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new Error('Account deletion cancelled.');
        throw error;
      }
    }
    const { error } = await supabase.functions.invoke('delete-account', { body: { authorizationCode } });
    if (error) throw error;
    await supabase.auth.signOut({ scope: 'local' });
  }, [usesAppleSignIn]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      session,
      userId,
      profile,
      usesAppleSignIn,
      signInWithApple,
      signInWithGoogle,
      devSignIn,
      refreshProfile,
      setDisplayName,
      signOut,
      deleteAccount,
    }),
    [isLoading, session, userId, profile, usesAppleSignIn, signInWithApple, signInWithGoogle, devSignIn, refreshProfile, setDisplayName, signOut, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
