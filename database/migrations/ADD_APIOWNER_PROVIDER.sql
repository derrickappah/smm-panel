-- Migration: Add ApiOwner SMM Panel support
-- This adds columns to link services, promotion packages, and orders to the ApiOwner SMM panel.

-- 1. Add apiowner_service_id to services table
ALTER TABLE services ADD COLUMN IF NOT EXISTS apiowner_service_id TEXT;

-- 2. Add apiowner_service_id to promotion_packages table
ALTER TABLE promotion_packages ADD COLUMN IF NOT EXISTS apiowner_service_id TEXT;

-- 3. Add apiowner_order_id to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS apiowner_order_id TEXT;

-- 4. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_services_apiowner_id ON services(apiowner_service_id);
CREATE INDEX IF NOT EXISTS idx_promotion_packages_apiowner_id ON promotion_packages(apiowner_service_id);
CREATE INDEX IF NOT EXISTS idx_orders_apiowner_id ON orders(apiowner_order_id);

-- 5. Add comments
COMMENT ON COLUMN services.apiowner_service_id IS 'Service ID from ApiOwner API used for mapping local services.';
COMMENT ON COLUMN promotion_packages.apiowner_service_id IS 'Service ID from ApiOwner API for promotion packages.';
COMMENT ON COLUMN orders.apiowner_order_id IS 'Order ID returned by ApiOwner API for tracking.';
