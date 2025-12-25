-- Create Support Attachments Storage Bucket
-- IMPORTANT: Storage buckets and policies must be created via Supabase Dashboard or API
-- This file contains instructions and the SQL policies that need to be created manually

-- ============================================================================
-- STEP 1: Create the Storage Bucket (via Supabase Dashboard)
-- ============================================================================
-- 1. Go to your Supabase Dashboard
-- 2. Navigate to Storage section
-- 3. Click "New bucket"
-- 4. Configure:
--    - Name: "support-attachments"
--    - Public: No (private bucket)
--    - File size limit: 10MB (or adjust as needed)
--    - Allowed MIME types: 
--      * image/jpeg
--      * image/png
--      * image/webp
--      * image/gif
--      * application/pdf
--      * application/msword
--      * application/vnd.openxmlformats-officedocument.wordprocessingml.document

-- ============================================================================
-- STEP 2: Create Storage Policies (via Supabase Dashboard)
-- ============================================================================
-- After creating the bucket, go to the bucket's "Policies" tab and create these policies:

-- Policy 1: Users can upload to their conversation folders
-- Name: "Users can upload to their conversation folders"
-- Operation: INSERT
-- Target roles: authenticated
-- Policy definition (USING expression): Leave empty or use: true
-- Policy definition (WITH CHECK expression):
-- bucket_id = 'support-attachments' 
-- AND (storage.foldername(name))[1] = 'support'
-- AND EXISTS (
--     SELECT 1 FROM conversations
--     WHERE id::text = (storage.foldername(name))[2]
--     AND user_id = auth.uid()
-- )

-- Policy 2: Users can download from their conversation folders
-- Name: "Users can download from their conversation folders"
-- Operation: SELECT
-- Target roles: authenticated
-- Policy definition (USING expression):
-- bucket_id = 'support-attachments'
-- AND (storage.foldername(name))[1] = 'support'
-- AND EXISTS (
--     SELECT 1 FROM conversations
--     WHERE id::text = (storage.foldername(name))[2]
--     AND user_id = auth.uid()
-- )

-- Policy 3: Users can delete from their conversation folders
-- Name: "Users can delete from their conversation folders"
-- Operation: DELETE
-- Target roles: authenticated
-- Policy definition (USING expression):
-- bucket_id = 'support-attachments'
-- AND (storage.foldername(name))[1] = 'support'
-- AND EXISTS (
--     SELECT 1 FROM conversations
--     WHERE id::text = (storage.foldername(name))[2]
--     AND user_id = auth.uid()
-- )

-- Policy 4: Admins can upload to any conversation folder
-- Name: "Admins can upload to any conversation folder"
-- Operation: INSERT
-- Target roles: authenticated
-- Policy definition (USING expression): Leave empty
-- Policy definition (WITH CHECK expression):
-- bucket_id = 'support-attachments' AND public.is_admin()

-- Policy 5: Admins can download from any conversation folder
-- Name: "Admins can download from any conversation folder"
-- Operation: SELECT
-- Target roles: authenticated
-- Policy definition (USING expression):
-- bucket_id = 'support-attachments' AND public.is_admin()

-- Policy 6: Admins can delete from any conversation folder
-- Name: "Admins can delete from any conversation folder"
-- Operation: DELETE
-- Target roles: authenticated
-- Policy definition (USING expression):
-- bucket_id = 'support-attachments' AND public.is_admin()

-- ============================================================================
-- ALTERNATIVE: Create via Supabase CLI or API
-- ============================================================================
-- You can also create the bucket and policies programmatically using:
-- 1. Supabase CLI: supabase storage create support-attachments
-- 2. Supabase Management API
-- 3. Supabase JavaScript client (for policies)

-- ============================================================================
-- NOTE: File Path Structure
-- ============================================================================
-- Files should be stored with the following path structure:
-- support/{conversation_id}/{random_uuid}.{extension}
-- 
-- Example: support/123e4567-e89b-12d3-a456-426614174000/abc123-def456-789.jpg
--
-- This structure allows the policies to extract the conversation_id from the path
-- and verify that the user has access to that conversation.

