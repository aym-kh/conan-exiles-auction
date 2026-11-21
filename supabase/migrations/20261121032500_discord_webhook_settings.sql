DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.guilds
    WHERE webhook_url IS NOT NULL
      AND pg_catalog.btrim(webhook_url) <> ''
  ) THEN
    RAISE EXCEPTION 'Cannot remove guilds.webhook_url because it contains data; migrate those values to secure storage first.';
  END IF;
END
$$;

ALTER TABLE public.guilds
  DROP COLUMN IF EXISTS webhook_url;

CREATE TABLE public.discord_webhook_settings (
  discord_guild_id text PRIMARY KEY
    REFERENCES public.guilds (discord_guild_id)
    ON DELETE CASCADE,
  webhook_url text NOT NULL,
  configured_by uuid
    REFERENCES auth.users (id)
    ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discord_webhook_settings_url_length
    CHECK (pg_catalog.length(webhook_url) <= 2048)
);

ALTER TABLE public.discord_webhook_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.discord_webhook_settings FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.discord_webhook_settings TO service_role;
