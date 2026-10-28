import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from '../lib/auth';
import { colors } from '../lib/theme';

function Gate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const onSignIn = segments[0] === 'sign-in';
    if (!session && !onSignIn) router.replace('/sign-in');
    if (session && onSignIn) router.replace('/');
  }, [session, loading, segments]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.canvas },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="challenge/[id]" options={{ title: '', headerBackTitle: 'Back' }} />
      <Stack.Screen name="fitswap/offer-form" options={{ title: '', headerBackTitle: 'Back' }} />
      <Stack.Screen name="fitswap/offer/[id]" options={{ title: '', headerBackTitle: 'Back' }} />
      <Stack.Screen name="fitswap/exchange/[id]" options={{ title: '', headerBackTitle: 'Back' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Gate />
    </AuthProvider>
  );
}
