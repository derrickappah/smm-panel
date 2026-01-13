-- Add rate_unit field to services table
-- Run this in Supabase SQL Editor
--
-- This allows admins to configure rates per 1000, 500, 100, or any other quantity
-- Default is 1000 for backward compatibility with existing services

-- Add rate_unit column (defaults to 1000 for existing services)
ALTER TABLE services
ADD COLUMN IF NOT EXISTS rate_unit INTEGER DEFAULT 1000 NOT NULL;

-- Add validation constraint: rate_unit must be positive
ALTER TABLE services
DROP CONSTRAINT IF EXISTS services_rate_unit_check;

ALTER TABLE services
ADD CONSTRAINT services_rate_unit_check 
CHECK (rate_unit > 0);

-- Update any existing services that might have NULL (shouldn't happen with NOT NULL, but just in case)
UPDATE services
SET rate_unit = 1000
WHERE rate_unit IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN services.rate_unit IS 'The quantity unit for rate calculation (e.g., 1000 = per 1000, 500 = per 500, 100 = per 100). Used in cost calculation: cost = (quantity / rate_unit) * rate';
