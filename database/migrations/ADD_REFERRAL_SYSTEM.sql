-- Add Referral System
-- This migration adds referral tracking, referral codes, and automatic bonus awarding
-- Run this in Supabase SQL Editor

-- Step 1: Add referral fields to profiles table
-- First, add the columns without UNIQUE constraint (to avoid issues with existing NULLs)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS referral_code TEXT;

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Add UNIQUE constraint only if it doesn't exist (using a partial index for NULL handling)
-- This allows multiple NULLs but ensures uniqueness for non-NULL values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'profiles_referral_code_key'
    ) THEN
        -- Create unique index that allows multiple NULLs
        CREATE UNIQUE INDEX profiles_referral_code_key 
        ON profiles(referral_code) 
        WHERE referral_code IS NOT NULL;
    END IF;
END $$;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON profiles(referred_by) WHERE referred_by IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN profiles.referral_code IS 'Unique referral code for this user (format: REF{alphanumeric})';
COMMENT ON COLUMN profiles.referred_by IS 'ID of the user who referred this user';

-- Step 2: Create referrals tracking table
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    referee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    first_deposit_amount DECIMAL(10, 2),
    referral_bonus DECIMAL(10, 2),
    bonus_awarded BOOLEAN DEFAULT false,
    bonus_awarded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(referee_id) -- Each user can only be referred once
);

-- Add indexes for referrals table
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referee_id ON referrals(referee_id);
CREATE INDEX IF NOT EXISTS idx_referrals_bonus_awarded ON referrals(bonus_awarded);

-- Add comments
COMMENT ON TABLE referrals IS 'Tracks referral relationships and bonus awards';
COMMENT ON COLUMN referrals.referrer_id IS 'User who made the referral';
COMMENT ON COLUMN referrals.referee_id IS 'User who was referred';
COMMENT ON COLUMN referrals.first_deposit_amount IS 'Amount of the first deposit made by referee';
COMMENT ON COLUMN referrals.referral_bonus IS '10% bonus amount awarded to referrer';
COMMENT ON COLUMN referrals.bonus_awarded IS 'Whether the bonus has been awarded';

-- Enable RLS on referrals table
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for referrals
DROP POLICY IF EXISTS "Users can view own referrals" ON referrals;
CREATE POLICY "Users can view own referrals" 
    ON referrals FOR SELECT 
    USING (auth.uid() = referrer_id);

DROP POLICY IF EXISTS "Admins can view all referrals" ON referrals;
CREATE POLICY "Admins can view all referrals" 
    ON referrals FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Step 3: Function to generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT AS $$
DECLARE
    new_code TEXT;
    code_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate code: REF + 8 random alphanumeric characters
        new_code := 'REF' || upper(
            substr(
                encode(gen_random_bytes(6), 'base64'),
                1, 8
            )
        );
        -- Replace any non-alphanumeric characters
        new_code := regexp_replace(new_code, '[^A-Z0-9]', '', 'g');
        -- Ensure it's exactly 11 characters (REF + 8 chars)
        new_code := 'REF' || substr(new_code, 1, 8);
        
        -- Check if code already exists
        SELECT EXISTS(SELECT 1 FROM profiles WHERE referral_code = new_code) INTO code_exists;
        
        -- Exit loop if code is unique
        EXIT WHEN NOT code_exists;
    END LOOP;
    
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Update handle_new_user function to generate referral code and handle referrals
-- This version handles cases where phone_number column might not exist
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    referral_code_from_meta TEXT;
    referrer_profile_id UUID;
    generated_code TEXT;
    user_phone_number TEXT;
    has_phone_column BOOLEAN;
    has_referral_columns BOOLEAN;
BEGIN
    -- Check if phone_number column exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'phone_number'
    ) INTO has_phone_column;
    
    -- Check if referral columns exist
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'referral_code'
    ) INTO has_referral_columns;
    
    -- Get phone number if column exists
    IF has_phone_column THEN
        user_phone_number := NEW.raw_user_meta_data->>'phone_number';
    ELSE
        user_phone_number := NULL;
    END IF;
    
    -- Generate unique referral code for new user (only if referral system is set up)
    IF has_referral_columns THEN
        -- Check if generate_referral_code function exists before calling it
        IF EXISTS (
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public' AND p.proname = 'generate_referral_code'
        ) THEN
            generated_code := generate_referral_code();
        ELSE
            -- Fallback: generate a simple code if function doesn't exist
            generated_code := 'REF' || upper(substr(md5(random()::text || NEW.id::text), 1, 8));
        END IF;
        
        -- Get referral code from signup metadata if provided
        referral_code_from_meta := NEW.raw_user_meta_data->>'referral_code';
        
        -- If referral code provided, find the referrer
        IF referral_code_from_meta IS NOT NULL AND referral_code_from_meta != '' THEN
            SELECT id INTO referrer_profile_id
            FROM profiles
            WHERE referral_code = referral_code_from_meta
            LIMIT 1;
            
            -- Only set referred_by if valid referrer found and not self-referral
            IF referrer_profile_id IS NOT NULL AND referrer_profile_id != NEW.id THEN
                -- Insert profile with referral info
                IF has_phone_column THEN
                    INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code, referred_by)
                    VALUES (
                        NEW.id,
                        NEW.email,
                        COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
                        user_phone_number,
                        0.0,
                        'user',
                        generated_code,
                        referrer_profile_id
                    )
                    ON CONFLICT (id) DO NOTHING;
                ELSE
                    INSERT INTO public.profiles (id, email, name, balance, role, referral_code, referred_by)
                    VALUES (
                        NEW.id,
                        NEW.email,
                        COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
                        0.0,
                        'user',
                        generated_code,
                        referrer_profile_id
                    )
                    ON CONFLICT (id) DO NOTHING;
                END IF;
                
                -- Create referral relationship record (only if referrals table exists)
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals') THEN
                    INSERT INTO public.referrals (referrer_id, referee_id)
                    VALUES (referrer_profile_id, NEW.id)
                    ON CONFLICT (referee_id) DO NOTHING;
                END IF;
            ELSE
                -- Invalid referral code or self-referral - insert without referred_by
                IF has_phone_column THEN
                    INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code)
                    VALUES (
                        NEW.id,
                        NEW.email,
                        COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
                        user_phone_number,
                        0.0,
                        'user',
                        generated_code
                    )
                    ON CONFLICT (id) DO NOTHING;
                ELSE
                    INSERT INTO public.profiles (id, email, name, balance, role, referral_code)
                    VALUES (
                        NEW.id,
                        NEW.email,
                        COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
                        0.0,
                        'user',
                        generated_code
                    )
                    ON CONFLICT (id) DO NOTHING;
                END IF;
            END IF;
        ELSE
            -- No referral code provided - insert without referred_by
            IF has_phone_column THEN
                INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code)
                VALUES (
                    NEW.id,
                    NEW.email,
                    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
                    user_phone_number,
                    0.0,
                    'user',
                    generated_code
                )
                ON CONFLICT (id) DO NOTHING;
            ELSE
                INSERT INTO public.profiles (id, email, name, balance, role, referral_code)
                VALUES (
                    NEW.id,
                    NEW.email,
                    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
                    0.0,
                    'user',
                    generated_code
                )
                ON CONFLICT (id) DO NOTHING;
            END IF;
        END IF;
    ELSE
        -- Referral system not set up yet - use basic profile creation
        IF has_phone_column THEN
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role)
            VALUES (
                NEW.id,
                NEW.email,
                COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
                user_phone_number,
                0.0,
                'user'
            )
            ON CONFLICT (id) DO NOTHING;
        ELSE
            INSERT INTO public.profiles (id, email, name, balance, role)
            VALUES (
                NEW.id,
                NEW.email,
                COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
                0.0,
                'user'
            )
            ON CONFLICT (id) DO NOTHING;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Function to award referral bonus when first deposit is approved
CREATE OR REPLACE FUNCTION award_referral_bonus()
RETURNS TRIGGER AS $$
DECLARE
    referral_record RECORD;
    bonus_amount DECIMAL(10, 2);
    referrer_balance DECIMAL(10, 2);
BEGIN
    -- Only process if transaction status changed to approved and is a deposit
    IF NEW.status = 'approved' AND NEW.type = 'deposit' AND OLD.status != 'approved' THEN
        
        -- Check if this user was referred and has a referral record
        SELECT * INTO referral_record
        FROM referrals
        WHERE referee_id = NEW.user_id
        AND bonus_awarded = false
        LIMIT 1;
        
        -- If referral exists and bonus not yet awarded
        IF referral_record IS NOT NULL THEN
            -- Check if this is the first approved deposit for this user
            -- (count only approved deposits before this one)
            IF NOT EXISTS (
                SELECT 1 FROM transactions
                WHERE user_id = NEW.user_id
                AND type = 'deposit'
                AND status = 'approved'
                AND id != NEW.id
            ) THEN
                -- Calculate 10% bonus
                bonus_amount := NEW.amount * 0.10;
                
                -- Get current referrer balance
                SELECT balance INTO referrer_balance
                FROM profiles
                WHERE id = referral_record.referrer_id;
                
                -- Update referrer's balance
                UPDATE profiles
                SET balance = COALESCE(referrer_balance, 0) + bonus_amount
                WHERE id = referral_record.referrer_id;
                
                -- Update referral record
                UPDATE referrals
                SET 
                    first_deposit_amount = NEW.amount,
                    referral_bonus = bonus_amount,
                    bonus_awarded = true,
                    bonus_awarded_at = NOW()
                WHERE id = referral_record.id;
                
                -- Create transaction record for the bonus (optional - for tracking)
                -- This helps track referral bonuses in transaction history
                INSERT INTO transactions (user_id, amount, type, status, description)
                VALUES (
                    referral_record.referrer_id,
                    bonus_amount,
                    'referral_bonus',
                    'approved',
                    'Referral bonus for first deposit'
                );
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Create trigger for deposit bonus
DROP TRIGGER IF EXISTS trigger_award_referral_bonus ON transactions;
CREATE TRIGGER trigger_award_referral_bonus
    AFTER UPDATE ON transactions
    FOR EACH ROW
    WHEN (NEW.status = 'approved' AND NEW.type = 'deposit')
    EXECUTE FUNCTION award_referral_bonus();

-- Step 7: Generate referral codes for existing users (if any)
-- This is safe to run multiple times - it only updates users without codes
DO $$
DECLARE
    user_record RECORD;
    new_code TEXT;
BEGIN
    FOR user_record IN 
        SELECT id FROM profiles WHERE referral_code IS NULL
    LOOP
        new_code := generate_referral_code();
        
        -- Update user with generated code
        UPDATE profiles
        SET referral_code = new_code
        WHERE id = user_record.id
        AND referral_code IS NULL;
    END LOOP;
END $$;

-- Verify the migration
SELECT 
    'Referral system migration completed' as status,
    (SELECT COUNT(*) FROM profiles WHERE referral_code IS NOT NULL) as users_with_codes,
    (SELECT COUNT(*) FROM referrals) as total_referrals;

