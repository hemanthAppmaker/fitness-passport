// FitSwap shared constants and pure logic. No imports on purpose: tests/fitswap.test.ts runs this
// file directly with Node. The database (supabase/fitswap.sql) is the source of truth; the checks
// here only give fast feedback and decide which buttons to show.

type Option<T extends string = string> = { value: T; label: string };

export const CATEGORIES: Option[] = [
  { value: 'gym', label: 'Gym' },
  { value: 'calisthenics', label: 'Calisthenics' },
  { value: 'running', label: 'Running' },
  { value: 'walking', label: 'Walking' },
  { value: 'cycling', label: 'Cycling' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'general', label: 'General fitness' },
];

export const SUPPORT_TYPES: Option[] = [
  { value: 'skill_exchange', label: 'Skill exchange' },
  { value: 'workout_partner', label: 'Workout partner' },
  { value: 'accountability', label: 'Accountability support' },
  { value: 'beginner_orientation', label: 'Beginner orientation' },
  { value: 'group_activity', label: 'Group activity' },
];

export const DELIVERY_MODES: Option[] = [
  { value: 'online', label: 'Online' },
  { value: 'in_person', label: 'In person' },
  { value: 'either', label: 'Online or in person' },
];

export const DURATIONS = [15, 30, 45, 60, 90, 120];

export const DAYS: Option[] = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
];

export const WINDOWS: Option[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
];

export const REPORT_REASONS: Option[] = [
  { value: 'no_show', label: 'No-show' },
  { value: 'not_as_described', label: 'Not as described' },
  { value: 'unsafe_behavior', label: 'Unsafe behaviour' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'medical_advice', label: 'Medical advice' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Other' },
];

export const PEER_SUPPORT_NOTE =
  'Peer support is friendly, informal help from another member. It is not professional training, ' +
  'medical advice, or rehabilitation, and it does not imply any certification.';

export const MEETING_SAFETY_NOTE =
  'For in-person sessions, meet in a public fitness location, tell someone where you are going, and ' +
  'leave if anything feels wrong. You can cancel or report a member at any time.';

export function labelOf(list: Option[], value: string | null | undefined): string {
  return list.find((o) => o.value === value)?.label ?? value ?? '';
}

// ---------- Types ----------
export type ProviderType = 'peer' | 'professional';
export type OfferStatus = 'active' | 'paused' | 'archived' | 'removed';
export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'closed';
export type ExchangeStatus = 'accepted' | 'completion_pending' | 'completed' | 'cancelled' | 'disputed';

export type OfferInput = {
  title: string;
  description: string;
  category: string;
  supportType: string;
  durationMinutes: number;
  deliveryMode: string;
  generalLocation: string;
  availabilityDays: string[];
  timeWindows: string[];
  availabilityNote: string;
  maxParticipants: number;
  prerequisites: string;
  providerType: ProviderType;
  qualifications: string;
};

export const EMPTY_OFFER: OfferInput = {
  title: '',
  description: '',
  category: '',
  supportType: '',
  durationMinutes: 30,
  deliveryMode: '',
  generalLocation: '',
  availabilityDays: [],
  timeWindows: [],
  availabilityNote: '',
  maxParticipants: 1,
  prerequisites: '',
  providerType: 'peer',
  qualifications: '',
};

const has = (list: Option[], v: string) => list.some((o) => o.value === v);

/** Returns a field -> message map. Empty object means valid. Mirrors the database rules. */
export function validateOffer(o: OfferInput): Record<string, string> {
  const e: Record<string, string> = {};
  const title = o.title.trim();
  const description = o.description.trim();
  if (title.length < 3 || title.length > 80) e.title = 'Title must be 3-80 characters.';
  if (description.length < 10 || description.length > 1000) e.description = 'Description must be 10-1000 characters.';
  if (!has(CATEGORIES, o.category)) e.category = 'Choose a category.';
  if (!has(SUPPORT_TYPES, o.supportType)) e.supportType = 'Choose a type of support.';
  if (!DURATIONS.includes(o.durationMinutes)) e.durationMinutes = 'Choose a duration.';
  if (!has(DELIVERY_MODES, o.deliveryMode)) e.deliveryMode = 'Choose online or in person.';
  if (o.deliveryMode && o.deliveryMode !== 'online' && !o.generalLocation.trim()) {
    e.generalLocation = 'Add a general meeting area (a suburb or park, not an address).';
  }
  if (o.generalLocation.trim().length > 80) e.generalLocation = 'Keep the area under 80 characters.';
  if (o.availabilityDays.length === 0 || !o.availabilityDays.every((d) => has(DAYS, d))) {
    e.availabilityDays = 'Choose at least one day.';
  }
  if (o.timeWindows.length === 0 || !o.timeWindows.every((w) => has(WINDOWS, w))) {
    e.timeWindows = 'Choose at least one time window.';
  }
  if (o.availabilityNote.length > 200) e.availabilityNote = 'Keep the note under 200 characters.';
  if (!Number.isInteger(o.maxParticipants) || o.maxParticipants < 1 || o.maxParticipants > 10) {
    e.maxParticipants = 'Participants must be between 1 and 10.';
  }
  if (o.prerequisites.length > 300) e.prerequisites = 'Keep prerequisites under 300 characters.';
  if (o.qualifications.length > 300) e.qualifications = 'Keep qualifications under 300 characters.';
  return e;
}

// ---------- Exchange state machine (mirrors the database; used to decide which buttons to show) ----------
export const EXCHANGE_TRANSITIONS: Record<ExchangeStatus, ExchangeStatus[]> = {
  accepted: ['completion_pending', 'cancelled', 'disputed'],
  completion_pending: ['completed', 'disputed'],
  completed: [],
  cancelled: [],
  disputed: ['completed', 'cancelled'], // moderator resolution only
};

export function canTransition(from: ExchangeStatus, to: ExchangeStatus): boolean {
  return EXCHANGE_TRANSITIONS[from].includes(to);
}

export type ExchangeAction = 'cancel' | 'mark_delivered' | 'confirm' | 'dispute' | 'feedback';

export function exchangeActions(
  status: ExchangeStatus,
  role: 'provider' | 'recipient',
  scheduledStartAt: string,
  hasLeftFeedback: boolean,
  now: Date = new Date(),
): ExchangeAction[] {
  const started = now.getTime() >= new Date(scheduledStartAt).getTime();
  const out: ExchangeAction[] = [];
  if (status === 'accepted') {
    if (!started) out.push('cancel');
    if (started && role === 'provider') out.push('mark_delivered');
    if (started) out.push('dispute');
  }
  if (status === 'completion_pending') {
    if (role === 'recipient') out.push('confirm');
    out.push('dispute');
  }
  if (status === 'completed' && !hasLeftFeedback) out.push('feedback');
  return out;
}

// ---------- My Exchanges grouping ----------
type RequestLike = { id: string; status: RequestStatus; requester_id: string; provider_id: string; requested_start_at: string };
type ExchangeLike = { id: string; status: ExchangeStatus; scheduled_start_at: string };

export type ExchangeItem<R extends RequestLike, E extends ExchangeLike> =
  | { kind: 'request'; request: R }
  | { kind: 'exchange'; exchange: E };

export type ExchangeGroup<R extends RequestLike, E extends ExchangeLike> = {
  key: 'incoming' | 'pending' | 'upcoming' | 'awaiting' | 'completed' | 'closed';
  title: string;
  items: ExchangeItem<R, E>[];
};

export function groupExchanges<R extends RequestLike, E extends ExchangeLike>(
  requests: R[],
  exchanges: E[],
  userId: string,
): ExchangeGroup<R, E>[] {
  const byStart = <T,>(get: (x: T) => string, dir: 1 | -1) => (a: T, b: T) =>
    dir * (new Date(get(a)).getTime() - new Date(get(b)).getTime());
  const req = (r: R): ExchangeItem<R, E> => ({ kind: 'request', request: r });
  const exc = (e: E): ExchangeItem<R, E> => ({ kind: 'exchange', exchange: e });

  const groups: ExchangeGroup<R, E>[] = [
    {
      key: 'incoming',
      title: 'Incoming requests',
      items: requests
        .filter((r) => r.status === 'pending' && r.provider_id === userId)
        .sort(byStart((r) => r.requested_start_at, 1))
        .map(req),
    },
    {
      key: 'pending',
      title: 'Pending requests',
      items: requests
        .filter((r) => r.status === 'pending' && r.requester_id === userId)
        .sort(byStart((r) => r.requested_start_at, 1))
        .map(req),
    },
    {
      key: 'upcoming',
      title: 'Upcoming sessions',
      items: exchanges
        .filter((e) => e.status === 'accepted')
        .sort(byStart((e) => e.scheduled_start_at, 1))
        .map(exc),
    },
    {
      key: 'awaiting',
      title: 'Awaiting completion confirmation',
      items: exchanges
        .filter((e) => e.status === 'completion_pending')
        .sort(byStart((e) => e.scheduled_start_at, 1))
        .map(exc),
    },
    {
      key: 'completed',
      title: 'Completed',
      items: exchanges
        .filter((e) => e.status === 'completed')
        .sort(byStart((e) => e.scheduled_start_at, -1))
        .map(exc),
    },
    {
      key: 'closed',
      title: 'Cancelled, declined or disputed',
      items: [
        ...requests.filter((r) => r.status === 'declined' || r.status === 'cancelled').map(req),
        ...exchanges.filter((e) => e.status === 'cancelled' || e.status === 'disputed').map(exc),
      ],
    },
  ];
  return groups.filter((g) => g.items.length > 0);
}

// ---------- Contribution milestones (a personal journey, not a ranking) ----------
export const CONTRIBUTION_MILESTONES = [
  { count: 1, title: 'First exchange', body: 'You completed your first FitSwap session.' },
  { count: 5, title: 'Regular', body: 'Five sessions completed.' },
  { count: 10, title: 'Community builder', body: 'Ten sessions completed.' },
];

export function contributionMilestones(completedTotal: number) {
  return CONTRIBUTION_MILESTONES.map((m) => ({ ...m, reached: completedTotal >= m.count }));
}

// ---------- Choosing a session time without a date-picker dependency ----------
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const WINDOW_SLOTS: Record<string, string[]> = {
  morning: ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00'],
  afternoon: ['12:00', '13:00', '14:00', '15:00', '16:00'],
  evening: ['17:00', '18:00', '19:00', '20:00'],
};

/** Upcoming dates (local) that fall on one of the offer's available weekdays. */
export function availableDates(days: string[], now: Date = new Date(), horizon = 28, max = 10): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < horizon && out.length < max; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (days.includes(WEEKDAYS[d.getDay()])) out.push(d);
  }
  return out;
}

export function availableSlots(windows: string[]): string[] {
  return Object.keys(WINDOW_SLOTS)
    .filter((w) => windows.includes(w))
    .flatMap((w) => WINDOW_SLOTS[w]);
}

/** Combines a local date and "HH:MM" into an ISO timestamp; null if it is under an hour away. */
export function slotToIso(date: Date, time: string, now: Date = new Date()): string | null {
  const [h, m] = time.split(':').map(Number);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
  if (start.getTime() < now.getTime() + 60 * 60 * 1000) return null;
  return start.toISOString();
}

export function providerBadge(providerType: ProviderType, verified: boolean): string {
  if (providerType === 'peer') return 'Peer support';
  return verified ? 'Credentials verified' : 'Credentials not verified';
}

export function ratingSummary(completed: number, ratingCount: number, avg: number | null): string {
  const parts: string[] = [];
  parts.push(completed === 0 ? 'New to FitSwap' : `${completed} completed`);
  if (ratingCount > 0 && avg != null) parts.push(`${avg.toFixed(1)} avg from ${ratingCount} ${ratingCount === 1 ? 'review' : 'reviews'}`);
  return parts.join(' · ');
}
