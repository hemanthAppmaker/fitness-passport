-- FitSwap: fitness skill & time exchange. Run AFTER schema.sql (safe to re-run).
--
-- Design:
--  * Tables have RLS with SELECT policies only. All writes go through the SECURITY DEFINER
--    functions below, which validate input and every status transition on the server.
--  * Exchange lifecycle:  accepted -> completion_pending -> completed
--                         accepted -> cancelled | disputed ; completion_pending -> disputed
--    Requests:            pending -> accepted | declined | cancelled ; accepted -> closed
--  * No time-credit ledger yet. exchanges.duration_minutes is kept so one can be added later.

-- ---------- Tables ----------
create table if not exists public.fitswap_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  description text not null check (char_length(description) between 10 and 1000),
  category text not null check (category in
    ('gym','calisthenics','running','walking','cycling','yoga','mobility','general')),
  support_type text not null check (support_type in
    ('skill_exchange','workout_partner','accountability','beginner_orientation','group_activity')),
  duration_minutes int not null check (duration_minutes in (15,30,45,60,90,120)),
  delivery_mode text not null check (delivery_mode in ('online','in_person','either')),
  general_location text check (char_length(general_location) <= 80),
  availability_days text[] not null check (
    cardinality(availability_days) > 0
    and availability_days <@ array['mon','tue','wed','thu','fri','sat','sun']::text[]),
  time_windows text[] not null check (
    cardinality(time_windows) > 0
    and time_windows <@ array['morning','afternoon','evening']::text[]),
  availability_note text check (char_length(availability_note) <= 200),
  max_participants int not null default 1 check (max_participants between 1 and 10),
  prerequisites text check (char_length(prerequisites) <= 300),
  provider_type text not null default 'peer' check (provider_type in ('peer','professional')),
  qualifications text check (char_length(qualifications) <= 300),
  -- Only a moderator (fitswap_moderate_offer) can set this. Never trust the client for it.
  qualification_verified boolean not null default false,
  status text not null default 'active' check (status in ('active','paused','archived','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (delivery_mode = 'online' or general_location is not null),
  check (not qualification_verified or provider_type = 'professional')
);
create index if not exists fitswap_offers_discover_idx on public.fitswap_offers (status, category, support_type);
create index if not exists fitswap_offers_owner_idx on public.fitswap_offers (user_id, status);

create table if not exists public.fitswap_requests (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.fitswap_offers(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  message text check (char_length(message) <= 500),
  goal_note text check (char_length(goal_note) <= 300),
  requested_start_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> provider_id)
);
-- One active request per member per offer.
create unique index if not exists fitswap_requests_one_active_idx
  on public.fitswap_requests (offer_id, requester_id) where status in ('pending','accepted');
create index if not exists fitswap_requests_requester_idx on public.fitswap_requests (requester_id, status);
create index if not exists fitswap_requests_provider_idx on public.fitswap_requests (provider_id, status);

create table if not exists public.fitswap_exchanges (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.fitswap_requests(id) on delete cascade,
  offer_id uuid not null references public.fitswap_offers(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  scheduled_start_at timestamptz not null,
  duration_minutes int not null,
  status text not null default 'accepted'
    check (status in ('accepted','completion_pending','completed','cancelled','disputed')),
  provider_marked_at timestamptz,
  recipient_confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancel_reason text check (char_length(cancel_reason) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fitswap_exchanges_provider_idx on public.fitswap_exchanges (provider_id, status);
create index if not exists fitswap_exchanges_recipient_idx on public.fitswap_exchanges (recipient_id, status);
create index if not exists fitswap_exchanges_offer_slot_idx on public.fitswap_exchanges (offer_id, scheduled_start_at);

create table if not exists public.fitswap_feedback (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null references public.fitswap_exchanges(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewed_user_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (exchange_id, reviewer_id),
  check (reviewer_id <> reviewed_user_id)
);
create index if not exists fitswap_feedback_reviewed_idx on public.fitswap_feedback (reviewed_user_id);

create table if not exists public.fitswap_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  offer_id uuid references public.fitswap_offers(id) on delete set null,
  exchange_id uuid references public.fitswap_exchanges(id) on delete set null,
  kind text not null check (kind in ('report','dispute')),
  reason text not null check (reason in
    ('no_show','not_as_described','unsafe_behavior','harassment','medical_advice','spam','other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_user_id)
);
create index if not exists fitswap_reports_status_idx on public.fitswap_reports (status, created_at);

-- Moderators are added by an admin in the SQL editor:
--   insert into public.fitswap_moderators (user_id) values ('<profile uuid>');
create table if not exists public.fitswap_moderators (
  user_id uuid primary key references public.profiles(id) on delete cascade
);
create table if not exists public.fitswap_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null,
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  created_at timestamptz not null default now()
);

-- ---------- Helpers ----------
create or replace function public.fitswap_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['fitswap_offers','fitswap_requests','fitswap_exchanges'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.fitswap_touch()', t, t);
  end loop;
end $$;

create or replace function public.fitswap_is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from fitswap_moderators where user_id = auth.uid());
$$;

-- Whether a member has already left feedback on an exchange (definer: avoids RLS recursion).
create or replace function public.fitswap_has_reviewed(p_exchange uuid, p_reviewer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from fitswap_feedback where exchange_id = p_exchange and reviewer_id = p_reviewer);
$$;

-- Feedback is "blind" to reduce retaliation: the person reviewed sees it once they have left their
-- own feedback, or 7 days after it was written.
create or replace function public.fitswap_feedback_revealed(p_exchange uuid, p_reviewed uuid, p_created timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select fitswap_has_reviewed(p_exchange, p_reviewed) or p_created < now() - interval '7 days';
$$;

-- ---------- Row level security (read-only for clients) ----------
alter table public.fitswap_offers enable row level security;
alter table public.fitswap_requests enable row level security;
alter table public.fitswap_exchanges enable row level security;
alter table public.fitswap_feedback enable row level security;
alter table public.fitswap_reports enable row level security;
alter table public.fitswap_moderators enable row level security;
alter table public.fitswap_audit_log enable row level security;

drop policy if exists "fitswap offers read" on public.fitswap_offers;
create policy "fitswap offers read" on public.fitswap_offers for select to authenticated
  using (
    status = 'active'
    or user_id = auth.uid()
    -- Participants keep seeing the offer behind their requests/sessions after it is paused or archived.
    or exists (select 1 from public.fitswap_requests r
               where r.offer_id = fitswap_offers.id and auth.uid() in (r.requester_id, r.provider_id))
  );

drop policy if exists "fitswap requests read" on public.fitswap_requests;
create policy "fitswap requests read" on public.fitswap_requests for select to authenticated
  using (auth.uid() in (requester_id, provider_id));

drop policy if exists "fitswap exchanges read" on public.fitswap_exchanges;
create policy "fitswap exchanges read" on public.fitswap_exchanges for select to authenticated
  using (auth.uid() in (provider_id, recipient_id));

drop policy if exists "fitswap feedback read" on public.fitswap_feedback;
create policy "fitswap feedback read" on public.fitswap_feedback for select to authenticated
  using (
    reviewer_id = auth.uid()
    or (reviewed_user_id = auth.uid() and public.fitswap_feedback_revealed(exchange_id, reviewed_user_id, created_at))
  );

drop policy if exists "fitswap reports read own" on public.fitswap_reports;
create policy "fitswap reports read own" on public.fitswap_reports for select to authenticated
  using (reporter_id = auth.uid());
-- fitswap_moderators and fitswap_audit_log: RLS on, no policies => not readable by clients.

-- Public reputation: counts and an average only. No private exchange details are exposed.
create or replace view public.fitswap_member_stats as
select
  p.id as user_id,
  (select count(*) from fitswap_exchanges e where e.provider_id = p.id and e.status = 'completed')::int as completed_provided,
  (select count(*) from fitswap_exchanges e where e.recipient_id = p.id and e.status = 'completed')::int as completed_received,
  coalesce((select sum(e.duration_minutes) from fitswap_exchanges e
            where e.provider_id = p.id and e.status = 'completed'), 0)::int as minutes_provided,
  (select count(*) from fitswap_feedback f
     where f.reviewed_user_id = p.id
       and fitswap_feedback_revealed(f.exchange_id, f.reviewed_user_id, f.created_at))::int as rating_count,
  (select round(avg(f.rating)::numeric, 1) from fitswap_feedback f
     where f.reviewed_user_id = p.id
       and fitswap_feedback_revealed(f.exchange_id, f.reviewed_user_id, f.created_at)) as avg_rating
from public.profiles p;
grant select on public.fitswap_member_stats to authenticated;

-- ---------- Offers ----------
create or replace function public.fitswap_save_offer(
  p_id uuid,
  p_title text, p_description text, p_category text, p_support_type text,
  p_duration_minutes int, p_delivery_mode text, p_general_location text,
  p_availability_days text[], p_time_windows text[], p_availability_note text,
  p_max_participants int, p_prerequisites text, p_provider_type text, p_qualifications text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_old fitswap_offers;
  v_title text := btrim(coalesce(p_title, ''));
  v_desc text := btrim(coalesce(p_description, ''));
  v_loc text := nullif(btrim(coalesce(p_general_location, '')), '');
  v_qual text := nullif(btrim(coalesce(p_qualifications, '')), '');
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if char_length(v_title) not between 3 and 80 then raise exception 'Title must be 3-80 characters'; end if;
  if char_length(v_desc) not between 10 and 1000 then raise exception 'Description must be 10-1000 characters'; end if;
  if p_delivery_mode <> 'online' and v_loc is null then
    raise exception 'Add a general meeting area for in-person offers'; end if;
  if coalesce(cardinality(p_availability_days), 0) = 0 or coalesce(cardinality(p_time_windows), 0) = 0 then
    raise exception 'Choose at least one available day and time window'; end if;
  if p_provider_type = 'peer' then v_qual := null; end if;

  if p_id is null then
    if (select count(*) from fitswap_offers where user_id = v_uid and status in ('active','paused')) >= 20 then
      raise exception 'You have reached the limit of 20 offers'; end if;
    insert into fitswap_offers (user_id, title, description, category, support_type, duration_minutes,
      delivery_mode, general_location, availability_days, time_windows, availability_note,
      max_participants, prerequisites, provider_type, qualifications)
    values (v_uid, v_title, v_desc, p_category, p_support_type, p_duration_minutes,
      p_delivery_mode, v_loc, p_availability_days, p_time_windows, nullif(btrim(coalesce(p_availability_note, '')), ''),
      coalesce(p_max_participants, 1), nullif(btrim(coalesce(p_prerequisites, '')), ''), p_provider_type, v_qual)
    returning id into v_id;
    return v_id;
  end if;

  select * into v_old from fitswap_offers where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'Offer not found'; end if;
  if v_old.status in ('archived','removed') then raise exception 'This offer can no longer be edited'; end if;

  update fitswap_offers set
    title = v_title, description = v_desc, category = p_category, support_type = p_support_type,
    duration_minutes = p_duration_minutes, delivery_mode = p_delivery_mode, general_location = v_loc,
    availability_days = p_availability_days, time_windows = p_time_windows,
    availability_note = nullif(btrim(coalesce(p_availability_note, '')), ''),
    max_participants = coalesce(p_max_participants, 1),
    prerequisites = nullif(btrim(coalesce(p_prerequisites, '')), ''),
    provider_type = p_provider_type, qualifications = v_qual,
    -- Changing credentials invalidates a previous verification.
    qualification_verified = case
      when p_provider_type = 'professional'
       and v_qual is not distinct from v_old.qualifications then v_old.qualification_verified
      else false end
  where id = p_id;
  return p_id;
end $$;

-- Owner: pause / reactivate / delete (archive). Archiving declines pending requests.
create or replace function public.fitswap_set_offer_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_offer fitswap_offers;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if p_status not in ('active','paused','archived') then raise exception 'Invalid status'; end if;
  select * into v_offer from fitswap_offers where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'Offer not found'; end if;
  if v_offer.status in ('archived','removed') then raise exception 'This offer can no longer be changed'; end if;
  update fitswap_offers set status = p_status where id = p_id;
  if p_status = 'archived' then
    update fitswap_requests set status = 'declined' where offer_id = p_id and status = 'pending';
  end if;
end $$;

-- ---------- Requests ----------
create or replace function public.fitswap_request_offer(
  p_offer uuid, p_start timestamptz, p_message text, p_goal text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_offer fitswap_offers; v_id uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select * into v_offer from fitswap_offers where id = p_offer and status = 'active';
  if not found then raise exception 'This offer is not available'; end if;
  if v_offer.user_id = v_uid then raise exception 'You cannot request your own offer'; end if;
  if p_start is null or p_start < now() + interval '1 hour' then
    raise exception 'Pick a time at least one hour from now'; end if;
  if p_start > now() + interval '60 days' then raise exception 'Pick a time within the next 60 days'; end if;
  if char_length(coalesce(p_message, '')) > 500 or char_length(coalesce(p_goal, '')) > 300 then
    raise exception 'Message or goal is too long'; end if;
  if (select count(*) from fitswap_requests where requester_id = v_uid and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many requests. Please try again later.'; end if;

  begin
    insert into fitswap_requests (offer_id, requester_id, provider_id, message, goal_note, requested_start_at)
    values (p_offer, v_uid, v_offer.user_id, nullif(btrim(coalesce(p_message, '')), ''),
            nullif(btrim(coalesce(p_goal, '')), ''), p_start)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'You already have an active request for this offer';
  end;
  return v_id;
end $$;

-- Provider accepts/declines. Returns the exchange id when accepted. Safe to retry.
create or replace function public.fitswap_respond_request(p_request uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r fitswap_requests; v_offer fitswap_offers; v_ex uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select * into r from fitswap_requests where id = p_request for update;
  if not found or r.provider_id <> v_uid then raise exception 'Request not found'; end if;

  if r.status = 'accepted' and p_accept then
    select id into v_ex from fitswap_exchanges where request_id = r.id; return v_ex;
  end if;
  if r.status = 'declined' and not p_accept then return null; end if;
  if r.status <> 'pending' then raise exception 'This request has already been handled'; end if;

  if not p_accept then
    update fitswap_requests set status = 'declined' where id = r.id;
    return null;
  end if;

  -- Lock the offer so two accepts can't both take the last place in a group slot.
  select * into v_offer from fitswap_offers where id = r.offer_id for update;
  if v_offer.status <> 'active' then raise exception 'This offer is not active'; end if;
  if r.requested_start_at < now() then
    raise exception 'The requested time has passed. Decline and ask them to request a new time.'; end if;
  if (select count(*) from fitswap_exchanges
        where offer_id = r.offer_id and scheduled_start_at = r.requested_start_at
          and status in ('accepted','completion_pending','completed')) >= v_offer.max_participants then
    raise exception 'That time slot is already full'; end if;

  update fitswap_requests set status = 'accepted' where id = r.id;
  insert into fitswap_exchanges (request_id, offer_id, provider_id, recipient_id, scheduled_start_at, duration_minutes)
  values (r.id, r.offer_id, r.provider_id, r.requester_id, r.requested_start_at, v_offer.duration_minutes)
  returning id into v_ex;
  return v_ex;
end $$;

create or replace function public.fitswap_cancel_request(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r fitswap_requests;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select * into r from fitswap_requests where id = p_request for update;
  if not found or r.requester_id <> v_uid then raise exception 'Request not found'; end if;
  if r.status = 'cancelled' then return; end if;
  if r.status <> 'pending' then raise exception 'Only pending requests can be withdrawn. Cancel the session instead.'; end if;
  update fitswap_requests set status = 'cancelled' where id = r.id;
end $$;

-- ---------- Exchange state machine ----------
create or replace function public.fitswap_cancel_exchange(p_exchange uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); e fitswap_exchanges;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select * into e from fitswap_exchanges where id = p_exchange for update;
  if not found or v_uid not in (e.provider_id, e.recipient_id) then raise exception 'Session not found'; end if;
  if e.status = 'cancelled' then return; end if;
  if e.status <> 'accepted' then raise exception 'This session can no longer be cancelled'; end if;
  if char_length(coalesce(p_reason, '')) > 200 then raise exception 'Reason is too long'; end if;
  update fitswap_exchanges set status = 'cancelled', cancelled_by = v_uid,
    cancel_reason = nullif(btrim(coalesce(p_reason, '')), '') where id = e.id;
  update fitswap_requests set status = 'cancelled' where id = e.request_id;
end $$;

-- Provider says the session happened. Recipient must confirm; nothing is credited on one claim.
create or replace function public.fitswap_mark_delivered(p_exchange uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); e fitswap_exchanges;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select * into e from fitswap_exchanges where id = p_exchange for update;
  if not found or e.provider_id <> v_uid then raise exception 'Session not found'; end if;
  if e.status in ('completion_pending','completed') then return; end if;
  if e.status <> 'accepted' then raise exception 'This session is %', e.status; end if;
  if now() < e.scheduled_start_at then raise exception 'You can mark it done once the session has started'; end if;
  update fitswap_exchanges set status = 'completion_pending', provider_marked_at = now() where id = e.id;
end $$;

create or replace function public.fitswap_confirm_completion(p_exchange uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); e fitswap_exchanges;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select * into e from fitswap_exchanges where id = p_exchange for update;
  if not found or e.recipient_id <> v_uid then raise exception 'Session not found'; end if;
  if e.status = 'completed' then return; end if;
  if e.status <> 'completion_pending' then raise exception 'The provider has not marked this session done yet'; end if;
  update fitswap_exchanges set status = 'completed', recipient_confirmed_at = now(), completed_at = now()
    where id = e.id;
  update fitswap_requests set status = 'closed' where id = e.request_id;
end $$;

create or replace function public.fitswap_report(
  p_reported uuid, p_offer uuid, p_exchange uuid, p_reason text, p_details text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if p_reported = v_uid then raise exception 'You cannot report yourself'; end if;
  if p_reason not in ('no_show','not_as_described','unsafe_behavior','harassment','medical_advice','spam','other') then
    raise exception 'Choose a reason'; end if;
  if char_length(coalesce(p_details, '')) > 1000 then raise exception 'Details are too long'; end if;
  if (select count(*) from fitswap_reports where reporter_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many reports today'; end if;
  if p_exchange is not null and not exists (
    select 1 from fitswap_exchanges where id = p_exchange and v_uid in (provider_id, recipient_id)
      and p_reported in (provider_id, recipient_id)) then
    raise exception 'Session not found'; end if;
  insert into fitswap_reports (reporter_id, reported_user_id, offer_id, exchange_id, kind, reason, details)
  values (v_uid, p_reported, p_offer, p_exchange, 'report', p_reason, nullif(btrim(coalesce(p_details, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

-- Either participant can dispute attendance/completion. Freezes the exchange for moderator review.
create or replace function public.fitswap_dispute_exchange(p_exchange uuid, p_reason text, p_details text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); e fitswap_exchanges; v_other uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select * into e from fitswap_exchanges where id = p_exchange for update;
  if not found or v_uid not in (e.provider_id, e.recipient_id) then raise exception 'Session not found'; end if;
  if e.status = 'disputed' then return; end if;
  if e.status not in ('accepted','completion_pending') then raise exception 'This session can no longer be disputed'; end if;
  if e.status = 'accepted' and now() < e.scheduled_start_at then
    raise exception 'You can dispute once the session start time has passed. Cancel it instead.'; end if;
  if p_reason not in ('no_show','not_as_described','unsafe_behavior','harassment','medical_advice','spam','other') then
    raise exception 'Choose a reason'; end if;
  if char_length(coalesce(p_details, '')) > 1000 then raise exception 'Details are too long'; end if;
  v_other := case when v_uid = e.provider_id then e.recipient_id else e.provider_id end;
  update fitswap_exchanges set status = 'disputed' where id = e.id;
  update fitswap_requests set status = 'closed' where id = e.request_id;
  insert into fitswap_reports (reporter_id, reported_user_id, offer_id, exchange_id, kind, reason, details)
  values (v_uid, v_other, e.offer_id, e.id, 'dispute', p_reason, nullif(btrim(coalesce(p_details, '')), ''));
end $$;

-- ---------- Feedback ----------
create or replace function public.fitswap_submit_feedback(p_exchange uuid, p_rating int, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); e fitswap_exchanges; v_other uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select * into e from fitswap_exchanges where id = p_exchange;
  if not found or v_uid not in (e.provider_id, e.recipient_id) then raise exception 'Session not found'; end if;
  if e.status <> 'completed' then raise exception 'Feedback opens once the session is completed'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Choose a rating from 1 to 5'; end if;
  if char_length(coalesce(p_comment, '')) > 500 then raise exception 'Comment is too long'; end if;
  v_other := case when v_uid = e.provider_id then e.recipient_id else e.provider_id end;
  begin
    insert into fitswap_feedback (exchange_id, reviewer_id, reviewed_user_id, rating, comment)
    values (e.id, v_uid, v_other, p_rating, nullif(btrim(coalesce(p_comment, '')), ''));
  exception when unique_violation then
    raise exception 'You have already left feedback for this session';
  end;
end $$;

-- ---------- Moderation (moderators only, always audited) ----------
create or replace function public.fitswap_moderate_offer(p_offer uuid, p_status text, p_verified boolean, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fitswap_is_moderator() then raise exception 'Not allowed'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'A reason is required'; end if;
  if p_status is not null and p_status not in ('active','paused','archived','removed') then
    raise exception 'Invalid status'; end if;
  update fitswap_offers set
    status = coalesce(p_status, status),
    qualification_verified = coalesce(p_verified, qualification_verified)
  where id = p_offer;
  if not found then raise exception 'Offer not found'; end if;
  if p_status in ('archived','removed') then
    update fitswap_requests set status = 'declined' where offer_id = p_offer and status = 'pending';
  end if;
  insert into fitswap_audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'moderate_offer', 'offer', p_offer, p_reason);
end $$;

create or replace function public.fitswap_resolve_dispute(p_exchange uuid, p_outcome text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare e fitswap_exchanges;
begin
  if not fitswap_is_moderator() then raise exception 'Not allowed'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'A reason is required'; end if;
  if p_outcome not in ('completed','cancelled') then raise exception 'Outcome must be completed or cancelled'; end if;
  select * into e from fitswap_exchanges where id = p_exchange for update;
  if not found or e.status <> 'disputed' then raise exception 'No open dispute for this session'; end if;
  update fitswap_exchanges set
    status = p_outcome,
    completed_at = case when p_outcome = 'completed' then now() else null end
  where id = e.id;
  update fitswap_reports set status = 'resolved' where exchange_id = e.id and kind = 'dispute';
  insert into fitswap_audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'resolve_dispute:' || p_outcome, 'exchange', e.id, p_reason);
end $$;

-- ---------- Function privileges: signed-in members only ----------
do $$ declare f record; begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'fitswap\_%'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
