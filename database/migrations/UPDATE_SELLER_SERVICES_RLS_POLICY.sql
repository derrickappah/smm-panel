-- ============================================================
-- Migration: Restrict service visibility for Seller role
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
--
-- Rule:
--   - Admin: sees all services.
--   - Seller (role='seller'): ONLY sees seller services (seller_only = TRUE).
--   - Normal User (role='user' or anonymous): ONLY sees regular services (seller_only = FALSE).
--   - Has ordered service: user can always see services they previously ordered.
-- ============================================================

-- Step 1: Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view services based on role" ON public.services;

-- Step 2: Create updated SELECT policy
CREATE POLICY "Users can view services based on role"
ON public.services FOR SELECT
USING (
  -- Admins can see everything (all states, all types)
  public.is_admin()

  OR

  -- Users can always see services they have previously ordered
  public.has_ordered_service(id)

  OR

  -- Enabled regular services are visible ONLY to non-sellers (regular users & public)
  (enabled = TRUE AND seller_only = FALSE AND NOT public.is_seller())

  OR

  -- Enabled seller-only services are visible ONLY to sellers and admins
  (enabled = TRUE AND seller_only = TRUE AND public.is_seller())
);

-- Step 3: Verify policies
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
