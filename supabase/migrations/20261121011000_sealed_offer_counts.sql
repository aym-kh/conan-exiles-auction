CREATE FUNCTION public.get_auction_bid_count(p_auction_id uuid, p_item_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.count(*)::integer
  FROM public.bids AS bid
  JOIN public.auctions AS auction ON auction.id = bid.auction_id
  WHERE auction.id = p_auction_id
    AND bid.item_id IS NOT DISTINCT FROM p_item_id
    AND (
      (auction.bid_visibility = 'sealed' AND bid.is_sealed_offer)
      OR (auction.bid_visibility <> 'sealed' AND NOT bid.is_sealed_offer)
    );
$$;

REVOKE ALL ON FUNCTION public.get_auction_bid_count(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auction_bid_count(uuid, uuid) TO anon, authenticated;
