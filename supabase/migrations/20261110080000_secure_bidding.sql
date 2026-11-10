DROP POLICY IF EXISTS "Allow public read access on bids"
  ON public.bids;

DROP POLICY IF EXISTS "Allow authenticated users to place bids"
  ON public.bids;

REVOKE SELECT, INSERT ON TABLE public.bids FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_auction_bids(p_auction_id uuid)
RETURNS TABLE (
  id uuid,
  bidder_discord_id text,
  bidder_name text,
  bidder_avatar text,
  currency_symbol text,
  amount integer,
  calculated_weight integer,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    bid.id,
    CASE WHEN auction.is_blind IS TRUE THEN bid.bidder_discord_id ELSE NULL::text END,
    CASE WHEN auction.is_blind IS TRUE THEN bid.bidder_name ELSE NULL::text END,
    CASE WHEN auction.is_blind IS TRUE THEN bid.bidder_avatar ELSE NULL::text END,
    bid.currency_symbol,
    bid.amount,
    bid.calculated_weight,
    bid.created_at
  FROM public.bids AS bid
  JOIN public.auctions AS auction ON auction.id = bid.auction_id
  WHERE auction.id = p_auction_id
  ORDER BY bid.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_auction_bids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auction_bids(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.place_auction_bid(
  p_auction_id uuid,
  p_auth_user_id uuid,
  p_bidder_discord_id text,
  p_bidder_name text,
  p_bidder_avatar text,
  p_currency_symbol text,
  p_amount integer
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

  SELECT pg_catalog.max(bid.calculated_weight)
  INTO v_current_highest
  FROM public.bids AS bid
  WHERE bid.auction_id = p_auction_id;

  IF v_current_highest IS NOT NULL AND v_calculated_weight <= v_current_highest THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Your bid must be higher than the current highest bid.';
  END IF;

  INSERT INTO public.bids (
    auction_id,
    bidder_discord_id,
    bidder_name,
    bidder_avatar,
    currency_symbol,
    amount,
    calculated_weight
  )
  VALUES (
    p_auction_id,
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

REVOKE ALL ON FUNCTION public.place_auction_bid(uuid, uuid, text, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_auction_bid(uuid, uuid, text, text, text, text, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.broadcast_auction_bid_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM realtime.send(
    pg_catalog.jsonb_build_object('auction_id', NEW.auction_id),
    'bid_changed',
    'auction:' || NEW.auction_id::text,
    true
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER bids_broadcast_auction_bid_change
  AFTER INSERT ON public.bids
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_auction_bid_change();

DROP POLICY IF EXISTS "Authenticated users can receive auction bid changes"
  ON realtime.messages;

CREATE POLICY "Authenticated users can receive auction bid changes"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    extension = 'broadcast'
    AND realtime.topic() LIKE 'auction:%'
  );
