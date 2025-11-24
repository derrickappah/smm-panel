-- Add enabled field to services table
-- Run this in Supabase SQL Editor

-- Add enabled column (defaults to true for existing services)
ALTER TABLE services
ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN services.enabled IS 'Whether the service is enabled and visible to users. Disabled services are hidden from user views but remain in the database.';

-- Create index for better query performance when filtering enabled services
CREATE INDEX IF NOT EXISTS idx_services_enabled ON services(enabled);

