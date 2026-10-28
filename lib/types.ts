import type { ExchangeStatus, OfferStatus, ProviderType, RequestStatus } from './fitswap';

export type Milestone = {
  id: string;
  challenge_id: string;
  position: number;
  title: string;
  description: string | null;
};

export type Challenge = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string | null;
  category: string;
  difficulty: string;
  sponsor: string | null;
  stamp_label: string;
  accent: string;
  milestones: Milestone[];
};

export type Membership = {
  joined_at: string;
  completed_at: string | null;
  challenge: Challenge;
};

export type StampRow = { earned_at: string; challenge: Challenge };

export type Profile = {
  id: string;
  display_name: string;
  city: string | null;
  bio: string | null;
  goals: string[];
};

export type Person = {
  id: string;
  display_name: string;
  city: string | null;
  goals: string[];
  shared_challenges: string[];
  score: number;
};

export type ConnectionRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
  requester: Pick<Profile, 'id' | 'display_name' | 'city'>;
  addressee: Pick<Profile, 'id' | 'display_name' | 'city'>;
};

// ---------- FitSwap ----------

export type MemberStats = {
  user_id: string;
  completed_provided: number;
  completed_received: number;
  minutes_provided: number;
  rating_count: number;
  avg_rating: number | null;
};

export type FitSwapOffer = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  support_type: string;
  duration_minutes: number;
  delivery_mode: string;
  general_location: string | null;
  availability_days: string[];
  time_windows: string[];
  availability_note: string | null;
  max_participants: number;
  prerequisites: string | null;
  provider_type: ProviderType;
  qualifications: string | null;
  qualification_verified: boolean;
  status: OfferStatus;
  created_at: string;
  provider: Pick<Profile, 'display_name' | 'city'> | null;
  stats: MemberStats | null;
};

type PersonRef = Pick<Profile, 'id' | 'display_name'>;
type OfferRef = Pick<FitSwapOffer, 'id' | 'title' | 'delivery_mode' | 'general_location'> | null;

export type FitSwapRequest = {
  id: string;
  offer_id: string;
  requester_id: string;
  provider_id: string;
  message: string | null;
  goal_note: string | null;
  requested_start_at: string;
  status: RequestStatus;
  created_at: string;
  requester: PersonRef;
  provider: PersonRef;
  offer: OfferRef;
};

export type FitSwapExchange = {
  id: string;
  request_id: string;
  offer_id: string;
  provider_id: string;
  recipient_id: string;
  scheduled_start_at: string;
  duration_minutes: number;
  status: ExchangeStatus;
  provider_marked_at: string | null;
  completed_at: string | null;
  cancel_reason: string | null;
  provider: PersonRef;
  recipient: PersonRef;
  offer: OfferRef;
};

export type FitSwapFeedback = {
  id: string;
  exchange_id: string;
  reviewer_id: string;
  reviewed_user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};
