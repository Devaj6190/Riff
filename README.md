# Riff

*For everything after hello.* An AI-hosted conversation game for two people. See [SPEC.md](SPEC.md).

## Setup

1. Create a Supabase project, then:
   - run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) in the SQL editor
   - enable **Authentication → Sign In / Providers → Allow anonymous sign-ins**
2. `cp .env.example .env.local` and fill it in.
3. `npm install`
4. `npm run dev`, then open two browsers (or one normal + one private window) to play against yourself.

## Scripts

`npm run dev` · `npm run build` · `npm run typecheck` · `npm test` · `npm run lint`
