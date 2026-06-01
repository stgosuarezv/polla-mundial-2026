-- =============================================================================
-- Polla Mundial 2026 — Round Audit Log
-- Mirrors match_audit; records every admin edit to rounds.lock_time.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.round_audit (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id    uuid        NOT NULL REFERENCES public.rounds(id),
  changed_by  uuid        NOT NULL REFERENCES public.profiles(id),
  old_value   jsonb,
  new_value   jsonb,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_round_audit_round      ON public.round_audit(round_id);
CREATE INDEX IF NOT EXISTS idx_round_audit_changed_at ON public.round_audit(changed_at DESC);

ALTER TABLE public.round_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "round_audit: admins can view"
  ON public.round_audit FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "round_audit: admins can insert"
  ON public.round_audit FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());
