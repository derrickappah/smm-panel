-- Add storage policies for payment proof uploads
-- Run this in Supabase SQL Editor

-- First, ensure the storage bucket exists (create it if it doesn't)
-- Note: You may need to create the bucket manually in Supabase Dashboard > Storage
-- Bucket name: 'storage'

-- Drop existing policies if they exist (to allow re-running this migration)
DROP POLICY IF EXISTS "Users can upload payment proofs to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read all payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete payment proofs" ON storage.objects;

-- Policy to allow authenticated users to upload payment proofs to their own folder
CREATE POLICY "Users can upload payment proofs to their own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'storage' AND
  (storage.foldername(name))[1] = 'payment-proofs' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy to allow users to read their own payment proofs
CREATE POLICY "Users can read their own payment proofs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'storage' AND
  (storage.foldername(name))[1] = 'payment-proofs' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy to allow admins to read all payment proofs
CREATE POLICY "Admins can read all payment proofs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'storage' AND
  (storage.foldername(name))[1] = 'payment-proofs' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Policy to allow admins to delete payment proofs (for cleanup)
CREATE POLICY "Admins can delete payment proofs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'storage' AND
  (storage.foldername(name))[1] = 'payment-proofs' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

