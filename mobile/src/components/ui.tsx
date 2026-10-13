// Component kit matching the "SplitEasy — UI" design's component sheet.
import { Children, Fragment, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatCents } from '@/domain/money';
import { Icon, type IconName } from './Icon';
import { colors, fonts, radius, sizes, space, type } from './theme';

// Buttons

type ButtonVariant = 'primary' | 'secondary' | 'amber' | 'green' | 'red' | 'redOutline';

const buttonColors: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.text, fg: colors.onLight },
  secondary: { bg: colors.raised, fg: colors.text, border: colors.border },
  amber: { bg: colors.amber, fg: colors.onLight },
  green: { bg: colors.green, fg: colors.onLight },
  red: { bg: colors.redFill, fg: colors.white },
  redOutline: { bg: 'transparent', fg: colors.red, border: colors.redLine },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  busy,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const off = disabled || busy;
  const palette = off && !busy ? { bg: colors.raised, fg: colors.textDisabled } : buttonColors[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        { backgroundColor: palette.bg },
        'border' in palette && palette.border && !off ? { borderWidth: 1, borderColor: palette.border } : null,
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.85 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={palette.fg} /> : icon ? <Icon name={icon} size={size === 'sm' ? 18 : 20} color={palette.fg} /> : null}
      <Text
        style={[styles.buttonText, size === 'sm' && styles.buttonTextSm, { color: palette.fg }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {title}
      </Text>
    </Pressable>
  );
}

/** Text-only "plain" button in the accent color (navigation bar actions, "Reopen group"). */
export function LinkButton({
  title,
  onPress,
  icon,
  iconSize = 20,
  bold,
  color = colors.accent,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  iconSize?: number;
  bold?: boolean;
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.link, { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }, style]}
    >
      {icon ? <Icon name={icon} size={iconSize} color={color} /> : null}
      <Text style={[styles.linkText, { color, fontFamily: bold ? fonts.semibold : fonts.medium }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, active }: { icon: IconName; onPress: () => void; label: string; active?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconButton, (active || pressed) && styles.iconButtonActive]}
    >
      <Icon name={icon} size={20} />
    </Pressable>
  );
}

// Layout

/**
 * Custom navigation bar: left / centered title / right, below the status bar.
 * `inSheet`: inside a page-sheet modal, which already starts below the status bar.
 */
export function NavBar({ left, title, right, inSheet }: { left?: ReactNode; title?: string; right?: ReactNode; inSheet?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.nav, { marginTop: inSheet ? 6 : insets.top }]}>
      <View style={styles.navSide}>{left}</View>
      {title ? (
        <Text style={styles.navTitle} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      ) : (
        <View />
      )}
      <View style={[styles.navSide, { justifyContent: 'flex-end' }]}>{right}</View>
    </View>
  );
}

/** Rounded surface. As a list (default) children are separated by 1px hairlines (the design's "card list"). */
export function Card({ children, style, separated = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; separated?: boolean }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.card, style]}>
      {items.map((child, index) => (
        <Fragment key={index}>
          {separated && index > 0 ? <View style={styles.hairline} /> : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

export function Row({
  children,
  onPress,
  style,
  minHeight = sizes.rowMin,
  accessibilityLabel,
  accessibilityHint,
  selected,
  accessibilityActions,
  onAccessibilityAction,
}: {
  children: ReactNode;
  onPress?: PressableProps['onPress'];
  style?: StyleProp<ViewStyle>;
  minHeight?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  selected?: boolean;
  accessibilityActions?: PressableProps['accessibilityActions'];
  onAccessibilityAction?: PressableProps['onAccessibilityAction'];
}) {
  if (!onPress) return <View style={[styles.row, { minHeight }, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected === undefined ? undefined : { selected }}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      style={({ pressed }) => [styles.row, { minHeight }, pressed && { backgroundColor: colors.raised }, style]}
    >
      {children}
    </Pressable>
  );
}

/** Mono, upper-case section label ("PAY EACH OTHER BACK"). */
export function SectionHeader({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[styles.sectionHeader, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Footnote({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.footnote, style]}>{children}</Text>;
}

export function T1({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return (
    <Text style={[styles.t1, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function T2({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return (
    <Text style={[styles.t2, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Amount({ cents, color = colors.text, style }: { cents: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.amount, { color }, style]}>{formatCents(cents)}</Text>;
}

// Small pieces

export function Badge({ status }: { status: 'settling' | 'settled' }) {
  const settled = status === 'settled';
  const fg = settled ? colors.green : colors.amber;
  return (
    <View style={[styles.badge, { backgroundColor: settled ? colors.greenBadge : colors.amberBadge }]}>
      <View style={[styles.badgeDot, { backgroundColor: fg }]} />
      <Text style={[styles.badgeText, { color: fg }]}>{settled ? 'Settled' : 'Settling up'}</Text>
    </View>
  );
}

export function Avatar({ name, me, size = 36 }: { name: string; me?: boolean; size?: number }) {
  return (
    <View
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }, me && { backgroundColor: colors.accent }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.avatarText, { fontSize: size <= 30 ? 13 : 14 }, me && { color: colors.onLight }]}>
        {(name.trim()[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

export function Tile({ icon, color = colors.textMuted, background = colors.raised, size = 40, iconSize = 20 }: {
  icon: IconName;
  color?: string;
  background?: string;
  size?: number;
  iconSize?: number;
}) {
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: size >= 40 ? 12 : 10, backgroundColor: background }]}>
      <Icon name={icon} size={iconSize} color={color} />
    </View>
  );
}

export function Checkbox({ checked, error }: { checked: boolean; error?: boolean }) {
  return (
    <View style={[styles.checkbox, checked && styles.checkboxOn, error && !checked && { borderColor: colors.red }]}>
      {checked ? <Icon name="check" size={16} color={colors.white} /> : null}
    </View>
  );
}

/** "you are owed $x" / "you owe $x" / "settled up" with the amount in mono. */
export function BalanceLabel({ cents, style }: { cents: number; style: 'summary' | 'you' | 'member' }) {
  if (cents === 0) return <T2>settled up</T2>;
  const owed = cents > 0;
  const caption = {
    summary: owed ? 'you are owed' : 'you owe',
    you: owed ? 'get back' : 'owe',
    member: owed ? 'gets back' : 'owes',
  }[style];
  return (
    <View style={{ alignItems: 'flex-end', gap: 1 }}>
      <T2>{caption}</T2>
      <Amount cents={Math.abs(cents)} color={owed ? colors.green : colors.amber} />
    </View>
  );
}

export function SegmentedControl({ values, index, onChange }: { values: string[]; index: number; onChange: (index: number) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {values.map((value, i) => (
        <Pressable
          key={value}
          onPress={() => onChange(i)}
          accessibilityRole="tab"
          accessibilityState={{ selected: i === index }}
          style={[styles.segment, i === index && styles.segmentOn]}
        >
          <Text style={[styles.segmentText, i === index && { color: colors.text }]}>{value}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Labelled text field with the design's focus ring and error state. */
export function TextField({
  label,
  error,
  style,
  inputStyle,
  ...props
}: TextInputProps & { label?: string; error?: boolean; style?: StyleProp<ViewStyle>; inputStyle?: StyleProp<TextStyle> }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={style}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.placeholder}
        selectionColor={colors.accent}
        keyboardAppearance="dark"
        accessibilityLabel={label}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          styles.field,
          focused && styles.fieldFocused,
          error && styles.fieldError,
          inputStyle,
        ]}
      />
    </View>
  );
}

export function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.errorCard} accessibilityRole="alert">
      <Text style={[styles.t1, { color: colors.red, fontFamily: fonts.semibold }]}>{title}</Text>
      <Text style={[styles.t2, { color: colors.redText }]}>{message}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  button: {
    minHeight: sizes.buttonH,
    paddingHorizontal: 20,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  buttonSm: { minHeight: sizes.buttonSmH, borderRadius: 12, paddingHorizontal: 14 },
  buttonText: { fontFamily: fonts.semibold, fontSize: 17, letterSpacing: -0.2, textAlign: 'center', flexShrink: 1 },
  buttonTextSm: { fontSize: 15 },
  link: { minHeight: sizes.hitMin, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 2 },
  linkText: { fontSize: 17 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  iconButtonActive: { backgroundColor: colors.selected, borderColor: colors.strongBorder },
  nav: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: space.xs },
  navSide: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  navTitle: { ...type.headline, color: colors.text, textAlign: 'center', flexShrink: 1, maxWidth: '55%' },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, overflow: 'hidden' },
  hairline: { height: 1, backgroundColor: '#1F2227' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.m, paddingVertical: space.s },
  sectionHeader: { ...type.label, color: colors.textMuted, marginHorizontal: 4, marginBottom: -10 },
  footnote: { ...type.caption, color: colors.textMuted, marginHorizontal: 4, marginTop: -10 },
  t1: { ...type.bodyMedium, color: colors.text },
  t2: { ...type.caption, color: colors.textMuted },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, paddingHorizontal: 10, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontFamily: fonts.medium, fontSize: 13 },
  avatar: { backgroundColor: colors.hairline, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.semibold, color: colors.text },
  tile: { alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.strongBorder, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.accentFill, borderColor: colors.accentFill },
  segmented: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  segment: { flex: 1, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.selected, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  segmentText: { fontFamily: fonts.medium, fontSize: 15, color: colors.textMuted },
  fieldLabel: { fontFamily: fonts.medium, fontSize: 15, color: colors.textMuted, marginLeft: 2, marginBottom: space.xs },
  field: {
    height: sizes.fieldH,
    borderRadius: radius.field,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 17,
    paddingHorizontal: space.m,
    letterSpacing: 0,
  },
  fieldFocused: { borderColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 0.35, shadowRadius: 3, shadowOffset: { width: 0, height: 0 } },
  fieldError: { borderColor: colors.red },
  errorCard: { padding: space.m, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.redTint, borderWidth: 1, borderColor: colors.redLine, gap: 2 },
});
