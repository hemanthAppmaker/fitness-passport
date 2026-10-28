import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Chip, ErrorNote, Loading, Screen, Stamp } from '../../components/ui';
import { getChallenges, getMemberships } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { colors, radius, type } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

export default function ChallengesTab() {
  const { userId } = useAuth();
  const router = useRouter();
  const { data, loading, error, refetch } = useAsync(async () => {
    const [challenges, memberships] = await Promise.all([getChallenges(), getMemberships(userId!)]);
    return { challenges, joined: new Map(memberships.map((m) => [m.challenge.id, m])) };
  }, [userId]);

  return (
    <Screen onRefresh={refetch}>
      <Text style={type.display}>Challenges</Text>
      <ErrorNote message={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        data?.challenges.map((c) => {
          const m = data.joined.get(c.id);
          return (
            <Pressable
              key={c.id}
              onPress={() => router.push(`/challenge/${c.id}`)}
              style={({ pressed }) => ({
                backgroundColor: colors.card,
                borderRadius: radius.lg,
                padding: 18,
                flexDirection: 'row',
                gap: 16,
                alignItems: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Stamp label={c.stamp_label} color={c.accent} earned={!!m?.completed_at} size={76} />
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={type.title}>{c.title}</Text>
                <Text style={type.small}>{c.subtitle}</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <Chip label={c.difficulty} />
                  <Chip label={`${c.milestones.length} milestones`} />
                  {m && <Chip label={m.completed_at ? 'Completed' : 'Joined'} selected />}
                </View>
                {c.sponsor && <Text style={type.small}>Sponsored by {c.sponsor}</Text>}
              </View>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}
