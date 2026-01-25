-- Migration: Add detailed provider error logging
-- This migration adds a column to store the full error response from SMM providers

ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_error_details JSONB;

-- Add comment for documentation
COMMENT ON COLUMN orders.provider_error_details IS 'Full JSON error response from the SMM provider when an order placement or status check fails.';
