import { supabase } from './supabase';
import type { Challenge, ConnectionRow, Membership, Person, Profile, StampRow } from './types';

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const CHALLENGE_SELECT = '*, milestones(*)';

function sortMilestones(c: Challenge): Challenge {
  return { ...c, milestones: [...(c.milestones ?? [])].sort((a, b) => a.position - b.position) };
}

export async function getChallenges(): Promise<Challenge[]> {
  const rows = check(await supabase.from('challenges').select(CHALLENGE_SELECT).order('sort_order'));
  return (rows as Challenge[]).map(sortMilestones);
}

export async function getChallenge(id: string): Promise<Challenge> {
  const row = check(await supabase.from('challenges').select(CHALLENGE_SELECT).eq('id', id).single());
  return sortMilestones(row as unknown as Challenge);
}

export async function getMemberships(userId: string): Promise<Membership[]> {
  const rows = check(
    await supabase
      .from('challenge_members')
      .select(`joined_at, completed_at, challenge:challenges(${CHALLENGE_SELECT})`)
      .eq('user_id', userId)
      .order('joined_at', { ascending: false }),
  );
  return (rows as unknown as Membership[]).map((m) => ({ ...m, challenge: sortMilestones(m.challenge) }));
}

export async function getDoneMilestoneIds(userId: string): Promise<Set<string>> {
  const rows = check(await supabase.from('milestone_progress').select('milestone_id').eq('user_id', userId));
  return new Set((rows as { milestone_id: string }[]).map((r) => r.milestone_id));
}

export async function joinChallenge(userId: string, challengeId: string) {
  const { error } = await supabase
    .from('challenge_members')
    .upsert({ user_id: userId, challenge_id: challengeId }, { onConflict: 'user_id,challenge_id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

export async function leaveChallenge(userId: string, challengeId: string) {
  const { error } = await supabase.from('challenge_members').delete().eq('user_id', userId).eq('challenge_id', challengeId);
  if (error) throw new Error(error.message);
}

export async function setMilestone(userId: string, milestoneId: string, done: boolean) {
  const q = done
    ? supabase.from('milestone_progress').insert({ user_id: userId, milestone_id: milestoneId })
    : supabase.from('milestone_progress').delete().eq('user_id', userId).eq('milestone_id', milestoneId);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

export async function getStamps(userId: string): Promise<StampRow[]> {
  const rows = check(
    await supabase
      .from('stamps')
      .select(`earned_at, challenge:challenges(${CHALLENGE_SELECT})`)
      .eq('user_id', userId)
      .order('earned_at', { ascending: false }),
  );
  return rows as unknown as StampRow[];
}

export async function getProfile(userId: string): Promise<Profile> {
  return check(await supabase.from('profiles').select('*').eq('id', userId).single()) as Profile;
}

export async function updateProfile(userId: string, patch: Partial<Pick<Profile, 'display_name' | 'city' | 'bio' | 'goals'>>) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function discoverPeople(): Promise<Person[]> {
  return check(await supabase.rpc('discover_people')) as Person[];
}

export async function getConnections(): Promise<ConnectionRow[]> {
  const rows = check(
    await supabase
      .from('connections')
      .select('*, requester:profiles!requester_id(id, display_name, city), addressee:profiles!addressee_id(id, display_name, city)'),
  );
  return rows as unknown as ConnectionRow[];
}

export async function requestConnection(userId: string, otherId: string) {
  const { error } = await supabase.from('connections').insert({ requester_id: userId, addressee_id: otherId });
  if (error) throw new Error(error.message);
}

export async function acceptConnection(id: string) {
  const { error } = await supabase.from('connections').update({ status: 'accepted' }).eq('id', id);
  if (error) throw new Error(error.message);
}
