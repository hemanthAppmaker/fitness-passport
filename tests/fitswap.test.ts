// Run with: npm test   (Node's built-in test runner; no extra dependencies)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  availableDates,
  availableSlots,
  canTransition,
  contributionMilestones,
  EMPTY_OFFER,
  exchangeActions,
  groupExchanges,
  providerBadge,
  ratingSummary,
  slotToIso,
  validateOffer,
  type ExchangeStatus,
  type OfferInput,
} from '../lib/fitswap.ts';

const valid: OfferInput = {
  ...EMPTY_OFFER,
  title: 'Sunday easy run',
  description: 'A relaxed pace run for beginners.',
  category: 'running',
  supportType: 'workout_partner',
  deliveryMode: 'in_person',
  generalLocation: 'Riverside park',
  availabilityDays: ['sun'],
  timeWindows: ['morning'],
};

test('a complete offer is valid', () => {
  assert.deepEqual(validateOffer(valid), {});
});

test('offer validation covers required fields, lengths and categories', () => {
  assert.ok(validateOffer({ ...valid, title: 'ab' }).title);
  assert.ok(validateOffer({ ...valid, title: 'x'.repeat(81) }).title);
  assert.ok(validateOffer({ ...valid, description: 'short' }).description);
  assert.ok(validateOffer({ ...valid, category: 'swimming' }).category);
  assert.ok(validateOffer({ ...valid, supportType: '' }).supportType);
  assert.ok(validateOffer({ ...valid, durationMinutes: 20 }).durationMinutes);
  assert.ok(validateOffer({ ...valid, availabilityDays: [] }).availabilityDays);
  assert.ok(validateOffer({ ...valid, availabilityDays: ['funday'] }).availabilityDays);
  assert.ok(validateOffer({ ...valid, timeWindows: [] }).timeWindows);
  assert.ok(validateOffer({ ...valid, maxParticipants: 0 }).maxParticipants);
  assert.ok(validateOffer({ ...valid, maxParticipants: 11 }).maxParticipants);
});

test('in-person offers need a general area, online offers do not', () => {
  assert.ok(validateOffer({ ...valid, generalLocation: '  ' }).generalLocation);
  assert.deepEqual(validateOffer({ ...valid, deliveryMode: 'online', generalLocation: '' }), {});
  assert.ok(validateOffer({ ...valid, deliveryMode: 'either', generalLocation: '' }).generalLocation);
});

test('valid and invalid exchange transitions', () => {
  const ok: [ExchangeStatus, ExchangeStatus][] = [
    ['accepted', 'completion_pending'],
    ['accepted', 'cancelled'],
    ['accepted', 'disputed'],
    ['completion_pending', 'completed'],
    ['completion_pending', 'disputed'],
  ];
  for (const [a, b] of ok) assert.ok(canTransition(a, b), `${a} -> ${b}`);
  const bad: [ExchangeStatus, ExchangeStatus][] = [
    ['accepted', 'completed'], // cannot skip provider mark + recipient confirmation
    ['completion_pending', 'cancelled'],
    ['completed', 'cancelled'],
    ['completed', 'accepted'],
    ['cancelled', 'accepted'],
  ];
  for (const [a, b] of bad) assert.ok(!canTransition(a, b), `${a} -> ${b}`);
});

test('actions offered depend on role, status and time', () => {
  const past = '2020-01-01T10:00:00Z';
  const future = '2999-01-01T10:00:00Z';
  assert.deepEqual(exchangeActions('accepted', 'provider', future, false), ['cancel']);
  assert.deepEqual(exchangeActions('accepted', 'recipient', future, false), ['cancel']);
  assert.deepEqual(exchangeActions('accepted', 'provider', past, false), ['mark_delivered', 'dispute']);
  assert.deepEqual(exchangeActions('accepted', 'recipient', past, false), ['dispute']);
  assert.deepEqual(exchangeActions('completion_pending', 'recipient', past, false), ['confirm', 'dispute']);
  assert.deepEqual(exchangeActions('completion_pending', 'provider', past, false), ['dispute']);
  assert.deepEqual(exchangeActions('completed', 'provider', past, false), ['feedback']);
  assert.deepEqual(exchangeActions('completed', 'provider', past, true), []);
  assert.deepEqual(exchangeActions('cancelled', 'provider', past, false), []);
  assert.deepEqual(exchangeActions('disputed', 'recipient', past, false), []);
});

test('exchanges are grouped for the My Exchanges screen', () => {
  const me = 'me';
  const requests = [
    { id: 'r1', status: 'pending' as const, requester_id: 'x', provider_id: me, requested_start_at: '2030-01-02T00:00:00Z' },
    { id: 'r2', status: 'pending' as const, requester_id: me, provider_id: 'x', requested_start_at: '2030-01-03T00:00:00Z' },
    { id: 'r3', status: 'declined' as const, requester_id: me, provider_id: 'x', requested_start_at: '2030-01-04T00:00:00Z' },
    { id: 'r4', status: 'accepted' as const, requester_id: me, provider_id: 'x', requested_start_at: '2030-01-05T00:00:00Z' },
  ];
  const exchanges = [
    { id: 'e1', status: 'accepted' as const, scheduled_start_at: '2030-02-02T00:00:00Z' },
    { id: 'e0', status: 'accepted' as const, scheduled_start_at: '2030-02-01T00:00:00Z' },
    { id: 'e2', status: 'completion_pending' as const, scheduled_start_at: '2030-01-01T00:00:00Z' },
    { id: 'e3', status: 'completed' as const, scheduled_start_at: '2029-01-01T00:00:00Z' },
    { id: 'e4', status: 'disputed' as const, scheduled_start_at: '2029-01-01T00:00:00Z' },
  ];
  const groups = groupExchanges(requests, exchanges, me);
  assert.deepEqual(groups.map((g) => g.key), ['incoming', 'pending', 'upcoming', 'awaiting', 'completed', 'closed']);
  const ids = (key: string) =>
    groups.find((g) => g.key === key)!.items.map((i) => (i.kind === 'request' ? i.request.id : i.exchange.id));
  assert.deepEqual(ids('incoming'), ['r1']);
  assert.deepEqual(ids('pending'), ['r2']);
  assert.deepEqual(ids('upcoming'), ['e0', 'e1'], 'soonest first');
  assert.deepEqual(ids('closed'), ['r3', 'e4']);
  // An accepted request is represented by its exchange, not listed twice.
  assert.ok(!groups.some((g) => g.items.some((i) => i.kind === 'request' && i.request.id === 'r4')));
});

test('empty groups are omitted', () => {
  assert.deepEqual(groupExchanges([], [], 'me'), []);
});

test('session time choices follow the offer availability', () => {
  const now = new Date(2030, 0, 1, 9, 0); // Tuesday
  const dates = availableDates(['sat', 'sun'], now);
  assert.ok(dates.length > 0 && dates.every((d) => d.getDay() === 6 || d.getDay() === 0));
  assert.deepEqual(availableSlots(['evening']), ['17:00', '18:00', '19:00', '20:00']);
  assert.equal(availableSlots([]).length, 0);
});

test('slots less than an hour away are rejected', () => {
  const now = new Date(2030, 0, 1, 9, 0);
  const day = new Date(2030, 0, 1);
  assert.equal(slotToIso(day, '09:30', now), null);
  assert.equal(slotToIso(day, '10:00', now), new Date(2030, 0, 1, 10, 0).toISOString());
});

test('verification wording never overstates credentials', () => {
  assert.equal(providerBadge('peer', false), 'Peer support');
  assert.equal(providerBadge('professional', false), 'Credentials not verified');
  assert.equal(providerBadge('professional', true), 'Credentials verified');
});

test('reputation text is based on completed exchanges and reviews', () => {
  assert.equal(ratingSummary(0, 0, null), 'New to FitSwap');
  assert.equal(ratingSummary(3, 1, 5), '3 completed · 5.0 avg from 1 review');
  assert.equal(ratingSummary(12, 4, 4.5), '12 completed · 4.5 avg from 4 reviews');
});

test('contribution milestones reflect completed sessions', () => {
  assert.deepEqual(contributionMilestones(0).map((m) => m.reached), [false, false, false]);
  assert.deepEqual(contributionMilestones(5).map((m) => m.reached), [true, true, false]);
});
