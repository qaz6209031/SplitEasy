import { Children, Fragment, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { formatCents } from '@/domain/money';
import { colors, spacing, type } from './theme';

/** iOS-style grouped list section: optional header, rounded card with separators, optional footer. */
export function Section({
  header,
  footer,
  children,
  style,
  cardStyle,
}: {
  header?: string;
  footer?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  cardStyle?: StyleProp<ViewStyle>;
}) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.section, style]}>
      {header ? <Text style={styles.sectionHeader}>{header.toUpperCase()}</Text> : null}
      <View style={[styles.card, cardStyle]}>
        {items.map((child, index) => (
          <Fragment key={index}>
            {index > 0 ? <View style={styles.separator} /> : null}
            {child}
          </Fragment>
        ))}
      </View>
      {typeof footer === 'string' ? <Text style={styles.sectionFooter}>{footer}</Text> : footer}
    </View>
  );
}

export function Row({
  children,
  onPress,
  style,
  accessibilityLabel,
  accessibilityHint,
  selected,
  accessibilityActions,
  onAccessibilityAction,
}: {
  children: ReactNode;
  onPress?: PressableProps['onPress'];
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  selected?: boolean;
  accessibilityActions?: PressableProps['accessibilityActions'];
  onAccessibilityAction?: PressableProps['onAccessibilityAction'];
}) {
  if (!onPress) return <View style={[styles.row, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected === undefined ? undefined : { selected }}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.cardPressed }, style]}
    >
      {children}
    </Pressable>
  );
}

export function Label({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return (
    <Text style={[styles.label, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Secondary({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.secondary, style]}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive' | 'plain';
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const isDisabled = disabled || busy;
  const background =
    variant === 'primary' ? colors.accent : variant === 'secondary' ? colors.fill : 'transparent';
  const foreground =
    variant === 'primary' ? colors.white : variant === 'destructive' ? colors.red : colors.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!busy }}
      style={({ pressed }) => [
        styles.button,
        variant === 'plain' && styles.plainButton,
        { backgroundColor: background, opacity: isDisabled ? 0.45 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={foreground} style={{ marginRight: spacing.s }} /> : null}
      <Text style={[styles.buttonText, { color: foreground }]}>{title}</Text>
    </Pressable>
  );
}

/** Text button for navigation bars; padded so the label doesn't touch the edges of the iOS glass capsule. */
export function HeaderButton({
  title,
  onPress,
  disabled,
  bold,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  bold?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({ paddingHorizontal: 10, paddingVertical: 4, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })}
    >
      <Text style={{ ...type.body, color: colors.accent, fontWeight: bold ? '600' : '400' }}>{title}</Text>
    </Pressable>
  );
}

/** "you are owed $x" / "you owe $x" / "settled up", colored green / orange / gray. */
export function BalanceLabel({ cents, style }: { cents: number; style: 'summary' | 'you' | 'member' }) {
  if (cents === 0) {
    return <Text style={[styles.secondary, { textAlign: 'right' }]}>settled up</Text>;
  }
  const owed = cents > 0;
  const caption = {
    summary: owed ? 'you are owed' : 'you owe',
    you: owed ? 'get back' : 'owe',
    member: owed ? 'gets back' : 'owes',
  }[style];
  const color = owed ? colors.green : colors.orange;
  return (
    <View style={{ alignItems: 'flex-end', minHeight: 36, justifyContent: 'center' }}>
      <Text style={[type.caption, { color }]}>{caption}</Text>
      <Text style={[type.subheadline, { color, fontWeight: '700', fontVariant: ['tabular-nums'] }]}>
        {formatCents(Math.abs(cents))}
      </Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  section: { marginHorizontal: spacing.l, marginTop: spacing.xl },
  sectionHeader: { ...type.footnote, color: colors.secondaryText, marginLeft: spacing.l, marginBottom: 6 },
  sectionFooter: { ...type.footnote, color: colors.secondaryText, marginHorizontal: spacing.l, marginTop: 6 },
  card: { backgroundColor: colors.card, borderRadius: 10, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: spacing.l },
  row: {
    minHeight: 44,
    paddingHorizontal: spacing.l,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  label: { ...type.body, color: colors.text, flexShrink: 1 },
  secondary: { ...type.subheadline, color: colors.secondaryText },
  button: {
    minHeight: 50,
    borderRadius: 12,
    paddingHorizontal: spacing.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plainButton: { minHeight: 44, paddingHorizontal: 0 },
  buttonText: { ...type.headline },
});
