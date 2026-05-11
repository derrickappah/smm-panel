-- 241_referral_wallet_system.sql
-- Create Referral Wallet System

-- 1. Create Referral Wallets Table
CREATE TABLE IF NOT EXISTS public.referral_wallets (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    balance DECIMAL(15, 2) DEFAULT 0.00,
    total_earned DECIMAL(15, 2) DEFAULT 0.00,
    total_withdrawn DECIMAL(15, 2) DEFAULT 0.00,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Referral Transactions Table
CREATE TABLE IF NOT EXISTS public.referral_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('commission', 'transfer', 'withdrawal')),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
    reference_id UUID, -- Optional: link to original deposit transaction
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable Row Level Security
ALTER TABLE public.referral_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_transactions ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "Users can view own referral wallet" ON public.referral_wallets;
CREATE POLICY "Users can view own referral wallet" 
    ON public.referral_wallets FOR SELECT 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own referral transactions" ON public.referral_transactions;
CREATE POLICY "Users can view own referral transactions" 
    ON public.referral_transactions FOR SELECT 
    USING (auth.uid() = user_id);

-- 5. Trigger to automatically create referral wallet for new users
CREATE OR REPLACE FUNCTION public.initialize_referral_wallet()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.referral_wallets (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created_init_referral_wallet ON public.profiles;
CREATE TRIGGER on_profile_created_init_referral_wallet
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.initialize_referral_wallet();

-- 6. Initialize wallets for existing users
INSERT INTO public.referral_wallets (user_id)
SELECT id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;
