ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS digest_layout text NOT NULL DEFAULT 'per_match'
    CHECK (digest_layout IN ('per_match', 'per_player'));
