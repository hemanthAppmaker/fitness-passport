import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import type { ColorValue } from 'react-native';
import { colors } from '../../lib/theme';

const icon = (name: keyof typeof Ionicons.glyphMap, focused: keyof typeof Ionicons.glyphMap) =>
  ({ color, focused: f, size }: { color: ColorValue; focused: boolean; size: number }) =>
    <Ionicons name={f ? focused : name} size={size} color={color as string} />;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line },
        tabBarLabelStyle: { fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Journey', tabBarIcon: icon('trail-sign-outline', 'trail-sign') }} />
      <Tabs.Screen name="challenges" options={{ title: 'Challenges', tabBarIcon: icon('compass-outline', 'compass') }} />
      <Tabs.Screen name="fitswap" options={{ title: 'FitSwap', tabBarIcon: icon('swap-horizontal-outline', 'swap-horizontal') }} />
      <Tabs.Screen name="people" options={{ title: 'People', tabBarIcon: icon('people-outline', 'people') }} />
      <Tabs.Screen name="passport" options={{ title: 'Passport', tabBarIcon: icon('book-outline', 'book') }} />
    </Tabs>
  );
}
