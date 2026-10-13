// Design tokens from the "SplitEasy — UI" design (Claude Design canvas): dark only, Geist for words,
// Geist Mono for money. Every tap target is at least 44×44.

export const colors = {
  bg: '#0A0B0D',
  field: '#0F1013',
  surface: '#131418',
  raised: '#1A1C21',
  selected: '#2A2D35',
  hairline: '#23262C',
  border: '#2E3138',
  strongBorder: '#3A3D45',
  text: '#EDEEF0',
  textMuted: '#8B8F98',
  textSoft: '#A9ADB6',
  textDisabled: '#5B5F68',
  placeholder: '#6B6F78',
  accent: '#8B9BFF',
  accentFill: '#5B6CFF',
  accentTint: '#1D2140',
  focusRing: 'rgba(139,155,255,0.22)',
  green: '#4ADE80',
  greenTint: '#0E1A13',
  greenLine: '#1B3A26',
  greenBadge: '#10291A',
  amber: '#FBBF24',
  amberTint: '#1C170B',
  amberLine: '#3B2F12',
  amberBadge: '#2A2210',
  amberText: '#C9C2AE',
  red: '#F87171',
  redFill: '#D93A3F',
  redTint: '#1F1012',
  redLine: '#4A1D21',
  redText: '#C9AEB0',
  onLight: '#0A0B0D',
  white: '#FFFFFF',
  scrim: 'rgba(0,0,0,0.6)',
};

export const fonts = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  mono: 'GeistMono_500Medium',
};

export const type = {
  largeTitle: { fontFamily: fonts.semibold, fontSize: 34, lineHeight: 39, letterSpacing: -1 },
  amountXL: { fontFamily: fonts.mono, fontSize: 52, lineHeight: 58, letterSpacing: -2.6 },
  title: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 },
  headline: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 24 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 17, lineHeight: 24 },
  caption: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 20 },
  captionMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20 },
  amount: { fontFamily: fonts.mono, fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums' as const] },
  label: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18, letterSpacing: 1, textTransform: 'uppercase' as const },
};

export const space = { xxs: 4, xs: 8, s: 12, m: 16, l: 24, xl: 32, xxl: 48 };

export const radius = { field: 12, button: 14, card: 16, alert: 20, sheet: 24, pill: 999 };

export const sizes = { hitMin: 44, buttonH: 52, buttonSmH: 44, fieldH: 52, rowMin: 60, avatar: 36, icon: 20 };

/** Floating layers only (sheet, alert, toast, menu). */
export const floatShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.5,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 16 },
};
