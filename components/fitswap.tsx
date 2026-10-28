import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import {
  CATEGORIES,
  ExchangeStatus,
  labelOf,
  MEETING_SAFETY_NOTE,
  OfferStatus,
  providerBadge,
  RequestStatus,
  REPORT_REASONS,
  ratingSummary,
  SUPPORT_TYPES,
} from '../lib/fitswap';
import { reportMember } from '../lib/fitswapApi';
import { colors, radius, type } from '../lib/theme';
import type { FitSwapOffer } from '../lib/types';
import { Button, Chip, ErrorNote, Screen } from './ui';

export const SECTIONS = [
  { key: 'discover', label: 'Discover' },
  { key: 'offer', label: 'Offer help' },
  { key: 'exchanges', label: 'My exchanges' },
  { key: 'contributions', label: 'My contributions' },
] as const;
export type SectionKey = (typeof SECTIONS)[number]['key'];

/** Screen frame for the FitSwap tab: title plus the four section chips. */
export function FitSwapShell({
  section,
  onSection,
  onRefresh,
  children,
}: {
  section: SectionKey;
  onSection: (s: SectionKey) => void;
  onRefresh?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Screen onRefresh={onRefresh}>
      <View style={{ gap: 4 }}>
        <Text style={type.display}>FitSwap</Text>
        <Text style={type.small}>Everyone has something to share. Offer help, ask for help, swap time.</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SECTIONS.map((s) => (
          <Chip key={s.key} label={s.label} selected={s.key === section} onPress={() => onSection(s.key)} />
        ))}
      </View>
      {children}
    </Screen>
  );
}

export function Card({ children, onPress, label }: { children: React.ReactNode; onPress?: () => void; label?: string }) {
  const body = { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, gap: 10 };
  if (!onPress) return <View style={body}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [body, pressed && { opacity: 0.85 }]}
    >
      {children}
    </Pressable>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.42 }}>{(name.trim()[0] ?? '?').toUpperCase()}</Text>
    </View>
  );
}

const STATUS_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: 'Pending', bg: '#FDF3DC', fg: '#8A5A00' },
  accepted: { label: 'Confirmed', bg: '#DDF0EF', fg: colors.teal },
  completion_pending: { label: 'Awaiting confirmation', bg: '#FDF3DC', fg: '#8A5A00' },
  completed: { label: 'Completed', bg: '#DDF0EF', fg: colors.teal },
  declined: { label: 'Declined', bg: '#EEF0F0', fg: colors.inkSoft },
  cancelled: { label: 'Cancelled', bg: '#EEF0F0', fg: colors.inkSoft },
  closed: { label: 'Closed', bg: '#EEF0F0', fg: colors.inkSoft },
  disputed: { label: 'Disputed', bg: '#FBE6E9', fg: colors.stamp },
  active: { label: 'Active', bg: '#DDF0EF', fg: colors.teal },
  paused: { label: 'Paused', bg: '#FDF3DC', fg: '#8A5A00' },
  archived: { label: 'Deleted', bg: '#EEF0F0', fg: colors.inkSoft },
  removed: { label: 'Removed by moderator', bg: '#FBE6E9', fg: colors.stamp },
};

export function StatusBadge({ status }: { status: ExchangeStatus | RequestStatus | OfferStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: s.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: s.fg, fontSize: 12, fontWeight: '700' }}>{s.label}</Text>
    </View>
  );
}

export function InfoRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Ionicons name={icon} size={16} color={colors.inkSoft} />
      <Text style={[type.small, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

export function offerWhere(o: Pick<FitSwapOffer, 'delivery_mode' | 'general_location'>): string {
  if (o.delivery_mode === 'online') return 'Online';
  const area = o.general_location ?? 'Area not set';
  return o.delivery_mode === 'either' ? `Online or ${area}` : area;
}

export function offerSchedule(o: Pick<FitSwapOffer, 'availability_days' | 'time_windows' | 'availability_note'>): string {
  const days = o.availability_days.map((d) => d[0].toUpperCase() + d.slice(1)).join(', ');
  const windows = o.time_windows.join(' / ');
  return `${days} · ${windows}${o.availability_note ? ` · ${o.availability_note}` : ''}`;
}

export function OfferCard({
  offer,
  onPress,
  footer,
}: {
  offer: FitSwapOffer;
  onPress?: () => void;
  footer?: React.ReactNode;
}) {
  const name = offer.provider?.display_name ?? 'Member';
  const stats = offer.stats;
  return (
    <Card onPress={onPress} label={`${offer.title} by ${name}`}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Avatar name={name} />
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { fontWeight: '700' }]}>{name}</Text>
          <Text style={type.small}>{ratingSummary(stats?.completed_provided ?? 0, stats?.rating_count ?? 0, stats?.avg_rating ?? null)}</Text>
        </View>
      </View>
      <Text style={type.title}>{offer.title}</Text>
      <Text style={type.body} numberOfLines={3}>
        {offer.description}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip label={labelOf(CATEGORIES, offer.category)} />
        <Chip label={labelOf(SUPPORT_TYPES, offer.support_type)} />
        <Chip label={providerBadge(offer.provider_type, offer.qualification_verified)} />
      </View>
      <InfoRow icon="time-outline" text={`${offer.duration_minutes} min${offer.max_participants > 1 ? ` · up to ${offer.max_participants} people` : ''}`} />
      <InfoRow icon="location-outline" text={offerWhere(offer)} />
      <InfoRow icon="calendar-outline" text={offerSchedule(offer)} />
      {footer}
    </Card>
  );
}

export function SafetyNote({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, backgroundColor: '#EAF4F4', borderRadius: radius.md, padding: 12 }}>
      <Ionicons name="shield-checkmark-outline" size={18} color={colors.teal} />
      <Text style={[type.small, { flex: 1, color: colors.ink }]}>{text}</Text>
    </View>
  );
}

export function Field({
  label,
  error,
  hint,
  multiline,
  ...props
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.small, { fontWeight: '700', color: colors.ink }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.inkSoft}
        multiline={multiline}
        style={[s.input, multiline && { height: 96, paddingTop: 14, textAlignVertical: 'top' }, !!error && { borderColor: colors.stamp }]}
        {...props}
      />
      {hint && !error ? <Text style={type.small}>{hint}</Text> : null}
      {error ? <Text style={[type.small, { color: colors.stamp }]}>{error}</Text> : null}
    </View>
  );
}

/** Chip group for single or multiple selection. */
export function OptionChips({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label?: string;
  options: { value: string; label: string }[];
  value: string | string[];
  onChange: (v: string) => void;
  error?: string;
}) {
  const selected = (v: string) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <View style={{ gap: 8 }}>
      {label ? <Text style={[type.small, { fontWeight: '700', color: colors.ink }]}>{label}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => (
          <Chip key={o.value} label={o.label} selected={selected(o.value)} onPress={() => onChange(o.value)} />
        ))}
      </View>
      {error ? <Text style={[type.small, { color: colors.stamp }]}>{error}</Text> : null}
    </View>
  );
}

export function toggle(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** Inline report form, used from offers and sessions. */
export function ReportForm({
  reportedId,
  offerId = null,
  exchangeId = null,
  onDone,
}: {
  reportedId: string;
  offerId?: string | null;
  exchangeId?: string | null;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) return <Text style={[type.small, { color: colors.teal }]}>Thanks. Your report was sent to the moderators.</Text>;
  if (!open) return <Button variant="secondary" label="Report this member" onPress={() => setOpen(true)} />;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await reportMember(reportedId, offerId, exchangeId, reason, details);
      setSent(true);
      onDone?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <OptionChips label="What happened?" options={REPORT_REASONS} value={reason} onChange={setReason} />
      <Field label="Details (optional)" multiline maxLength={1000} value={details} onChangeText={setDetails} />
      <ErrorNote message={error} />
      <Button label="Send report" busy={busy} disabled={!reason} onPress={submit} />
      <Button variant="secondary" label="Cancel" onPress={() => setOpen(false)} />
    </View>
  );
}

export function InPersonSafety({ mode }: { mode: string }) {
  if (mode === 'online') return null;
  return <SafetyNote text={MEETING_SAFETY_NOTE} />;
}

export function useGo() {
  const router = useRouter();
  return {
    offer: (id: string) => router.push(`/fitswap/offer/${id}`),
    exchange: (id: string) => router.push(`/fitswap/exchange/${id}`),
    newOffer: () => router.push('/fitswap/offer-form'),
    editOffer: (id: string) => router.push({ pathname: '/fitswap/offer-form', params: { id } }),
  };
}

export const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const s = StyleSheet.create({
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    minHeight: 52,
    fontSize: 16,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
