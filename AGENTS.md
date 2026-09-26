<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Riff

Product spec: `SPEC.md` (scope, game design, architecture). Read the relevant section before building a feature.

## Stack

Next.js 16 App Router + TypeScript + Tailwind 4 · Supabase (Postgres, Realtime, anonymous auth, Storage) · Vercel. See SPEC.md §6.

- Schema + RLS: `supabase/migrations/`. Shared types: `lib/types.ts`.
- Browser DB access: `supabase()` / `ensureSignedIn()` from `lib/supabase/client.ts`. API routes: `supabaseAdmin()` from `lib/supabase/admin.ts` (service role; server only).
- Live updates: `subscribeToRiff()` from `lib/supabase/realtime.ts`. Load state in its `onReady`, never on SUBSCRIBED.
- Checks: `npm run typecheck`, `npm test` (Vitest), `npm run lint`.

## Parallel work: lanes

Three tools work at once, each in its own git worktree. Your lane comes from your branch:

| Branch | Lane | Owns |
|---|---|---|
| `claude/engine` | Engine | `/api/round`, `/api/judge`, `/api/advance`, `/api/talk`, state machine, scoring, Bonus Round |
| `cursor/ui` | UI | pages and components: chat, round cards, animations, mobile feel |
| `codex/media` | Media | `/api/image`, `/api/transcribe`, meme audio, `public/clips/`, `clips.json` |

- Work comes from GitHub issues labelled with your lane (`lane:engine`, `lane:ui`, `lane:media`) and `ready-for-agent`. Skip any issue with an open blocker. Put `Closes #<n>` in the commit that finishes it.
- Commit only to your own branch. Never merge into or push `main`; the human does that.
- Stay in your lane's files. Need something outside it? Stop and say so.
- `lib/types.ts`, `supabase/migrations/` and `package.json` change only on `main`. Need a new type, column or package? Stop and ask.
- Run `git merge main` before starting each new issue.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `Devaj6190/Riff`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
