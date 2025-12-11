-- Add promotion_package_id column to orders table
-- This allows tracking which orders came from promotion packages
-- Run this in Supabase SQL Editor

-- Add the promotion_package_id column
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS promotion_package_id UUID REFERENCES promotion_packages(id) ON DELETE SET NULL;

-- Make service_id nullable to support package orders (package orders don't need a service_id)
-- Note: This is safe because we check for either service_id OR promotion_package_id in application logic
ALTER TABLE orders
ALTER COLUMN service_id DROP NOT NULL;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_orders_promotion_package_id ON orders(promotion_package_id) WHERE promotion_package_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN orders.promotion_package_id IS 'Reference to promotion package if this order was created from a package. NULL for regular service orders.';
COMMENT ON COLUMN orders.service_id IS 'Reference to service. Can be NULL if order is from a promotion package.';

