-- Add UPDATE and INSERT Policies for Services Table (Admin only)
-- This allows admins to create and update services
-- Run this in Supabase SQL Editor

-- Ensure the is_admin() function exists (from FIX_ADMIN_RLS.sql or ADD_SERVICES_DELETE_POLICY.sql)
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

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can update services" ON services;
DROP POLICY IF EXISTS "Admins can insert services" ON services;

-- Policy to allow admins to update services (using is_admin() function for consistency)
CREATE POLICY "Admins can update services"
    ON services FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Policy to allow admins to insert services (using is_admin() function for consistency)
CREATE POLICY "Admins can insert services"
    ON services FOR INSERT
    WITH CHECK (public.is_admin());

-- Verify the policies were created
SELECT 
    tablename,
    policyname,
    cmd as command
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'services'
AND (policyname LIKE '%update%' OR policyname LIKE '%insert%')
ORDER BY policyname;

