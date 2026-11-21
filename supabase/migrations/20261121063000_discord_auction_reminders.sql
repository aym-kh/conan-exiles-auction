CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

ALTER TABLE public.discord_notification_outbox
  DROP CONSTRAINT discord_notification_outbox_event_type_check,
  DROP CONSTRAINT discord_notification_outbox_event_target_check,
  ADD CONSTRAINT discord_notification_outbox_event_type_check
    CHECK (event_type IN ('auction_created', 'bid_placed', 'auction_reminder')),
  ADD CONSTRAINT discord_notification_outbox_event_target_check
    CHECK (
      (event_type IN ('auction_created', 'auction_reminder') AND bid_id IS NULL)
      OR (event_type = 'bid_placed' AND bid_id IS NOT NULL)
    );

CREATE UNIQUE INDEX discord_notification_outbox_auction_reminder_unique
  ON public.discord_notification_outbox (auction_id)
  WHERE event_type = 'auction_reminder';

CREATE FUNCTION public.enqueue_due_discord_auction_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inserted_count integer;
BEGIN
  INSERT INTO public.discord_notification_outbox (auction_id, event_type)
  SELECT auction.id, 'auction_reminder'
  FROM public.auctions AS auction
  JOIN public.discord_notification_outbox AS creation_notification
    ON creation_notification.auction_id = auction.id
    AND creation_notification.event_type = 'auction_created'
    AND creation_notification.status = 'sent'
  JOIN public.discord_webhook_settings AS settings
    ON settings.discord_guild_id = auction.guild_id
  WHERE auction.status = 'ACTIVE'
    AND auction.end_time > pg_catalog.statement_timestamp()
    AND auction.end_time <= pg_catalog.statement_timestamp() + interval '1 hour'
  ON CONFLICT (auction_id) WHERE event_type = 'auction_reminder' DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN v_inserted_count;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.enqueue_due_discord_auction_reminders()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_due_discord_auction_reminders() TO service_role;

CREATE FUNCTION public.claim_due_discord_auction_reminders(p_limit integer DEFAULT 10)
RETURNS SETOF public.discord_notification_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH candidates AS (
    SELECT outbox.id
    FROM public.discord_notification_outbox AS outbox
    WHERE outbox.event_type = 'auction_reminder'
      AND (
        (outbox.status = 'pending' AND outbox.next_attempt_at <= pg_catalog.statement_timestamp())
        OR (
          outbox.status = 'processing'
          AND outbox.claimed_at < pg_catalog.statement_timestamp() - interval '5 minutes'
        )
      )
    ORDER BY outbox.created_at, outbox.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 20)
    FOR UPDATE OF outbox SKIP LOCKED
  )
  UPDATE public.discord_notification_outbox AS outbox
  SET
    status = 'processing',
    claimed_at = pg_catalog.statement_timestamp(),
    attempts = outbox.attempts + 1
  FROM candidates
  WHERE outbox.id = candidates.id
  RETURNING outbox.*;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.claim_due_discord_auction_reminders(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_discord_auction_reminders(integer) TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'dispatch-discord-auction-reminders'
  ) THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'dispatch-discord-auction-reminders';
  END IF;

  PERFORM cron.schedule(
    'dispatch-discord-auction-reminders',
    '* * * * *',
    $job$
      SELECT net.http_post(
        url := pg_catalog.rtrim(config.project_url, '/') || '/functions/v1/dispatch-scheduled-discord-notifications',
        headers := pg_catalog.jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', config.service_role_key
        ),
        body := '{}'::jsonb
      )
      FROM (
        SELECT
          (
            SELECT secret.decrypted_secret
            FROM vault.decrypted_secrets AS secret
            WHERE secret.name = 'project_url'
            ORDER BY secret.updated_at DESC
            LIMIT 1
          ) AS project_url,
          (
            SELECT secret.decrypted_secret
            FROM vault.decrypted_secrets AS secret
            WHERE secret.name = 'service_role_key'
            ORDER BY secret.updated_at DESC
            LIMIT 1
          ) AS service_role_key
      ) AS config
      WHERE config.project_url IS NOT NULL
        AND config.service_role_key IS NOT NULL;
    $job$
  );
END;
$$;
