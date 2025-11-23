-- Fix Service Delete CASCADE Constraint
-- This migration ensures that when a service is deleted, related orders are also deleted
-- Run this in Supabase SQL Editor

-- First, drop the existing foreign key constraint
ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_service_id_fkey;

-- Recreate the foreign key constraint with CASCADE delete
ALTER TABLE orders
ADD CONSTRAINT orders_service_id_fkey
FOREIGN KEY (service_id)
REFERENCES services(id)
ON DELETE CASCADE;

-- Verify the constraint was created correctly
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
LEFT JOIN information_schema.referential_constraints AS rc
    ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'orders'
    AND kcu.column_name = 'service_id';

