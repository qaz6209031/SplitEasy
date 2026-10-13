import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see mobile/.env).');
}

export const supabaseUrl = url;
export const supabaseKey = key;

/**
 * A token minted moments ago can be rejected as "JWT issued at future" when the auth and database
 * servers' clocks differ by a second. That happens right after sign-in, so wait and retry briefly.
 */
async function fetchWithClockSkewRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(input, init);
    if (response.status !== 401 || attempt >= 2) return response;
    const body = await response.clone().text();
    if (!body.includes('JWT issued at future')) return response;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export const supabase = createClient(url, key, {
  global: { fetch: fetchWithClockSkewRetry },
  auth: {
    // localStorage is backed by expo-sqlite so sessions survive app restarts.
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE: Google OAuth returns a one-time code to spliteasy://auth-callback.
    flowType: 'pkce',
  },
});

// Only refresh tokens while the app is in the foreground (Supabase's recommendation for mobile).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Turns Supabase/Postgres errors (including our `raise exception` messages) into user-facing text. */
export function userMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}
