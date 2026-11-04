// Component kit for the Postmark world: ink controls on a white card ground, no boxed sections.
import { Children, Fragment, useState, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatMoney, type Currency } from '@/domain/money';
import { Icon, type IconName } from './Icon';
import { colors, radius, sizes, space, type } from './theme';

// Buttons

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dangerOutline';

const buttonColors: Record<ButtonVariant, { bg: ColorValue; fg: ColorValue; border?: ColorValue }> = {
  primary: { bg: colors.ink, fg: colors.onInk },
  secondary: { bg: 'transparent', fg: colors.ink, border: colors.ink },
  danger: { bg: colors.danger, fg: colors.white },
  dangerOutline: { bg: 'transparent', fg: colors.danger, border: colors.danger },
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
  const palette = disabled && !busy ? { bg: colors.fill, fg: colors.ink3 } : buttonColors[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      hitSlop={size === 'sm' ? 4 : 0}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        { backgroundColor: palette.bg },
        'border' in palette && palette.border && !disabled ? { borderWidth: 1.5, borderColor: palette.border } : null,
        pressed && { opacity: 0.7 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={palette.fg} /> : icon ? <Icon name={icon} size={size === 'sm' ? 17 : 20} color={palette.fg} /> : null}
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

/** Text-only "plain" button (navigation bar actions, "Reopen group"). */
export function LinkButton({
  title,
  onPress,
  icon,
  iconSize = 20,
  bold,
  color = colors.ink,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  iconSize?: number;
  bold?: boolean;
  color?: ColorValue;
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
      style={({ pressed }) => [styles.link, { opacity: disabled ? 0.35 : pressed ? 0.5 : 1 }, style]}
    >
      {icon ? <Icon name={icon} size={iconSize} color={color} /> : null}
      <Text style={[styles.linkText, { color, fontWeight: bold ? '600' : '400' }]}>{title}</Text>
    </Pressable>
  );
}

/** Bare 44pt icon button for navigation bars. */
export function IconButton({
  icon,
  onPress,
  label,
  size = 24,
  ref,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  size?: number;
  /** For anchoring a popover (an action sheet on a wide screen) to the button. */
  ref?: Ref<View>;
}) {
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.5 }]}
    >
      <Icon name={icon} size={size} />
    </Pressable>
  );
}

// Layout

/**
 * Navigation bar: left / centred title / right, below the status bar.
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

/** Inset grouped list (settings-shaped content only). Children are separated by hairlines. */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, style]}>
      {items.map((child, index) => (
        <Fragment key={index}>
          {index > 0 ? <View style={[styles.hairline, { marginLeft: space.m }]} /> : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

/** Plain list: rows on the page ground, hairlines inset to the text column. */
export function List({ children, inset = space.m, style }: { children: ReactNode; inset?: number; style?: StyleProp<ViewStyle> }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={style}>
      {items.map((child, index) => (
        <Fragment key={index}>
          {index > 0 ? <View style={[styles.hairline, { marginLeft: inset }]} /> : null}
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
      style={({ pressed }) => [styles.row, { minHeight }, pressed && { backgroundColor: colors.fill }, style]}
    >
      {children}
    </Pressable>
  );
}

/** Section title in sentence case ("Balances"). Optional trailing detail on the same line. */
export function SectionHeader({ children, detail, style }: { children: ReactNode; detail?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <Text style={styles.sectionText} accessibilityRole="header">
        {children}
      </Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
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

export function Amount({
  cents,
  currency,
  color = colors.ink,
  signed,
  small,
  style,
}: {
  cents: number;
  currency: Currency;
  color?: ColorValue;
  signed?: boolean;
  small?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const sign = signed && cents !== 0 ? (cents > 0 ? '+' : '−') : '';
  return <Text style={[small ? type.amountSm : type.amount, { color }, style]}>{sign + formatMoney(Math.abs(cents), currency)}</Text>;
}

/** "Settling up" / "Settled" as a dot and a word, in the state's colour. */
export function StatusLine({ status }: { status: 'settling' | 'settled' }) {
  const settled = status === 'settled';
  const fg = settled ? colors.cancel : colors.warn;
  return (
    <View style={styles.status}>
      {settled ? null : <View style={[styles.statusDot, { backgroundColor: fg }]} />}
      <Text style={[styles.statusText, { color: fg }]}>{settled ? 'Settled' : 'Settling up'}</Text>
    </View>
  );
}

export function Checkbox({ checked, error }: { checked: boolean; error?: boolean }) {
  return (
    <View style={[styles.checkbox, checked && styles.checkboxOn, error && !checked && { borderColor: colors.danger }]}>
      {checked ? <Icon name="check" size={15} color={colors.onInk} /> : null}
    </View>
  );
}

/** "you're owed $x" / "you owe $x" / "all square", right-aligned. */
export function BalanceLabel({ cents, currency }: { cents: number; currency: Currency }) {
  if (cents === 0) return <T2>all square</T2>;
  const owed = cents > 0;
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={styles.balanceCaption}>{owed ? 'you’re owed' : 'you owe'}</Text>
      <Amount cents={Math.abs(cents)} currency={currency} color={owed ? colors.pos : colors.neg} />
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
          <Text style={[styles.segmentText, i === index && styles.segmentTextOn]} numberOfLines={1}>
            {value}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Labelled text field: filled, no border until focus (ink) or error (red). */
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
        placeholderTextColor={colors.ink3}
        selectionColor={colors.ink}
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
        style={[styles.field, focused && styles.fieldFocused, error && styles.fieldError, inputStyle]}
      />
    </View>
  );
}

export function ErrorNote({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.errorNote} accessibilityRole="alert">
      <Text style={[styles.t1, { color: colors.danger, fontWeight: '600' }]}>{title}</Text>
      <Text style={[styles.t2, { color: colors.ink }]}>{message}</Text>
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
  buttonSm: { minHeight: sizes.buttonSmH, borderRadius: radius.pill, paddingHorizontal: 14 },
  buttonText: { fontSize: 17, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  buttonTextSm: { fontSize: 15 },
  link: { minHeight: sizes.hitMin, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 2 },
  linkText: { fontSize: 17 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: space.xs },
  navSide: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  navTitle: { ...type.headline, color: colors.ink, textAlign: 'center', flexShrink: 1, maxWidth: '56%' },
  group: { backgroundColor: colors.surface, borderRadius: radius.group, overflow: 'hidden' },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.strongRule },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.m, paddingVertical: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: space.m, gap: space.s },
  sectionText: { ...type.section, color: colors.ink, flexShrink: 1 },
  sectionDetail: { ...type.footnote, color: colors.ink2 },
  footnote: { ...type.footnote, color: colors.ink2, paddingHorizontal: space.m },
  t1: { ...type.body, color: colors.ink },
  t2: { ...type.subhead, color: colors.ink2 },
  balanceCaption: { ...type.footnote, color: colors.ink2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { ...type.footnote, fontWeight: '600' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.strongRule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  segmented: { flexDirection: 'row', padding: 2, borderRadius: 9, backgroundColor: colors.fill },
  segment: { flex: 1, minHeight: 32, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentOn: {
    backgroundColor: colors.bg,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  segmentText: { fontSize: 14, fontWeight: '500', color: colors.ink2 },
  segmentTextOn: { color: colors.ink, fontWeight: '600' },
  fieldLabel: { ...type.footnote, fontWeight: '500', color: colors.ink2, marginLeft: 2, marginBottom: 6 },
  field: {
    minHeight: sizes.fieldH,
    borderRadius: radius.field,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
    color: colors.ink,
    fontSize: 17,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  fieldFocused: { borderColor: colors.ink },
  fieldError: { borderColor: colors.danger },
  errorNote: { padding: 14, borderRadius: radius.field, backgroundColor: colors.dangerTint, gap: 2 },
});
