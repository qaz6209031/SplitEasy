// The expense screen's own keypad: digits, a point, delete and the four operators, so a bill can be
// added up ("38.50 + 12") or divided ("120 ÷ 3") right where it's entered. It docks under the form.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import type { CalcKey } from '@/domain/calc';

import { colors, fonts, space, type, useResolve } from './theme';
import { LinkButton } from './ui';

const ROWS: CalcKey[][] = [
  ['1', '2', '3', '÷'],
  ['4', '5', '6', '×'],
  ['7', '8', '9', '−'],
  ['.', '0', 'del', '+'],
];

const LABELS: Partial<Record<CalcKey, string>> = {
  '.': 'Decimal point',
  del: 'Delete',
  '+': 'Plus',
  '−': 'Minus',
  '×': 'Times',
  '÷': 'Divided by',
};

export function AmountKeypad({
  onKey,
  onClear,
  onDone,
  result,
}: {
  onKey: (key: CalcKey) => void;
  /** Long-pressing delete clears the field. */
  onClear: () => void;
  onDone: () => void;
  /** "= $20.50" once the entry has arithmetic in it. */
  result: string | null;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tray, { paddingBottom: Math.max(insets.bottom, space.xs) }]}>
      <View style={styles.bar}>
        <Text style={styles.result} numberOfLines={1} accessibilityLiveRegion="polite">
          {result ?? ''}
        </Text>
        <LinkButton title="Done" bold onPress={onDone} />
      </View>
      <View style={styles.grid}>
        {ROWS.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((key, c) => {
              const operator = key === '+' || key === '−' || key === '×' || key === '÷';
              const quiet = operator || key === 'del';
              return (
                <Pressable
                  key={key}
                  onPress={() => onKey(key)}
                  onLongPress={key === 'del' ? onClear : undefined}
                  accessibilityRole="keyboardkey"
                  accessibilityLabel={LABELS[key] ?? key}
                  accessibilityHint={key === 'del' ? 'Hold to clear' : undefined}
                  style={({ pressed }) => [
                    styles.key,
                    c === 3 && styles.keyNarrow,
                    quiet ? styles.keyQuiet : styles.keyDigit,
                    pressed && { backgroundColor: quiet ? colors.strongRule : colors.fill },
                  ]}
                >
                  {key === 'del' ? (
                    <DeleteGlyph />
                  ) : (
                    <Text allowFontScaling={false} style={operator ? styles.operator : styles.digit}>
                      {key}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

/** A backspace key cap: a left-pointing tag with an × in it, drawn in the icon set's stroke. */
function DeleteGlyph() {
  const resolve = useResolve();
  return (
    <Svg width={28} height={22} viewBox="0 0 28 22">
      <Path
        d="M9 2h15a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9L2 11z M13 7l8 8 M21 7l-8 8"
        stroke={resolve(colors.ink)}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  tray: { backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.rule },
  bar: { height: 44, flexDirection: 'row', alignItems: 'center', paddingLeft: space.m, paddingRight: space.xs },
  result: { ...type.amount, flex: 1, color: colors.ink2 },
  grid: { paddingHorizontal: 6, gap: 6 },
  row: { flexDirection: 'row', gap: 6 },
  key: { flex: 1, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  keyNarrow: { flex: 0.8 },
  keyDigit: { backgroundColor: colors.bg },
  keyQuiet: { backgroundColor: colors.fill },
  digit: { fontSize: 25, color: colors.ink },
  operator: { fontFamily: fonts.displayMedium, fontSize: 24, color: colors.ink },
});
