import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Field, OptionChips, SafetyNote, toggle } from '../../components/fitswap';
import { Button, ErrorNote, Loading, Screen } from '../../components/ui';
import {
  CATEGORIES,
  DAYS,
  DELIVERY_MODES,
  DURATIONS,
  EMPTY_OFFER,
  OfferInput,
  PEER_SUPPORT_NOTE,
  SUPPORT_TYPES,
  validateOffer,
  WINDOWS,
} from '../../lib/fitswap';
import { getOffer, saveOffer } from '../../lib/fitswapApi';
import { colors, type } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

export default function OfferForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const [form, setForm] = useState<OfferInput>(EMPTY_OFFER);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { loading, error } = useAsync(async () => {
    if (!id) return null;
    const o = await getOffer(id);
    setForm({
      title: o.title,
      description: o.description,
      category: o.category,
      supportType: o.support_type,
      durationMinutes: o.duration_minutes,
      deliveryMode: o.delivery_mode,
      generalLocation: o.general_location ?? '',
      availabilityDays: o.availability_days,
      timeWindows: o.time_windows,
      availabilityNote: o.availability_note ?? '',
      maxParticipants: o.max_participants,
      prerequisites: o.prerequisites ?? '',
      providerType: o.provider_type,
      qualifications: o.qualifications ?? '',
    });
    return o;
  }, [id]);

  const set = <K extends keyof OfferInput>(k: K, v: OfferInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    const found = validateOffer(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setSubmitError(null);
    try {
      await saveOffer(id ?? null, form);
      router.back();
    } catch (e: any) {
      setSubmitError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (id && loading) return <Loading />;
  const inPerson = form.deliveryMode === 'in_person' || form.deliveryMode === 'either';

  return (
    <Screen edges={[]}>
      <Text style={type.display}>{id ? 'Edit offer' : 'Offer help'}</Text>
      <ErrorNote message={error} />
      <SafetyNote text={PEER_SUPPORT_NOTE} />

      <Field label="Title" value={form.title} onChangeText={(v) => set('title', v)} maxLength={80} error={errors.title} placeholder="e.g. Easy Sunday run for beginners" />
      <Field label="Description" multiline value={form.description} onChangeText={(v) => set('description', v)} maxLength={1000} error={errors.description} placeholder="What will you do together? Who is it for?" />
      <OptionChips label="Category" options={CATEGORIES} value={form.category} onChange={(v) => set('category', v)} error={errors.category} />
      <OptionChips label="Type of support" options={SUPPORT_TYPES} value={form.supportType} onChange={(v) => set('supportType', v)} error={errors.supportType} />
      <OptionChips
        label="Session length"
        options={DURATIONS.map((d) => ({ value: String(d), label: `${d} min` }))}
        value={String(form.durationMinutes)}
        onChange={(v) => set('durationMinutes', Number(v))}
        error={errors.durationMinutes}
      />
      <OptionChips label="Where" options={DELIVERY_MODES} value={form.deliveryMode} onChange={(v) => set('deliveryMode', v)} error={errors.deliveryMode} />
      {inPerson && (
        <Field
          label="General meeting area"
          value={form.generalLocation}
          onChangeText={(v) => set('generalLocation', v)}
          maxLength={80}
          error={errors.generalLocation}
          placeholder="e.g. Riverside park"
          hint="Share a suburb or public place, never your home address."
        />
      )}
      <OptionChips label="Days available" options={DAYS} value={form.availabilityDays} onChange={(v) => set('availabilityDays', toggle(form.availabilityDays, v))} error={errors.availabilityDays} />
      <OptionChips label="Time of day" options={WINDOWS} value={form.timeWindows} onChange={(v) => set('timeWindows', toggle(form.timeWindows, v))} error={errors.timeWindows} />
      <Field label="Schedule note (optional)" value={form.availabilityNote} onChangeText={(v) => set('availabilityNote', v)} maxLength={200} error={errors.availabilityNote} placeholder="e.g. Not available in school holidays" />
      <OptionChips
        label="Maximum participants"
        options={[1, 2, 3, 4, 5, 8, 10].map((n) => ({ value: String(n), label: String(n) }))}
        value={String(form.maxParticipants)}
        onChange={(v) => set('maxParticipants', Number(v))}
        error={errors.maxParticipants}
      />
      <Field label="Prerequisites (optional)" value={form.prerequisites} onChangeText={(v) => set('prerequisites', v)} maxLength={300} error={errors.prerequisites} placeholder="e.g. Able to walk 30 minutes" />

      <OptionChips
        label="Who is offering?"
        options={[
          { value: 'peer', label: 'Peer support' },
          { value: 'professional', label: 'Qualified professional' },
        ]}
        value={form.providerType}
        onChange={(v) => set('providerType', v as OfferInput['providerType'])}
      />
      {form.providerType === 'professional' && (
        <View style={{ gap: 8 }}>
          <Field label="Qualifications" value={form.qualifications} onChangeText={(v) => set('qualifications', v)} maxLength={300} error={errors.qualifications} placeholder="e.g. Level 2 gym instructor" />
          <Text style={[type.small, { color: colors.inkSoft }]}>
            Listed as “Credentials not verified” until a moderator reviews them. Do not give medical advice or rehabilitation.
          </Text>
        </View>
      )}

      <ErrorNote message={submitError} />
      <Button label={id ? 'Save changes' : 'Publish offer'} busy={busy} onPress={submit} />
    </Screen>
  );
}
