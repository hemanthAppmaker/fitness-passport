-- Fitness Passport: schema, RLS, triggers, discovery function, seed challenges.
-- Run the whole file in Supabase Dashboard > SQL Editor.

create extension if not exists "pgcrypto";

-- ---------- Tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'New member',
  city text,
  bio text,
  goals text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  subtitle text not null,           -- e.g. "From beginner to 5K runner"
  description text,
  category text not null,           -- running | strength | yoga | cycling
  difficulty text not null default 'Beginner',
  sponsor text,                     -- gym/brand partner (nullable)
  stamp_label text not null,        -- text on the passport stamp
  accent text not null default '#0E7C7B',
  sort_order int not null default 0
);

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  position int not null,
  title text not null,
  description text,
  unique (challenge_id, position)
);

create table if not exists public.challenge_members (
  user_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  joined_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, challenge_id)
);

create table if not exists public.milestone_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  milestone_id uuid not null references public.milestones(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, milestone_id)
);

create table if not exists public.stamps (
  user_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, challenge_id)
);

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

-- ---------- Row level security ----------
alter table public.profiles enable row level security;
alter table public.challenges enable row level security;
alter table public.milestones enable row level security;
alter table public.challenge_members enable row level security;
alter table public.milestone_progress enable row level security;
alter table public.stamps enable row level security;
alter table public.connections enable row level security;

-- MVP: any signed-in member can read profiles (needed to show names on requests).
create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "profiles insert own" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles update own" on public.profiles for update to authenticated using (auth.uid() = id);

create policy "challenges readable" on public.challenges for select to authenticated using (true);
create policy "milestones readable" on public.milestones for select to authenticated using (true);

create policy "members read own" on public.challenge_members for select to authenticated using (auth.uid() = user_id);
create policy "members join own" on public.challenge_members for insert to authenticated with check (auth.uid() = user_id);
create policy "members leave own" on public.challenge_members for delete to authenticated using (auth.uid() = user_id);

create policy "progress read own" on public.milestone_progress for select to authenticated using (auth.uid() = user_id);
create policy "progress insert own" on public.milestone_progress for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.milestones m
      join public.challenge_members cm on cm.challenge_id = m.challenge_id and cm.user_id = auth.uid()
      where m.id = milestone_id
    )
  );
create policy "progress delete own" on public.milestone_progress for delete to authenticated using (auth.uid() = user_id);

-- Stamps are only written by the trigger below (no insert policy on purpose).
create policy "stamps read own" on public.stamps for select to authenticated using (auth.uid() = user_id);

create policy "connections read mine" on public.connections for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));
create policy "connections request" on public.connections for insert to authenticated
  with check (auth.uid() = requester_id and status = 'pending');
create policy "connections accept" on public.connections for update to authenticated
  using (auth.uid() = addressee_id) with check (auth.uid() = addressee_id);
create policy "connections remove" on public.connections for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- ---------- Auto-create profile on sign-up ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(split_part(new.email, '@', 1), 'New member'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Award / revoke stamps as milestones change ----------
create or replace function public.sync_challenge_completion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_milestone uuid;
  v_challenge uuid;
  v_total int;
  v_done int;
begin
  if tg_op = 'DELETE' then
    v_user := old.user_id; v_milestone := old.milestone_id;
  else
    v_user := new.user_id; v_milestone := new.milestone_id;
  end if;

  select challenge_id into v_challenge from milestones where id = v_milestone;
  if v_challenge is null then return null; end if;

  select count(*) into v_total from milestones where challenge_id = v_challenge;
  select count(*) into v_done
    from milestone_progress mp join milestones m on m.id = mp.milestone_id
    where mp.user_id = v_user and m.challenge_id = v_challenge;

  if v_total > 0 and v_done = v_total then
    update challenge_members set completed_at = now()
      where user_id = v_user and challenge_id = v_challenge and completed_at is null;
    insert into stamps (user_id, challenge_id) values (v_user, v_challenge)
      on conflict do nothing;
  else
    update challenge_members set completed_at = null
      where user_id = v_user and challenge_id = v_challenge;
    delete from stamps where user_id = v_user and challenge_id = v_challenge;
  end if;
  return null;
end $$;

drop trigger if exists milestone_progress_sync on public.milestone_progress;
create trigger milestone_progress_sync
  after insert or delete on public.milestone_progress
  for each row execute function public.sync_challenge_completion();

-- ---------- People discovery: shared challenges + shared goals ----------
create or replace function public.discover_people()
returns table (
  id uuid, display_name text, city text, goals text[],
  shared_challenges text[], score int
)
language sql stable security definer set search_path = public as $$
  with my_ch as (
    select challenge_id from challenge_members where user_id = auth.uid()
  ),
  my_goals as (
    select coalesce(goals, '{}') as goals from profiles where id = auth.uid()
  )
  select
    p.id, p.display_name, p.city, p.goals,
    coalesce(array(
      select c.title from challenge_members cm
      join challenges c on c.id = cm.challenge_id
      where cm.user_id = p.id and cm.challenge_id in (select challenge_id from my_ch)
    ), '{}') as shared_challenges,
    (
      (select count(*) from challenge_members cm
        where cm.user_id = p.id and cm.challenge_id in (select challenge_id from my_ch)) * 2
      + coalesce(cardinality(array(
          select unnest(p.goals) intersect select unnest((select goals from my_goals))
        )), 0)
    )::int as score
  from profiles p
  where p.id <> auth.uid()
    and not exists (
      select 1 from connections k
      where (k.requester_id = auth.uid() and k.addressee_id = p.id)
         or (k.addressee_id = auth.uid() and k.requester_id = p.id)
    )
  order by score desc, p.created_at desc
  limit 30;
$$;

-- ---------- Seed challenges ----------
insert into public.challenges (slug, title, subtitle, description, category, difficulty, sponsor, stamp_label, accent, sort_order) values
 ('beginner-5k', 'Couch to 5K', 'From beginner to 5K runner',
  'Build up to your first 5K with other beginners who are starting where you are.',
  'running', 'Beginner', null, '5K', '#0E7C7B', 1),
 ('strength-habit', 'Strength Habit', 'From curious to lifting regularly',
  'Learn the basics, train consistently, and find people to lift with.',
  'strength', 'Beginner', null, 'LIFT', '#D7263D', 2),
 ('yoga-month', 'Yoga Month', 'Thirty days on the mat',
  'Ease into a daily practice with a community that celebrates showing up.',
  'yoga', 'All levels', null, 'YOGA', '#7A5CFA', 3),
 ('first-50k-ride', 'First 50K Ride', 'From short rides to your first 50K',
  'Progress from neighbourhood loops to a confident 50 km ride.',
  'cycling', 'Intermediate', null, '50K', '#C77D00', 4)
on conflict (slug) do nothing;

insert into public.milestones (challenge_id, position, title, description)
select c.id, m.position, m.title, m.description
from (values
  ('beginner-5k', 1, 'Complete your first run-walk session', 'Alternate running and walking for 20 minutes'),
  ('beginner-5k', 2, 'Complete your first group run', 'Join a beginner-friendly group'),
  ('beginner-5k', 3, 'Find two running partners', 'Meet people with similar goals'),
  ('beginner-5k', 4, 'Run 20 minutes without stopping', 'Your halfway breakthrough'),
  ('beginner-5k', 5, 'Finish your first 5K', 'Unlock your 5K passport stamp'),

  ('strength-habit', 1, 'Learn the five basic lifts', 'Squat, hinge, push, pull, carry'),
  ('strength-habit', 2, 'Train three times in one week', 'Consistency beats intensity'),
  ('strength-habit', 3, 'Find a training partner', 'Someone to spot you and keep you honest'),
  ('strength-habit', 4, 'Complete four weeks in a row', 'Unlock your LIFT passport stamp'),

  ('yoga-month', 1, 'Attend your first class', 'In a studio or online'),
  ('yoga-month', 2, 'Practise seven days in a row', 'Ten minutes is enough'),
  ('yoga-month', 3, 'Bring a friend to a class', 'Share the practice'),
  ('yoga-month', 4, 'Complete thirty days', 'Unlock your YOGA passport stamp'),

  ('first-50k-ride', 1, 'Complete a 10K ride', 'Warm up your legs'),
  ('first-50k-ride', 2, 'Ride with a group', 'Learn pacing and signals'),
  ('first-50k-ride', 3, 'Complete a 30K ride', 'Halfway to the big day'),
  ('first-50k-ride', 4, 'Finish your first 50K', 'Unlock your 50K passport stamp')
) as m(slug, position, title, description)
join public.challenges c on c.slug = m.slug
on conflict (challenge_id, position) do nothing;
