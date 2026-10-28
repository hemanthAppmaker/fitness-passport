import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { setMilestone } from '../lib/api';
import { colors, type } from '../lib/theme';
import type { Challenge } from '../lib/types';
import { ErrorNote, MilestoneRow, SegmentedProgress, Stamp } from './ui';

/** Progress header + tappable milestone list for one challenge the user has joined. */
export function Journey({
  userId,
  challenge,
  done,
  onChanged,
}: {
  userId: string;
  challenge: Challenge;
  done: Set<string>;
  onChanged: () => void | Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = challenge.milestones.length;
  const count = challenge.milestones.filter((m) => done.has(m.id)).length;
  const complete = total > 0 && count === total;

  async function toggle(milestoneId: string) {
    setBusyId(milestoneId);
    setError(null);
    try {
      await setMilestone(userId, milestoneId, !done.has(milestoneId));
      await onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={type.small}>Your progress</Text>
          <Text style={[type.small, { color: colors.ink, fontWeight: '700' }]}>
            {count} of {total} milestones
          </Text>
        </View>
        <SegmentedProgress total={total} done={count} color={challenge.accent} />
      </View>

      {complete && (
        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
          <Stamp label={challenge.stamp_label} color={challenge.accent} date={new Date().toISOString()} />
          <Text style={[type.body, { fontWeight: '700' }]}>Passport stamp unlocked</Text>
        </View>
      )}

      <ErrorNote message={error} />

      <View>
        {challenge.milestones.map((m) => (
          <MilestoneRow
            key={m.id}
            title={m.title}
            description={m.description}
            done={done.has(m.id)}
            accent={challenge.accent}
            busy={busyId === m.id}
            onPress={() => toggle(m.id)}
          />
        ))}
      </View>
    </View>
  );
}
