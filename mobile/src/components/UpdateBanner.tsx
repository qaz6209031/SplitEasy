import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Updates, updatesSupported } from '@/lib/updates';
import { colors, spacing, type } from './theme';

/** Appears once an over-the-air update has been downloaded; restarting applies it immediately. */
export function UpdateBanner() {
  const { isUpdatePending } = Updates.useUpdates();
  const insets = useSafeAreaInsets();
  if (!updatesSupported || !isUpdatePending) return null;
  return (
    // Bottom placement, above the screens' bottom "Add Expense" bar, so it never covers navigation buttons.
    <View style={[styles.banner, { bottom: insets.bottom + 76 }]} accessibilityRole="alert">
      <Text style={styles.text}>A new version of SplitEasy is ready.</Text>
      <Pressable
        onPress={() => Updates.reloadAsync()}
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.buttonText}>Restart</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: spacing.l,
    right: spacing.l,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    padding: spacing.m,
    borderRadius: 14,
    backgroundColor: colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  text: { ...type.subheadline, color: colors.white, flex: 1, fontWeight: '600' },
  button: { backgroundColor: colors.white, borderRadius: 8, paddingHorizontal: spacing.m, paddingVertical: 6 },
  buttonText: { ...type.subheadline, color: colors.accent, fontWeight: '700' },
});
