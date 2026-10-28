import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import {
  CATEGORIES,
  contributionMilestones,
  DURATIONS,
  DAYS,
  groupExchanges,
  PEER_SUPPORT_NOTE,
  SUPPORT_TYPES,
  WINDOWS,
} from '../lib/fitswap';
import {
  cancelRequest,
  discoverOffers,
  DiscoverFilters,
  getContributions,
  getMyExchangeData,
  getMyOffers,
  respondToRequest,
  setOfferStatus,
} from '../lib/fitswapApi';
import { useAuth } from '../lib/auth';
import { colors, type } from '../lib/theme';
import { useAsync } from '../lib/useAsync';
import {
  Card,
  fmtWhen,
  FitSwapShell,
  InfoRow,
  OfferCard,
  OptionChips,
  SafetyNote,
  SectionKey,
  StatusBadge,
  useGo,
  Field,
} from './fitswap';
import { Button, Empty, ErrorNote, Loading } from './ui';

type ShellProps = { section: SectionKey; onSection: (s: SectionKey) => void };

// ---------- Discover ----------
const ANY = [{ value: '', label: 'Any' }];
const MODE_FILTER = [...ANY, { value: 'online', label: 'Online' }, { value: 'in_person', label: 'In person' }];

export function DiscoverSection(shell: ShellProps) {
  const { userId } = useAuth();
  const go = useGo();
  const [filters, setFilters] = useState<DiscoverFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const key = JSON.stringify(filters);
  const { data, loading, error, refetch } = useAsync(() => discoverOffers(userId!, filters), [userId, key]);
  const set = (patch: Partial<DiscoverFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const active = Object.values(filters).filter(Boolean).length;

  return (
    <FitSwapShell {...shell} onRefresh={refetch}>
      <Button
        variant="secondary"
        label={showFilters ? 'Hide filters' : `Filters${active ? ` (${active})` : ''}`}
        onPress={() => setShowFilters((v) => !v)}
      />
      {showFilters && (
        <Card>
          <OptionChips label="Category" options={[...ANY, ...CATEGORIES]} value={filters.category ?? ''} onChange={(v) => set({ category: v || undefined })} />
          <OptionChips label="Type" options={[...ANY, ...SUPPORT_TYPES]} value={filters.supportType ?? ''} onChange={(v) => set({ supportType: v || undefined })} />
          <OptionChips label="Online or in person" options={MODE_FILTER} value={filters.delivery ?? ''} onChange={(v) => set({ delivery: (v || undefined) as DiscoverFilters['delivery'] })} />
          <OptionChips
            label="Session length"
            options={[...ANY, ...DURATIONS.map((d) => ({ value: String(d), label: `${d} min` }))]}
            value={filters.durationMinutes ? String(filters.durationMinutes) : ''}
            onChange={(v) => set({ durationMinutes: v ? Number(v) : undefined })}
          />
          <OptionChips label="Day" options={[...ANY, ...DAYS]} value={filters.day ?? ''} onChange={(v) => set({ day: v || undefined })} />
          <OptionChips label="Time of day" options={[...ANY, ...WINDOWS]} value={filters.window ?? ''} onChange={(v) => set({ window: v || undefined })} />
          <Field label="Area" placeholder="e.g. Riverside" value={filters.location ?? ''} onChangeText={(v) => set({ location: v })} />
          {active > 0 && <Button variant="secondary" label="Clear filters" onPress={() => setFilters({})} />}
        </Card>
      )}
      <ErrorNote message={error} />
      {error && <Button variant="secondary" label="Retry" onPress={refetch} />}
      {loading && !data ? (
        <Loading />
      ) : !error && data?.length === 0 ? (
        <Empty
          title={active ? 'No offers match' : 'No offers yet'}
          body={active ? 'Try removing a filter.' : 'Be the first to share something. Every member has something to give.'}
          action={!active ? <Button label="Offer help" onPress={() => shell.onSection('offer')} /> : undefined}
        />
      ) : (
        data?.map((o) => (
          <OfferCard
            key={o.id}
            offer={o}
            onPress={() => go.offer(o.id)}
            footer={<Button label="Request a session" onPress={() => go.offer(o.id)} />}
          />
        ))
      )}
    </FitSwapShell>
  );
}

// ---------- Offer help ----------
export function OfferHelpSection(shell: ShellProps) {
  const { userId } = useAuth();
  const go = useGo();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, loading, error, refetch } = useAsync(() => getMyOffers(userId!), [userId]);

  async function act(id: string, status: 'active' | 'paused' | 'archived') {
    setBusyId(id);
    setActionError(null);
    try {
      await setOfferStatus(id, status);
      await refetch();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  function confirmDelete(id: string) {
    Alert.alert('Delete this offer?', 'Pending requests will be declined. Confirmed sessions are kept.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => act(id, 'archived') },
    ]);
  }

  return (
    <FitSwapShell {...shell} onRefresh={refetch}>
      <SafetyNote text={PEER_SUPPORT_NOTE} />
      <Button label="Create an offer" onPress={go.newOffer} />
      <ErrorNote message={actionError ?? error} />
      {error && <Button variant="secondary" label="Retry" onPress={refetch} />}
      {loading && !data ? (
        <Loading />
      ) : !error && data?.length === 0 ? (
        <Empty title="You have no offers" body="Share a run, a stretch routine, or just your time. Beginners are welcome to offer too." />
      ) : (
        data?.map((o) => (
          <OfferCard
            key={o.id}
            offer={o}
            footer={
              <View style={{ gap: 10 }}>
                <StatusBadge status={o.status} />
                {o.status !== 'removed' && (
                  <>
                    <Button variant="secondary" label="Edit" onPress={() => go.editOffer(o.id)} />
                    {o.status === 'active' ? (
                      <Button variant="secondary" label="Pause" busy={busyId === o.id} onPress={() => act(o.id, 'paused')} />
                    ) : (
                      <Button variant="secondary" label="Reactivate" busy={busyId === o.id} onPress={() => act(o.id, 'active')} />
                    )}
                    <Button variant="secondary" label="Delete" onPress={() => confirmDelete(o.id)} />
                  </>
                )}
              </View>
            }
          />
        ))
      )}
    </FitSwapShell>
  );
}

// ---------- My exchanges ----------
export function ExchangesSection(shell: ShellProps) {
  const { userId } = useAuth();
  const go = useGo();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, loading, error, refetch } = useAsync(() => getMyExchangeData(userId!), [userId]);

  async function act(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    setActionError(null);
    try {
      await fn();
      await refetch();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  const groups = data ? groupExchanges(data.requests, data.exchanges, userId!) : [];

  return (
    <FitSwapShell {...shell} onRefresh={refetch}>
      <ErrorNote message={actionError ?? error} />
      {error && <Button variant="secondary" label="Retry" onPress={refetch} />}
      {loading && !data ? (
        <Loading />
      ) : !error && groups.length === 0 ? (
        <Empty
          title="No exchanges yet"
          body="Request a session from someone's offer, or publish your own."
          action={<Button label="Browse offers" onPress={() => shell.onSection('discover')} />}
        />
      ) : (
        groups.map((g) => (
          <View key={g.key} style={{ gap: 10 }}>
            <Text style={type.title}>{g.title}</Text>
            {g.items.map((item) => {
              if (item.kind === 'exchange') {
                const e = item.exchange;
                const other = e.provider_id === userId ? e.recipient : e.provider;
                return (
                  <Card key={e.id} onPress={() => go.exchange(e.id)} label={`Session with ${other.display_name}`}>
                    <StatusBadge status={e.status} />
                    <Text style={[type.body, { fontWeight: '700' }]}>{e.offer?.title ?? 'Session'}</Text>
                    <Text style={type.small}>
                      {e.provider_id === userId ? 'You are helping' : 'You are being helped by'} {other.display_name}
                    </Text>
                    <InfoRow icon="calendar-outline" text={`${fmtWhen(e.scheduled_start_at)} · ${e.duration_minutes} min`} />
                  </Card>
                );
              }
              const r = item.request;
              const mine = r.requester_id === userId;
              return (
                <Card key={r.id} onPress={r.offer ? () => go.offer(r.offer_id) : undefined} label="Request details">
                  <StatusBadge status={r.status} />
                  <Text style={[type.body, { fontWeight: '700' }]}>{r.offer?.title ?? 'Offer no longer listed'}</Text>
                  <Text style={type.small}>
                    {mine ? `Requested from ${r.provider.display_name}` : `${r.requester.display_name} would like a session`}
                  </Text>
                  <InfoRow icon="calendar-outline" text={fmtWhen(r.requested_start_at)} />
                  {r.message ? <Text style={type.body}>“{r.message}”</Text> : null}
                  {r.goal_note ? <Text style={type.small}>Goal: {r.goal_note}</Text> : null}
                  {r.status === 'pending' && !mine && (
                    <View style={{ gap: 8 }}>
                      <Button label="Accept" busy={busyId === r.id} onPress={() => act(r.id, () => respondToRequest(r.id, true))} />
                      <Button variant="secondary" label="Decline" disabled={busyId === r.id} onPress={() => act(r.id, () => respondToRequest(r.id, false))} />
                    </View>
                  )}
                  {r.status === 'pending' && mine && (
                    <Button variant="secondary" label="Withdraw request" busy={busyId === r.id} onPress={() => act(r.id, () => cancelRequest(r.id))} />
                  )}
                </Card>
              );
            })}
          </View>
        ))
      )}
    </FitSwapShell>
  );
}

// ---------- My contributions ----------
export function ContributionsSection(shell: ShellProps) {
  const { userId } = useAuth();
  const { data, loading, error, refetch } = useAsync(() => getContributions(userId!), [userId]);
  const stats = data?.stats;
  const completed = (stats?.completed_provided ?? 0) + (stats?.completed_received ?? 0);

  const tiles = [
    { label: 'Active offers', value: data?.activeOffers ?? 0 },
    { label: 'Help provided', value: stats?.completed_provided ?? 0 },
    { label: 'Help received', value: stats?.completed_received ?? 0 },
    { label: 'Minutes shared', value: stats?.minutes_provided ?? 0 },
  ];

  return (
    <FitSwapShell {...shell} onRefresh={refetch}>
      <ErrorNote message={error} />
      {error && <Button variant="secondary" label="Retry" onPress={refetch} />}
      {loading && !data ? (
        <Loading />
      ) : data ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {tiles.map((t) => (
              <View key={t.label} style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: colors.card, borderRadius: 22, padding: 16, gap: 2 }}>
                <Text style={type.display}>{t.value}</Text>
                <Text style={type.small}>{t.label}</Text>
              </View>
            ))}
          </View>

          <View style={{ gap: 10 }}>
            <Text style={type.title}>Milestones</Text>
            {contributionMilestones(completed).map((m) => (
              <Card key={m.count}>
                <Text style={[type.body, { fontWeight: '700', color: m.reached ? colors.teal : colors.inkSoft }]}>
                  {m.reached ? '✓ ' : ''}
                  {m.title}
                </Text>
                <Text style={type.small}>{m.body}</Text>
              </Card>
            ))}
          </View>

          <View style={{ gap: 10 }}>
            <Text style={type.title}>Feedback you received</Text>
            {data.feedback.length === 0 ? (
              <Empty title="No feedback yet" body="Feedback appears after a completed session, once you have left yours too." />
            ) : (
              data.feedback.map((f) => (
                <Card key={f.id}>
                  <Text style={[type.body, { fontWeight: '700' }]}>{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</Text>
                  {f.comment ? <Text style={type.body}>{f.comment}</Text> : null}
                  <Text style={type.small}>{new Date(f.created_at).toLocaleDateString()}</Text>
                </Card>
              ))
            )}
          </View>
        </>
      ) : null}
    </FitSwapShell>
  );
}
