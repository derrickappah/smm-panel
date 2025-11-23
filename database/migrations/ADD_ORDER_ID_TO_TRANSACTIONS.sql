-- Add order_id to transactions table for better tracking
-- This allows linking transaction records to specific orders
-- Run this in Supabase SQL Editor

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;

COMMENT ON COLUMN transactions.order_id IS 'Reference to the order that caused this transaction (for order-type transactions)';

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON transactions(order_id);

