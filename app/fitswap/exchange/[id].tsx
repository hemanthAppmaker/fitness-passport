import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import {
  Card,
  Field,
  fmtWhen,
  InfoRow,
  InPersonSafety,
  offerWhere,
  OptionChips,
  ReportForm,
  StatusBadge,
} from '../../../components/fitswap';
import { Button, ErrorNote, Loading, Screen } from '../../../components/ui';
import { exchangeActions, REPORT_REASONS } from '../../../lib/fitswap';
import {
  cancelExchange,
  confirmCompletion,
  disputeExchange,
  getExchange,
  markDelivered,
  submitFeedback,
} from '../../../lib/fitswapApi';
import { useAuth } from '../../../lib/auth';
import { colors, type } from '../../../lib/theme';
import { useAsync } from '../../../lib/useAsync';

export default function ExchangeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const { data, loading, error, refetch } = useAsync(() => getExchange(id), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setActionError(null);
    try {
      await fn();
      await refetch();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) return <Loading />;
  if (!data) return <Screen edges={[]}><ErrorNote message={error ?? 'Session not found.'} /></Screen>;

  const { exchange: e, feedback } = data;
  const role = e.provider_id === userId ? 'provider' : 'recipient';
  const other = role === 'provider' ? e.recipient : e.provider;
  const mine = feedback.find((f) => f.reviewer_id === userId);
  const theirs = feedback.find((f) => f.reviewed_user_id === userId);
  const actions = exchangeActions(e.status, role, e.scheduled_start_at, !!mine);

  function confirmCancel() {
    Alert.alert('Cancel this session?', `${other.display_name} will be notified in their exchanges list.`, [
      { text: 'Keep session', style: 'cancel' },
      { text: 'Cancel session', style: 'destructive', onPress: () => act('cancel', () => cancelExchange(e.id, '')) },
    ]);
  }

  return (
    <Screen edges={[]}>
      <View style={{ gap: 8 }}>
        <StatusBadge status={e.status} />
        <Text style={type.display}>{e.offer?.title ?? 'Session'}</Text>
        <Text style={type.body}>
          {role === 'provider' ? `You are helping ${other.display_name}` : `${other.display_name} is helping you`}
        </Text>
      </View>

      <Card>
        <InfoRow icon="calendar-outline" text={fmtWhen(e.scheduled_start_at)} />
        <InfoRow icon="time-outline" text={`${e.duration_minutes} min`} />
        {e.offer && <InfoRow icon="location-outline" text={offerWhere(e.offer)} />}
        {e.cancel_reason ? <InfoRow icon="information-circle-outline" text={`Reason: ${e.cancel_reason}`} /> : null}
      </Card>

      {e.offer && (e.status === 'accepted' || e.status === 'completion_pending') && <InPersonSafety mode={e.offer.delivery_mode} />}
      <ErrorNote message={actionError ?? error} />

      {actions.includes('mark_delivered') && (
        <Button label="Mark session as done" busy={busy === 'mark'} onPress={() => act('mark', () => markDelivered(e.id))} />
      )}
      {e.status === 'completion_pending' && role === 'provider' && (
        <Text style={type.small}>Waiting for {other.display_name} to confirm the session happened.</Text>
      )}
      {actions.includes('confirm') && (
        <Button label="Confirm it happened" busy={busy === 'confirm'} onPress={() => act('confirm', () => confirmCompletion(e.id))} />
      )}
      {actions.includes('cancel') && <Button variant="secondary" label="Cancel session" busy={busy === 'cancel'} onPress={confirmCancel} />}

      {actions.includes('dispute') && !disputing && (
        <Button variant="secondary" label="Something went wrong" onPress={() => setDisputing(true)} />
      )}
      {disputing && (
        <Card>
          <Text style={type.title}>Report a problem with this session</Text>
          <Text style={type.small}>Moderators will review. The session is paused until they decide.</Text>
          <OptionChips options={REPORT_REASONS} value={reason} onChange={setReason} />
          <Field label="Details (optional)" multiline maxLength={1000} value={details} onChangeText={setDetails} />
          <Button label="Submit dispute" busy={busy === 'dispute'} disabled={!reason} onPress={() => act('dispute', () => disputeExchange(e.id, reason, details))} />
          <Button variant="secondary" label="Cancel" onPress={() => setDisputing(false)} />
        </Card>
      )}
      {e.status === 'disputed' && <Text style={type.small}>This session is under review by the moderators.</Text>}

      {e.status === 'completed' && (
        <View style={{ gap: 12 }}>
          <Text style={type.title}>Feedback</Text>
          {mine ? (
            <Text style={type.small}>You gave {mine.rating}/5{mine.comment ? `: “${mine.comment}”` : ''}.</Text>
          ) : (
            <Card>
              <Text style={type.small}>How was it? Feedback stays hidden from {other.display_name} until you have both left some.</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Button
                    key={n}
                    label={n <= rating ? '★' : '☆'}
                    variant={n <= rating ? 'primary' : 'secondary'}
                    onPress={() => setRating(n)}
                    style={{ flex: 1, paddingHorizontal: 0 }}
                  />
                ))}
              </View>
              <Field label="Comment (optional)" multiline maxLength={500} value={comment} onChangeText={setComment} />
              <Button label="Submit feedback" busy={busy === 'fb'} disabled={rating === 0} onPress={() => act('fb', () => submitFeedback(e.id, rating, comment))} />
            </Card>
          )}
          {theirs && (
            <Card>
              <Text style={[type.small, { color: colors.ink, fontWeight: '700' }]}>From {other.display_name}</Text>
              <Text style={type.body}>{'★'.repeat(theirs.rating)}{'☆'.repeat(5 - theirs.rating)}</Text>
              {theirs.comment ? <Text style={type.body}>{theirs.comment}</Text> : null}
            </Card>
          )}
        </View>
      )}

      <ReportForm reportedId={other.id} offerId={e.offer_id} exchangeId={e.id} />
    </Screen>
  );
}
