-- =============================================================================
-- Polla Mundial 2026 — One-time display_name change + audit trail
--
-- 1. Adds display_name_changed_at (timestamptz, nullable) to profiles.
--    NULL = the user has not yet used their one self-rename.
--    Non-NULL = the timestamp when they exercised their single change.
--    Admin renames do NOT touch this column (tracked separately).
--
-- 2. Creates display_name_audit to record every name change (self or admin).
--
-- 3. Installs a BEFORE UPDATE trigger on profiles that:
--    a. Enforces the one-time rule for non-admin actors.
--    b. Prevents users from resetting display_name_changed_at to re-enable
--       the change (pins it to the OLD value on non-admin paths).
--    c. Writes an audit row on every actual display_name change.
-- =============================================================================

-- ── 1. Add tracking column ───────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name_changed_at timestamptz;

COMMENT ON COLUMN public.profiles.display_name_changed_at IS
  'Timestamp of the user''s own one-time display_name change. NULL = not yet used. Admin renames do not set this.';

-- ── 2. Audit table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.display_name_audit (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL,                                         -- whose name changed
  old_display_name  text,
  new_display_name  text        NOT NULL,
  changed_by        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL, -- actor (null if service-role)
  by_admin          boolean     NOT NULL DEFAULT false,
  changed_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_display_name_audit_user
  ON public.display_name_audit(user_id, changed_at DESC);

ALTER TABLE public.display_name_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "display_name_audit: admins can view"
  ON public.display_name_audit FOR SELECT
  TO authenticated
  USING (is_admin());

-- No INSERT policy needed — rows are written by the SECURITY DEFINER trigger below.

-- ── 3. Trigger function ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_display_name_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor      uuid;
  v_admin_path boolean;
BEGIN
  -- Who is making this change?
  v_actor      := auth.uid();
  -- Admin path: either the actor is null (service-role bypass) OR the actor is an admin.
  v_admin_path := (v_actor IS NULL) OR public.is_admin();

  -- ── One-time rule for non-admin self-changes ──────────────────────────────
  IF NOT v_admin_path THEN
    -- Always pin the tracker column so users cannot reset it.
    NEW.display_name_changed_at := OLD.display_name_changed_at;

    -- If the display_name is actually changing, check the allowance.
    IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
      IF OLD.display_name_changed_at IS NOT NULL THEN
        RAISE EXCEPTION 'display_name already changed'
          USING ERRCODE = 'check_violation';
      END IF;
      -- First and only self-change: stamp the timestamp.
      NEW.display_name_changed_at := now();
    END IF;
  END IF;

  -- ── Audit row on any actual name change ───────────────────────────────────
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    INSERT INTO public.display_name_audit
      (user_id, old_display_name, new_display_name, changed_by, by_admin)
    VALUES
      (NEW.id, OLD.display_name, NEW.display_name, v_actor, v_admin_path);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_display_name_change ON public.profiles;
CREATE TRIGGER trg_display_name_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_display_name_change();
