import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Journey } from '../../components/journey';
import { MilestoneRow, Button, ErrorNote, Loading, Screen, Stamp } from '../../components/ui';
import { getChallenge, getDoneMilestoneIds, getMemberships, joinChallenge, leaveChallenge } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { colors, type } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

export default function ChallengeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, refetch } = useAsync(async () => {
    const [challenge, memberships, done] = await Promise.all([
      getChallenge(id),
      getMemberships(userId!),
      getDoneMilestoneIds(userId!),
    ]);
    return { challenge, joined: memberships.some((m) => m.challenge.id === id), done };
  }, [id, userId]);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await refetch();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <Loading />;
  if (!data) return <Screen edges={[]}><ErrorNote message={error ?? 'Challenge not found.'} /></Screen>;

  const { challenge, joined, done } = data;

  return (
    <Screen edges={[]}>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <Stamp label={challenge.stamp_label} color={challenge.accent} earned={false} size={96} />
        <Text style={[type.display, { textAlign: 'center' }]}>{challenge.title}</Text>
        <Text style={[type.body, { textAlign: 'center', color: colors.inkSoft }]}>{challenge.description}</Text>
        {challenge.sponsor && <Text style={type.small}>Sponsored by {challenge.sponsor}</Text>}
      </View>

      <ErrorNote message={actionError ?? error} />

      {joined ? (
        <>
          <Journey userId={userId!} challenge={challenge} done={done} onChanged={refetch} />
          <Button
            variant="secondary"
            label="Leave challenge"
            busy={busy}
            onPress={() => act(() => leaveChallenge(userId!, challenge.id))}
          />
        </>
      ) : (
        <>
          <View>
            {challenge.milestones.map((m) => (
              <MilestoneRow key={m.id} title={m.title} description={m.description} done={false} accent={challenge.accent} />
            ))}
          </View>
          <Button label="Join this challenge" busy={busy} onPress={() => act(() => joinChallenge(userId!, challenge.id))} />
        </>
      )}
    </Screen>
  );
}
