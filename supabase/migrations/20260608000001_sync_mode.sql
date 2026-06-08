-- =============================================================================
-- Polla Mundial 2026 — Add sync_mode to app_settings
--
-- Extends the existing singleton app_settings row with a sync_mode column,
-- mirroring the digest_mode toggle. When set to 'automated', the GitHub
-- Actions cron (every 5 min) calls /api/cron/sync-results which fetches
-- finished matches from football-data.org and rescores predictions.
-- =============================================================================

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS sync_mode text NOT NULL DEFAULT 'manual'
    CHECK (sync_mode IN ('manual', 'automated'));
