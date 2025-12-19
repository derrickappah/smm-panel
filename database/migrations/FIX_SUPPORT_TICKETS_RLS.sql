-- Fix Support Tickets RLS Policies to use is_admin() function
-- Run this in your Supabase SQL Editor
-- Make sure is_admin() function exists (from FIX_ADMIN_RLS.sql)

-- Drop existing admin policies
DROP POLICY IF EXISTS "Admins can view all support tickets" ON support_tickets;
DROP POLICY IF EXISTS "Admins can update support tickets" ON support_tickets;

-- Recreate admin policies using the is_admin() function
CREATE POLICY "Admins can view all support tickets"
    ON support_tickets FOR SELECT
    TO authenticated
    USING (public.is_admin() OR user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Admins can update support tickets"
    ON support_tickets FOR UPDATE
    TO authenticated
    USING (public.is_admin() OR user_id = auth.uid());

-- Also ensure users can still view their own tickets
DROP POLICY IF EXISTS "Users can view their own tickets" ON support_tickets;
CREATE POLICY "Users can view their own tickets"
    ON support_tickets FOR SELECT
    TO authenticated
    USING (user_id = auth.uid() OR user_id IS NULL);

-- Verify policies were created
SELECT 
    tablename,
    policyname,
    cmd as command
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'support_tickets'
ORDER BY policyname;
