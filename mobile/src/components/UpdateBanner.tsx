import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Updates, updatesSupported } from '@/lib/updates';
import { Icon } from './Icon';
import { colors, floatShadow, radius, type } from './theme';
import { Button, T2 } from './ui';

/** "Update ready" toast: appears once an over-the-air update has been downloaded; Restart applies it. */
export function UpdateBanner() {
  const { isUpdatePending } = Updates.useUpdates();
  const insets = useSafeAreaInsets();
  if (!updatesSupported || !isUpdatePending) return null;
  return (
    // Floats above the screens' bottom "Add Expense" bar so it never covers navigation buttons.
    <View style={[styles.toast, { bottom: insets.bottom + 84 }]} accessibilityRole="alert">
      <Icon name="refresh" size={22} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Update ready</Text>
        <T2>A new version of Tabmates is ready.</T2>
      </View>
      <Button title="Restart" size="sm" onPress={() => Updates.reloadAsync()} />
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
    paddingLeft: 16,
    borderRadius: radius.sheet,
    backgroundColor: colors.bg,
    ...floatShadow,
  },
  title: { ...type.subhead, fontWeight: '600', color: colors.ink },
});
