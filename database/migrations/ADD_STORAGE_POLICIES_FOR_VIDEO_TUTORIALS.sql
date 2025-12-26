-- Add storage policies for video tutorial uploads
-- Run this in Supabase SQL Editor
--
-- Note: This assumes the 'storage' bucket already exists
-- If it doesn't, create it manually in Supabase Dashboard > Storage
-- Bucket name: 'storage'

-- Drop existing policies if they exist (to allow re-running this migration)
DROP POLICY IF EXISTS "Admins can upload video tutorials" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read video tutorials" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete video tutorials" ON storage.objects;
DROP POLICY IF EXISTS "Public can read video tutorials" ON storage.objects;

-- Policy to allow admins to upload video tutorials
CREATE POLICY "Admins can upload video tutorials"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'storage' AND
  (storage.foldername(name))[1] = 'video-tutorials' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Policy to allow admins to read video tutorials
CREATE POLICY "Admins can read video tutorials"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'storage' AND
  (storage.foldername(name))[1] = 'video-tutorials' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Policy to allow admins to delete video tutorials
CREATE POLICY "Admins can delete video tutorials"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'storage' AND
  (storage.foldername(name))[1] = 'video-tutorials' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Policy to allow public (including unauthenticated users) to read video tutorials
-- This allows the videos and thumbnails to be accessible on the public-facing pages
CREATE POLICY "Public can read video tutorials"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'storage' AND
  (storage.foldername(name))[1] = 'video-tutorials'
);

