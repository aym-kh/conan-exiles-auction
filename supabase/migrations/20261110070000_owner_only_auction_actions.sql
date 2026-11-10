DROP POLICY IF EXISTS "Allow authenticated users to create auctions"
  ON public.auctions;

CREATE POLICY "Auction owners can create auctions"
  ON public.auctions
  FOR INSERT
  TO authenticated
  WITH CHECK (seller_discord_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "Allow authenticated users to update auctions"
  ON public.auctions;

CREATE POLICY "Auction owners can update auctions"
  ON public.auctions
  FOR UPDATE
  TO authenticated
  USING (seller_discord_id = (SELECT auth.uid())::text)
  WITH CHECK (seller_discord_id = (SELECT auth.uid())::text);

CREATE POLICY "Auction owners can delete auctions"
  ON public.auctions
  FOR DELETE
  TO authenticated
  USING (seller_discord_id = (SELECT auth.uid())::text);
