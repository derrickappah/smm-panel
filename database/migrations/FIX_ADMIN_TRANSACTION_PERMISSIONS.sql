-- Migration: Fix Admin Transaction Permissions
-- This script adds the missing RLS policies to allow admins to insert transactions directly.
-- This is required for the "Manual Balance Adjustment" feature to work correctly.

-- 1. Allow admins to insert transactions
-- We restrict this to admins only, and they can insert any type of transaction.
-- However, we still validate that the user_id exists (via FK) and the role is admin.
DROP POLICY IF EXISTS "Admins can insert transactions" ON transactions;
CREATE POLICY "Admins can insert transactions" 
    ON transactions FOR INSERT 
    WITH CHECK ( is_admin() );

-- 2. Ensure admins can also update any transaction (already exists, but reinforcing)
DROP POLICY IF EXISTS "Admins can update all transactions" ON transactions;
CREATE POLICY "Admins can update all transactions" 
    ON transactions FOR UPDATE 
    USING ( is_admin() );


-- 3. Log this permission fix
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_activity_logs') THEN
        INSERT INTO system_activity_logs (event_type, severity, source, description, metadata)
        VALUES (
            'security_policy_updated',
            'info',
            'database-fixer',
            'Added Admins can insert transactions policy to allow manual balance adjustments.',
            '{"target": "transactions", "action": "INSERT", "role": "admin"}'::JSONB
        );
    END IF;
END $$;

COMMENT ON POLICY "Admins can insert transactions" ON transactions IS 'Allows admins to directly insert transaction records, supporting manual adjustments and offline payments.';
