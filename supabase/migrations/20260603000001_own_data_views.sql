-- =============================================================================
-- Polla Mundial 2026 — "Own data" views (structural guarantee against leaks)
-- =============================================================================
-- The base SELECT policies on predictions / podio_predictions intentionally
-- expose other players' rows once a round locks (powers /scoreboard/[userId],
-- /profile/[userId], and the leaderboard). That's correct for those surfaces,
-- but it means a page that wants to show ONLY the current user's own rows must
-- either chain an explicit .eq("user_id", auth.uid()) on every query OR read
-- from a surface that guarantees the filter structurally.
--
-- These views are that structural guarantee. With security_invoker=true the
-- view honors the caller's RLS (base-table policies still apply), and the
-- view's WHERE then further restricts to the caller's rows — so SELECT * FROM
-- my_predictions always returns only the caller's predictions, regardless of
-- what the calling code chains onto the query.
--
-- Pages reading "my own" data should read from these views exclusively.
-- Writes still go through the base tables (the INSERT/UPDATE RLS gates them
-- by auth.uid() and the upsert calls pass user_id explicitly).
-- =============================================================================

CREATE OR REPLACE VIEW public.my_predictions
  WITH (security_invoker = true) AS
SELECT *
FROM public.predictions
WHERE user_id = auth.uid();

CREATE OR REPLACE VIEW public.my_podio_prediction
  WITH (security_invoker = true) AS
SELECT *
FROM public.podio_predictions
WHERE user_id = auth.uid();

GRANT SELECT ON public.my_predictions      TO authenticated;
GRANT SELECT ON public.my_podio_prediction TO authenticated;
