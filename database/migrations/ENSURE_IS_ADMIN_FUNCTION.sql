-- Ensure is_admin() function exists and is properly configured
-- This function is critical for RLS policies on conversations and other tables
-- Run this in your Supabase SQL Editor

-- Create or replace the is_admin() function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    -- SECURITY DEFINER bypasses RLS, so this won't cause recursion
    -- STABLE means the function result doesn't change within a transaction
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission to authenticated and anon users
-- This is necessary for RLS policies to work
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

-- Add comment for documentation
COMMENT ON FUNCTION public.is_admin() IS 'Returns true if the current authenticated user has admin role. Used by RLS policies.';

-- Verify the function exists and is accessible
DO $$
BEGIN
    -- Test that the function can be called (will return false if no user is authenticated, which is expected)
    PERFORM public.is_admin();
    RAISE NOTICE 'is_admin() function verified successfully';
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error verifying is_admin() function: %', SQLERRM;
END $$;

