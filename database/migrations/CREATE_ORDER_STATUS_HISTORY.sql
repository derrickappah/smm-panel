-- Create Order Status History Table
-- This table tracks all status changes for orders, especially from SMMGen API
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS order_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('smmgen', 'manual', 'system')),
    smmgen_response JSONB, -- Full response from SMMGen API (status, charge, start_count, remains, currency, etc.)
    previous_status TEXT, -- Previous status before this change
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL -- Admin who manually changed status (if source is 'manual')
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_created_at ON order_status_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_status_history_status ON order_status_history(status);
CREATE INDEX IF NOT EXISTS idx_order_status_history_source ON order_status_history(source);

-- Add comment for documentation
COMMENT ON TABLE order_status_history IS 'Tracks all order status changes, especially from SMMGen API';
COMMENT ON COLUMN order_status_history.order_id IS 'Reference to the order';
COMMENT ON COLUMN order_status_history.status IS 'The status value (pending, in progress, completed, etc.)';
COMMENT ON COLUMN order_status_history.source IS 'Source of status change: smmgen (from API), manual (admin), system (automatic)';
COMMENT ON COLUMN order_status_history.smmgen_response IS 'Full JSON response from SMMGen API including status, charge, start_count, remains, currency';
COMMENT ON COLUMN order_status_history.previous_status IS 'Previous status before this change';
COMMENT ON COLUMN order_status_history.created_by IS 'Admin user who manually changed status (if source is manual)';

-- Enable Row Level Security (RLS)
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

-- Policy for users to view their own order status history
CREATE POLICY "Users can view own order status history"
    ON order_status_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM orders
            WHERE orders.id = order_status_history.order_id
            AND orders.user_id = auth.uid()
        )
    );

-- Policy for admins to view all order status history
CREATE POLICY "Admins can view all order status history"
    ON order_status_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Policy for system/admins to insert order status history
CREATE POLICY "System and admins can insert order status history"
    ON order_status_history FOR INSERT
    WITH CHECK (
        -- Allow if user is admin
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
        OR
        -- Allow if it's for user's own order (system updates)
        EXISTS (
            SELECT 1 FROM orders
            WHERE orders.id = order_status_history.order_id
            AND orders.user_id = auth.uid()
        )
    );

