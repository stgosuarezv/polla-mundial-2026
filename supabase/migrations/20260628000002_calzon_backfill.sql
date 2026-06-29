-- Backfill calzones_seen to each player's current perfect-score count so that
-- existing calzones (earned before this feature shipped) do not trigger the
-- celebration. Only calzones earned after this migration runs will fire it.
UPDATE public.profiles pr
SET calzones_seen = (
  SELECT count(*)::int
  FROM predictions p
  JOIN matches m ON m.id = p.match_id
  JOIN rounds  r ON r.id = m.round_id
  WHERE p.user_id        = pr.id
    AND p.points_awarded IS NOT NULL
    AND p.points_awarded = CASE WHEN r.stage = 'group' THEN 10 ELSE 25 END
);
