-- Change orders table to use SMMGen order ID as primary key
-- Run this in Supabase SQL Editor
-- WARNING: This will require updating foreign key references

-- First, check if there are any orders without smmgen_order_id
-- If so, we'll need to handle them (generate UUIDs or skip migration)

-- Step 1: Drop policies and constraints that depend on orders.id
-- Drop policies on order_status_history that might reference orders
DROP POLICY IF EXISTS "Users can view own order status history" ON order_status_history;
DROP POLICY IF EXISTS "Admins can view all order status history" ON order_status_history;
DROP POLICY IF EXISTS "System and admins can insert order status history" ON order_status_history;

-- Drop foreign key constraints that reference orders.id
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_order_id_fkey;
ALTER TABLE order_status_history DROP CONSTRAINT IF EXISTS order_status_history_order_id_fkey;

-- Step 2: Change orders.id from UUID to TEXT
-- First, we need to handle existing data
-- Create a backup of current orders
CREATE TABLE IF NOT EXISTS orders_backup AS SELECT * FROM orders;

-- Create a temporary mapping table to track old UUID -> new TEXT ID
CREATE TEMP TABLE order_id_mapping AS
SELECT 
  id::text as old_id,
  COALESCE(smmgen_order_id, id::text) as new_id
FROM orders;

-- Drop the existing primary key constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_pkey;

-- Change id column to TEXT (will store SMMGen order ID)
-- For existing orders without smmgen_order_id, we'll use their UUID as the ID
ALTER TABLE orders 
ALTER COLUMN id TYPE TEXT USING COALESCE(smmgen_order_id, id::text);

-- Set id as primary key again
ALTER TABLE orders ADD PRIMARY KEY (id);

-- Step 3: Make smmgen_order_id the same as id (since id now IS the SMMGen ID)
-- Update smmgen_order_id to match id for existing records
UPDATE orders SET smmgen_order_id = id WHERE smmgen_order_id IS NULL OR smmgen_order_id != id;

-- Step 4: Recreate foreign key constraints with TEXT type
-- First, update transactions.order_id to match the new orders.id format using the mapping table
-- We need to convert to TEXT first, then update
-- Step 4a: Convert transactions.order_id to TEXT first (temporarily, we'll update values after)
ALTER TABLE transactions 
ALTER COLUMN order_id TYPE TEXT USING order_id::text;

-- Step 4b: Now update transactions.order_id to match the new orders.id format using the mapping table
UPDATE transactions t
SET order_id = m.new_id
FROM order_id_mapping m
WHERE t.order_id = m.old_id
AND t.order_id IS NOT NULL;

-- Step 4c: Set order_id to NULL for transactions that reference orders that don't exist
UPDATE transactions 
SET order_id = NULL 
WHERE order_id IS NOT NULL 
AND NOT EXISTS (
    SELECT 1 FROM orders WHERE orders.id = transactions.order_id
);

-- Recreate foreign key constraint
ALTER TABLE transactions
ADD CONSTRAINT transactions_order_id_fkey 
FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- Step 5: Update order_status_history.order_id to match new orders.id format
-- Step 5a: Convert order_status_history.order_id to TEXT first
ALTER TABLE order_status_history 
ALTER COLUMN order_id TYPE TEXT USING order_id::text;

-- Step 5b: Update order_status_history.order_id to match the new orders.id format using the mapping table
UPDATE order_status_history osh
SET order_id = m.new_id
FROM order_id_mapping m
WHERE osh.order_id = m.old_id
AND osh.order_id IS NOT NULL;

-- Step 5c: Set order_id to NULL for order_status_history that reference orders that don't exist
UPDATE order_status_history 
SET order_id = NULL 
WHERE order_id IS NOT NULL 
AND NOT EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_status_history.order_id
);

-- Step 5d: Recreate foreign key constraint
ALTER TABLE order_status_history
ADD CONSTRAINT order_status_history_order_id_fkey 
FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- Step 6: Recreate policies on order_status_history
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

-- Step 5: Remove smmgen_order_id column (no longer needed since id IS the SMMGen ID)
-- Actually, let's keep it for backward compatibility and set it to always equal id
-- We can add a trigger to keep them in sync
CREATE OR REPLACE FUNCTION sync_smmgen_order_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.smmgen_order_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_smmgen_order_id_trigger
BEFORE INSERT OR UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION sync_smmgen_order_id();

-- Add comment
COMMENT ON COLUMN orders.id IS 'Order ID - uses SMMGen order ID when available, otherwise generated UUID';
COMMENT ON COLUMN orders.smmgen_order_id IS 'SMMGen order ID (synced with id via trigger)';

