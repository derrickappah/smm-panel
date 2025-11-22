-- Add DELETE Policy for Services Table
-- This migration adds RLS policies for admins to delete services
-- Run this in Supabase SQL Editor

-- Drop existing DELETE policy if it exists
DROP POLICY IF EXISTS "Admins can delete services" ON services;

-- Create DELETE policy for admins using the is_admin() function
CREATE POLICY "Admins can delete services"
    ON services FOR DELETE
    USING (public.is_admin());

-- Also ensure the is_admin() function exists (from FIX_ADMIN_RLS.sql)
-- If it doesn't exist, create it
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

-- Verify the policy was created
SELECT 
    tablename,
    policyname,
    cmd as command
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'services'
AND policyname LIKE '%delete%'
ORDER BY policyname;

