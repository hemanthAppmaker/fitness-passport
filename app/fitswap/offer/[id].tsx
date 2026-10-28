import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import {
  Avatar,
  Card,
  Field,
  fmtWhen,
  InfoRow,
  InPersonSafety,
  offerSchedule,
  offerWhere,
  OptionChips,
  ReportForm,
  SafetyNote,
  StatusBadge,
  useGo,
} from '../../../components/fitswap';
import { Button, Chip, ErrorNote, Loading, Screen } from '../../../components/ui';
import {
  availableDates,
  availableSlots,
  CATEGORIES,
  labelOf,
  PEER_SUPPORT_NOTE,
  providerBadge,
  ratingSummary,
  slotToIso,
  SUPPORT_TYPES,
} from '../../../lib/fitswap';
import { getOffer, requestOffer } from '../../../lib/fitswapApi';
import { useAuth } from '../../../lib/auth';
import { colors, type } from '../../../lib/theme';
import { useAsync } from '../../../lib/useAsync';

export default function OfferDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const router = useRouter();
  const go = useGo();
  const { data: offer, loading, error } = useAsync(() => getOffer(id), [id]);

  const [dateIdx, setDateIdx] = useState<number | null>(null);
  const [time, setTime] = useState('');
  const [message, setMessage] = useState('');
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (loading && !offer) return <Loading />;
  if (!offer) return <Screen edges={[]}><ErrorNote message={error ?? 'Offer not found.'} /></Screen>;

  const name = offer.provider?.display_name ?? 'Member';
  const own = offer.user_id === userId;
  const dates = availableDates(offer.availability_days);
  const slots = availableSlots(offer.time_windows);
  const stats = offer.stats;
  const chosen = dateIdx != null && time ? slotToIso(dates[dateIdx], time) : null;

  async function submit() {
    if (!chosen) {
      setSubmitError('Choose a date and a time at least one hour from now.');
      return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      await requestOffer(offer!.id, chosen, message, goal);
      setSent(true);
    } catch (e: any) {
      setSubmitError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={[]}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Avatar name={name} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={[type.title]}>{name}</Text>
          <Text style={type.small}>{ratingSummary(stats?.completed_provided ?? 0, stats?.rating_count ?? 0, stats?.avg_rating ?? null)}</Text>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={type.display}>{offer.title}</Text>
        {offer.status !== 'active' && <StatusBadge status={offer.status} />}
        <Text style={type.body}>{offer.description}</Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip label={labelOf(CATEGORIES, offer.category)} />
        <Chip label={labelOf(SUPPORT_TYPES, offer.support_type)} />
        <Chip label={providerBadge(offer.provider_type, offer.qualification_verified)} />
      </View>

      <Card>
        <InfoRow icon="time-outline" text={`${offer.duration_minutes} min${offer.max_participants > 1 ? ` · up to ${offer.max_participants} people` : ''}`} />
        <InfoRow icon="location-outline" text={offerWhere(offer)} />
        <InfoRow icon="calendar-outline" text={offerSchedule(offer)} />
        {offer.prerequisites ? <InfoRow icon="checkmark-circle-outline" text={`Good to have: ${offer.prerequisites}`} /> : null}
        {offer.provider_type === 'professional' && offer.qualifications ? (
          <InfoRow icon="ribbon-outline" text={`${offer.qualifications}${offer.qualification_verified ? '' : ' (not verified)'}`} />
        ) : null}
      </Card>

      {offer.provider_type === 'peer' && <SafetyNote text={PEER_SUPPORT_NOTE} />}
      <InPersonSafety mode={offer.delivery_mode} />

      {own ? (
        <Button label="Edit your offer" variant="secondary" onPress={() => go.editOffer(offer.id)} />
      ) : offer.status !== 'active' ? (
        <Text style={type.small}>This offer is not currently accepting requests.</Text>
      ) : sent ? (
        <Card>
          <Text style={type.title}>Request sent</Text>
          <Text style={type.body}>{name} will accept or decline. You will find it under My exchanges.</Text>
          <Button label="Done" onPress={() => router.back()} />
        </Card>
      ) : (
        <View style={{ gap: 14 }}>
          <Text style={type.title}>Request a session</Text>
          {dates.length === 0 ? (
            <Text style={type.small}>No upcoming dates match this offer's availability.</Text>
          ) : (
            <>
              <OptionChips
                label="Preferred date"
                options={dates.map((d, i) => ({
                  value: String(i),
                  label: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
                }))}
                value={dateIdx == null ? '' : String(dateIdx)}
                onChange={(v) => setDateIdx(Number(v))}
              />
              <OptionChips label="Preferred time" options={slots.map((t) => ({ value: t, label: t }))} value={time} onChange={setTime} />
            </>
          )}
          {chosen && <Text style={[type.small, { color: colors.teal }]}>Requesting {fmtWhen(chosen)}</Text>}
          <Field label="Introduce yourself (optional)" multiline maxLength={500} value={message} onChangeText={setMessage} placeholder="A little about you" />
          <Field label="Your goal (optional)" maxLength={300} value={goal} onChangeText={setGoal} placeholder="e.g. Run 5K without stopping" />
          <ErrorNote message={submitError} />
          <Button label="Send request" busy={busy} disabled={dates.length === 0} onPress={submit} />
        </View>
      )}

      {!own && <ReportForm reportedId={offer.user_id} offerId={offer.id} />}
    </Screen>
  );
}
