-- =============================================================================
-- Polla Mundial 2026 — Profile audit + relax audit FKs so user deletion works
--
-- Adds a profile_audit table that records when an admin removes a player.
-- The audit row preserves the deleted user's UUID, email, display name and
-- admin flag as plain values (no FK to profiles since the profile row is
-- about to disappear) along with the admin who performed the deletion.
--
-- Also relaxes the existing *_audit.changed_by FKs from
-- "NOT NULL REFERENCES profiles(id)" (which blocks deletion) to
-- "NULL REFERENCES profiles(id) ON DELETE SET NULL". This means if a future
-- admin is ever deleted, their old audit entries survive with changed_by=NULL
-- instead of preventing the deletion outright.
-- =============================================================================

-- ── profile_audit ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_audit (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_user_id      uuid        NOT NULL,                                  -- UUID of the deleted user
  deleted_email        text,
  deleted_display_name text,
  was_admin            boolean     NOT NULL DEFAULT false,
  changed_by           uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_audit_changed_at
  ON public.profile_audit(changed_at DESC);

ALTER TABLE public.profile_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_audit: admins can view"
  ON public.profile_audit FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "profile_audit: admins can insert"
  ON public.profile_audit FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- ── Relax changed_by FKs on existing audit tables ───────────────────────────
ALTER TABLE public.match_audit
  ALTER COLUMN changed_by DROP NOT NULL,
  DROP CONSTRAINT match_audit_changed_by_fkey,
  ADD  CONSTRAINT match_audit_changed_by_fkey
       FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.round_audit
  ALTER COLUMN changed_by DROP NOT NULL,
  DROP CONSTRAINT round_audit_changed_by_fkey,
  ADD  CONSTRAINT round_audit_changed_by_fkey
       FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.app_settings_audit
  ALTER COLUMN changed_by DROP NOT NULL,
  DROP CONSTRAINT app_settings_audit_changed_by_fkey,
  ADD  CONSTRAINT app_settings_audit_changed_by_fkey
       FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ── rounds.snapshot_sent_by also needs ON DELETE SET NULL ───────────────────
ALTER TABLE public.rounds
  DROP CONSTRAINT IF EXISTS rounds_snapshot_sent_by_fkey,
  ADD  CONSTRAINT rounds_snapshot_sent_by_fkey
       FOREIGN KEY (snapshot_sent_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
