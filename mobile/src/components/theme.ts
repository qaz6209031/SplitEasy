// Design tokens for the "Postmark" world: white card ground (near-black in dark mode), ink-black
// type and controls, and colour only where it identifies someone (their stamp) or a state.
// SF Pro carries the UI; Archivo Narrow sets money; Archivo ExtraBold sets display moments.
// Every tap target is at least 44×44.
import { DynamicColorIOS, Platform, useColorScheme, type ColorValue } from 'react-native';

type Pair = { light: string; dark: string };
const pairs = new WeakMap<object, Pair>();

/** A colour that follows the system appearance. Resolve it with `useResolve` where a plain string is needed (SVG). */
function dyn(light: string, dark: string): ColorValue {
  if (Platform.OS !== 'ios') return light;
  const value = DynamicColorIOS({ light, dark });
  pairs.set(value as object, { light, dark });
  return value;
}

/** Returns a resolver from theme colours to plain hex strings for the current appearance. */
export function useResolve() {
  const scheme = useColorScheme();
  return (color: ColorValue): string => {
    if (typeof color === 'string') return color;
    const pair = pairs.get(color as object);
    if (!pair) return '#000000';
    return scheme === 'dark' ? pair.dark : pair.light;
  };
}

export const colors = {
  bg: dyn('#FFFFFF', '#0E0F12'),
  /** Grouped fields, sheets, inputs. */
  surface: dyn('#F4F5F7', '#18191D'),
  /** Tracks: segmented control, balance bars, pressed rows. */
  fill: dyn('#ECEDF0', '#25272C'),
  rule: dyn('#E6E7EB', '#27292E'),
  strongRule: dyn('#C9CBD1', '#3A3D44'),
  ink: dyn('#16181D', '#F1F2F4'),
  ink2: dyn('#5E626C', '#A3A7B0'),
  ink3: dyn('#8E929B', '#70747D'),
  /** Text on an ink fill. */
  onInk: dyn('#FFFFFF', '#0E0F12'),
  pos: dyn('#14824F', '#4CC38A'),
  neg: dyn('#B4372A', '#F0806F'),
  warn: dyn('#9A6200', '#E7B34A'),
  warnTint: dyn('#FFF5DC', '#272012'),
  danger: dyn('#C8302F', '#FF6B66'),
  dangerTint: dyn('#FDEDEC', '#2A1415'),
  /** Postmark ink. */
  cancel: dyn('#34408A', '#9DA8F2'),
  white: '#FFFFFF',
  scrim: 'rgba(0,0,0,0.4)',
};

/** The printed stamp colours. Each holds 4.5:1 against a white initial. */
export const stampColors = ['#2B4BD8', '#9C6B00', '#0F7A89', '#B8306A', '#7A3FC4', '#8A5A2B'];
export const stampColor = (index: number) => stampColors[((index % stampColors.length) + stampColors.length) % stampColors.length];

/**
 * Each person keeps the same stamp colour in every group where possible: their id picks a colour,
 * and on a clash inside one group the later joiner takes the next free one.
 */
export function assignStampColors(ids: string[]): Map<string, string> {
  const result = new Map<string, string>();
  const taken = new Set<number>();
  for (const id of ids) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    let index = hash % stampColors.length;
    for (let step = 0; step < stampColors.length && taken.has(index); step++) index = (index + 1) % stampColors.length;
    if (taken.size < stampColors.length) taken.add(index);
    result.set(id, stampColors[index]);
  }
  return result;
}

export const fonts = {
  money: 'ArchivoNarrow_600SemiBold',
  moneyBold: 'ArchivoNarrow_700Bold',
  display: 'Archivo_800ExtraBold',
  displayMedium: 'Archivo_600SemiBold',
};

// UI text is SF Pro (the system font): no fontFamily, so it follows Dynamic Type and covers CJK.
export const type = {
  largeTitle: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.3 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 17, lineHeight: 22 },
  callout: { fontSize: 16, lineHeight: 21 },
  subhead: { fontSize: 15, lineHeight: 20 },
  footnote: { fontSize: 13, lineHeight: 18 },
  section: { fontSize: 20, lineHeight: 25, fontWeight: '700' as const, letterSpacing: -0.2 },
  amountHero: { fontFamily: fonts.moneyBold, fontSize: 56, lineHeight: 62, letterSpacing: -1, fontVariant: ['tabular-nums' as const] },
  amount: { fontFamily: fonts.money, fontSize: 19, lineHeight: 24, fontVariant: ['tabular-nums' as const] },
  amountSm: { fontFamily: fonts.money, fontSize: 16, lineHeight: 20, fontVariant: ['tabular-nums' as const] },
};

export const space = { xxs: 4, xs: 8, s: 12, m: 16, l: 24, xl: 32, xxl: 48 };

export const radius = { field: 10, button: 14, group: 12, sheet: 16, pill: 999 };

export const sizes = { hitMin: 44, buttonH: 52, buttonSmH: 40, fieldH: 48, rowMin: 52 };

/** Floating layers only (dialog, toast, menu). */
export const floatShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.18,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 12 },
};
