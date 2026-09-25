-- Migration: Add SMM Raja Provider Columns
-- Description: Adds order and service tracking columns for SMM Raja (smmraja.com) SMM panel provider

-- Add smmraja_order_id to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS smmraja_order_id TEXT;

-- Add smmraja_service_id to services table
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS smmraja_service_id TEXT;

-- Add smmraja_service_id to promotion_packages table
ALTER TABLE promotion_packages 
ADD COLUMN IF NOT EXISTS smmraja_service_id TEXT;

-- Comments
COMMENT ON COLUMN orders.smmraja_order_id IS 'Order ID returned from SMM Raja (smmraja.com) API';
COMMENT ON COLUMN services.smmraja_service_id IS 'External service ID on SMM Raja (smmraja.com) API';
COMMENT ON COLUMN promotion_packages.smmraja_service_id IS 'External service ID on SMM Raja (smmraja.com) API';
