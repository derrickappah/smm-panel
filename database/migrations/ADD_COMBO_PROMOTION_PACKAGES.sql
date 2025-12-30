-- Add Combo Promotion Packages Support
-- This migration adds fields to support combo promotion packages that combine multiple packages
-- Run this in Supabase SQL Editor

-- Add combo package fields to promotion_packages table
ALTER TABLE promotion_packages 
ADD COLUMN IF NOT EXISTS is_combo BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS combo_package_ids JSONB, -- Array of promotion package IDs that make up the combo
ADD COLUMN IF NOT EXISTS combo_smmgen_service_ids JSONB; -- Array of SMMGen service IDs for each component

-- Add index for faster combo package lookups
CREATE INDEX IF NOT EXISTS idx_promotion_packages_is_combo ON promotion_packages(is_combo) WHERE is_combo = TRUE;

-- Add comments for documentation
COMMENT ON COLUMN promotion_packages.is_combo IS 'Indicates if this promotion package is a combo package that combines multiple packages';
COMMENT ON COLUMN promotion_packages.combo_package_ids IS 'Array of promotion package IDs that make up this combo package (e.g., ["uuid1", "uuid2"])';
COMMENT ON COLUMN promotion_packages.combo_smmgen_service_ids IS 'Array of SMMGen service IDs for each component package in the combo (e.g., ["123", "456"])';

-- Example: Create a combo promotion package (1M Views + 100K Likes)
-- First, you need to get the IDs of the individual packages you want to combine
-- Then insert a combo package like this:
-- INSERT INTO promotion_packages (
--   platform, 
--   service_type, 
--   name, 
--   quantity, 
--   price, 
--   description, 
--   is_combo, 
--   combo_package_ids,
--   combo_smmgen_service_ids
-- ) VALUES (
--   'instagram',
--   'combo',
--   'Instagram 1M Views + 100K Likes Combo',
--   1000000, -- Use the quantity from first component (or sum, depending on your logic)
--   250.00, -- Combined price (sum of component prices)
--   'Get both views and likes for your Instagram post',
--   TRUE,
--   '["package-uuid-1", "package-uuid-2"]'::jsonb, -- Replace with actual package UUIDs
--   '["smmgen-id-1", "smmgen-id-2"]'::jsonb -- Replace with actual SMMGen service IDs
-- );
