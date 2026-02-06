-- Migration: Add support for tracking multiple provider orders in a combo
-- Run this in Supabase SQL Editor

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS component_provider_order_ids JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN orders.component_provider_order_ids IS 'Stores details of all provider orders for combo packages/services. Format: [{"provider": "smmgen", "id": "123", "service": "456", "status": "pending"}, ...]';

-- Update create_secure_order RPC if needed? 
-- The RPC creates the record but the API updates the provider IDs.
-- So adding the column is enough for now.
