-- FitSwap database tests. Everything runs in one transaction and is rolled back.
-- Run after schema.sql + fitswap.sql, either with supabase/tests/run-local.sh (throwaway local
-- Postgres) or by pasting into the Supabase SQL editor. Any failed check raises an exception.
begin;

create schema fitswap_t;
grant usage on schema fitswap_t to authenticated;

-- Impersonate a signed-in member (sets the JWT claim that auth.uid() reads, and the DB role).
create function fitswap_t.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function fitswap_t.as_admin() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function fitswap_t.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

-- Asserts that p_sql raises an error whose message matches p_pattern (ILIKE).
create function fitswap_t.fails(p_sql text, p_pattern text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike p_pattern then raise notice 'ok - %', p_msg; return; end if;
    raise exception 'FAIL: % (wrong error: %)', p_msg, sqlerrm;
  end;
  raise exception 'FAIL: % (no error raised)', p_msg;
end $$;
grant execute on all functions in schema fitswap_t to authenticated;

-- Test members: A provides, B requests, C is a bystander, M is a moderator.
insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000003'), ('dddddddd-0000-0000-0000-000000000004');
insert into public.fitswap_moderators (user_id) values ('dddddddd-0000-0000-0000-000000000004');

create table fitswap_t.ctx (k text primary key, v uuid);
grant all on fitswap_t.ctx to authenticated;

create function fitswap_t.mk_offer(p_title text, p_mode text, p_loc text, p_max int default 1,
                                   p_provider text default 'peer', p_qual text default null)
returns uuid language sql as $$
  select public.fitswap_save_offer(null, p_title, 'A friendly description of the session.', 'running',
    'workout_partner', 30, p_mode, p_loc, array['mon','sat'], array['morning'], null, p_max, null, p_provider, p_qual);
$$;
grant execute on function fitswap_t.mk_offer(text,text,text,int,text,text) to authenticated;

-- =====================================================================
-- Offers: create, validate, edit, pause, reactivate, delete
-- =====================================================================
select fitswap_t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into fitswap_t.ctx select 'offer', fitswap_t.mk_offer('Sunday easy run', 'in_person', 'Riverside park');
select fitswap_t.ok((select count(*) from public.fitswap_offers) = 1, 'offer created');

select fitswap_t.fails($$select fitswap_t.mk_offer('ab', 'online', null)$$, '%Title%', 'short title rejected');
select fitswap_t.fails($$select fitswap_t.mk_offer('Good title', 'in_person', null)$$, '%meeting area%',
  'in-person offer needs a general area');
select fitswap_t.fails($$select public.fitswap_save_offer(null,'Good title','A friendly description here.','running',
  'workout_partner',30,'online',null,array[]::text[],array['morning'],null,1,null,'peer',null)$$,
  '%available day%', 'availability days required');
select fitswap_t.fails($$select public.fitswap_save_offer(null,'Good title','A friendly description here.','swimming',
  'workout_partner',30,'online',null,array['mon'],array['morning'],null,1,null,'peer',null)$$,
  '%category%', 'unsupported category rejected');

insert into fitswap_t.ctx select 'pro', fitswap_t.mk_offer('Form check', 'online', null, 1, 'professional', 'Level 2 coach');
select fitswap_t.ok((select qualification_verified from public.fitswap_offers
  where id = (select v from fitswap_t.ctx where k = 'pro')) = false, 'new credentials start unverified');
insert into fitswap_t.ctx select 'peer', fitswap_t.mk_offer('Peer with creds', 'online', null, 1, 'peer', 'Marathon x3');
select fitswap_t.ok((select qualifications from public.fitswap_offers
  where id = (select v from fitswap_t.ctx where k = 'peer')) is null, 'peer offers store no qualifications');

select public.fitswap_save_offer((select v from fitswap_t.ctx where k = 'offer'), 'Sunday long run',
  'A friendly description of the session.', 'running', 'workout_partner', 45, 'in_person', 'Riverside park',
  array['sun'], array['morning'], null, 1, null, 'peer', null);
select fitswap_t.ok((select title from public.fitswap_offers
  where id = (select v from fitswap_t.ctx where k = 'offer')) = 'Sunday long run', 'owner can edit offer');

select fitswap_t.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select fitswap_t.fails($$select public.fitswap_set_offer_status((select v from fitswap_t.ctx where k='offer'),'paused')$$,
  '%not found%', 'non-owner cannot pause');
select fitswap_t.fails($$select public.fitswap_save_offer((select v from fitswap_t.ctx where k='offer'),'Hijacked title',
  'A friendly description here.','running','workout_partner',30,'online',null,array['mon'],array['morning'],null,1,null,'peer',null)$$,
  '%not found%', 'non-owner cannot edit');

select fitswap_t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select public.fitswap_set_offer_status((select v from fitswap_t.ctx where k = 'offer'), 'paused');
select fitswap_t.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select fitswap_t.ok((select count(*) from public.fitswap_offers
  where id = (select v from fitswap_t.ctx where k = 'offer')) = 0, 'paused offer hidden from others');
select fitswap_t.fails($$select public.fitswap_request_offer((select v from fitswap_t.ctx where k='offer'),
  now() + interval '2 days', null, null)$$, '%not available%', 'cannot request a paused offer');
select fitswap_t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select public.fitswap_set_offer_status((select v from fitswap_t.ctx where k = 'offer'), 'active');
select fitswap_t.ok((select status from public.fitswap_offers
  where id = (select v from fitswap_t.ctx where k = 'offer')) = 'active', 'offer reactivated');

-- Direct table writes are blocked: everything goes through the validated functions.
select fitswap_t.fails($$insert into public.fitswap_offers (user_id,title,description,category,support_type,duration_minutes,
  delivery_mode,availability_days,time_windows) values (auth.uid(),'Direct insert','Bypassing the function.','yoga',
  'workout_partner',30,'online',array['mon'],array['morning'])$$, '%row-level security%', 'direct offer insert blocked');
update public.fitswap_offers set qualification_verified = true;
select fitswap_t.as_admin();
select fitswap_t.ok((select count(*) from public.fitswap_offers where qualification_verified) = 0,
  'client cannot self-verify credentials');
select fitswap_t.as_user('aaaaaaaa-0000-0000-0000-000000000001');

-- =====================================================================
-- Requests
-- =====================================================================
select fitswap_t.fails($$select public.fitswap_request_offer((select v from fitswap_t.ctx where k='offer'),
  now() + interval '2 days', null, null)$$, '%own offer%', 'self-request blocked');

select fitswap_t.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select fitswap_t.fails($$select public.fitswap_request_offer((select v from fitswap_t.ctx where k='offer'),
  now() + interval '10 minutes', null, null)$$, '%at least one hour%', 'past/too-soon time rejected');
insert into fitswap_t.ctx select 'req', public.fitswap_request_offer(
  (select v from fitswap_t.ctx where k='offer'), now() + interval '2 days', 'Hi!', 'Run my first 5K');
select fitswap_t.fails($$select public.fitswap_request_offer((select v from fitswap_t.ctx where k='offer'),
  now() + interval '3 days', null, null)$$, '%already have an active request%', 'duplicate active request blocked');

-- Withdraw then re-request is allowed.
select public.fitswap_cancel_request((select v from fitswap_t.ctx where k='req'));
select public.fitswap_cancel_request((select v from fitswap_t.ctx where k='req'));  -- idempotent
insert into fitswap_t.ctx select 'req2', public.fitswap_request_offer(
  (select v from fitswap_t.ctx where k='offer'), now() + interval '2 days', 'Hi again', null);

-- Only the provider can respond.
select fitswap_t.fails($$select public.fitswap_respond_request((select v from fitswap_t.ctx where k='req2'), true)$$,
  '%not found%', 'requester cannot accept their own request');
select fitswap_t.as_user('cccccccc-0000-0000-0000-000000000003');
select fitswap_t.fails($$select public.fitswap_respond_request((select v from fitswap_t.ctx where k='req2'), true)$$,
  '%not found%', 'bystander cannot accept');
select fitswap_t.ok((select count(*) from public.fitswap_requests) = 0, 'bystander cannot read requests');

-- Decline path
select fitswap_t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select public.fitswap_respond_request((select v from fitswap_t.ctx where k='req2'), false);
select fitswap_t.ok((select status from public.fitswap_requests
  where id = (select v from fitswap_t.ctx where k='req2')) = 'declined', 'request declined');
select fitswap_t.fails($$select public.fitswap_respond_request((select v from fitswap_t.ctx where k='req2'), true)$$,
  '%already been handled%', 'declined request cannot be accepted');

-- Accept path (fresh request)
select fitswap_t.as_user('bbbbbbbb-0000-0000-0000-000000000002');
insert into fitswap_t.ctx select 'req3', public.fitswap_request_offer(
  (select v from fitswap_t.ctx where k='offer'), now() + interval '2 days', null, null);
select fitswap_t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into fitswap_t.ctx select 'ex', public.fitswap_respond_request((select v from fitswap_t.ctx where k='req3'), true);
select fitswap_t.ok((select v from fitswap_t.ctx where k='ex') is not null, 'accept creates an exchange');
select fitswap_t.ok(public.fitswap_respond_request((select v from fitswap_t.ctx where k='req3'), true)
  = (select v from fitswap_t.ctx where k='ex'), 'accept retry returns the same exchange (idempotent)');
select fitswap_t.ok((select count(*) from public.fitswap_exchanges) = 1, 'retry created no duplicate exchange');

-- =====================================================================
-- Exchange state machine
-- =====================================================================
select fitswap_t.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select fitswap_t.ok((select count(*) from public.fitswap_exchanges) = 1, 'recipient can see their exchange');
select fitswap_t.fails($$select public.fitswap_confirm_completion((select v from fitswap_t.ctx where k='ex'))$$,
  '%not marked this session done%', 'cannot confirm before provider marks done');
select fitswap_t.fails($$select public.fitswap_mark_delivered((select v from fitswap_t.ctx where k='ex'))$$,
  '%not found%', 'recipient cannot mark delivered');
update public.fitswap_exchanges set status = 'completed';
select fitswap_t.ok((select status from public.fitswap_exchanges) = 'accepted', 'direct status update has no effect');

select fitswap_t.as_user('cccccccc-0000-0000-0000-000000000003');
select fitswap_t.ok((select count(*) from public.fitswap_exchanges) = 0, 'outsider cannot read exchanges');
select fitswap_t.fails($$select public.fitswap_cancel_exchange((select v from fitswap_t.ctx where k='ex'), 'x')$$,
  '%not found%', 'outsider cannot cancel');
select fitswap_t.fails($$select public.fitswap_submit_feedback((select v from fitswap_t.ctx where k='ex'), 5, 'x')$$,
  '%not found%', 'outsider cannot leave feedback');

select fitswap_t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select fitswap_t.fails($$select public.fitswap_mark_delivered((select v from fitswap_t.ctx where k='ex'))$$,
  '%has started%', 'cannot mark done before the session starts');
select fitswap_t.fails($$select public.fitswap_dispute_exchange((select v from fitswap_t.ctx where k='ex'),'no_show',null)$$,
  '%start time has passed%', 'cannot dispute before the session starts');
select fitswap_t.fails($$select public.fitswap_submit_feedback((select v from fitswap_t.ctx where k='ex'), 5, null)$$,
  '%once the session is completed%', 'no feedback before completion');

-- Time passes.
select fitswap_t.as_admin();
update public.fitswap_exchanges set scheduled_start_at = now() - interval '1 hour';
select fitswap_t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select public.fitswap_mark_delivered((select v from fitswap_t.ctx where k='ex'));
select public.fitswap_mark_delivered((select v from fitswap_t.ctx where k='ex'));  -- retry is a no-op
select fitswap_t.ok((select status from public.fitswap_exchanges) = 'completion_pending', 'provider marks done');
select fitswap_t.fails($$select public.fitswap_confirm_completion((select v from fitswap_t.ctx where k='ex'))$$,
  '%not found%', 'provider cannot confirm their own session');
select fitswap_t.fails($$select public.fitswap_cancel_exchange((select v from fitswap_t.ctx where k='ex'), null)$$,
  '%no longer be cancelled%', 'cannot cancel once marked done');

select fitswap_t.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select public.fitswap_confirm_completion((select v from fitswap_t.ctx where k='ex'));
select public.fitswap_confirm_completion((select v from fitswap_t.ctx where k='ex'));  -- retry is a no-op
select fitswap_t.ok((select status from public.fitswap_exchanges) = 'completed', 'recipient confirms completion');
select fitswap_t.ok((select count(*) from public.fitswap_member_stats
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and completed_provided = 1 and minutes_provided = 45) = 1,
  'completed exchange counted exactly once');
select fitswap_t.fails($$select public.fitswap_dispute_exchange((select v from fitswap_t.ctx where k='ex'),'no_show',null)$$,
  '%no longer be disputed%', 'completed session cannot be disputed');

-- Request is free again after completion (not blocked as "active").
insert into fitswap_t.ctx select 'req4', public.fitswap_request_offer(
  (select v from fitswap_t.ctx where k='offer'), now() + interval '5 days', null, null);
select fitswap_t.ok(true, 'can request the same offer again after completion');

-- =====================================================================
-- Feedback: eligibility, duplicates, blind reviews
-- =====================================================================
select fitswap_t.fails($$select public.fitswap_submit_feedback((select v from fitswap_t.ctx where k='ex'), 9, null)$$,
  '%rating%', 'invalid rating rejected');
select public.fitswap_submit_feedback((select v from fitswap_t.ctx where k='ex'), 5, 'Great run');
select fitswap_t.fails($$select public.fitswap_submit_feedback((select v from fitswap_t.ctx where k='ex'), 1, 'again')$$,
  '%already left feedback%', 'duplicate feedback rejected');

select fitswap_t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select fitswap_t.ok((select count(*) from public.fitswap_feedback where reviewed_user_id = auth.uid()) = 0,
  'feedback hidden until the reviewed member has left their own');
select fitswap_t.ok((select rating_count from public.fitswap_member_stats where user_id = auth.uid()) = 0,
  'hidden feedback not counted publicly');
select public.fitswap_submit_feedback((select v from fitswap_t.ctx where k='ex'), 4, 'Thanks!');
select fitswap_t.ok((select count(*) from public.fitswap_feedback where reviewed_user_id = auth.uid()) = 1,
  'feedback revealed after both submit');
select fitswap_t.ok((select avg_rating from public.fitswap_member_stats where user_id = auth.uid()) = 5.0,
  'public rating reflects revealed feedback');

-- =====================================================================
-- Cancellation, capacity, disputes, moderation
-- =====================================================================
select fitswap_t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
-- req4 (B again): accept, then B cancels, then B may request again.
select fitswap_t.ok(public.fitswap_respond_request((select v from fitswap_t.ctx where k='req4'), true) is not null,
  'second exchange accepted');
insert into fitswap_t.ctx select 'ex2', id from public.fitswap_exchanges where request_id = (select v from fitswap_t.ctx where k='req4');
select fitswap_t.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select public.fitswap_cancel_exchange((select v from fitswap_t.ctx where k='ex2'), 'Sick');
select public.fitswap_cancel_exchange((select v from fitswap_t.ctx where k='ex2'), 'Sick');  -- idempotent
select fitswap_t.ok((select status from public.fitswap_exchanges
  where id = (select v from fitswap_t.ctx where k='ex2')) = 'cancelled', 'participant cancels a session');
select fitswap_t.ok(public.fitswap_request_offer((select v from fitswap_t.ctx where k='offer'),
  now() + interval '6 days', null, null) is not null, 'cancelled session frees the offer for a new request');

-- Capacity for a 1-person offer.
select fitswap_t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into fitswap_t.ctx select 'cap', fitswap_t.mk_offer('Solo coaching', 'online', null, 1);
-- B has used its hourly request allowance above; age those requests so the limit isn't hit here.
select fitswap_t.as_admin();
update public.fitswap_requests set created_at = now() - interval '2 hours';
select fitswap_t.as_user('bbbbbbbb-0000-0000-0000-000000000002');
insert into fitswap_t.ctx select 'cap_b', public.fitswap_request_offer((select v from fitswap_t.ctx where k='cap'), date_trunc('hour', now() + interval '3 days'), null, null);
select fitswap_t.as_user('cccccccc-0000-0000-0000-000000000003');
insert into fitswap_t.ctx select 'cap_c', public.fitswap_request_offer((select v from fitswap_t.ctx where k='cap'), date_trunc('hour', now() + interval '3 days'), null, null);
select fitswap_t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select public.fitswap_respond_request((select v from fitswap_t.ctx where k='cap_b'), true);
select fitswap_t.fails($$select public.fitswap_respond_request((select v from fitswap_t.ctx where k='cap_c'), true)$$,
  '%slot is already full%', 'accepting beyond max participants is blocked');

-- Dispute after the start time freezes the exchange; moderator resolves it with an audit trail.
select fitswap_t.as_admin();
update public.fitswap_exchanges set scheduled_start_at = now() - interval '2 hours'
  where offer_id = (select v from fitswap_t.ctx where k='cap');
select fitswap_t.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select public.fitswap_dispute_exchange(
  (select id from public.fitswap_exchanges where offer_id = (select v from fitswap_t.ctx where k='cap')),
  'no_show', 'Provider never joined');
select fitswap_t.ok((select status from public.fitswap_exchanges
  where offer_id = (select v from fitswap_t.ctx where k='cap')) = 'disputed', 'dispute freezes the exchange');
select fitswap_t.ok((select count(*) from public.fitswap_reports where kind = 'dispute' and reporter_id = auth.uid()) = 1,
  'dispute creates a report');
insert into fitswap_t.ctx select 'dx', id from public.fitswap_exchanges where offer_id = (select v from fitswap_t.ctx where k='cap');
select fitswap_t.fails($$select public.fitswap_resolve_dispute((select v from fitswap_t.ctx where k='dx'),'cancelled','nope nope')$$,
  '%not allowed%', 'non-moderator cannot resolve disputes');

select fitswap_t.as_user('dddddddd-0000-0000-0000-000000000004');
select fitswap_t.fails($$select public.fitswap_resolve_dispute((select v from fitswap_t.ctx where k='dx'),'cancelled','')$$,
  '%reason is required%', 'moderator must give a reason');
select public.fitswap_resolve_dispute((select v from fitswap_t.ctx where k='dx'), 'cancelled', 'No evidence provider attended');
select fitswap_t.as_admin();
select fitswap_t.ok((select status from public.fitswap_exchanges where id = (select v from fitswap_t.ctx where k='dx')) = 'cancelled',
  'moderator resolved dispute');
select fitswap_t.ok((select count(*) from public.fitswap_audit_log where action = 'resolve_dispute:cancelled') = 1,
  'moderation action audited');

-- Moderator verifies credentials; editing them resets verification; peers cannot be "verified".
select fitswap_t.as_user('dddddddd-0000-0000-0000-000000000004');
select public.fitswap_moderate_offer((select v from fitswap_t.ctx where k='pro'), null, true, 'Certificate checked');
select fitswap_t.ok((select qualification_verified from public.fitswap_offers
  where id = (select v from fitswap_t.ctx where k='pro')), 'moderator verifies a professional offer');
select fitswap_t.fails($$select public.fitswap_moderate_offer((select v from fitswap_t.ctx where k='peer'), null, true, 'Verify peer')$$,
  '%violates check constraint%', 'peer offers cannot be marked verified');
select fitswap_t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select public.fitswap_save_offer((select v from fitswap_t.ctx where k='pro'), 'Form check', 'A friendly description here.',
  'gym', 'skill_exchange', 30, 'online', null, array['mon'], array['morning'], null, 1, null, 'professional', 'Different cert');
select fitswap_t.ok((select qualification_verified from public.fitswap_offers
  where id = (select v from fitswap_t.ctx where k='pro')) = false, 'changing credentials clears verification');
select fitswap_t.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select fitswap_t.fails($$select public.fitswap_moderate_offer((select v from fitswap_t.ctx where k='pro'), 'removed', null, 'trying')$$,
  '%not allowed%', 'non-moderator cannot moderate');
select fitswap_t.ok((select count(*) from public.fitswap_audit_log) = 0, 'audit log not readable by members');

-- =====================================================================
-- Reports and rate limiting
-- =====================================================================
select fitswap_t.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select public.fitswap_report('aaaaaaaa-0000-0000-0000-000000000001', null, null, 'unsafe_behavior', 'Suggested a private location');
select fitswap_t.fails($$select public.fitswap_report(auth.uid(), null, null, 'spam', null)$$, '%yourself%', 'cannot report yourself');
select fitswap_t.fails($$select public.fitswap_report('aaaaaaaa-0000-0000-0000-000000000001', null, null, 'rude', null)$$,
  '%Choose a reason%', 'invalid report reason rejected');
select fitswap_t.ok((select count(*) from public.fitswap_reports) >= 1, 'reporter can read their own reports');
select fitswap_t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select fitswap_t.ok((select count(*) from public.fitswap_reports) = 0, 'reported member cannot read reports about them');

-- Request rate limit: 5 requests per hour per member. C already made one (cap_c).
select fitswap_t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into fitswap_t.ctx select 'rl' || i, fitswap_t.mk_offer('Rate test ' || i, 'online', null) from generate_series(1, 5) i;
select fitswap_t.as_user('cccccccc-0000-0000-0000-000000000003');
select public.fitswap_request_offer((select v from fitswap_t.ctx where k='rl'||i), now() + interval '2 days', null, null)
  from generate_series(1, 4) i;
select fitswap_t.fails($$select public.fitswap_request_offer((select v from fitswap_t.ctx where k='rl5'), now() + interval '2 days', null, null)$$,
  '%Too many requests%', 'requests are rate limited');

select fitswap_t.as_admin();
select 'ALL FITSWAP DB TESTS PASSED' as result;
rollback;
