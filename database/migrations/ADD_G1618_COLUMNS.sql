-- Migration: Add G1618 support
-- This adds columns to link services and orders to the G1618 SMM panel.

-- 1. Add g1618_service_id to services table
ALTER TABLE services ADD COLUMN IF NOT EXISTS g1618_service_id TEXT;

-- 2. Add g1618_order_id to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS g1618_order_id TEXT;

-- 3. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_services_g1618_id ON services(g1618_service_id);
CREATE INDEX IF NOT EXISTS idx_orders_g1618_id ON orders(g1618_order_id);

-- 4. Add comments
COMMENT ON COLUMN services.g1618_service_id IS 'Service ID from G1618 API used for mapping local services.';
COMMENT ON COLUMN orders.g1618_order_id IS 'Order ID returned by G1618 API for tracking.';
