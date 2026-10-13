import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Updates, updatesSupported } from '@/lib/updates';
import { colors, floatShadow, fonts } from './theme';
import { Button, T2, Tile } from './ui';

/** "Update ready" toast: appears once an over-the-air update has been downloaded; Restart applies it. */
export function UpdateBanner() {
  const { isUpdatePending } = Updates.useUpdates();
  const insets = useSafeAreaInsets();
  if (!updatesSupported || !isUpdatePending) return null;
  return (
    // Floats above the screens' bottom "Add Expense" bar so it never covers navigation buttons.
    <View style={[styles.toast, { bottom: insets.bottom + 84 }]} accessibilityRole="alert">
      <Tile icon="refresh" color={colors.green} background={colors.greenTint} size={36} iconSize={18} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Update ready</Text>
        <T2>A new version of SplitEasy is ready.</T2>
      </View>
      <Button title="Restart" variant="green" size="sm" onPress={() => Updates.reloadAsync()} />
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingRight: 10,
    paddingLeft: 12,
    borderRadius: 16,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
    ...floatShadow,
    shadowOpacity: 0.6,
  },
  title: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
});
