-- 246_admin_referral_rls_fix.sql
-- Adds missing RLS policies for admins to view all referral wallets and transactions

-- 1. Add admin policy for referral_wallets
DROP POLICY IF EXISTS "Admins can view all referral wallets" ON public.referral_wallets;
CREATE POLICY "Admins can view all referral wallets"
    ON public.referral_wallets FOR SELECT
    USING (public.is_admin());

-- 2. Add admin policy for referral_transactions
DROP POLICY IF EXISTS "Admins can view all referral transactions" ON public.referral_transactions;
CREATE POLICY "Admins can view all referral transactions"
    ON public.referral_transactions FOR SELECT
    USING (public.is_admin());

-- Also double check referrals table just in case it was dropped
DROP POLICY IF EXISTS "Admins can view all referrals" ON public.referrals;
CREATE POLICY "Admins can view all referrals"
    ON public.referrals FOR SELECT
    USING (public.is_admin());
