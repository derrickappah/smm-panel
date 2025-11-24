-- Add refund tracking fields to orders table
-- This tracks automatic refund attempts and status
-- Run this in Supabase SQL Editor

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS refund_status TEXT DEFAULT NULL CHECK (refund_status IN ('pending', 'succeeded', 'failed', NULL)),
ADD COLUMN IF NOT EXISTS refund_attempted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS refund_error TEXT DEFAULT NULL;

COMMENT ON COLUMN orders.refund_status IS 'Status of refund: pending (automatic refund in progress), succeeded (refund completed), failed (automatic refund failed, needs manual intervention), NULL (no refund attempted)';
COMMENT ON COLUMN orders.refund_attempted_at IS 'Timestamp when automatic refund was first attempted';
COMMENT ON COLUMN orders.refund_error IS 'Error message if automatic refund failed';

