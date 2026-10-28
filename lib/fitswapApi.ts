import type { OfferInput } from './fitswap';
import { supabase } from './supabase';
import type { FitSwapExchange, FitSwapFeedback, FitSwapOffer, FitSwapRequest, MemberStats } from './types';

// All FitSwap writes go through database functions (see supabase/fitswap.sql) that validate input
// and every status change. The client never sets a status, a verification flag, or a count.

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

const OFFER_SELECT = '*, provider:profiles!user_id(display_name, city)';

async function withStats(offers: Omit<FitSwapOffer, 'stats'>[]): Promise<FitSwapOffer[]> {
  if (offers.length === 0) return [];
  const ids = [...new Set(offers.map((o) => o.user_id))];
  const stats = check(await supabase.from('fitswap_member_stats').select('*').in('user_id', ids)) as MemberStats[];
  const byUser = new Map(stats.map((s) => [s.user_id, s]));
  return offers.map((o) => ({ ...o, stats: byUser.get(o.user_id) ?? null }));
}

// ---------- Discover ----------
export type DiscoverFilters = {
  category?: string;
  supportType?: string;
  delivery?: 'online' | 'in_person';
  durationMinutes?: number;
  day?: string;
  window?: string;
  location?: string;
};

export async function discoverOffers(userId: string, f: DiscoverFilters): Promise<FitSwapOffer[]> {
  let q = supabase
    .from('fitswap_offers')
    .select(OFFER_SELECT)
    .eq('status', 'active')
    .neq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (f.category) q = q.eq('category', f.category);
  if (f.supportType) q = q.eq('support_type', f.supportType);
  if (f.delivery) q = q.in('delivery_mode', [f.delivery, 'either']);
  if (f.durationMinutes) q = q.eq('duration_minutes', f.durationMinutes);
  if (f.day) q = q.overlaps('availability_days', [f.day]);
  if (f.window) q = q.overlaps('time_windows', [f.window]);
  const loc = f.location?.replace(/[%_,()\\]/g, ' ').trim();
  if (loc) q = q.ilike('general_location', `%${loc}%`);
  return withStats(check(await q) as unknown as Omit<FitSwapOffer, 'stats'>[]);
}

export async function getOffer(id: string): Promise<FitSwapOffer> {
  const row = check(await supabase.from('fitswap_offers').select(OFFER_SELECT).eq('id', id).single());
  return (await withStats([row as unknown as Omit<FitSwapOffer, 'stats'>]))[0];
}

// ---------- Offers ----------
export async function getMyOffers(userId: string): Promise<FitSwapOffer[]> {
  const rows = check(
    await supabase
      .from('fitswap_offers')
      .select(OFFER_SELECT)
      .eq('user_id', userId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false }),
  );
  return withStats(rows as unknown as Omit<FitSwapOffer, 'stats'>[]);
}

export async function saveOffer(id: string | null, o: OfferInput): Promise<string> {
  return (await rpc('fitswap_save_offer', {
    p_id: id,
    p_title: o.title,
    p_description: o.description,
    p_category: o.category,
    p_support_type: o.supportType,
    p_duration_minutes: o.durationMinutes,
    p_delivery_mode: o.deliveryMode,
    p_general_location: o.generalLocation,
    p_availability_days: o.availabilityDays,
    p_time_windows: o.timeWindows,
    p_availability_note: o.availabilityNote,
    p_max_participants: o.maxParticipants,
    p_prerequisites: o.prerequisites,
    p_provider_type: o.providerType,
    p_qualifications: o.qualifications,
  })) as string;
}

export const setOfferStatus = (id: string, status: 'active' | 'paused' | 'archived') =>
  rpc('fitswap_set_offer_status', { p_id: id, p_status: status }).then(() => undefined);

// ---------- Requests and exchanges ----------
export const requestOffer = (offerId: string, startAtIso: string, message: string, goal: string) =>
  rpc('fitswap_request_offer', { p_offer: offerId, p_start: startAtIso, p_message: message, p_goal: goal });

export const respondToRequest = (requestId: string, accept: boolean) =>
  rpc('fitswap_respond_request', { p_request: requestId, p_accept: accept }).then(() => undefined);

export const cancelRequest = (requestId: string) =>
  rpc('fitswap_cancel_request', { p_request: requestId }).then(() => undefined);

const REQUEST_SELECT =
  '*, requester:profiles!requester_id(id, display_name), provider:profiles!provider_id(id, display_name), offer:fitswap_offers(id, title, delivery_mode, general_location)';
const EXCHANGE_SELECT =
  '*, provider:profiles!provider_id(id, display_name), recipient:profiles!recipient_id(id, display_name), offer:fitswap_offers(id, title, delivery_mode, general_location)';

export async function getMyExchangeData(userId: string) {
  const [requests, exchanges] = await Promise.all([
    supabase.from('fitswap_requests').select(REQUEST_SELECT).order('requested_start_at'),
    supabase.from('fitswap_exchanges').select(EXCHANGE_SELECT).order('scheduled_start_at'),
  ]);
  const reqs = check(requests) as unknown as FitSwapRequest[];
  // Accepted requests are represented by their exchange.
  return {
    requests: reqs.filter((r) => r.status !== 'accepted' && r.status !== 'closed'),
    exchanges: check(exchanges) as unknown as FitSwapExchange[],
    userId,
  };
}

export async function getExchange(id: string) {
  const [ex, fb] = await Promise.all([
    supabase.from('fitswap_exchanges').select(EXCHANGE_SELECT).eq('id', id).single(),
    supabase.from('fitswap_feedback').select('*').eq('exchange_id', id),
  ]);
  return {
    exchange: check(ex) as unknown as FitSwapExchange,
    feedback: check(fb) as FitSwapFeedback[],
  };
}

export const markDelivered = (id: string) => rpc('fitswap_mark_delivered', { p_exchange: id }).then(() => undefined);
export const confirmCompletion = (id: string) => rpc('fitswap_confirm_completion', { p_exchange: id }).then(() => undefined);
export const cancelExchange = (id: string, reason: string) =>
  rpc('fitswap_cancel_exchange', { p_exchange: id, p_reason: reason }).then(() => undefined);
export const disputeExchange = (id: string, reason: string, details: string) =>
  rpc('fitswap_dispute_exchange', { p_exchange: id, p_reason: reason, p_details: details }).then(() => undefined);
export const submitFeedback = (id: string, rating: number, comment: string) =>
  rpc('fitswap_submit_feedback', { p_exchange: id, p_rating: rating, p_comment: comment }).then(() => undefined);
export const reportMember = (reportedId: string, offerId: string | null, exchangeId: string | null, reason: string, details: string) =>
  rpc('fitswap_report', {
    p_reported: reportedId,
    p_offer: offerId,
    p_exchange: exchangeId,
    p_reason: reason,
    p_details: details,
  }).then(() => undefined);

// ---------- Contributions ----------
export async function getContributions(userId: string) {
  const [stats, offers, feedback] = await Promise.all([
    supabase.from('fitswap_member_stats').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('fitswap_offers').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'active'),
    supabase.from('fitswap_feedback').select('*').eq('reviewed_user_id', userId).order('created_at', { ascending: false }).limit(20),
  ]);
  if (offers.error) throw new Error(offers.error.message);
  return {
    stats: check(stats) as MemberStats | null,
    activeOffers: offers.count ?? 0,
    feedback: check(feedback) as FitSwapFeedback[],
  };
}
