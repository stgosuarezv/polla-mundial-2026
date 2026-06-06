-- =============================================================================
-- Polla Mundial 2026 — Round-close digest infrastructure
--
-- Adds:
--   - app_settings (singleton row holding digest_mode = 'manual' | 'automated')
--   - app_settings_audit (one row per UPDATE; written from the server action)
--   - rounds.snapshot_sent_at + rounds.snapshot_sent_by columns to record
--     when each round's digest was emailed and by whom (NULL = cron sent it).
-- =============================================================================

-- ── app_settings (singleton) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
  id           smallint    PRIMARY KEY DEFAULT 1,
  digest_mode  text        NOT NULL DEFAULT 'manual'
                          CHECK (digest_mode IN ('manual','automated')),
  updated_by   uuid        REFERENCES public.profiles(id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (id = 1)
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings: admins can view"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "app_settings: admins can update"
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

INSERT INTO public.app_settings (id, digest_mode)
VALUES (1, 'manual')
ON CONFLICT (id) DO NOTHING;

-- ── app_settings_audit ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings_audit (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_by uuid        NOT NULL REFERENCES public.profiles(id),
  old_value  jsonb,
  new_value  jsonb,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_settings_audit_changed_at
  ON public.app_settings_audit(changed_at DESC);

ALTER TABLE public.app_settings_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_audit: admins can view"
  ON public.app_settings_audit FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "app_settings_audit: admins can insert"
  ON public.app_settings_audit FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- ── rounds: digest tracking ──────────────────────────────────────────────────
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS snapshot_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS snapshot_sent_by uuid NULL REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_rounds_snapshot_pending
  ON public.rounds(lock_time)
  WHERE snapshot_sent_at IS NULL;
