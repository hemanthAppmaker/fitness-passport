import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ErrorNote, Stamp } from '../components/ui';
import { updateProfile } from '../lib/api';
import { supabase } from '../lib/supabase';
import { colors, radius, type } from '../lib/theme';

export default function SignIn() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login() {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      await updateProfile(data.user!.id, { display_name: name.trim() });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <View style={{ alignItems: 'center', gap: 16 }}>
          <Stamp label="5K" color={colors.stamp} date={new Date().toISOString()} size={120} />
          <Text style={[type.display, { textAlign: 'center' }]}>Fitness Passport</Text>
          <Text style={[type.body, { textAlign: 'center', color: colors.inkSoft }]}>
            Pick a challenge, reach milestones, and collect stamps with people on the same path.
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor={colors.inkSoft}
            autoComplete="name"
            textContentType="name"
            returnKeyType="go"
            value={name}
            onChangeText={setName}
            onSubmitEditing={() => name.trim() && login()}
          />
          <ErrorNote message={error} />
          <Button label="Login" onPress={login} busy={busy} disabled={!name.trim()} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 32 },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    height: 52,
    fontSize: 16,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
