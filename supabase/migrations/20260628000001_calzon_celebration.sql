-- Add calzones_seen to profiles so the app can track which players have already
-- been celebrated for their perfect scores (calzones). Mirrors the precedent of
-- display_name_changed_at: a simple, non-null integer column with a safe default.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS calzones_seen int NOT NULL DEFAULT 0;

-- my_calzon_count() — returns the number of perfect predictions (calzones) for
-- the calling user. A calzón is: points_awarded equals the maximum for the
-- match's stage (10 for group stage, 25 for knockout). Uses SECURITY INVOKER +
-- auth.uid() so it cannot return another user's data, following the same pattern
-- as the my_predictions / my_podio_prediction views.
CREATE OR REPLACE FUNCTION public.my_calzon_count()
RETURNS int LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT count(*)::int
  FROM predictions p
  JOIN matches m ON m.id = p.match_id
  JOIN rounds  r ON r.id = m.round_id
  WHERE p.user_id        = auth.uid()
    AND p.points_awarded IS NOT NULL
    AND p.points_awarded = CASE WHEN r.stage = 'group' THEN 10 ELSE 25 END;
$$;

GRANT EXECUTE ON FUNCTION public.my_calzon_count() TO authenticated;
