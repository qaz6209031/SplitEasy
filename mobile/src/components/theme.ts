// Dark theme matching the iOS system dark palette (the app is dark-mode only).

export const colors = {
  background: '#000000',
  card: '#1C1C1E',
  cardPressed: '#2C2C2E',
  separator: '#38383A',
  fill: 'rgba(118,118,128,0.24)',
  text: '#FFFFFF',
  secondaryText: 'rgba(235,235,245,0.6)',
  tertiaryText: 'rgba(235,235,245,0.3)',
  accent: '#5A7AF6',
  green: '#30D158',
  orange: '#FF9F0A',
  red: '#FF453A',
  white: '#FFFFFF',
  black: '#000000',
};

export const spacing = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };

export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const },
  title: { fontSize: 28, fontWeight: '700' as const },
  headline: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 17 },
  subheadline: { fontSize: 15 },
  footnote: { fontSize: 13 },
  caption: { fontSize: 12 },
};
