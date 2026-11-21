DROP FUNCTION public.get_auction_bids(uuid);
DROP FUNCTION public.place_auction_bid(uuid, uuid, text, text, text, text, integer, uuid);

ALTER TABLE public.auctions
  ADD COLUMN bid_visibility text;

UPDATE public.auctions
SET bid_visibility = CASE
  WHEN is_blind IS TRUE THEN 'anonymous'
  ELSE 'open'
END;

ALTER TABLE public.auctions
  ALTER COLUMN bid_visibility SET DEFAULT 'open',
  ALTER COLUMN bid_visibility SET NOT NULL,
  ADD CONSTRAINT auctions_bid_visibility_check
    CHECK (bid_visibility IN ('open', 'anonymous', 'sealed')),
  DROP COLUMN is_blind;

ALTER TABLE public.bids
  ADD COLUMN is_sealed_offer boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX bids_one_sealed_offer_per_item_idx
  ON public.bids (
    auction_id,
    bidder_discord_id,
    (COALESCE(item_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  WHERE is_sealed_offer;

CREATE FUNCTION public.get_auction_bids(p_auction_id uuid)
RETURNS TABLE (
  id uuid,
  bidder_discord_id text,
  bidder_name text,
  bidder_avatar text,
  currency_symbol text,
  amount integer,
  calculated_weight integer,
  created_at timestamptz,
  item_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    bid.id,
    CASE WHEN auction.bid_visibility = 'open' THEN bid.bidder_discord_id ELSE NULL::text END,
    CASE WHEN auction.bid_visibility = 'open' THEN bid.bidder_name ELSE NULL::text END,
    CASE WHEN auction.bid_visibility = 'open' THEN bid.bidder_avatar ELSE NULL::text END,
    bid.currency_symbol,
    bid.amount,
    bid.calculated_weight,
    bid.created_at,
    bid.item_id
  FROM public.bids AS bid
  JOIN public.auctions AS auction ON auction.id = bid.auction_id
  WHERE auction.id = p_auction_id
    AND (
      auction.bid_visibility <> 'sealed'
      OR auction.status IN ('ENDED', 'CANCELLED')
      OR auction.end_time <= pg_catalog.statement_timestamp()
    )
    AND (auction.bid_visibility <> 'sealed' OR bid.is_sealed_offer)
  ORDER BY bid.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_auction_bids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auction_bids(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_auction_bid_visibility_locked(p_auction_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.auctions AS auction
    WHERE auction.id = p_auction_id
      AND auction.seller_discord_id = (SELECT auth.uid())::text
      AND EXISTS (
        SELECT 1
        FROM public.bids AS bid
        WHERE bid.auction_id = auction.id
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_auction_bid_visibility_locked(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_auction_bid_visibility_locked(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_bid_visibility_change_after_bid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.bid_visibility IS DISTINCT FROM OLD.bid_visibility
     AND EXISTS (
       SELECT 1
       FROM public.bids AS bid
       WHERE bid.auction_id = OLD.id
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'The bidding format cannot be changed after the first bid is placed.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER auction_bid_visibility_immutable_after_bid
  BEFORE UPDATE OF bid_visibility ON public.auctions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_bid_visibility_change_after_bid();

CREATE FUNCTION public.place_auction_bid(
  p_auction_id uuid,
  p_auth_user_id uuid,
  p_bidder_discord_id text,
  p_bidder_name text,
  p_bidder_avatar text,
  p_currency_symbol text,
  p_amount integer,
  p_item_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auction public.auctions%ROWTYPE;
  v_currency_count integer;
  v_currency_weight numeric;
  v_calculated_weight bigint;
  v_current_highest integer;
  v_bid_id uuid;
  v_has_items boolean;
BEGIN
  IF p_auth_user_id IS NULL
     OR p_bidder_discord_id IS NULL
     OR p_bidder_name IS NULL
     OR p_currency_symbol IS NULL
     OR p_amount IS NULL
     OR p_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Bid details are invalid.';
  END IF;

  SELECT *
  INTO v_auction
  FROM public.auctions
  WHERE id = p_auction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Auction was not found.';
  END IF;

  IF v_auction.status IS DISTINCT FROM 'ACTIVE'
     OR v_auction.end_time <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This auction is no longer accepting bids.';
  END IF;

  IF v_auction.seller_discord_id = p_auth_user_id::text THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'You cannot bid on your own auction.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.auction_items
    WHERE auction_id = p_auction_id
  )
  INTO v_has_items;

  IF v_has_items AND p_item_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Select an item before bidding.';
  END IF;

  IF p_item_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.auction_items
       WHERE id = p_item_id
         AND auction_id = p_auction_id
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Selected item is not part of this auction.';
  END IF;

  IF pg_catalog.jsonb_typeof(v_auction.currencies) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Auction currencies are not configured correctly.';
  END IF;

  SELECT
    pg_catalog.count(*),
    pg_catalog.min(
      CASE
        WHEN currency.item->>'weight' ~ '^[1-9][0-9]*$'
          THEN (currency.item->>'weight')::numeric
        ELSE NULL
      END
    )
  INTO v_currency_count, v_currency_weight
  FROM pg_catalog.jsonb_array_elements(v_auction.currencies) AS currency(item)
  WHERE currency.item->>'symbol' = pg_catalog.btrim(p_currency_symbol);

  IF v_currency_count <> 1
     OR v_currency_weight IS NULL
     OR v_currency_weight > 2147483647 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Selected currency is not valid for this auction.';
  END IF;

  v_calculated_weight := p_amount::bigint * v_currency_weight::bigint;
  IF v_calculated_weight > 2147483647 THEN
    RAISE EXCEPTION USING ERRCODE = '22003', MESSAGE = 'Calculated bid is too large.';
  END IF;

  IF v_auction.bid_visibility = 'sealed' THEN
    INSERT INTO public.bids (
      auction_id,
      item_id,
      bidder_discord_id,
      bidder_name,
      bidder_avatar,
      currency_symbol,
      amount,
      calculated_weight,
      is_sealed_offer
    )
    VALUES (
      p_auction_id,
      p_item_id,
      p_bidder_discord_id,
      p_bidder_name,
      p_bidder_avatar,
      pg_catalog.btrim(p_currency_symbol),
      p_amount,
      v_calculated_weight::integer,
      true
    )
    ON CONFLICT (
      auction_id,
      bidder_discord_id,
      (COALESCE(item_id, '00000000-0000-0000-0000-000000000000'::uuid))
    ) WHERE is_sealed_offer
    DO UPDATE SET
      bidder_name = EXCLUDED.bidder_name,
      bidder_avatar = EXCLUDED.bidder_avatar,
      currency_symbol = EXCLUDED.currency_symbol,
      amount = EXCLUDED.amount,
      calculated_weight = EXCLUDED.calculated_weight,
      created_at = pg_catalog.clock_timestamp()
    RETURNING id INTO v_bid_id;

    RETURN v_bid_id;
  END IF;

  SELECT pg_catalog.max(bid.calculated_weight)
  INTO v_current_highest
  FROM public.bids AS bid
  WHERE bid.auction_id = p_auction_id
    AND bid.item_id IS NOT DISTINCT FROM p_item_id;

  IF v_current_highest IS NOT NULL AND v_calculated_weight <= v_current_highest THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Your bid must be higher than the current highest bid.';
  END IF;

  INSERT INTO public.bids (
    auction_id,
    item_id,
    bidder_discord_id,
    bidder_name,
    bidder_avatar,
    currency_symbol,
    amount,
    calculated_weight
  )
  VALUES (
    p_auction_id,
    p_item_id,
    p_bidder_discord_id,
    p_bidder_name,
    p_bidder_avatar,
    pg_catalog.btrim(p_currency_symbol),
    p_amount,
    v_calculated_weight::integer
  )
  RETURNING id INTO v_bid_id;

  RETURN v_bid_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_auction_bid(uuid, uuid, text, text, text, text, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_auction_bid(uuid, uuid, text, text, text, text, integer, uuid)
  TO service_role;

DROP TRIGGER IF EXISTS bids_broadcast_auction_bid_change ON public.bids;

CREATE TRIGGER bids_broadcast_auction_bid_change
  AFTER INSERT OR UPDATE ON public.bids
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_auction_bid_change();
