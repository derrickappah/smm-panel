-- Migration: Fix Services RLS Policy to Allow Users to View Disabled Services They Have Ordered
-- Run this in your Supabase SQL Editor

-- 1. Drop existing policies on services table if they exist
DROP POLICY IF EXISTS "Users can view services based on role" ON public.services;
DROP POLICY IF EXISTS "Anyone can view services" ON public.services;

-- 2. Create the new select policy that allows viewing disabled services if the user has ordered them
CREATE POLICY "Users can view services based on role" 
ON public.services FOR SELECT 
USING (
  -- Admins can see all services
  public.is_admin()
  OR
  -- Users can see services they have placed orders for (even if disabled)
  EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.user_id = auth.uid() AND orders.service_id = services.id
  )
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

-- 3. Verify the policy was created
SELECT 
    tablename,
    policyname,
    cmd as command
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'services';
