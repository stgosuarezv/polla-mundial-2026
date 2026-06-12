-- pg_net's default 5 s timeout fires while a real sync pass is still running
-- (observed 2026-06-12 04:01–04:02: the KOR–CZE sync took ~7 s; pg_net cut
-- the connection and logged a timeout, though the endpoint finished anyway).
-- Give the endpoint 20 s so responses land in net._http_response and the
-- Vercel function is never aborted mid-sync.

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
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 20000
  );
end;
$$;
