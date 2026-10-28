export const colors = {
  canvas: '#EDF0EE',
  card: '#FFFFFF',
  ink: '#12263A',
  inkSoft: '#5B6B7A',
  line: '#D5DCD9',
  teal: '#0E7C7B',
  stamp: '#D7263D',
  sun: '#F2B134',
};

export const radius = { sm: 8, md: 14, lg: 22 };

export const type = {
  display: { fontSize: 32, lineHeight: 36, fontWeight: '800' as const, letterSpacing: -0.8, color: colors.ink },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const, color: colors.ink },
  body: { fontSize: 15, lineHeight: 21, color: colors.ink },
  small: { fontSize: 13, lineHeight: 18, color: colors.inkSoft },
};

export const GOALS = [
  'Run a 5K',
  'Build strength',
  'Move more',
  'Try yoga',
  'Ride longer',
  'Make fitness friends',
];
