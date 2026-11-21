INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'auction-image-staging',
  'auction-image-staging',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Users can view their staged auction images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'auction-image-staging'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "Users can upload their staged auction images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'auction-image-staging'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "Users can delete their staged auction images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'auction-image-staging'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
