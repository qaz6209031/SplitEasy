import { DarkTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { colors } from '@/components/theme';
import { UpdateBanner } from '@/components/UpdateBanner';
import { useForegroundUpdateCheck } from '@/lib/updates';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, primary: colors.accent, background: colors.background, card: colors.background },
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemeProvider value={theme}>
        <AuthProvider>
          <RootNavigator />
          <UpdateBanner />
          <StatusBar style="light" />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { isLoading, session, profile } = useAuth();
  useForegroundUpdateCheck();

  useEffect(() => {
    if (!isLoading) SplashScreen.hideAsync();
  }, [isLoading]);

  if (isLoading) return null;

  const signedIn = session != null;
  // Apple only shares a name on the first sign-in, so ask for one when the profile has none.
  const needsName = signedIn && profile != null && !profile.display_name;

  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={needsName}>
        <Stack.Screen name="name-setup" options={{ title: "What's your name?", headerBackVisible: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !needsName}>
        <Stack.Screen name="index" options={{ title: 'Groups', headerLargeTitle: true }} />
        <Stack.Screen name="group/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="group/[id]/expense" options={{ presentation: 'modal', title: 'Expense' }} />
        <Stack.Screen
          name="new-group"
          // headerShown must be fixed here: toggling it from inside a modal remounts the screen and loses its state.
          options={{ presentation: 'formSheet', sheetAllowedDetents: [0.4], sheetGrabberVisible: true, headerShown: false }}
        />
        <Stack.Screen name="settings" options={{ presentation: 'modal', title: 'Settings' }} />
      </Stack.Protected>
    </Stack>
  );
}
