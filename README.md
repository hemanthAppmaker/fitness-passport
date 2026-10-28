# Fitness Passport

A mobile app that turns fitness into a journey. Pick a challenge, complete milestones, collect passport stamps, and meet people on the same path.

Built with **Expo (React Native)** and **Supabase**.

## Features

- **Journey:** your active challenge, such as "From beginner to 5K runner", with "2 of 5 milestones" progress. Tap a milestone to complete it.
- **Challenges:** browse and join community challenges. Each one has milestones and an optional sponsor.
- **People:** find members who share your challenges and goals, then send and accept partner requests.
- **Passport:** stamps you've earned (awarded automatically when all milestones are done), plus your name, city and goals.

Progress is logged manually. No wearables or health data are needed.

## Tech stack

| Layer | Tool |
| --- | --- |
| App | Expo SDK 52, React Native, TypeScript |
| Navigation | Expo Router (file-based) |
| Backend | Supabase (Postgres, Auth, Row Level Security) |

## Prerequisites

- Node.js 18 or newer
- A free [Supabase](https://supabase.com) account
- The **Expo Go** app on your phone, or an iOS/Android simulator

## Setup

### 1. Create the Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project.
2. Open **SQL Editor** in the left sidebar and click **New query**.
3. Paste the full contents of `supabase/schema.sql` and click **Run**.

This creates the tables, security policies, triggers, the people-discovery function, and four starter challenges.

### 2. Turn off email confirmation (development only)

Go to **Authentication → Sign In / Providers → Email**, switch off **Confirm email**, and click **Save**. Otherwise new accounts must click an email link before signing in.

### 3. Add your API keys

1. In Supabase, open **Project Settings → API** (or **API Keys**).
2. Copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

3. Fill in the values:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
   ```

Use the **anon / publishable** key only. Never put the `service_role` key in the app.

### 4. Install and run

```bash
npm install
npx expo install --fix
npx expo start -c
```

Scan the QR code with Expo Go, or press `i` (iOS simulator) or `a` (Android emulator).

## Project structure

```
app/
  _layout.tsx          Root layout and sign-in redirect
  sign-in.tsx          Sign in / create account
  (tabs)/
    index.tsx          Journey tab
    challenges.tsx     Challenge list
    people.tsx         People discovery and partner requests
    passport.tsx       Stamps and profile
  challenge/[id].tsx   Challenge detail, join and leave
components/
  ui.tsx               Buttons, stamp, progress bar, milestone row
  journey.tsx          Progress header and milestone list
lib/
  supabase.ts          Supabase client
  api.ts               All database calls
  auth.tsx             Session context
  theme.ts             Colors, type, goal options
supabase/
  schema.sql           Tables, RLS, triggers, seed data
```

## How it works

- **Stamps:** a database trigger awards a stamp when a member completes every milestone in a challenge, and removes it if they untick one. The app cannot write stamps directly.
- **People discovery:** the `discover_people()` function ranks members by shared challenges (weighted x2) plus overlapping goals, and hides people you're already connected with.
- **Security:** Row Level Security is on for every table. Members can only read and change their own progress and memberships.

## Adding your own challenges

Insert rows into `challenges` and `milestones` (see the seed section at the bottom of `schema.sql`). Set `sponsor` to show a gym or brand partner on the challenge.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Invalid API key" or network errors | Check `.env`, then restart with `npx expo start -c` |
| Sign-up works but sign-in fails | Turn off **Confirm email** (step 2) or confirm the email |
| Challenges list is empty | Re-run `schema.sql` and make sure it finished without errors |
| Package version warnings | Run `npx expo install --fix` |

## Before a public launch

- Profiles are readable by every signed-in user so names can appear on partner requests. Tighten this policy.
- Turn email confirmation back on and add password reset.
- Add a privacy policy and account deletion, which the app stores require.

## Roadmap

- Auto-complete "Find two running partners" once a member has two accepted connections
- Events and RSVPs for paid meetups
- Premium challenges and subscriptions
- Push reminders for the next milestone
