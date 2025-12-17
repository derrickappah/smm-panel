-- Complete Referral System Fix - Run this ONE file to fix everything
-- This script safely adds referral system without breaking signups

-- Step 1: Add referral columns to profiles (if they don't exist)
DO $$
BEGIN
    -- Add referral_code column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'referral_code'
    ) THEN
        ALTER TABLE profiles ADD COLUMN referral_code TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key 
        ON profiles(referral_code) WHERE referral_code IS NOT NULL;
    END IF;
    
    -- Add referred_by column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'referred_by'
    ) THEN
        ALTER TABLE profiles ADD COLUMN referred_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON profiles(referred_by) WHERE referred_by IS NOT NULL;
    END IF;
END $$;

-- Step 2: Create referrals table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    referee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    first_deposit_amount DECIMAL(10, 2),
    referral_bonus DECIMAL(10, 2),
    bonus_awarded BOOLEAN DEFAULT false,
    bonus_awarded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(referee_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referee_id ON referrals(referee_id);
CREATE INDEX IF NOT EXISTS idx_referrals_bonus_awarded ON referrals(bonus_awarded);

-- Step 3: Enable RLS and create policies for referrals
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

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

-- Allow trigger to insert referrals (must allow all inserts from trigger)
DROP POLICY IF EXISTS "Allow trigger to insert referrals" ON referrals;
CREATE POLICY "Allow trigger to insert referrals" 
    ON referrals FOR INSERT 
    WITH CHECK (true);

-- Also grant explicit permissions to ensure inserts work
GRANT ALL ON referrals TO postgres, service_role;
GRANT INSERT, SELECT ON referrals TO anon, authenticated;

-- Step 4: Create generate_referral_code function (if it doesn't exist)
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT AS $$
DECLARE
    new_code TEXT;
    code_exists BOOLEAN;
BEGIN
    LOOP
        new_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
        
        SELECT EXISTS(SELECT 1 FROM profiles WHERE referral_code = new_code) INTO code_exists;
        
        EXIT WHEN NOT code_exists;
    END LOOP;
    
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create safe handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_name TEXT;
    user_phone TEXT;
    referral_code_from_meta TEXT;
    referrer_id UUID;
    generated_code TEXT;
    has_phone BOOLEAN;
    has_referral_code_col BOOLEAN;
BEGIN
    -- Get basic user info
    user_name := COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1));
    user_phone := NEW.raw_user_meta_data->>'phone_number';
    
    -- Check what columns exist
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone_number'
    ) INTO has_phone;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'referral_code'
    ) INTO has_referral_code_col;
    
    -- Generate referral code if column exists (ALWAYS generate for new users)
    IF has_referral_code_col THEN
        BEGIN
            -- Try to use the function first
            IF EXISTS (
                SELECT 1 FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE n.nspname = 'public' AND p.proname = 'generate_referral_code'
            ) THEN
                generated_code := generate_referral_code();
            ELSE
                -- Fallback: generate directly if function doesn't exist
                generated_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text || NEW.id::text), 1, 8));
            END IF;
            
            -- Ensure code is not empty
            IF generated_code IS NULL OR generated_code = '' THEN
                generated_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text || NEW.id::text), 1, 8));
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- If generation fails, use fallback
            generated_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text || NEW.id::text), 1, 8));
        END;
        
        -- Get referral code from metadata (case-insensitive, trimmed)
        referral_code_from_meta := upper(trim(COALESCE(NEW.raw_user_meta_data->>'referral_code', '')));
        
        -- Find referrer if code provided
        IF referral_code_from_meta IS NOT NULL AND referral_code_from_meta != '' THEN
            -- Case-insensitive lookup with proper NULL handling
            SELECT id INTO referrer_id
            FROM profiles
            WHERE upper(trim(COALESCE(referral_code, ''))) = referral_code_from_meta
            AND id != NEW.id  -- Prevent self-referral
            LIMIT 1;
        END IF;
    END IF;
    
    -- Insert profile
    IF has_phone AND has_referral_code_col THEN
        -- With phone and referral columns
        IF referrer_id IS NOT NULL AND referrer_id != NEW.id THEN
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code, referred_by)
            VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code, referrer_id)
            ON CONFLICT (id) DO NOTHING;
        ELSE
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code)
            VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code)
            ON CONFLICT (id) DO NOTHING;
        END IF;
    ELSIF has_phone THEN
        -- With phone, no referral columns
        INSERT INTO public.profiles (id, email, name, phone_number, balance, role)
        VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user')
        ON CONFLICT (id) DO NOTHING;
    ELSIF has_referral_code_col THEN
        -- With referral columns, no phone
        IF referrer_id IS NOT NULL AND referrer_id != NEW.id THEN
            INSERT INTO public.profiles (id, email, name, balance, role, referral_code, referred_by)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code, referrer_id)
            ON CONFLICT (id) DO UPDATE SET
                referral_code = EXCLUDED.referral_code,
                referred_by = EXCLUDED.referred_by;
        ELSE
            INSERT INTO public.profiles (id, email, name, balance, role, referral_code)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code)
            ON CONFLICT (id) DO NOTHING;
        END IF;
    ELSE
        -- Basic insert
        INSERT INTO public.profiles (id, email, name, balance, role)
        VALUES (NEW.id, NEW.email, user_name, 0.0, 'user')
        ON CONFLICT (id) DO NOTHING;
    END IF;
    
    -- Create referral record if referrer found (AFTER profile is created/updated)
    -- This MUST happen after profile insert to ensure foreign key constraints are satisfied
    IF referrer_id IS NOT NULL AND referrer_id != NEW.id THEN
        -- Check if referrals table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals') THEN
            BEGIN
                -- Insert referral record
                -- Using SECURITY DEFINER, this should bypass RLS, but we also have a policy allowing it
                INSERT INTO public.referrals (referrer_id, referee_id)
                VALUES (referrer_id, NEW.id)
                ON CONFLICT (referee_id) DO NOTHING;
                
                -- Log success for debugging (check Supabase logs)
                RAISE NOTICE 'SUCCESS: Referral record created - referrer_id=%, referee_id=%', referrer_id, NEW.id;
            EXCEPTION WHEN OTHERS THEN
                -- Log detailed error but don't fail signup
                RAISE WARNING 'FAILED: Referral insert error - referrer_id=%, referee_id=%, error=%', referrer_id, NEW.id, SQLERRM;
            END;
        ELSE
            RAISE WARNING 'Referrals table does not exist';
        END IF;
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Ultimate fallback - try basic insert
    BEGIN
        INSERT INTO public.profiles (id, email, name, balance, role)
        VALUES (NEW.id, NEW.email, user_name, 0.0, 'user')
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Profile creation failed: %', SQLERRM;
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Generate referral codes for existing users
DO $$
DECLARE
    user_record RECORD;
    new_code TEXT;
BEGIN
    FOR user_record IN 
        SELECT id FROM profiles WHERE referral_code IS NULL
    LOOP
        new_code := generate_referral_code();
        UPDATE profiles
        SET referral_code = new_code
        WHERE id = user_record.id AND referral_code IS NULL;
    END LOOP;
END $$;

-- Step 7: Create bonus award function and trigger (if transactions table exists)
-- First create the function (always, it's safe to replace)
CREATE OR REPLACE FUNCTION award_referral_bonus()
RETURNS TRIGGER AS $$
DECLARE
    referral_record RECORD;
    bonus_amount DECIMAL(10, 2);
    referrer_balance DECIMAL(10, 2);
BEGIN
    IF NEW.status = 'approved' AND NEW.type = 'deposit' AND OLD.status != 'approved' THEN
        SELECT * INTO referral_record
        FROM referrals
        WHERE referee_id = NEW.user_id AND bonus_awarded = false
        LIMIT 1;
        
        IF referral_record IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM transactions
                WHERE user_id = NEW.user_id
                AND type = 'deposit'
                AND status = 'approved'
                AND id != NEW.id
            ) THEN
                bonus_amount := NEW.amount * 0.10;
                
                SELECT balance INTO referrer_balance
                FROM profiles
                WHERE id = referral_record.referrer_id;
                
                UPDATE profiles
                SET balance = COALESCE(referrer_balance, 0) + bonus_amount
                WHERE id = referral_record.referrer_id;
                
                UPDATE referrals
                SET 
                    first_deposit_amount = NEW.amount,
                    referral_bonus = bonus_amount,
                    bonus_awarded = true,
                    bonus_awarded_at = NOW()
                WHERE id = referral_record.id;
                
                INSERT INTO transactions (user_id, amount, type, status, description)
                VALUES (referral_record.referrer_id, bonus_amount, 'referral_bonus', 'approved', 'Referral bonus for first deposit');
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Then create trigger only if transactions table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transactions') THEN
        DROP TRIGGER IF EXISTS trigger_award_referral_bonus ON transactions;
        CREATE TRIGGER trigger_award_referral_bonus
            AFTER UPDATE ON transactions
            FOR EACH ROW
            WHEN (NEW.status = 'approved' AND NEW.type = 'deposit')
            EXECUTE FUNCTION award_referral_bonus();
    END IF;
END $$;

-- Verify everything
SELECT 
    'Setup complete!' as status,
    (SELECT COUNT(*) FROM profiles WHERE referral_code IS NOT NULL) as users_with_codes,
    (SELECT COUNT(*) FROM referrals) as total_referrals;

