# Webcoda Time Sync - Asana OAuth

Implementation scaffold generated from `Asana-OAuth-Spec.pdf`.

## Included files

- `src/server.js`: Express OAuth app with:
  - `GET /auth/asana?everhour_id=...`
  - `GET /auth/asana/callback`
- `src/asanaAuth.js`: token exchange, profile lookup, token upsert, token refresh helper
- `src/supabase.js`: Supabase service-role client
- `supabase/schema.sql`: reference schema (not required if table already exists)
- `.env.example`: required environment variables

## Setup

1. Install dependencies:
   - `npm install`
2. Copy env file:
   - `copy .env.example .env`
3. Fill environment values in `.env` (and in Vercel Project Settings -> Environment Variables for deployment)
4. Start server:
   - `npm run dev`

## OAuth URL format

Send each user a link like:

`https://your-app.vercel.app/auth/asana?everhour_id=848268`

The callback stores tokens in `asana_tokens` keyed by `everhour_user_id`.

Important: the callback path is `/auth/asana/callback` (not `/asana/callback`).
