-- Migration: Add SMM Take provider columns
-- Target project: spihsvdchouynfbsotwq

ALTER TABLE orders ADD COLUMN IF NOT EXISTS smmtake_order_id TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS smmtake_service_id TEXT;
ALTER TABLE promotion_packages ADD COLUMN IF NOT EXISTS smmtake_service_id TEXT;
