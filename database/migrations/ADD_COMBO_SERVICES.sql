-- Add Combo Services Support
-- This migration adds fields to support combo services that combine multiple services
-- Run this in Supabase SQL Editor

-- Add combo service fields to services table
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS is_combo BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS combo_service_ids JSONB, -- Array of service IDs that make up the combo
ADD COLUMN IF NOT EXISTS combo_smmgen_service_ids JSONB; -- Array of SMMGen service IDs for each component

-- Add index for faster combo service lookups
CREATE INDEX IF NOT EXISTS idx_services_is_combo ON services(is_combo) WHERE is_combo = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN services.is_combo IS 'Indicates if this service is a combo service that combines multiple services';
COMMENT ON COLUMN services.combo_service_ids IS 'Array of service IDs that make up this combo service (e.g., ["uuid1", "uuid2"])';
COMMENT ON COLUMN services.combo_smmgen_service_ids IS 'Array of SMMGen service IDs for each component service in the combo (e.g., ["123", "456"])';

-- Example: Create a combo service (views + likes)
-- First, you need to get the IDs of the individual services you want to combine
-- Then insert a combo service like this:
-- INSERT INTO services (
--   platform, 
--   service_type, 
--   name, 
--   rate, 
--   min_quantity, 
--   max_quantity, 
--   description, 
--   is_combo, 
--   combo_service_ids,
--   combo_smmgen_service_ids
-- ) VALUES (
--   'instagram',
--   'combo',
--   'Instagram Views + Likes Combo',
--   2.30, -- Combined rate (views rate + likes rate)
--   100,  -- Min quantity (use the minimum of component services)
--   50000, -- Max quantity (use the minimum of component services)
--   'Get both views and likes for your Instagram post',
--   TRUE,
--   '["service-uuid-1", "service-uuid-2"]'::jsonb, -- Replace with actual service UUIDs
--   '["smmgen-id-1", "smmgen-id-2"]'::jsonb -- Replace with actual SMMGen service IDs
-- );

