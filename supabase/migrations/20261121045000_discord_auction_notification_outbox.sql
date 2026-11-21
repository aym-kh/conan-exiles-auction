CREATE TABLE public.discord_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES public.auctions (id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type = 'auction_created'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text,
  UNIQUE (auction_id, event_type)
);

CREATE INDEX discord_notification_outbox_pending_idx
  ON public.discord_notification_outbox (next_attempt_at, created_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.discord_notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.discord_notification_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.discord_notification_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_new_auction_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'ACTIVE'
    AND NEW.guild_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.discord_webhook_settings AS settings
      WHERE settings.discord_guild_id = NEW.guild_id
    )
  THEN
    INSERT INTO public.discord_notification_outbox (auction_id, event_type)
    VALUES (NEW.id, 'auction_created')
    ON CONFLICT (auction_id, event_type) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.enqueue_new_auction_notification() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER auctions_enqueue_discord_notification
AFTER INSERT ON public.auctions
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_new_auction_notification();

CREATE OR REPLACE FUNCTION public.claim_discord_notification_outbox(
  p_seller_discord_id text,
  p_limit integer DEFAULT 10,
  p_auction_id uuid DEFAULT NULL
)
RETURNS SETOF public.discord_notification_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH candidates AS (
    SELECT outbox.id
    FROM public.discord_notification_outbox AS outbox
    JOIN public.auctions AS auction ON auction.id = outbox.auction_id
    WHERE auction.seller_discord_id = p_seller_discord_id
      AND (p_auction_id IS NULL OR auction.id = p_auction_id)
      AND outbox.event_type = 'auction_created'
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

REVOKE ALL PRIVILEGES ON FUNCTION public.claim_discord_notification_outbox(text, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_discord_notification_outbox(text, integer, uuid) TO service_role;
