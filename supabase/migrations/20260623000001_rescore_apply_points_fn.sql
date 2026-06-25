-- Two SECURITY DEFINER helpers used exclusively by rescoreAllWithClient
-- (service-role path). They do a true set-based UPDATE … FROM jsonb, touching
-- only points_awarded — unlike a PostgREST upsert, this never fires INSERT
-- constraint checks and never silently no-ops on NOT NULL violations.

create or replace function public.apply_prediction_points(p_updates jsonb)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.predictions p
  set points_awarded = v.points_awarded
  from jsonb_to_recordset(p_updates) as v(id uuid, points_awarded int)
  where p.id = v.id;
  select coalesce(jsonb_array_length(p_updates), 0);
$$;

create or replace function public.apply_podio_points(p_updates jsonb)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.podio_predictions p
  set points_awarded = v.points_awarded
  from jsonb_to_recordset(p_updates) as v(id uuid, points_awarded int)
  where p.id = v.id;
  select coalesce(jsonb_array_length(p_updates), 0);
$$;

-- Only the service-role client calls these; no public/anon/authenticated access.
revoke all on function public.apply_prediction_points(jsonb) from public, anon, authenticated;
revoke all on function public.apply_podio_points(jsonb)      from public, anon, authenticated;
