-- ============================================================
-- Migration: Fix seller_only services RLS visibility bug
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- 
-- Problem: Users with role='user' (and unauthenticated visitors)
-- could see services marked as seller_only=true because either:
--   1. The old RLS policy (seller_only = FALSE) clause had no
--      enabled=TRUE guard, so disabled non-seller services leaked.
--   2. The newer FIX_SERVICES_RLS_POLICY.sql may not have been
--      applied, leaving the original permissive policy in place.
-- ============================================================

-- Step 1: Drop ALL existing SELECT policies on services to avoid conflicts
DROP POLICY IF EXISTS "Users can view services based on role"   ON public.services;
DROP POLICY IF EXISTS "Anyone can view services"                ON public.services;
DROP POLICY IF EXISTS "rls_services_select_admin"               ON public.services;
DROP POLICY IF EXISTS "rls_services_select_auth"                ON public.services;
DROP POLICY IF EXISTS "rls_services_select_seller"              ON public.services;
DROP POLICY IF EXISTS "Services are viewable by everyone"       ON public.services;
DROP POLICY IF EXISTS "Public services are viewable by everyone" ON public.services;

-- Step 2: Ensure the has_ordered_service helper function exists
--         (SECURITY DEFINER avoids RLS circular dependencies on orders table)
CREATE OR REPLACE FUNCTION public.has_ordered_service(p_service_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.user_id = auth.uid()
      AND orders.service_id = p_service_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.has_ordered_service(UUID) TO authenticated, service_role;

-- Step 3: Create the single, authoritative SELECT policy
CREATE POLICY "Users can view services based on role"
ON public.services FOR SELECT
USING (
  -- Admins can see everything (all states, all types)
  public.is_admin()

  OR

  -- Users can always see services they have previously ordered
  -- (even if the service is later disabled or made seller-only)
  public.has_ordered_service(id)

  OR

  -- Enabled, non-seller-only services are visible to everyone
  -- (authenticated users, anonymous visitors)
  (enabled = TRUE AND seller_only = FALSE)

  OR

  -- Enabled seller-only services are visible only to sellers and admins
  (enabled = TRUE AND seller_only = TRUE AND (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('seller', 'admin')
    )
  ))
);

-- Step 4: Verify the active policies on the services table
SELECT
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'services'
ORDER BY policyname;
