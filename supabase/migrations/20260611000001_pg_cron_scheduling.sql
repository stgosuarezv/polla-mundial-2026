-- =============================================================================
-- Move cron scheduling from GitHub Actions to pg_cron + pg_net.
--
-- GitHub Actions schedule drift is severe (the */5 sync workflow observed
-- firing with 1.5–3 h gaps on 2026-06-11, leaving the MEX–RSA result unsynced
-- until it was entered manually). pg_cron fires reliably on the minute from
-- inside this database, POSTing to the same bearer-guarded /api/cron/*
-- endpoints the workflows used.
--
-- Secrets live in Supabase Vault (never in this repo):
--   cron_url    — e.g. https://pollamundial.cl
--   cron_secret — must equal the CRON_SECRET env var on Vercel
-- Seed them once via the SQL editor:
--   select vault.create_secret('https://pollamundial.cl', 'cron_url');
--   select vault.create_secret('<CRON_SECRET value>', 'cron_secret');
-- Until both exist, jobs no-op with a NOTICE instead of erroring every minute.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper the jobs call: reads Vault, POSTs to the app's cron endpoint.
create or replace function public.invoke_cron_endpoint(path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  secret   text;
begin
  select decrypted_secret into base_url
    from vault.decrypted_secrets where name = 'cron_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'cron_secret';

  if base_url is null or secret is null then
    raise notice 'invoke_cron_endpoint: cron_url / cron_secret not seeded in Vault; skipping %', path;
    return;
  end if;

  perform net.http_post(
    url     := base_url || path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret)
  );
end;
$$;

-- Vault-reading SECURITY DEFINER function: cron jobs (run as postgres) only.
revoke all on function public.invoke_cron_endpoint(text) from public, anon, authenticated;

-- Idempotent re-schedule: drop any previous incarnation of our jobs by name.
do $$
declare
  j record;
begin
  for j in
    select jobid from cron.job
    where jobname in ('sync-results', 'round-close-digest', 'cron-history-cleanup')
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end;
$$;

-- Every minute. The endpoint smart-skips (one cheap local count query, zero
-- football-data.org calls) unless a match kicked off ≥ 105 min ago and is
-- still unfinished, so off-window runs cost ~nothing.
select cron.schedule(
  'sync-results',
  '* * * * *',
  $$select public.invoke_cron_endpoint('/api/cron/sync-results')$$
);

-- Same cadence the GitHub workflow had. Endpoint respects digest_mode.
select cron.schedule(
  'round-close-digest',
  '5,35 * * * *',
  $$select public.invoke_cron_endpoint('/api/cron/snapshot-locked-rounds')$$
);

-- The 1-min job writes ~1.5k rows/day of run history; prune weekly.
select cron.schedule(
  'cron-history-cleanup',
  '0 3 * * 0',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
