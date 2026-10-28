import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Button, Chip, ErrorNote, Loading, Screen, Stamp } from '../../components/ui';
import { getMemberships, getProfile, getStamps, updateProfile } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { GOALS, colors, radius, type } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

export default function PassportTab() {
  const { userId } = useAuth();
  const { data, loading, error, refetch } = useAsync(async () => {
    const [profile, stamps, memberships] = await Promise.all([
      getProfile(userId!),
      getStamps(userId!),
      getMemberships(userId!),
    ]);
    return { profile, stamps, memberships };
  }, [userId]);

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setName(data.profile.display_name);
      setCity(data.profile.city ?? '');
      setGoals(data.profile.goals);
    }
  }, [data?.profile]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await updateProfile(userId!, { display_name: name.trim() || 'New member', city: city.trim() || null, goals });
      setSaved(true);
      await refetch();
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const toggleGoal = (g: string) => {
    setSaved(false);
    setGoals((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));
  };

  if (loading && !data) return <Loading />;

  const earnedIds = new Set(data?.stamps.map((s) => s.challenge.id));
  const inProgress = data?.memberships.filter((m) => !earnedIds.has(m.challenge.id)) ?? [];

  return (
    <Screen onRefresh={refetch}>
      <View style={{ gap: 4 }}>
        <Text style={type.small}>Fitness passport</Text>
        <Text style={type.display}>{data?.profile.display_name}</Text>
      </View>
      <ErrorNote message={error} />

      <View style={{ gap: 12 }}>
        <Text style={type.title}>Stamps ({data?.stamps.length ?? 0})</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, backgroundColor: colors.card, borderRadius: radius.lg, padding: 20, minHeight: 100 }}>
          {data?.stamps.map((s) => (
            <Stamp key={s.challenge.id} label={s.challenge.stamp_label} color={s.challenge.accent} date={s.earned_at} size={92} />
          ))}
          {inProgress.map((m) => (
            <Stamp key={m.challenge.id} label={m.challenge.stamp_label} color={m.challenge.accent} earned={false} size={92} />
          ))}
          {!data?.stamps.length && !inProgress.length && (
            <Text style={type.small}>Join a challenge to start filling your passport.</Text>
          )}
        </View>
      </View>

      <View style={{ gap: 12 }}>
        <Text style={type.title}>About you</Text>
        <TextInput
          value={name}
          onChangeText={(t) => { setName(t); setSaved(false); }}
          placeholder="Display name"
          placeholderTextColor={colors.inkSoft}
          style={inputStyle}
        />
        <TextInput
          value={city}
          onChangeText={(t) => { setCity(t); setSaved(false); }}
          placeholder="City"
          placeholderTextColor={colors.inkSoft}
          style={inputStyle}
        />
        <Text style={type.small}>Your goals help us find people on a similar path.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {GOALS.map((g) => (
            <Chip key={g} label={g} selected={goals.includes(g)} onPress={() => toggleGoal(g)} />
          ))}
        </View>
        <ErrorNote message={saveError} />
        <Button label={saved ? 'Saved' : 'Save changes'} onPress={save} busy={saving} disabled={saved} />
      </View>

      <Button variant="secondary" label="Sign out" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}

const inputStyle = {
  backgroundColor: colors.card,
  borderRadius: radius.md,
  paddingHorizontal: 16,
  height: 52,
  fontSize: 16,
  color: colors.ink,
  borderWidth: 1,
  borderColor: colors.line,
} as const;
