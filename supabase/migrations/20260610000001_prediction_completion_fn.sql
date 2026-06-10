-- =============================================================================
-- Polla Mundial 2026 — prediction_completion() aggregate function
-- =============================================================================
-- Returns one row per profile with prediction-completion counts for the NEXT
-- OPEN ROUND (non-podio round with the smallest lock_time still in the future).
--
-- Returns counts only — never the pick content — so it is safe to make this
-- a SECURITY DEFINER function. Revealing a count per player ("X of Y filled")
-- is exactly the intended disclosure; the actual scores stay protected.
--
-- Why SECURITY DEFINER is required:
--   RLS on predictions / podio_predictions only exposes other players' rows once
--   a round LOCKS. The whole point of this column is seeing who's filled in
--   BEFORE the deadline (when those rows would otherwise be invisible to the
--   querying session). Running as the function definer bypasses that select
--   policy while returning only aggregate counts.
--
-- Columns returned:
--   user_id     uuid    — profile id
--   made        bigint  — predictions submitted in the next open round's
--                         team-assigned matches
--   total       bigint  — total team-assigned matches in that round
--                         (same for everyone; = 0 when no open round exists)
--   podio_slots int     — non-null slots in user's podio_predictions (0-3)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prediction_completion()
RETURNS TABLE (
  user_id     uuid,
  made        bigint,
  total       bigint,
  podio_slots int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH next_round AS (
    SELECT r.id
    FROM   public.rounds r
    WHERE  r.stage    <> 'podio'
      AND  r.lock_time > now()
    ORDER BY r.lock_time ASC
    LIMIT 1
  ),
  open_matches AS (
    SELECT m.id
    FROM   public.matches m
    WHERE  m.round_id      = (SELECT id FROM next_round)
      AND  m.home_team_id IS NOT NULL
      AND  m.away_team_id IS NOT NULL
  ),
  round_total AS (
    SELECT count(*) AS cnt FROM open_matches
  ),
  made_per_user AS (
    SELECT p.user_id, count(*) AS cnt
    FROM   public.predictions p
    WHERE  p.match_id IN (SELECT id FROM open_matches)
    GROUP BY p.user_id
  ),
  podio_per_user AS (
    SELECT
      pp.user_id,
      (  (CASE WHEN pp.champion_team_id    IS NOT NULL THEN 1 ELSE 0 END)
       + (CASE WHEN pp.runner_up_team_id   IS NOT NULL THEN 1 ELSE 0 END)
       + (CASE WHEN pp.third_place_team_id IS NOT NULL THEN 1 ELSE 0 END)
      ) AS slots
    FROM public.podio_predictions pp
  )
  SELECT
    prof.id                               AS user_id,
    COALESCE(mu.cnt, 0)                   AS made,
    (SELECT cnt FROM round_total)         AS total,
    COALESCE(pu.slots, 0)                 AS podio_slots
  FROM   public.profiles prof
  LEFT JOIN made_per_user  mu ON mu.user_id = prof.id
  LEFT JOIN podio_per_user pu ON pu.user_id = prof.id;
$$;

-- Restrict execution: no anonymous or public access.
REVOKE ALL ON FUNCTION public.prediction_completion() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prediction_completion() FROM anon;
GRANT  EXECUTE ON FUNCTION public.prediction_completion() TO authenticated;
