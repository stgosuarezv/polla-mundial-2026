-- Shift digest cron from :05/:35 to :01/:31 — fires 4 minutes earlier,
-- closer to the round lock time.
SELECT cron.alter_job(2, schedule => '1,31 * * * *');
