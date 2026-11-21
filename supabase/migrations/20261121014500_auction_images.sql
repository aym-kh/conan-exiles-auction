ALTER TABLE public.auction_items
  ADD CONSTRAINT auction_items_id_auction_id_key UNIQUE (id, auction_id);

CREATE TABLE public.auction_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  item_id uuid,
  storage_path text NOT NULL UNIQUE CHECK (pg_catalog.length(pg_catalog.btrim(storage_path)) > 0),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auction_images_path_matches_auction
    CHECK (storage_path LIKE (auction_id::text || '/%')),
  CONSTRAINT auction_images_item_auction_fk
    FOREIGN KEY (item_id, auction_id)
    REFERENCES public.auction_items(id, auction_id)
    ON DELETE CASCADE
);

CREATE INDEX auction_images_auction_item_sort_idx
  ON public.auction_images (auction_id, item_id, sort_order);

ALTER TABLE public.auction_images ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.auction_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.auction_images TO authenticated;

CREATE POLICY "Allow public read access on auction images"
  ON public.auction_images
  FOR SELECT
  USING (true);

CREATE POLICY "Auction owners can add auction images"
  ON public.auction_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.auctions AS auction
      WHERE auction.id = auction_id
        AND auction.seller_discord_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "Auction owners can update auction images"
  ON public.auction_images
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.auctions AS auction
      WHERE auction.id = auction_id
        AND auction.seller_discord_id = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.auctions AS auction
      WHERE auction.id = auction_id
        AND auction.seller_discord_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "Auction owners can delete auction images"
  ON public.auction_images
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.auctions AS auction
      WHERE auction.id = auction_id
        AND auction.seller_discord_id = (SELECT auth.uid())::text
    )
  );
