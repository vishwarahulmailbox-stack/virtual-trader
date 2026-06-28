# VirtualTrader v2 — Cloud Auth Setup Guide

Your portfolio is now stored in Supabase instead of localStorage.  
This means you can log in from any device and your trades follow you everywhere.

---

## Step 1 — Create a free Supabase project

1. Go to [https://supabase.com](https://supabase.com) and sign up (free).
2. Click **New Project**, give it a name (e.g. `virtual-trader`), choose a region close to India (Singapore works well), set a database password, and click **Create**.
3. Wait ~2 min for it to provision.

---

## Step 2 — Create the database table

In your Supabase dashboard, go to **SQL Editor** and run this SQL:

```sql
-- Table to store each user's portfolio state
CREATE TABLE trader_state (
  user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  capital   NUMERIC NOT NULL DEFAULT 10000,
  portfolio JSONB   NOT NULL DEFAULT '{}',
  trades    JSONB   NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security: users can only read/write their own row
ALTER TABLE trader_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own state" ON trader_state
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

## Step 3 — Get your API keys

In Supabase dashboard → **Settings → API**:

- Copy **Project URL** → this is your `NEXT_PUBLIC_SUPABASE_URL`
- Copy **anon / public** key → this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Step 4 — Add environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Step 5 — Configure email auth (optional but recommended)

In Supabase dashboard → **Authentication → Providers → Email**:
- Enable **Confirm email** if you want email verification (recommended for production).
- For local dev you can disable it so signup is instant.

If you deploy to Vercel/Netlify, also set:
- **Authentication → URL Configuration → Site URL** to your production URL.
- Add your production URL to **Redirect URLs** too.

---

## Step 6 — Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll see the login screen.

---

## What changed from v1

| Feature | v1 (localStorage) | v2 (Supabase) |
|---|---|---|
| Storage | Browser only | Cloud (any device) |
| Login | None | Email + Password |
| Data loss on clear | Yes | No |
| Multi-device | No | Yes |
| Sync status | "Auto-saved" | "☁️ Synced" indicator |

---

## Project structure

```
src/
  app/
    api/
      auth/callback/route.ts   ← Supabase email confirmation handler
      trader/route.ts          ← Load/save portfolio state (server-side)
      price/route.ts           ← Stock price fetcher (unchanged)
      search/route.ts          ← Stock search (unchanged)
      top-movers/route.ts      ← Top movers (unchanged)
    layout.tsx
    page.tsx                   ← Session-aware root: shows Auth or Trader
  components/
    AuthPage.tsx               ← Login / Signup / Forgot password
    VirtualTrader.tsx          ← Main trading UI (cloud sync added)
  lib/
    supabase-client.ts         ← Browser Supabase client
    supabase-server.ts         ← Server Supabase client (for API routes)
```
