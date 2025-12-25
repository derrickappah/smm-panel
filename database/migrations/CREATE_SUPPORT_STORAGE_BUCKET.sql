-- Create Support Attachments Storage Bucket
-- Run this in your Supabase SQL Editor
-- Note: Storage buckets are created via Supabase Dashboard or API, but policies are set here

-- Create the storage bucket (if it doesn't exist)
-- This requires using the Supabase Dashboard Storage section or API
-- The bucket should be named "support-attachments" and set to private

-- Storage policies for support-attachments bucket
-- These policies control who can upload/download files

-- Policy: Users can upload files to their own conversation folders
CREATE POLICY "Users can upload to their conversation folders"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = 'support'
    AND (
        -- Extract conversation_id from path: support/{conversation_id}/...
        EXISTS (
            SELECT 1 FROM conversations
            WHERE id::text = (storage.foldername(name))[2]
            AND user_id = auth.uid()
        )
    )
);

-- Policy: Users can download files from their own conversation folders
CREATE POLICY "Users can download from their conversation folders"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = 'support'
    AND (
        -- Extract conversation_id from path: support/{conversation_id}/...
        EXISTS (
            SELECT 1 FROM conversations
            WHERE id::text = (storage.foldername(name))[2]
            AND user_id = auth.uid()
        )
    )
);

-- Policy: Users can delete files from their own conversation folders
CREATE POLICY "Users can delete from their conversation folders"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = 'support'
    AND (
        -- Extract conversation_id from path: support/{conversation_id}/...
        EXISTS (
            SELECT 1 FROM conversations
            WHERE id::text = (storage.foldername(name))[2]
            AND user_id = auth.uid()
        )
    )
);

-- Policy: Admins can upload files to any conversation folder
CREATE POLICY "Admins can upload to any conversation folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'support-attachments'
    AND public.is_admin()
);

-- Policy: Admins can download files from any conversation folder
CREATE POLICY "Admins can download from any conversation folder"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'support-attachments'
    AND public.is_admin()
);

-- Policy: Admins can delete files from any conversation folder
CREATE POLICY "Admins can delete from any conversation folder"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'support-attachments'
    AND public.is_admin()
);

-- Add comments for documentation
COMMENT ON POLICY "Users can upload to their conversation folders" ON storage.objects IS 
'Allows users to upload files to support/{conversation_id}/... paths for their own conversations';
COMMENT ON POLICY "Users can download from their conversation folders" ON storage.objects IS 
'Allows users to download files from support/{conversation_id}/... paths for their own conversations';
COMMENT ON POLICY "Admins can upload to any conversation folder" ON storage.objects IS 
'Allows admins to upload files to any conversation folder';
COMMENT ON POLICY "Admins can download from any conversation folder" ON storage.objects IS 
'Allows admins to download files from any conversation folder';

-- Note: To create the bucket, use Supabase Dashboard:
-- 1. Go to Storage section
-- 2. Click "New bucket"
-- 3. Name: "support-attachments"
-- 4. Public: No (private)
-- 5. File size limit: 10MB (or as needed)
-- 6. Allowed MIME types: image/jpeg, image/png, image/webp, image/gif, application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document

