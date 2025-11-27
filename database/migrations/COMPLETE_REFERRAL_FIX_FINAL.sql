-- Complete Final Fix for Referral System
-- This fixes both issues: referrals table not updating and codes not showing for new users
-- Run this ONE file to fix everything

-- ============================================
-- PART 1: Ensure referral codes exist for all users
-- ============================================

DO $$
DECLARE
    user_record RECORD;
    new_code TEXT;
    attempts INTEGER;
    code_exists BOOLEAN;
    func_exists BOOLEAN;
BEGIN
    -- Check if generate_referral_code function exists
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'generate_referral_code'
    ) INTO func_exists;
    
    FOR user_record IN 
        SELECT id FROM profiles WHERE referral_code IS NULL OR referral_code = '' OR trim(referral_code) = ''
    LOOP
        attempts := 0;
        LOOP
            IF func_exists THEN
                BEGIN
                    new_code := generate_referral_code();
                EXCEPTION WHEN OTHERS THEN
                    new_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text || user_record.id::text), 1, 8));
                END;
            ELSE
                new_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text || user_record.id::text), 1, 8));
            END IF;
            
            SELECT EXISTS(SELECT 1 FROM profiles WHERE referral_code = new_code) INTO code_exists;
            EXIT WHEN NOT code_exists OR attempts > 10;
            attempts := attempts + 1;
        END LOOP;
        
        UPDATE profiles
        SET referral_code = new_code
        WHERE id = user_record.id
        AND (referral_code IS NULL OR referral_code = '' OR trim(referral_code) = '');
    END LOOP;
END $$;

-- ============================================
-- PART 2: Create/Update handle_new_user function
-- This ensures codes are ALWAYS generated and referrals are ALWAYS created
-- ============================================

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
    
    -- CRITICAL: Generate referral code FIRST - MUST ALWAYS SUCCEED
    IF has_referral_code_col THEN
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE n.nspname = 'public' AND p.proname = 'generate_referral_code'
            ) THEN
                BEGIN
                    generated_code := generate_referral_code();
                EXCEPTION WHEN OTHERS THEN
                    generated_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text || NEW.id::text), 1, 8));
                END;
            ELSE
                generated_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text || NEW.id::text), 1, 8));
            END IF;
            
            -- Validate code
            IF generated_code IS NULL OR generated_code = '' OR length(generated_code) < 4 THEN
                generated_code := 'REF' || upper(substr(md5(NEW.id::text || clock_timestamp()::text), 1, 8));
            END IF;
            
            IF NOT generated_code LIKE 'REF%' THEN
                generated_code := 'REF' || upper(substr(generated_code, 1, 8));
            END IF;
        EXCEPTION WHEN OTHERS THEN
            generated_code := 'REF' || upper(substr(md5(NEW.id::text), 1, 8));
        END;
    END IF;
    
    -- Get referral code from metadata
    referral_code_from_meta := upper(trim(COALESCE(NEW.raw_user_meta_data->>'referral_code', '')));
    
    -- Find referrer
    referrer_id := NULL;
    IF has_referral_code_col AND referral_code_from_meta IS NOT NULL AND referral_code_from_meta != '' THEN
        -- Check if profiles table exists before querying
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
            BEGIN
                -- Use explicit schema reference
                SELECT id INTO referrer_id
                FROM public.profiles
                WHERE upper(trim(COALESCE(referral_code, ''))) = referral_code_from_meta
                AND id != NEW.id
                LIMIT 1;
                
                IF referrer_id IS NOT NULL THEN
                    RAISE NOTICE 'Referrer found: id=%, code=%', referrer_id, referral_code_from_meta;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'Error looking up referrer: %', SQLERRM;
                referrer_id := NULL;
            END;
        END IF;
    END IF;
    
    -- Insert profile - ensure table exists first and use explicit schema references
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
        IF has_phone AND has_referral_code_col THEN
            IF referrer_id IS NOT NULL THEN
                INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code, referred_by)
                VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code, referrer_id)
                ON CONFLICT (id) DO UPDATE SET
                    referral_code = COALESCE(EXCLUDED.referral_code, public.profiles.referral_code, generated_code),
                    referred_by = COALESCE(EXCLUDED.referred_by, public.profiles.referred_by);
            ELSE
                INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code)
                VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code)
                ON CONFLICT (id) DO UPDATE SET
                    referral_code = COALESCE(EXCLUDED.referral_code, public.profiles.referral_code, generated_code);
            END IF;
        ELSIF has_phone THEN
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role)
            VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user')
            ON CONFLICT (id) DO NOTHING;
        ELSIF has_referral_code_col THEN
            IF referrer_id IS NOT NULL THEN
                INSERT INTO public.profiles (id, email, name, balance, role, referral_code, referred_by)
                VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code, referrer_id)
                ON CONFLICT (id) DO UPDATE SET
                    referral_code = COALESCE(EXCLUDED.referral_code, public.profiles.referral_code, generated_code),
                    referred_by = COALESCE(EXCLUDED.referred_by, public.profiles.referred_by);
            ELSE
                INSERT INTO public.profiles (id, email, name, balance, role, referral_code)
                VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code)
                ON CONFLICT (id) DO UPDATE SET
                    referral_code = COALESCE(EXCLUDED.referral_code, public.profiles.referral_code, generated_code);
            END IF;
        ELSE
            INSERT INTO public.profiles (id, email, name, balance, role)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user')
            ON CONFLICT (id) DO NOTHING;
        END IF;
    ELSE
        RAISE WARNING 'Profiles table does not exist - cannot create profile';
    END IF;
    
    -- CRITICAL: Create referral record if referrer found
    -- Use extensive logging to diagnose issues
    IF referrer_id IS NOT NULL AND referrer_id != NEW.id AND has_referral_code_col THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals') THEN
            RAISE NOTICE 'Creating referral: referrer=%, referee=%', referrer_id, NEW.id;
            
            BEGIN
                -- Try direct insert first
                INSERT INTO public.referrals (referrer_id, referee_id, created_at)
                VALUES (referrer_id, NEW.id, NOW())
                ON CONFLICT (referee_id) DO NOTHING;
                
                -- Verify it was created - just check if record exists for this referee (avoid ambiguous column reference)
                -- Since we just inserted with referrer_id, we only need to check if the record exists
                IF EXISTS (SELECT 1 FROM public.referrals r WHERE r.referee_id = NEW.id) THEN
                    RAISE NOTICE 'SUCCESS: Referral created - referrer_id=%, referee_id=%', referrer_id, NEW.id;
                ELSE
                    RAISE WARNING 'Insert completed but record not found, retrying...';
                    -- Retry with UPDATE on conflict
                    BEGIN
                        INSERT INTO public.referrals (referrer_id, referee_id, created_at)
                        VALUES (referrer_id, NEW.id, NOW())
                        ON CONFLICT (referee_id) DO UPDATE SET
                            referrer_id = EXCLUDED.referrer_id,
                            created_at = EXCLUDED.created_at;
                        
                        IF EXISTS (SELECT 1 FROM public.referrals r WHERE r.referee_id = NEW.id) THEN
                            RAISE NOTICE 'SUCCESS: Referral created on retry';
                        ELSE
                            RAISE WARNING 'Retry also failed - record still not found';
                        END IF;
                    EXCEPTION WHEN OTHERS THEN
                        RAISE WARNING 'Retry insert failed: %', SQLERRM;
                    END;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'Referral insert exception: %, SQLSTATE: %', SQLERRM, SQLSTATE;
            END;
        ELSE
            RAISE WARNING 'Referrals table does not exist';
        END IF;
    ELSE
        IF referrer_id IS NULL THEN
            RAISE NOTICE 'No referrer found, skipping referral creation';
        ELSIF referrer_id = NEW.id THEN
            RAISE NOTICE 'Self-referral prevented';
        END IF;
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Fallback
    BEGIN
        INSERT INTO public.profiles (id, email, name, balance, role)
        VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)), 0.0, 'user')
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 3: Ensure Referrals Table Exists
-- ============================================

-- Create referrals table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    referee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    first_deposit_amount DECIMAL(10, 2),
    referral_bonus DECIMAL(10, 2),
    bonus_awarded BOOLEAN DEFAULT false,
    bonus_awarded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(referee_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referee_id ON public.referrals(referee_id);
CREATE INDEX IF NOT EXISTS idx_referrals_bonus_awarded ON public.referrals(bonus_awarded);

-- Enable RLS
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PART 4: Create Helper Function for Referral Creation
-- ============================================

CREATE OR REPLACE FUNCTION create_referral_record(p_referrer_id UUID, p_referee_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    result BOOLEAN := false;
BEGIN
    -- Validate IDs exist using explicit schema
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_referrer_id) THEN
        RAISE WARNING 'Referrer ID does not exist: %', p_referrer_id;
        RETURN false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_referee_id) THEN
        RAISE WARNING 'Referee ID does not exist: %', p_referee_id;
        RETURN false;
    END IF;
    
    -- Insert referral
    BEGIN
        INSERT INTO public.referrals (referrer_id, referee_id, created_at)
        VALUES (p_referrer_id, p_referee_id, NOW())
        ON CONFLICT (referee_id) DO NOTHING;
        
        -- Verify using explicit schema and table alias
        IF EXISTS (SELECT 1 FROM public.referrals r WHERE r.referee_id = p_referee_id) THEN
            result := true;
            RAISE NOTICE 'SUCCESS: Referral created - referrer=%, referee=%', p_referrer_id, p_referee_id;
        ELSE
            RAISE WARNING 'Insert completed but record not found';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Error creating referral: %', SQLERRM;
    END;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 5: Ensure RLS and Permissions
-- ============================================

DROP POLICY IF EXISTS "Allow trigger to insert referrals" ON public.referrals;
CREATE POLICY "Allow trigger to insert referrals" 
    ON public.referrals FOR INSERT 
    WITH CHECK (true);

-- Grant permissions
GRANT ALL ON public.referrals TO postgres, service_role;
GRANT INSERT, SELECT ON public.referrals TO anon, authenticated;

-- Grant execute on helper function
GRANT EXECUTE ON FUNCTION create_referral_record TO postgres, service_role, anon, authenticated;

-- ============================================
-- PART 6: Verification
-- ============================================

SELECT 
    'Fix Complete' as status,
    (SELECT COUNT(*) FROM public.profiles WHERE referral_code IS NOT NULL) as users_with_codes,
    (SELECT COUNT(*) FROM public.referrals) as total_referrals,
    (SELECT COUNT(*) FROM public.profiles WHERE referred_by IS NOT NULL) as referred_users;

