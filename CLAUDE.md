# CLAUDE.md — Project rules for Claude Code

## Git workflow

For all non-trivial changes, use a feature branch and open a PR — do not push directly to `main`.

1. `git checkout -b feat/<short-description>` (or `fix/`, `chore/` as appropriate)
2. Make commits on the branch.
3. `git push -u origin <branch>`
4. `gh pr create` to open the PR.
5. Merge via GitHub (or `gh pr merge`) once approved.

Hotfixes that are a single trivial commit (e.g. a one-line copy or color tweak) may go directly to `main`.

## Phase completion protocol

At the end of every phase, before moving to the next one:

1. Run the phase verification (tests, lint, and/or build as appropriate).
2. Make a git commit with a message describing what the phase built and any autonomous decisions made.
   - Format: `phase-N: <short description>`
   - Include a brief note on any non-obvious choices made autonomously (e.g. data model deviations, alternative implementations).

## User-data queries

`predictions` and `podio_predictions` both have RLS policies that expose **other players' rows** once the relevant round locks. This is intentional and powers `/scoreboard/[userId]`, `/profile/[userId]`, and the leaderboard. It also means any page that wants to show *only the current user's own* rows must NOT query the base tables — it must read from the "own data" views.

- For the current user's predictions: `supabase.from("my_predictions")` — never `supabase.from("predictions")`.
- For the current user's Podio pick: `supabase.from("my_podio_prediction")` — never `supabase.from("podio_predictions")`.

Both views are `security_invoker = true` with `WHERE user_id = auth.uid()`, so they cannot return another user's rows regardless of what the calling code chains on. Pages that legitimately need to show another player's data (scoreboard / profile surfaces) continue to read the base tables with an explicit `.eq("user_id", <target>)` filter — that path is reviewed manually.

If a new user-scoped table is added, follow the same pattern: create a `my_<entity>` view with `WITH (security_invoker = true)` and `WHERE user_id = auth.uid()` in the same migration, `GRANT SELECT ... TO authenticated`, and use that view exclusively for "own data" reads.

Writes (`INSERT` / `UPDATE` / `UPSERT`) still go through the base tables, gated by the existing `auth.uid()`-based RLS.
