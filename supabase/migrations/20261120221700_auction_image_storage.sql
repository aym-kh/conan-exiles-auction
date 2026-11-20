INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'auction-images',
  'auction-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Auction owners can view their image files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'auction-images'
    AND EXISTS (
      SELECT 1
      FROM public.auctions AS auction
      WHERE auction.id::text = (storage.foldername(name))[1]
        AND auction.seller_discord_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "Auction owners can upload image files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'auction-images'
    AND EXISTS (
      SELECT 1
      FROM public.auctions AS auction
      WHERE auction.id::text = (storage.foldername(name))[1]
        AND auction.seller_discord_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "Auction owners can update their image files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'auction-images'
    AND EXISTS (
      SELECT 1
      FROM public.auctions AS auction
      WHERE auction.id::text = (storage.foldername(name))[1]
        AND auction.seller_discord_id = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    bucket_id = 'auction-images'
    AND EXISTS (
      SELECT 1
      FROM public.auctions AS auction
      WHERE auction.id::text = (storage.foldername(name))[1]
        AND auction.seller_discord_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "Auction owners can delete their image files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'auction-images'
    AND EXISTS (
      SELECT 1
      FROM public.auctions AS auction
      WHERE auction.id::text = (storage.foldername(name))[1]
        AND auction.seller_discord_id = (SELECT auth.uid())::text
    )
  );
