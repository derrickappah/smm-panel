-- Add JB SMM Panel API integration columns
-- This migration adds columns to support jbsmmpanel SMM panel integration
-- Run this in Supabase SQL Editor

-- Add jbsmmpanel_service_id column to services table (INTEGER - numeric ID from jbsmmpanel API)
ALTER TABLE services
ADD COLUMN IF NOT EXISTS jbsmmpanel_service_id INTEGER;

-- Add jbsmmpanel_order_id column to orders table (INTEGER - numeric ID from jbsmmpanel API)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS jbsmmpanel_order_id INTEGER;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_services_jbsmmpanel_service_id ON services(jbsmmpanel_service_id) WHERE jbsmmpanel_service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_jbsmmpanel_order_id ON orders(jbsmmpanel_order_id) WHERE jbsmmpanel_order_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN services.jbsmmpanel_service_id IS 'JB SMM Panel API service ID (numeric) for integration. NULL if service is not from jbsmmpanel.';
COMMENT ON COLUMN orders.jbsmmpanel_order_id IS 'JB SMM Panel API order ID (numeric) for tracking orders placed via jbsmmpanel. NULL if order was not placed via jbsmmpanel.';

-- Verify the columns were added
SELECT 
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('services', 'orders')
AND column_name IN ('jbsmmpanel_service_id', 'jbsmmpanel_order_id')
ORDER BY table_name, column_name;
