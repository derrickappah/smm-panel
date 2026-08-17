-- Migration 253: Enforce Non-Negative Wallet Balances, Immutable Transaction Logs & Security Constraints
-- Threat Categories: 2 (Access Control), 7 (Payment Attacks), 8 (Wallet Integrity), 16 & 29 (Database Security)

-- 1. Ensure profile balances can NEVER drop below zero (prevents overdraft / negative balance exploits)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_profiles_non_negative_balance'
    ) THEN
        ALTER TABLE public.profiles 
        ADD CONSTRAINT check_profiles_non_negative_balance 
        CHECK (balance >= 0);
    END IF;
END $$;

-- 2. Ensure referral wallet balances can NEVER drop below zero
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'referral_wallets'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'check_referral_wallets_non_negative_balance'
        ) THEN
            ALTER TABLE public.referral_wallets 
            ADD CONSTRAINT check_referral_wallets_non_negative_balance 
            CHECK (balance >= 0);
        END IF;
    END IF;
END $$;

-- 3. Ensure orders quantity is strictly positive integer
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_orders_positive_quantity'
    ) THEN
        ALTER TABLE public.orders 
        ADD CONSTRAINT check_orders_positive_quantity 
        CHECK (quantity > 0);
    END IF;
END $$;

-- 4. Revoke dangerous anonymous permissions on internal schema tables
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON public.services TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT ON public.orders TO authenticated;
GRANT SELECT ON public.transactions TO authenticated;

