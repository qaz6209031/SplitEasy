import { Archivo_600SemiBold, Archivo_800ExtraBold, useFonts } from '@expo-google-fonts/archivo';
import { ArchivoNarrow_600SemiBold, ArchivoNarrow_700Bold } from '@expo-google-fonts/archivo-narrow';
import { DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { DialogProvider } from '@/components/Dialog';
import { colors, useResolve } from '@/components/theme';
import { UpdateBanner } from '@/components/UpdateBanner';
import { useForegroundUpdateCheck } from '@/lib/updates';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Archivo_600SemiBold,
    Archivo_800ExtraBold,
    ArchivoNarrow_600SemiBold,
    ArchivoNarrow_700Bold,
  });
  const scheme = useColorScheme();
  const resolve = useResolve();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, primary: resolve(colors.ink), background: resolve(colors.bg), card: resolve(colors.bg), text: resolve(colors.ink), border: resolve(colors.rule) },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ThemeProvider value={theme}>
        <DialogProvider>
          <AuthProvider>
            {/* Fonts ship inside the JS bundle, so they also update over the air. */}
            {fontsLoaded || fontError ? <RootNavigator /> : null}
            <UpdateBanner />
            <StatusBar style="auto" />
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
    // Screens draw their own navigation bars (NavBar) so titles and actions sit in one ink system.
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
            sheetCornerRadius: 16,
            contentStyle: { backgroundColor: colors.bg },
          }}
        />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}
