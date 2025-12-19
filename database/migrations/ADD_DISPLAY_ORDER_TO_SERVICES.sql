-- Add display_order field to services table
-- This allows admins to control the order in which services are displayed
-- Run this in Supabase SQL Editor

-- Add display_order column (defaults to 0 for existing services)
ALTER TABLE services
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0 NOT NULL;

-- Initialize existing services with sequential display_order values based on created_at
-- This ensures existing services maintain their current order
UPDATE services
SET display_order = subquery.row_number - 1
FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) as row_number
    FROM services
) AS subquery
WHERE services.id = subquery.id;

-- Create index for better query performance when ordering services
CREATE INDEX IF NOT EXISTS idx_services_display_order ON services(display_order);

-- Add comment for documentation
COMMENT ON COLUMN services.display_order IS 'Order for displaying services (lower numbers first). Used to control the order in which services appear in the admin panel and user-facing pages.';
