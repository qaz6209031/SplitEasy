import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, useFonts } from '@expo-google-fonts/geist';
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { DarkTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { DialogProvider } from '@/components/Dialog';
import { colors } from '@/components/theme';
import { UpdateBanner } from '@/components/UpdateBanner';
import { useForegroundUpdateCheck } from '@/lib/updates';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, primary: colors.accent, background: colors.bg, card: colors.bg, border: colors.hairline },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_500Medium,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ThemeProvider value={theme}>
        <DialogProvider>
          <AuthProvider>
            {/* Fonts ship inside the JS bundle, so they also update over the air. */}
            {fontsLoaded || fontError ? <RootNavigator /> : null}
            <UpdateBanner />
            <StatusBar style="light" />
          </AuthProvider>
        </DialogProvider>
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
    // Screens draw their own navigation bars (custom NavBar) to match the design.
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={needsName}>
        <Stack.Screen name="name-setup" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !needsName}>
        <Stack.Screen name="index" />
        <Stack.Screen name="group/[id]/index" />
        <Stack.Screen name="group/[id]/expense" options={{ presentation: 'modal' }} />
        <Stack.Screen
          name="new-group"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: 'fitToContents',
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
            contentStyle: { backgroundColor: colors.surface },
          }}
        />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}
