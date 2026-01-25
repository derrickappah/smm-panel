-- Migration: Add support for ignoring specific ledger balance anomalies
-- This allows admins to whitelist users with known/accepted discrepancies

-- 1. Create exceptions table
CREATE TABLE IF NOT EXISTS ledger_balance_exceptions (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id)
);

COMMENT ON TABLE ledger_balance_exceptions IS 'Whitelist of users whose balance discrepancies should be ignored by the monitoring system.';

-- 2. Update the verification view to exclude whitelisted users
CREATE OR REPLACE VIEW ledger_balance_verification AS
SELECT 
    p.id as user_id,
    p.email,
    p.balance as cached_balance,
    COALESCE(SUM(
        CASE 
            WHEN t.status = 'approved' THEN
                CASE 
                    WHEN t.type IN ('deposit', 'refund', 'referral_bonus') THEN t.amount
                    WHEN t.type = 'manual_adjustment' THEN t.amount
                    WHEN t.type = 'order' THEN 
                        CASE WHEN t.amount < 0 THEN t.amount ELSE -t.amount END
                    ELSE 0
                END
            ELSE 0
        END
    ), 0) as ledger_balance,
    p.balance - COALESCE(SUM(
        CASE 
            WHEN t.status = 'approved' THEN
                CASE 
                    WHEN t.type IN ('deposit', 'refund', 'referral_bonus') THEN t.amount
                    WHEN t.type = 'manual_adjustment' THEN t.amount
                    WHEN t.type = 'order' THEN 
                        CASE WHEN t.amount < 0 THEN t.amount ELSE -t.amount END
                    ELSE 0
                END
            ELSE 0
        END
    ), 0) as discrepancy
FROM profiles p
LEFT JOIN transactions t ON p.id = t.user_id
-- Filter out ignored users
WHERE NOT EXISTS (SELECT 1 FROM ledger_balance_exceptions WHERE user_id = p.id)
GROUP BY p.id, p.email, p.balance
HAVING p.balance != 0 OR EXISTS (SELECT 1 FROM transactions WHERE user_id = p.id);

COMMENT ON VIEW ledger_balance_verification IS 'Detects silent balance corruption by comparing cached balance with transaction ledger, excluding whitelisted exceptions.';
