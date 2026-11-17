CREATE TABLE public.auction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(title)) >= 3),
  description text,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auction_items_auction_id_idx ON public.auction_items(auction_id);

CREATE FUNCTION public.enforce_multiple_auction_items()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_auction_id uuid;
  v_auction_ids uuid[];
  v_item_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_auction_ids := ARRAY[OLD.auction_id];
  ELSIF TG_OP = 'UPDATE' THEN
    v_auction_ids := ARRAY[OLD.auction_id, NEW.auction_id];
  ELSE
    v_auction_ids := ARRAY[NEW.auction_id];
  END IF;

  FOREACH v_auction_id IN ARRAY v_auction_ids LOOP
    SELECT pg_catalog.count(*)
    INTO v_item_count
    FROM public.auction_items
    WHERE auction_id = v_auction_id;

    IF v_item_count = 1 THEN
      RAISE EXCEPTION 'Auctions must have either zero or at least two items.';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER auction_items_minimum_count
  AFTER INSERT OR UPDATE OR DELETE ON public.auction_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_multiple_auction_items();

ALTER TABLE public.auction_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on auction items"
  ON public.auction_items
  FOR SELECT
  USING (true);

CREATE POLICY "Auction owners can create auction items"
  ON public.auction_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.auctions
      WHERE id = auction_id
        AND seller_discord_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "Auction owners can update auction items"
  ON public.auction_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.auctions
      WHERE id = auction_id
        AND seller_discord_id = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.auctions
      WHERE id = auction_id
        AND seller_discord_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "Auction owners can delete auction items"
  ON public.auction_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.auctions
      WHERE id = auction_id
        AND seller_discord_id = (SELECT auth.uid())::text
    )
  );

ALTER TABLE public.bids
  ADD COLUMN item_id uuid REFERENCES public.auction_items(id);

DROP FUNCTION public.get_auction_bids(uuid);

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
    CASE WHEN auction.is_blind IS TRUE THEN bid.bidder_discord_id ELSE NULL::text END,
    CASE WHEN auction.is_blind IS TRUE THEN bid.bidder_name ELSE NULL::text END,
    CASE WHEN auction.is_blind IS TRUE THEN bid.bidder_avatar ELSE NULL::text END,
    bid.currency_symbol,
    bid.amount,
    bid.calculated_weight,
    bid.created_at,
    bid.item_id
  FROM public.bids AS bid
  JOIN public.auctions AS auction ON auction.id = bid.auction_id
  WHERE auction.id = p_auction_id
  ORDER BY bid.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_auction_bids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auction_bids(uuid) TO anon, authenticated;

DROP FUNCTION public.place_auction_bid(uuid, uuid, text, text, text, text, integer);

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
