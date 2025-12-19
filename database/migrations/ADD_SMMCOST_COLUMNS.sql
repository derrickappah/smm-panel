-- Add SMMCost API integration columns
-- This migration adds columns to support smmcost SMM panel integration
-- Run this in Supabase SQL Editor

-- Add smmcost_service_id column to services table (INTEGER - numeric ID from smmcost API)
ALTER TABLE services
ADD COLUMN IF NOT EXISTS smmcost_service_id INTEGER;

-- Add smmcost_order_id column to orders table (INTEGER - numeric ID from smmcost API)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS smmcost_order_id INTEGER;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_services_smmcost_service_id ON services(smmcost_service_id) WHERE smmcost_service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_smmcost_order_id ON orders(smmcost_order_id) WHERE smmcost_order_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN services.smmcost_service_id IS 'SMMCost API service ID (numeric) for integration. NULL if service is not from smmcost panel.';
COMMENT ON COLUMN orders.smmcost_order_id IS 'SMMCost API order ID (numeric) for tracking orders placed via smmcost. NULL if order was not placed via smmcost.';

-- Verify the columns were added
SELECT 
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('services', 'orders')
AND column_name IN ('smmcost_service_id', 'smmcost_order_id')
ORDER BY table_name, column_name;
