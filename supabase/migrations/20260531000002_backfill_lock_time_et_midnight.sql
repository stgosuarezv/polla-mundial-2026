-- =============================================================================
-- Polla Mundial 2026 — Backfill rounds.lock_time to 00:00 ET
-- Changes each round's lock from MIN(kickoff_at) to midnight ET on that date.
-- Double AT TIME ZONE is the standard Postgres idiom: interpret timestamp
-- in a zone, truncate, then re-express as timestamptz.
-- =============================================================================

-- Rounds with matches: midnight ET on the date of MIN(kickoff_at) in ET
WITH round_first AS (
  SELECT round_id, MIN(kickoff_at) AS first_kickoff
  FROM public.matches
  GROUP BY round_id
)
UPDATE public.rounds r
SET lock_time = (
  date_trunc('day', (rf.first_kickoff AT TIME ZONE 'America/New_York'))
  AT TIME ZONE 'America/New_York'
)
FROM round_first rf
WHERE r.id = rf.round_id;

-- Podio has no matches — inherit R32's new lock_time
UPDATE public.rounds
SET lock_time = (
  SELECT lock_time FROM public.rounds WHERE name_key = 'rounds.knockout_r32'
)
WHERE name_key = 'rounds.podio';
