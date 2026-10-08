// Over-the-air updates (EAS Update).
// expo-updates already checks on every cold start (checkAutomatically: ON_LOAD) and applies a downloaded
// update on the next launch. On top of that we check whenever the app returns to the foreground and
// offer "Restart to update" as soon as a new update has been downloaded.

import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState } from 'react-native';

/** Updates can't run in development builds or Expo Go; only release builds talk to EAS Update. */
export const updatesSupported = !__DEV__ && Updates.isEnabled;

export async function checkAndDownloadUpdate(): Promise<'downloaded' | 'up-to-date' | 'unsupported'> {
  if (!updatesSupported) return 'unsupported';
  const check = await Updates.checkForUpdateAsync();
  if (!check.isAvailable) return 'up-to-date';
  await Updates.fetchUpdateAsync();
  return 'downloaded';
}

/** Checks for an update each time the app comes back to the foreground. Errors are ignored (offline etc.). */
export function useForegroundUpdateCheck() {
  useEffect(() => {
    if (!updatesSupported) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkAndDownloadUpdate().catch(() => {});
    });
    return () => subscription.remove();
  }, []);
}

export function describeCurrentUpdate(): string {
  if (!Updates.isEnabled || __DEV__) return 'Development build';
  if (Updates.isEmbeddedLaunch) return 'Built-in version';
  const date = Updates.createdAt ? Updates.createdAt.toLocaleDateString('en-US', { dateStyle: 'medium' }) : '';
  return `Update ${Updates.updateId?.slice(0, 8) ?? ''}${date ? ` · ${date}` : ''}`;
}

export { Updates };
