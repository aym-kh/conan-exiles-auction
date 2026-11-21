ALTER TABLE public.discord_notification_outbox
  DROP CONSTRAINT discord_notification_outbox_event_type_check,
  DROP CONSTRAINT discord_notification_outbox_auction_id_event_type_key,
  ADD COLUMN bid_id uuid REFERENCES public.bids (id) ON DELETE CASCADE,
  ADD CONSTRAINT discord_notification_outbox_event_type_check
    CHECK (event_type IN ('auction_created', 'bid_placed')),
  ADD CONSTRAINT discord_notification_outbox_event_target_check
    CHECK (
      (event_type = 'auction_created' AND bid_id IS NULL)
      OR (event_type = 'bid_placed' AND bid_id IS NOT NULL)
    );

CREATE UNIQUE INDEX discord_notification_outbox_auction_created_unique
  ON public.discord_notification_outbox (auction_id)
  WHERE event_type = 'auction_created';

CREATE UNIQUE INDEX discord_notification_outbox_bid_placed_unique
  ON public.discord_notification_outbox (bid_id)
  WHERE event_type = 'bid_placed';

CREATE OR REPLACE FUNCTION public.enqueue_bid_placed_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auction public.auctions%ROWTYPE;
BEGIN
  IF NEW.is_sealed_offer THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_auction
  FROM public.auctions
  WHERE id = NEW.auction_id;

  IF NOT FOUND
    OR v_auction.status IS DISTINCT FROM 'ACTIVE'
    OR v_auction.end_time <= pg_catalog.statement_timestamp()
    OR v_auction.bid_visibility NOT IN ('open', 'anonymous')
    OR v_auction.guild_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.discord_webhook_settings AS settings
      WHERE settings.discord_guild_id = v_auction.guild_id
    )
  THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.discord_notification_outbox (auction_id, bid_id, event_type)
  VALUES (v_auction.id, NEW.id, 'bid_placed')
  ON CONFLICT (bid_id) WHERE event_type = 'bid_placed' DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.enqueue_bid_placed_notification() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER bids_enqueue_discord_notification
AFTER INSERT ON public.bids
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_bid_placed_notification();

CREATE FUNCTION public.claim_discord_notification_events(
  p_auth_user_id uuid,
  p_discord_user_id text,
  p_limit integer,
  p_auction_id uuid,
  p_event_type text,
  p_bid_id uuid
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
    LEFT JOIN public.bids AS bid ON bid.id = outbox.bid_id
    WHERE (
        (outbox.event_type = 'auction_created' AND auction.seller_discord_id = p_auth_user_id::text)
        OR (
          outbox.event_type = 'bid_placed'
          AND (
            auction.seller_discord_id = p_auth_user_id::text
            OR bid.bidder_discord_id = p_discord_user_id
          )
        )
      )
      AND (p_auction_id IS NULL OR auction.id = p_auction_id)
      AND (p_event_type IS NULL OR outbox.event_type = p_event_type)
      AND (p_bid_id IS NULL OR outbox.bid_id = p_bid_id)
      AND outbox.event_type IN ('auction_created', 'bid_placed')
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

REVOKE ALL PRIVILEGES ON FUNCTION public.claim_discord_notification_events(uuid, text, integer, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_discord_notification_events(uuid, text, integer, uuid, text, uuid)
  TO service_role;

CREATE FUNCTION public.count_discord_notification_events(
  p_auth_user_id uuid,
  p_discord_user_id text,
  p_auction_id uuid,
  p_event_type text,
  p_bid_id uuid
)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.count(*)
  FROM public.discord_notification_outbox AS outbox
  JOIN public.auctions AS auction ON auction.id = outbox.auction_id
  LEFT JOIN public.bids AS bid ON bid.id = outbox.bid_id
  WHERE (
      (outbox.event_type = 'auction_created' AND auction.seller_discord_id = p_auth_user_id::text)
      OR (
        outbox.event_type = 'bid_placed'
        AND (
          auction.seller_discord_id = p_auth_user_id::text
          OR bid.bidder_discord_id = p_discord_user_id
        )
      )
    )
    AND (p_auction_id IS NULL OR auction.id = p_auction_id)
    AND (p_event_type IS NULL OR outbox.event_type = p_event_type)
    AND (p_bid_id IS NULL OR outbox.bid_id = p_bid_id)
    AND outbox.event_type IN ('auction_created', 'bid_placed')
    AND outbox.status IN ('pending', 'processing', 'failed');
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.count_discord_notification_events(uuid, text, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_discord_notification_events(uuid, text, uuid, text, uuid)
  TO service_role;
