-- Migration: Add Tiksta SMM Provider Columns
-- Description: Adds order and service tracking columns for Tiksta (tiksta.com) SMM panel provider

-- Add tiksta_order_id to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS tiksta_order_id TEXT;

-- Add tiksta_service_id to services table
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS tiksta_service_id TEXT;

-- Add tiksta_service_id to promotion_packages table
ALTER TABLE promotion_packages 
ADD COLUMN IF NOT EXISTS tiksta_service_id TEXT;

-- Comments
COMMENT ON COLUMN orders.tiksta_order_id IS 'Order ID returned from Tiksta (tiksta.com) API';
COMMENT ON COLUMN services.tiksta_service_id IS 'External service ID on Tiksta (tiksta.com) API';
COMMENT ON COLUMN promotion_packages.tiksta_service_id IS 'External service ID on Tiksta (tiksta.com) API';
