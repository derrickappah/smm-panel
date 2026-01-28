-- Add World of SMM API integration columns
-- Run this in Supabase SQL Editor

-- Add worldofsmm_service_id column to services table
ALTER TABLE services
ADD COLUMN IF NOT EXISTS worldofsmm_service_id TEXT;

-- Add worldofsmm_order_id column to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS worldofsmm_order_id TEXT;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_services_worldofsmm_service_id ON services(worldofsmm_service_id) WHERE worldofsmm_service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_worldofsmm_order_id ON orders(worldofsmm_order_id) WHERE worldofsmm_order_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN services.worldofsmm_service_id IS 'World of SMM API service ID for integration.';
COMMENT ON COLUMN orders.worldofsmm_order_id IS 'World of SMM API order ID for tracking orders.';
