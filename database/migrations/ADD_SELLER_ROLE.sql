-- Add Seller Role and Seller-Only Services
-- This migration adds the 'seller' role and allows services to be restricted to sellers only
-- Run this in Supabase SQL Editor

-- Step 1: Update the role constraint to include 'seller'
-- First, drop the existing constraint
ALTER TABLE profiles 
DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add the new constraint with 'seller' role
ALTER TABLE profiles 
ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('user', 'admin', 'seller'));

-- Step 2: Add seller_only field to services table
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS seller_only BOOLEAN DEFAULT FALSE;

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_services_seller_only ON services(seller_only) WHERE seller_only = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN services.seller_only IS 'If true, this service is only visible to users with seller or admin role';

-- Step 3: Update RLS policies for services
-- Drop existing "Anyone can view services" policy
DROP POLICY IF EXISTS "Anyone can view services" ON services;

-- Create new policy that filters based on seller_only flag
CREATE POLICY "Users can view services based on role" 
ON services FOR SELECT 
USING (
  -- Admins can see all services
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
  OR
  -- Seller-only services: visible to sellers and admins
  (seller_only = TRUE AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role IN ('seller', 'admin')
  ))
  OR
  -- Regular services: visible to everyone (including sellers)
  (seller_only = FALSE)
);

-- Step 4: Create helper function to check if user is seller
CREATE OR REPLACE FUNCTION public.is_seller()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'seller'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_seller() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_seller() TO anon;

-- Step 5: Update admin policies to include sellers (optional - if you want sellers to have some admin privileges)
-- For now, sellers only have access to seller-only services, not full admin access

-- Example: Mark existing services as seller-only (optional - uncomment if needed)
-- UPDATE services SET seller_only = TRUE WHERE platform = 'premium' OR service_type = 'premium';

-- Verify the changes
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'role';

SELECT 
  column_name, 
  data_type, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'services' AND column_name = 'seller_only';

