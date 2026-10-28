import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { Journey } from '../../components/journey';
import { Button, Empty, ErrorNote, Loading, Screen } from '../../components/ui';
import { getDoneMilestoneIds, getMemberships } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { colors, radius, type } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

export default function JourneyTab() {
  const { userId } = useAuth();
  const router = useRouter();

  const { data, loading, error, refetch } = useAsync(async () => {
    const [memberships, done] = await Promise.all([getMemberships(userId!), getDoneMilestoneIds(userId!)]);
    return { memberships, done };
  }, [userId]);

  const active = data?.memberships.filter((m) => !m.completed_at) ?? [];
  const current = active[0];
  const others = active.slice(1);
  const finished = data?.memberships.filter((m) => m.completed_at).length ?? 0;

  return (
    <Screen onRefresh={refetch} refreshing={false}>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorNote message={error} />
      ) : !current ? (
        <>
          <Text style={type.display}>Find your next challenge</Text>
          <Empty
            title={finished > 0 ? 'Every stamp collected' : 'No challenge yet'}
            body={
              finished > 0
                ? 'You finished all your challenges. Pick another to keep your streak going.'
                : 'Choose a challenge and we will turn it into milestones you can tick off.'
            }
            action={<Button label="Browse challenges" onPress={() => router.push('/challenges')} />}
          />
        </>
      ) : (
        <>
          <View style={{ gap: 6 }}>
            <Text style={type.small}>Your next chapter</Text>
            <Text style={type.display}>{current.challenge.subtitle}</Text>
          </View>

          <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: 18 }}>
            <Journey
              userId={userId!}
              challenge={current.challenge}
              done={data!.done}
              onChanged={refetch}
            />
          </View>

          {others.length > 0 && (
            <View style={{ gap: 10 }}>
              <Text style={type.title}>Also in progress</Text>
              {others.map((m) => (
                <Button
                  key={m.challenge.id}
                  variant="secondary"
                  label={m.challenge.title}
                  onPress={() => router.push(`/challenge/${m.challenge.id}`)}
                />
              ))}
            </View>
          )}

          <Button variant="secondary" label="Find people on this path" onPress={() => router.push('/people')} />
        </>
      )}
    </Screen>
  );
}
