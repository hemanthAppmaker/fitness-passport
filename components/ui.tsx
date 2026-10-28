import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, type } from '../lib/theme';

export function Screen({
  children,
  onRefresh,
  refreshing = false,
  edges = ['top'],
}: {
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  edges?: ('top' | 'bottom')[];
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={edges}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 18 }}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.button,
        primary ? { backgroundColor: colors.ink } : { borderWidth: 1.5, borderColor: colors.ink },
        (disabled || busy) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? '#fff' : colors.ink} />
      ) : (
        <Text style={[s.buttonText, { color: primary ? '#fff' : colors.ink }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={s.error}>
      <Text style={{ color: colors.stamp, fontSize: 14, lineHeight: 20 }}>{message}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: 40, alignItems: 'center' }}>
      <ActivityIndicator color={colors.ink} />
    </View>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <View style={s.empty}>
      <Text style={type.title}>{title}</Text>
      <Text style={[type.small, { textAlign: 'center' }]}>{body}</Text>
      {action}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[s.chip, selected && { backgroundColor: colors.ink, borderColor: colors.ink }]}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: selected ? '#fff' : colors.ink }}>{label}</Text>
    </Pressable>
  );
}

/** One segment per milestone, so "2 of 5" reads at a glance. */
export function SegmentedProgress({ total, done, color }: { total: number; done: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 5 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: i < done ? color : colors.line }}
        />
      ))}
    </View>
  );
}

export function MilestoneRow({
  title,
  description,
  done,
  accent,
  onPress,
  busy,
}: {
  title: string;
  description: string | null;
  done: boolean;
  accent: string;
  onPress?: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || busy}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      style={({ pressed }) => [s.milestone, pressed && { opacity: 0.7 }]}
    >
      <View style={[s.check, done ? { backgroundColor: accent, borderColor: accent } : { borderColor: colors.line }]}>
        {done && <Ionicons name="checkmark" size={16} color="#fff" />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { fontWeight: '600' }, done && { color: colors.inkSoft }]}>{title}</Text>
        <Text style={[type.small, done && { color: accent, fontWeight: '600' }]}>
          {done ? 'Milestone completed' : description}
        </Text>
      </View>
    </Pressable>
  );
}

/** Passport stamp: ring, label, and date. Unearned stamps render as a dashed outline. */
export function Stamp({
  label,
  color,
  date,
  earned = true,
  size = 104,
}: {
  label: string;
  color: string;
  date?: string;
  earned?: boolean;
  size?: number;
}) {
  const c = earned ? color : colors.line;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 3,
        borderColor: c,
        borderStyle: earned ? 'solid' : 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ rotate: earned ? '-8deg' : '0deg' }],
      }}
    >
      <View
        style={{
          width: size - 16,
          height: size - 16,
          borderRadius: (size - 16) / 2,
          borderWidth: 1,
          borderColor: c,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <Text style={{ fontSize: size * 0.28, fontWeight: '900', color: c, letterSpacing: -0.5 }}>{label}</Text>
        {earned && date ? (
          <Text style={{ fontSize: 9, fontWeight: '700', color: c }}>{new Date(date).toLocaleDateString()}</Text>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  button: { minHeight: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  error: { backgroundColor: '#FBE6E9', borderRadius: radius.sm, padding: 12 },
  empty: { alignItems: 'center', gap: 10, padding: 28, backgroundColor: colors.card, borderRadius: radius.lg },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  milestone: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
