# Polla Mundial 2026

Private FIFA World Cup 2026 prediction pool for ~35–50 friends. Invite-only, multilingual (es/en/ko).

Full specification: [`docs/polla-prompt.md`](docs/polla-prompt.md)  
Build progress: [`PROGRESS.md`](PROGRESS.md)

---

## Prerequisites

- Node.js ≥ 20 (tested on 24.x)
- pnpm ≥ 9 (tested on 11.x)
- A [Supabase](https://supabase.com) project (free tier)
- A [Resend](https://resend.com) account (free tier: 3 000 emails/month)
- A [football-data.org](https://www.football-data.org) API key (free tier: 10 req/min)

## Setup

```bash
pnpm install
cp .env.example .env.local   # then fill in real values
pnpm dev                     # http://localhost:3000 → redirects to /es
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server) | Supabase service-role key — never expose to client |
| `FOOTBALL_DATA_API_KEY` | Yes | football-data.org API key |
| `RESEND_API_KEY` | Yes | Resend API key |
| `RESEND_FROM_EMAIL` | Yes | Verified sender email |
| `NEXT_PUBLIC_APP_NAME` | No | App display name (default: "Polla Mundial 2026") |
| `NEXT_PUBLIC_APP_URL` | Yes | Full URL (e.g. `https://pollamundial.cl`) |

## Scripts

```bash
pnpm dev          # start dev server
pnpm build        # production build
pnpm lint         # ESLint
pnpm format       # Prettier
pnpm test         # Vitest (run once)
pnpm test:watch   # Vitest (watch mode)
pnpm test:coverage # Vitest with coverage report
```

## Folder structure

```
app/[locale]/         Next.js App Router pages (locale-prefixed)
  (auth)/             login, signup, forgot-password, reset-password
  (app)/              predictions, podio, scoreboard, rules, profile, admin
components/ui/        shadcn/ui primitives
content/rules/        Authoritative game rules (es/en/ko) — rendered at /[locale]/rules
lib/
  scoring/            Scoring engine — pure functions, fully tested
  supabase/           Browser/server Supabase clients
  email/              Resend wrapper
  i18n/               next-intl routing + request config
messages/             Translation files (es, en, ko)
supabase/migrations/  SQL migration files
scripts/              seed.ts, sync-results.ts
tests/                Vitest test suite
docs/                 polla-prompt.md (original build spec, historical)
proxy.ts              Next.js 16 middleware (renamed from middleware.ts)
```

## Admin runbook

1. **Invite a user:** Admin panel → Enter email → system sends invite via Resend
2. **Enter match results:** Admin panel → Matches → inline edit scores
3. **Sync from football-data.org:** Admin panel → "Sync results" button
4. **Force rescore:** Admin panel → "Rescore all" button (idempotent)

## Architecture decisions

- Tailwind v4 (CSS-based config, no `tailwind.config.ts`)
- next-intl v4 with locale prefix `always` — all URLs include locale (`/es/`, `/en/`, `/ko/`)
- RLS is the authorization source of truth — server-side checks are defense-in-depth
- Scoring engine is pure functions in `lib/scoring/` with ≥95% test coverage required
