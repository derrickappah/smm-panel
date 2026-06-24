-- Migration: Fix Services RLS Policy to Allow Users to View Disabled Services They Have Ordered
-- Run this in your Supabase SQL Editor

-- 1. Drop all existing SELECT policies on services table to avoid conflicts
DROP POLICY IF EXISTS "Users can view services based on role" ON public.services;
DROP POLICY IF EXISTS "Anyone can view services" ON public.services;
DROP POLICY IF EXISTS "rls_services_select_admin" ON public.services;
DROP POLICY IF EXISTS "rls_services_select_auth" ON public.services;
DROP POLICY IF EXISTS "rls_services_select_seller" ON public.services;

-- 2. Create a security definer function to check if the current user has ordered a service.
-- SECURITY DEFINER runs the check with bypass-RLS privileges, preventing any RLS circular dependencies.
CREATE OR REPLACE FUNCTION public.has_ordered_service(p_service_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.user_id = auth.uid() AND orders.service_id = p_service_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permissions on the function
GRANT EXECUTE ON FUNCTION public.has_ordered_service(UUID) TO authenticated, service_role;

-- 3. Create the consolidated SELECT policy
CREATE POLICY "Users can view services based on role" 
ON public.services FOR SELECT 
USING (
  -- Admins can see all services
  public.is_admin()
  OR
  -- Users can see services they have placed orders for (even if disabled)
  public.has_ordered_service(id)
  OR
  -- Enabled regular services: visible to everyone
  (enabled = TRUE AND seller_only = FALSE)
  OR
  -- Enabled seller-only services: visible to sellers and admins
  (enabled = TRUE AND seller_only = TRUE AND (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('seller', 'admin')
    )
  ))
);

-- 4. Verify the policy was created
SELECT 
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'services';
