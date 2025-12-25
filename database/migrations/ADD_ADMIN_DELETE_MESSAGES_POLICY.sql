-- Add DELETE policy for admins on messages table
-- This allows admins to delete any message in support conversations

-- Policy: Admins can DELETE all messages
CREATE POLICY "Admins can delete all messages"
    ON messages FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- Add comment for documentation
COMMENT ON POLICY "Admins can delete all messages" ON messages IS 'Allows admins to delete any message in support conversations';

