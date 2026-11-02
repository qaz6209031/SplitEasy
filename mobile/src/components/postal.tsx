// The Postmark world's signature pieces: a member's perforated stamp, the wavy cancel lines that mark
// stamps used once a payment is paid (or a group settled), and the dated postmark for a settled group.
import { useEffect, useId } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Mask, Path, Rect, Text as SvgText, TextPath } from 'react-native-svg';

import { colors, fonts, useResolve } from './theme';

const STAMP_SIZES = {
  sm: { w: 22, h: 26, font: 11, hole: 1.15, pitch: 4.4 },
  md: { w: 30, h: 36, font: 14, hole: 1.5, pitch: 5 },
  lg: { w: 52, h: 62, font: 24, hole: 2.2, pitch: 6.6 },
};

/** Holes centred on the edges, evenly spaced, so the stamp reads as torn from a sheet. */
function holes(w: number, h: number, pitch: number) {
  const out: [number, number][] = [];
  const nx = Math.max(3, Math.round(w / pitch));
  const ny = Math.max(3, Math.round(h / pitch));
  for (let i = 0; i < nx; i++) {
    const x = ((i + 0.5) * w) / nx;
    out.push([x, 0], [x, h]);
  }
  for (let i = 0; i < ny; i++) {
    const y = ((i + 0.5) * h) / ny;
    out.push([0, y], [w, y]);
  }
  return out;
}

/** A member's avatar: a perforated stamp in their colour with their initial. */
export function Stamp({
  name,
  color,
  size = 'md',
  style,
  dimmed,
}: {
  name: string;
  color: string;
  size?: keyof typeof STAMP_SIZES;
  style?: StyleProp<ViewStyle>;
  dimmed?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const s = STAMP_SIZES[size];
  const inset = s.hole + 1.6;
  return (
    <View
      style={[{ width: s.w, height: s.h, opacity: dimmed ? 0.4 : 1 }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={s.w} height={s.h}>
        <Defs>
          <Mask id={`m${id}`}>
            <Rect width={s.w} height={s.h} fill="#fff" />
            {holes(s.w, s.h, s.pitch).map(([x, y], i) => (
              <Circle key={i} cx={x} cy={y} r={s.hole} fill="#000" />
            ))}
          </Mask>
        </Defs>
        <Rect width={s.w} height={s.h} fill={color} mask={`url(#m${id})`} />
        <Rect
          x={inset}
          y={inset}
          width={s.w - inset * 2}
          height={s.h - inset * 2}
          fill="none"
          stroke="#fff"
          strokeOpacity={0.5}
          strokeWidth={size === 'lg' ? 1.25 : 0.9}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <Text allowFontScaling={false} style={[styles.initial, { fontSize: s.font, lineHeight: s.h }]}>
          {(name.trim()[0] ?? '?').toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

const POSTMARK_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export const postmarkDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${POSTMARK_MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
};

/** Whole repeats of the ring label, spaced so they close the circle without a cut-off word. */
function ringText(label: string) {
  const clean = label.toUpperCase().trim();
  const unit = `${clean.length > 24 ? `${clean.slice(0, 23)}…` : clean} · `;
  const repeats = Math.max(1, Math.floor(34 / unit.length));
  const text = unit.repeat(repeats);
  // Circumference of the text path (r = 35) is about 220 units; a bold 9.5-unit glyph advances about 6.4.
  const spacing = Math.min(6, Math.max(0.4, 220 / text.length - 6.4));
  return { text, spacing };
}

/** The landing for a cancellation: a quick press-down from slightly larger, or a fade under Reduce Motion. */
function useLanding(stamped: boolean | undefined, rotate: number) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(stamped ? 0 : 1);
  useEffect(() => {
    if (stamped) t.value = withTiming(1, { duration: reduceMotion ? 200 : 320, easing: Easing.out(Easing.exp) });
  }, [stamped, reduceMotion, t]);
  return useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value * 1.4),
    transform: [{ rotate: `${rotate}deg` }, { scale: reduceMotion ? 1 : 1.35 - 0.35 * t.value }],
  }));
}

/**
 * Machine-cancel wavy lines across the lower band of a run of stamps. They pass under the initials,
 * so each stamp stays readable while the run reads as used. Lay it absolutely over the stamps.
 */
export function CancelLines({
  width,
  top,
  stamped,
  style,
}: {
  width: number;
  /** Distance from the top of the stamps' box to the first line. */
  top: number;
  stamped?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const resolve = useResolve();
  const ink = resolve(colors.cancel);
  const animated = useLanding(stamped, -4);
  const step = 7;
  const waves = Math.ceil((width + 8) / step);
  const d = (y: number) => `M-4 ${y} q${step / 2} -2.6 ${step} 0` + ` t${step} 0`.repeat(waves);
  return (
    <Animated.View
      style={[{ position: 'absolute', left: -4, top, width: width + 8, height: 12 }, animated, style]}
      pointerEvents="none"
      accessibilityElementsHidden
    >
      <Svg width={width + 8} height={12}>
        <G opacity={0.92}>
          {[3, 9].map((y) => (
            <Path key={y} d={d(y)} stroke={ink} strokeWidth={1.8} fill="none" strokeLinecap="round" />
          ))}
        </G>
      </Svg>
    </Animated.View>
  );
}

/**
 * Circular date cancellation with wavy "killer" lines trailing to the right. `stamped` makes it land
 * (a quick press-down from slightly larger) the moment it appears; Reduce Motion fades it instead.
 */
export function Postmark({
  word,
  date,
  ring = 'Tabmates',
  size = 76,
  waves = true,
  rotate = -12,
  stamped,
  style,
}: {
  word: string;
  date: string;
  ring?: string;
  size?: number;
  waves?: boolean;
  rotate?: number;
  stamped?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const id = useId().replace(/:/g, '');
  const resolve = useResolve();
  const ink = resolve(colors.cancel);
  const animated = useLanding(stamped, rotate);

  const width = waves ? size * 2.1 : size;
  const wordSize = word.length > 5 ? 10.5 : 13;
  const killerStroke = size < 70 ? 4 : 2.2;
  // Below ~70pt the ring text can't be read, so the compact mark is just rings, word and date.
  const compact = size < 70;
  const ringLabel = ringText(ring);
  return (
    <Animated.View style={[{ width, height: size }, animated, style]} pointerEvents="none" accessibilityElementsHidden>
      <Svg width={width} height={size} viewBox={`0 0 ${waves ? 210 : 100} 100`}>
        <Defs>
          <Path id={`r${id}`} d="M50 50 m-35 0 a35 35 0 1 1 70 0 a35 35 0 1 1 -70 0" />
        </Defs>
        <G opacity={0.92}>
          {waves
            ? [34, 44, 54, 64].map((y) => (
                <Path
                  key={y}
                  d={`M96 ${y} q7 -5 14 0 t14 0 t14 0 t14 0 t14 0 t14 0 t14 0 t14 0`}
                  stroke={ink}
                  strokeWidth={killerStroke}
                  fill="none"
                  strokeLinecap="round"
                />
              ))
            : null}
          <Circle cx={50} cy={50} r={46} stroke={ink} strokeWidth={compact ? 4 : 2.6} fill="none" />
          {compact ? (
            <>
              <Circle cx={50} cy={50} r={37} stroke={ink} strokeWidth={2} fill="none" />
              <SvgText x={50} y={54} textAnchor="middle" fill={ink} fontSize={word.length > 5 ? 12.5 : 21} fontWeight="800" fontFamily={fonts.display}>
                {word.toUpperCase()}
              </SvgText>
              <SvgText x={50} y={70} textAnchor="middle" fill={ink} fontSize={11} fontWeight="700" fontFamily={fonts.display}>
                {date}
              </SvgText>
            </>
          ) : (
            <>
              <Circle cx={50} cy={50} r={27} stroke={ink} strokeWidth={1.5} fill="none" />
              <SvgText fill={ink} fontSize={9.5} fontWeight="700" fontFamily={fonts.display} letterSpacing={ringLabel.spacing}>
                <TextPath href={`#r${id}`}>{ringLabel.text}</TextPath>
              </SvgText>
              <SvgText x={50} y={49} textAnchor="middle" fill={ink} fontSize={wordSize} fontWeight="800" fontFamily={fonts.display}>
                {word.toUpperCase()}
              </SvgText>
              <SvgText x={50} y={62} textAnchor="middle" fill={ink} fontSize={8.5} fontWeight="700" fontFamily={fonts.display}>
                {date}
              </SvgText>
            </>
          )}
        </G>
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  initial: { fontFamily: fonts.display, color: '#FFFFFF', textAlign: 'center' },
});
