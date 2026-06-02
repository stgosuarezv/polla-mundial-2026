# 🏆 Polla Mundial 2026 — Build Spec for Claude Code

> **Preserved for historical context.** This is the original build prompt as of 2026-05-15.
> The authoritative game rules are now in [`content/rules/{es,en,ko}.md`](../content/rules/) and shown in-app at `/[locale]/rules`. Sections below may not match the live behavior (e.g. round lock time, Podio edit window, acierto definition).

## 1. Your Role

You are a senior full-stack engineer with deep expertise in Next.js 14+ (App Router), TypeScript, Supabase (Postgres + Auth + Row-Level Security), Tailwind CSS, and Vercel deployment. You build production-grade web apps end-to-end and care about correctness, especially in **scoring logic** — bugs there will cost user trust permanently. Treat the scoring engine as the most important code in the repo.

## 2. Project Overview

Build a multilingual web app for a private **FIFA World Cup 2026 prediction pool** ("polla") among **35–50 friends**. Players predict the exact score of every match (104 total) before each round's deadline, earn points by accuracy, and the player with the most points at the tournament's end wins.

**Today's date:** May 15, 2026. **Hard launch deadline:** **June 1, 2026** (16 days out — enough time for users to register and submit predictions for Group Stage Round 1 before the World Cup kicks off on June 11, 2026).

**Admins (two):** Santiago and Tomás. Both have full admin permissions.

**Audience:** ~age 27 friends, mostly Spanish speakers (Chile-based group) with some English and Korean speakers. Multilingual UI is required.

## 3. Locked Decisions

| Decision | Choice |
|---|---|
| Framework | Next.js 14+ App Router, TypeScript strict mode |
| Database | Supabase Postgres |
| Auth | Supabase Auth (email + password, invite-only signup) |
| Authorization | Postgres Row-Level Security (RLS) on all tables |
| Styling | Tailwind CSS + shadcn/ui |
| Forms | react-hook-form + Zod |
| i18n | next-intl, locales: `en`, `es`, `ko` (default `es`) |
| Email | Resend (transactional: invitations, password reset, optional deadline reminders) |
| Hosting | Vercel |
| Match data source | football-data.org REST API (primary); admin manual entry (fallback + override) |
| Date/time | All timestamps in UTC in DB; display in user's locale and timezone using `date-fns-tz` |
| Testing | Vitest for unit tests (scoring engine MUST be unit-tested) |
| Linting | ESLint + Prettier, strict config |
| Package manager | pnpm |

## 4. Game Rules (Authoritative)

These rules supersede any prior versions. Implement them exactly.

### 4.1 Tournament Format

- 48 teams, 12 groups of 4. Each team plays 3 group matches.
- Knockout qualifiers: top 2 of each group + 8 best third-placed teams = 32 teams.
- Knockout rounds (5 total): Round of 32 ("Dieciseisavos") → Round of 16 ("Octavos") → Quarter-Finals → Semi-Finals → Final.
- Total matches: 104.

### 4.2 Prediction Structure

**Group Stage** is split into 3 "fechas" (matchdays). Each matchday contains one match per team (16 matches per matchday × 3 matchdays = 48 group matches).

**Knockout Stage** is split into 5 rounds.

**Submission rules (apply to every round, group or knockout):**
- Users may save predictions individually as drafts at any time before the round's deadline.
- The round **locks at kickoff of the first match of that round** (in UTC). Once locked, no edits are possible — period. Any match the user did not submit a prediction for scores 0 points.
- Show users a clear countdown to the next deadline.

**Bonus Podio** (one-time bet):
- Unlocks immediately and locks at the kickoff of the first knockout match (start of Round of 32).
- User picks 1st (Champion), 2nd (Runner-up), 3rd place teams.
- Must be three distinct teams.
- One-shot submission — no edits.

### 4.3 Scoring System

**This is the most critical logic in the app. Implement it in a single pure function `scorePrediction(prediction, actualResult, stage)` and unit-test it exhaustively before wiring it to the UI.**

#### Group Stage (max 10 pts per match)

| Criterion | Points |
|---|---|
| Correct result (winner OR draw) | 5 |
| Exact goals — home team | 2 |
| Exact goals — away team | 2 |
| Correct goal difference AND correct winner | 1 |

Points are **additive**. Perfect prediction = 5 + 2 + 2 + 1 = 10 pts.

#### Knockout Stage (max 25 pts per match)

| Criterion | Points |
|---|---|
| Correct result at end of regulation/ET (winner OR draw) | 10 |
| Exact goals — home team (regulation/ET) | 4 |
| Exact goals — away team (regulation/ET) | 4 |
| Correct goal difference AND correct winner | 2 |
| Correct "who advances" | 5 |

Points additive. Perfect = 10 + 4 + 4 + 2 + 5 = 25 pts.

**Important implementation notes:**
- Goals (home and away) are evaluated **independently of the result criterion**, same as group stage. A wrong result does not zero out the individual goal scores.
- "Correct goal difference AND correct winner" still requires the result to be correct.
- "Who advances" depends only on which team advanced, regardless of whether it was via regulation, ET, or penalties. The predicted advancing team (either the penalty winner for draw predictions, or the predicted winner for non-draw predictions) is compared by UUID against `advancing_team_id` — independently of whether the FT result criterion was met. Example: predicting 2-1 home when the match ends 1-1 and home wins on pens still earns the 5 advance points.
- The final score used for all criteria is the score **after extra time** (if played), not the 90-minute score. ET goals count.

#### Bonus Podio (max 90 pts total)

| Criterion | Points |
|---|---|
| Correct Champion | 50 |
| Correct Runner-up | 25 |
| Correct 3rd place | 15 |

Each evaluated independently — getting the Champion right earns 50 even if Runner-up is wrong.

### 4.4 Scoring Details (Worked Examples — treat as test cases)

**Group stage examples:**

| Predicted | Actual | Pts | Reasoning |
|---|---|---|---|
| 2-1 | 2-1 | 10 | Perfect — winner ✓, home exact ✓, away exact ✓, diff+winner ✓ |
| 2-0 | 3-1 | 6 | Winner ✓ (5), home ✗, away ✗, diff+winner ✓ (1) = 6 |
| 1-1 | 2-2 | 5 | Draw ✓ (5), goals ✗, diff+winner — a draw is diff 0 ✓ but no "winner," interpretation below* |
| 2-1 | 1-2 | 0 | Wrong winner — nothing scores |
| 0-0 | 0-0 | 10 | Perfect draw |
| 3-1 | 2-1 | 7 | Winner ✓ (5), home ✗, away ✓ (2), diff ✗ = 7 |

***Important interpretation:** For the "correct goal difference AND correct winner" point, a **draw counts** if both predicted and actual are draws (diff = 0 for both, "winner" = draw for both). So predicting any draw when the match is a draw earns 5 + 1 = 6 pts minimum.

**Knockout examples:**

| Predicted | Actual (FT/ET) | Advances? | Pts | Reasoning |
|---|---|---|---|---|
| 2-1 home | 2-1 home | Home | 25 | Perfect — result ✓, both exact ✓, diff+winner ✓, advance ✓ |
| 1-1, home pen | 1-1 | Home | 25 | Perfect draw — result ✓, both exact ✓, diff+winner ✓, advance ✓ |
| 1-1, home pen | 1-1 | Away | 20 | Draw ✓, goals ✓, diff+winner ✓, advance ✗ |
| 2-1 home | 1-1, away wins pens | Away | 4 | Wrong result (0), home ✗ (0), away ✓ (4), diff ✗ (0), advance ✗ (0) — predicted home, away advanced |
| 2-1 home | 1-1, home wins pens | Home | 9 | Wrong result (0), home ✗ (0), away ✓ (4), diff ✗ (0), advance ✓ (5) — predicted home, home advanced |
| 1-1, home pen | 2-1 home | Home | 9 | Wrong result (0), home ✗ (0), away ✓ (4), diff ✗ (0), advance ✓ (5) — pen winner = advancing team |

**Rule:** If user predicts a draw in a knockout match, they MUST also select a penalty winner (this is their "who advances" pick). If user predicts a non-draw, their "who advances" auto-equals the predicted winner. UI must enforce this.

### 4.5 Scoreboard & Tiebreakers

Show a leaderboard table ranked by total points. **Tiebreakers (in order):**

1. Higher count of "hit" matches (any match where the player scored > 0).
2. Lower count of "zero" matches (matches where the player scored exactly 0). Unsubmitted predictions count as zero matches.

Display each player's: rank, name, total points, matches hit, zero-matches, and a small delta-from-leader.

### 4.6 Access & Participation

- **Invite-only.** Public signup is disabled.
- Admins (Santiago, Tomás) invite users by email. Invitation generates a single-use token + sends an email via Resend with a signup link.
- Invited users land on a signup page where they set their display name and password. The token authenticates them as an invited user.
- Password reset is a standard "Forgot password" flow — Supabase Auth handles this.
- Admin actions:
  - Invite/revoke users
  - Edit match data (fixtures, results) — with audit log
  - Edit the Bonus Podio deadline if needed
  - Manually trigger a results sync from football-data.org
  - Send a deadline-reminder email blast (optional)

## 5. Data Model (Proposed — refine as needed)

Suggested core tables. You may adjust column names/types but preserve semantics.

```sql
-- Users (Supabase auth.users handles auth; extend with a profile)
profiles (
  id uuid PK FK→auth.users,
  display_name text NOT NULL,
  preferred_locale text DEFAULT 'es',  -- 'en' | 'es' | 'ko'
  timezone text DEFAULT 'America/Santiago',
  is_admin boolean DEFAULT false,
  created_at timestamptz
)

-- Invitations
invitations (
  id uuid PK,
  email text NOT NULL UNIQUE,
  token text NOT NULL UNIQUE,
  invited_by uuid FK→profiles,
  accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz
)

-- Teams (48 teams)
teams (
  id uuid PK,
  code text NOT NULL UNIQUE,         -- 3-letter code, e.g. 'BRA'
  name_en text, name_es text, name_ko text,
  flag_url text,
  group_letter text                  -- 'A'..'L', null until draw confirmed
)

-- Rounds (3 group matchdays + 5 knockout rounds + Bonus Podio = 9 rounds)
rounds (
  id uuid PK,
  stage text NOT NULL,               -- 'group' | 'knockout' | 'podio'
  name_key text NOT NULL,            -- i18n key, e.g. 'group_round_1'
  order_index int NOT NULL,
  lock_time timestamptz NOT NULL     -- computed: earliest kickoff in round
)

-- Matches (104)
matches (
  id uuid PK,
  round_id uuid FK→rounds,
  home_team_id uuid FK→teams,
  away_team_id uuid FK→teams,
  kickoff_at timestamptz NOT NULL,
  venue text,
  external_id text,                  -- football-data.org match ID
  status text NOT NULL DEFAULT 'scheduled',  -- scheduled|in_progress|finished
  home_score int,                    -- final score (after ET if any)
  away_score int,
  penalty_winner_team_id uuid,       -- only for KO matches that went to pens
  advancing_team_id uuid             -- derived/required for KO matches once finished
)

-- Predictions
predictions (
  id uuid PK,
  user_id uuid FK→profiles,
  match_id uuid FK→matches,
  home_score_pred int NOT NULL,
  away_score_pred int NOT NULL,
  penalty_winner_team_id uuid,       -- required if draw predicted in KO
  submitted_at timestamptz NOT NULL,
  points_awarded int,                -- null until scored; recomputable
  UNIQUE (user_id, match_id)
)

-- Podio predictions
podio_predictions (
  id uuid PK,
  user_id uuid FK→profiles UNIQUE,
  champion_team_id uuid FK→teams,
  runner_up_team_id uuid FK→teams,
  third_place_team_id uuid FK→teams,
  submitted_at timestamptz,
  points_awarded int                 -- null until tournament ends
)

-- Audit log for admin edits to match results
match_audit (
  id uuid PK,
  match_id uuid FK→matches,
  changed_by uuid FK→profiles,
  old_value jsonb, new_value jsonb,
  changed_at timestamptz
)
```

**RLS policies (critical):**
- Users can read all `profiles`, `teams`, `matches`, `rounds`.
- Users can `select` their own `predictions` always.
- Users can `select` others' `predictions` ONLY when the parent round's `lock_time <= now()`.
- Users can `insert`/`update` `predictions` only when the parent round's `lock_time > now()` AND the prediction belongs to them.
- Same pattern for `podio_predictions`.
- Only admins can `insert`/`update` `matches`, `teams`, `rounds`, `invitations`.

## 6. Critical UX Rules

- **Prediction visibility:** A player's predictions for a round are private until that round's `lock_time` passes. After lock, all players can see everyone's predictions for that round. Show this clearly in the UI ("Predictions reveal in 2h 14m").
- **Deadline countdown:** Persistent countdown banner to the next active deadline.
- **Locked rounds:** Visually distinct — read-only, show points earned per match.
- **Mobile-first responsive layout** — most users will check on phones.
- **Locale toggle** in the header. Persist choice to `profiles.preferred_locale`.
- **Team names, round names, stage names, UI strings all i18n'd** for en/es/ko. Match venues stay in original language. Use a single translations source-of-truth (next-intl JSON files).
- **Scoring transparency:** When a match is scored, show a per-criterion breakdown ("+5 winner, +2 home goals, ... = 7 pts"). Players notice when scoring feels opaque.

## 7. Visual Design

Use a palette inspired by the **FIFA World Cup 2026 official identity** (hosts: Mexico, USA, Canada):

- Primary: deep navy blue `#1F2A5C` (echoes Canada/US navy + FIFA 26 brand)
- Accent: vibrant red `#E63946`
- Highlight: warm gold `#F4C430`
- Neutrals: off-white `#F8F8F4`, charcoal `#1A1A1A`
- Success/error from Tailwind defaults

Typography: Inter for body, a bolder display face (e.g., Bebas Neue or Anton) for headings to feel sport-y. Keep it clean — no skeuomorphism.

App name: **"Polla Mundial 2026"** (configurable via env var so it can be tweaked).

Logo: simple wordmark with a soccer-ball glyph. You can generate an SVG inline.

## 8. Build Plan (Phased)

Work through these phases sequentially. **At the end of each phase, run the relevant tests, verify locally, then proceed.** Don't ask for permission between phases — just go — but DO stop and ask if you hit a real blocker (see §10).

### Phase 0 — Setup (30 min)
- `pnpm create next-app` with TypeScript, App Router, Tailwind, ESLint
- Install dependencies: `@supabase/supabase-js`, `@supabase/ssr`, `next-intl`, `react-hook-form`, `zod`, `@hookform/resolvers`, `date-fns`, `date-fns-tz`, `resend`, `vitest`, `@testing-library/react`
- Initialize shadcn/ui with our color palette
- Set up `.env.local` with placeholders, document required env vars in README
- Create folder structure: `/app`, `/components`, `/lib` (scoring, supabase, email), `/messages/{en,es,ko}.json`, `/tests`
- Set up Vitest config
- Initial commit

### Phase 1 — Database & Supabase Setup
- Write SQL migration files (in `/supabase/migrations`) for the schema in §5
- Write all RLS policies
- Seed `teams` with the 48 World Cup 2026 teams (use real team list as of May 15, 2026 — fetch from football-data.org)
- Seed `rounds` with 9 rounds (3 group + 5 knockout + 1 podio)
- Seed `matches` (104) from football-data.org. Compute each round's `lock_time` from earliest kickoff
- Create a `scripts/seed.ts` and a `scripts/sync-results.ts` (admin-triggered later)

### Phase 2 — Scoring Engine (HIGH PRIORITY — test first)
- Implement `lib/scoring.ts` with pure function `scorePrediction(prediction, actual, stage): ScoreBreakdown`
- Implement `scorePodio(prediction, finalStandings): number`
- Write `tests/scoring.test.ts` covering EVERY example in §4.4 plus edge cases (no actual score yet → 0, missing prediction → 0, draws, KO draws + pens, etc.)
- Implement `computeLeaderboard(users, matches, predictions)` returning ranked array with tiebreakers
- Test leaderboard tiebreaker logic
- **Do not move on until all scoring tests pass.**

### Phase 3 — Auth & Invitations
- Supabase Auth wiring (server-side helpers, middleware for protected routes)
- Invitation flow: admin enters email → generates token → `invitations` row → Resend email with `/signup?token=...` link
- Signup page validates token, lets user set name + password, creates `profiles` row
- Login page, forgot-password flow (Supabase Auth built-in)
- Logout
- Middleware redirects: unauthenticated → `/login`; authenticated without invite → blocked

### Phase 4 — Predictions UI
- `/predictions` — list of rounds. Current round expanded with all matches and editable score inputs.
- Save-on-blur or "Save predictions" button. Drafts persist to DB.
- For KO draws: show penalty-winner picker.
- Locked rounds: read-only with everyone's predictions visible, points highlighted.
- `/podio` — one-shot Champion / Runner-up / 3rd picker. Three distinct teams. Locks at Round of 32 kickoff.
- Countdown component for next deadline.

### Phase 5 — Scoreboard
- `/scoreboard` — main leaderboard with tiebreakers, current user highlighted
- `/scoreboard/[userId]` — drill into any player's predictions for past rounds (only past rounds visible)
- Live recompute on results sync

### Phase 6 — Admin Panel
- `/admin` (guarded by `is_admin`):
  - Invite a user (email input → send invite)
  - Pending invites list, revoke action
  - Match list with inline edit for scores, status, penalty winner
  - "Sync from football-data.org" button (calls `scripts/sync-results.ts` via a server action)
  - Trigger rescoring (idempotent)
  - View audit log

### Phase 7 — i18n Polish
- Translate every UI string to en/es/ko using next-intl
- Translate team names (use FIFA's official lists; for Korean, use 한국어 names)
- Locale switcher in header, persisted to profile
- Date/time formatting per locale

### Phase 8 — Deploy
- Create Supabase project (production), apply migrations + seeds
- Set up Resend account and domain (use a free Resend-provided sender for MVP if domain setup is slow)
- Push to GitHub, connect Vercel, configure env vars
- Smoke-test the full flow on production: invite → signup → predict → admin enters a fake result → scoreboard updates
- Provide README with: how to run locally, env vars, how to invite users, how to sync results

### Phase 9 — Stretch (only if time permits)
- Deadline-reminder email blast (admin-triggered) 24h and 1h before each round
- Per-match player breakdown view
- Stats page (most accurate predictor, biggest comeback, etc.)
- PWA install prompt

## 9. Quality Standards

- TypeScript `strict: true`. No `any` without a comment justifying it.
- All API inputs validated with Zod.
- All database mutations through server actions or route handlers — never trust client state.
- RLS is the source of truth for authorization. Even if you also check on the client, the DB must enforce.
- No `console.log` in committed code (use a proper logger or remove).
- Every server action returns `{ ok: true, data } | { ok: false, error }` — consistent error shape.
- Loading states and error states for every async UI surface.
- Accessibility: semantic HTML, ARIA where needed, keyboard-navigable forms, sufficient color contrast.
- Mobile breakpoints tested at 375px width minimum.

## 10. When to Ask vs. When to Proceed

**Proceed autonomously on:**
- Naming, file structure, library minor versions, styling details, copy choices in any of the 3 languages
- Implementation details within a phase (component breakdown, helper functions)
- Reasonable defaults for anything unspecified
- Bug fixes in your own code
- Choosing test cases beyond the ones I listed

**Stop and ask before:**
- Spending money (paid API tiers, paid Vercel features, paid Resend tier — free tiers should be enough)
- Adding a new major dependency outside the locked stack in §3
- Deviating from the data model in §5 in a way that changes RLS semantics
- Any change to the scoring rules in §4.3 or §4.4
- Pushing to production for the first time (confirm env vars are set)

If you hit a genuine blocker (e.g., football-data.org doesn't return what we need), document the issue, propose 2 options, and ask — don't silently work around it.

If you discover an inconsistency between this spec and the original `GAME_RULES.md`, **this spec wins** — but flag it.

## 11. Final Deliverables Checklist

By June 1, 2026, the following must be true:

- [ ] App is live at a Vercel URL (e.g., `polla2026.vercel.app`)
- [ ] Santiago and Tomás can log in as admins
- [ ] Admins can invite users via email and invitations arrive in inboxes
- [ ] Invited users can sign up, log in, and reset passwords
- [ ] All 48 teams and 48 group matches are seeded with correct fixtures
- [ ] Knockout-stage rounds exist but matches are blank (filled after group stage)
- [ ] Users can submit predictions for the first group-stage round and Bonus Podio
- [ ] Predictions lock at the correct UTC times
- [ ] Locale switcher works for es/en/ko
- [ ] Scoring engine has ≥95% test coverage on `lib/scoring.ts` and all listed examples pass
- [ ] Scoreboard renders correctly with zero matches scored (everyone at 0, tiebreakers applied)
- [ ] Admin can manually edit a match result and the scoreboard updates correctly
- [ ] README documents the runbook for the tournament

---

## Getting Started

Begin with Phase 0. Confirm the dev environment is set up (Node version, pnpm installed) before scaffolding. Then move through phases 1 → 8 sequentially. Report progress at the end of each phase with a one-line summary + any decisions you made autonomously that you want me to know about.

Good luck. Build it like the trophy is yours.
