-- Comprehensive Diagnostic and Fix for Referrals Table
-- Run this to diagnose and fix the referrals issue

-- ============================================
-- PART 1: DIAGNOSTICS
-- ============================================

-- Check 1: Do users have referral codes?
SELECT 
    'Check 1: Users with referral codes' as diagnostic,
    COUNT(*) as total_users,
    COUNT(CASE WHEN referral_code IS NOT NULL THEN 1 END) as users_with_codes,
    COUNT(CASE WHEN referral_code IS NULL THEN 1 END) as users_without_codes
FROM profiles;

-- Check 2: Show sample referral codes
SELECT 
    'Check 2: Sample referral codes' as diagnostic,
    id,
    email,
    referral_code,
    created_at
FROM profiles
WHERE referral_code IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;

-- Check 3: Check referrals table
SELECT 
    'Check 3: Referrals table status' as diagnostic,
    COUNT(*) as total_referrals,
    COUNT(CASE WHEN bonus_awarded = true THEN 1 END) as bonuses_awarded
FROM referrals;

-- Check 4: Check if any users have referred_by set
SELECT 
    'Check 4: Users who were referred' as diagnostic,
    COUNT(*) as referred_users
FROM profiles
WHERE referred_by IS NOT NULL;

-- Check 5: Show recent signups
SELECT 
    'Check 5: Recent signups (last hour)' as diagnostic,
    id,
    email,
    referral_code,
    referred_by,
    created_at
FROM profiles
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- ============================================
-- PART 2: FIX THE FUNCTION
-- ============================================

-- Create a completely rewritten handle_new_user function
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
    profile_created BOOLEAN := false;
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
    
    -- Get referral code from metadata FIRST (before generating new one)
    referral_code_from_meta := upper(trim(COALESCE(NEW.raw_user_meta_data->>'referral_code', '')));
    
    -- Find referrer BEFORE creating profile (so we can use it during profile creation)
    referrer_id := NULL;
    IF has_referral_code_col AND referral_code_from_meta IS NOT NULL AND referral_code_from_meta != '' THEN
        -- Look up referrer by referral code
        SELECT id INTO referrer_id
        FROM profiles
        WHERE upper(trim(COALESCE(referral_code, ''))) = referral_code_from_meta
        AND id != NEW.id
        LIMIT 1;
        
        -- Log if referrer found or not
        IF referrer_id IS NOT NULL THEN
            RAISE NOTICE 'Referrer found: id=%, code=%', referrer_id, referral_code_from_meta;
        ELSE
            RAISE WARNING 'Referrer NOT found for code: %', referral_code_from_meta;
        END IF;
    END IF;
    
    -- Generate referral code for new user
    IF has_referral_code_col THEN
        generated_code := generate_referral_code();
    END IF;
    
    -- Insert profile with all necessary fields
    IF has_phone AND has_referral_code_col THEN
        IF referrer_id IS NOT NULL THEN
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code, referred_by)
            VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code, referrer_id)
            ON CONFLICT (id) DO UPDATE SET
                referral_code = COALESCE(EXCLUDED.referral_code, profiles.referral_code),
                referred_by = COALESCE(EXCLUDED.referred_by, profiles.referred_by);
            profile_created := true;
        ELSE
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code)
            VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code)
            ON CONFLICT (id) DO UPDATE SET
                referral_code = COALESCE(EXCLUDED.referral_code, profiles.referral_code);
            profile_created := true;
        END IF;
    ELSIF has_phone THEN
        INSERT INTO public.profiles (id, email, name, phone_number, balance, role)
        VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user')
        ON CONFLICT (id) DO NOTHING;
        profile_created := true;
    ELSIF has_referral_code_col THEN
        IF referrer_id IS NOT NULL THEN
            INSERT INTO public.profiles (id, email, name, balance, role, referral_code, referred_by)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code, referrer_id)
            ON CONFLICT (id) DO UPDATE SET
                referral_code = COALESCE(EXCLUDED.referral_code, profiles.referral_code),
                referred_by = COALESCE(EXCLUDED.referred_by, profiles.referred_by);
            profile_created := true;
        ELSE
            INSERT INTO public.profiles (id, email, name, balance, role, referral_code)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code)
            ON CONFLICT (id) DO UPDATE SET
                referral_code = COALESCE(EXCLUDED.referral_code, profiles.referral_code);
            profile_created := true;
        END IF;
    ELSE
        INSERT INTO public.profiles (id, email, name, balance, role)
        VALUES (NEW.id, NEW.email, user_name, 0.0, 'user')
        ON CONFLICT (id) DO NOTHING;
        profile_created := true;
    END IF;
    
    -- NOW create referral record (AFTER profile is definitely created)
    IF referrer_id IS NOT NULL AND referrer_id != NEW.id AND has_referral_code_col THEN
        -- Wait a tiny bit to ensure profile commit is complete
        PERFORM pg_sleep(0.01);
        
        -- Check if referrals table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals') THEN
            BEGIN
                -- Insert referral - use explicit transaction safety
                INSERT INTO public.referrals (referrer_id, referee_id, created_at)
                VALUES (referrer_id, NEW.id, NOW())
                ON CONFLICT (referee_id) DO NOTHING;
                
                -- Verify it was inserted
                IF EXISTS (SELECT 1 FROM referrals WHERE referee_id = NEW.id) THEN
                    RAISE NOTICE 'SUCCESS: Referral record verified in table - referrer_id=%, referee_id=%', referrer_id, NEW.id;
                ELSE
                    RAISE WARNING 'Referral insert returned no conflict but record not found - referrer_id=%, referee_id=%', referrer_id, NEW.id;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'EXCEPTION inserting referral - referrer_id=%, referee_id=%, error=%', referrer_id, NEW.id, SQLERRM;
            END;
        ELSE
            RAISE WARNING 'Referrals table does not exist!';
        END IF;
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Fallback: create basic profile
    BEGIN
        INSERT INTO public.profiles (id, email, name, balance, role)
        VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)), 0.0, 'user')
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Fallback profile creation also failed: %', SQLERRM;
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 3: ENSURE PERMISSIONS AND POLICIES
-- ============================================

-- Make sure RLS allows trigger to insert
DROP POLICY IF EXISTS "Allow trigger to insert referrals" ON referrals;
CREATE POLICY "Allow trigger to insert referrals" 
    ON referrals FOR INSERT 
    WITH CHECK (true);

-- Grant all necessary permissions
GRANT ALL ON referrals TO postgres, service_role;
GRANT INSERT, SELECT ON referrals TO anon, authenticated;

-- ============================================
-- PART 4: VERIFY FIX
-- ============================================

SELECT 
    'Fix applied - function updated' as status,
    proname as function_name
FROM pg_proc 
WHERE proname = 'handle_new_user' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- ============================================
-- PART 5: MANUAL FIX FOR EXISTING USERS
-- ============================================

-- If you have existing users who were referred but don't have referral records,
-- you can manually create them. Uncomment and run this with actual IDs:

-- INSERT INTO referrals (referrer_id, referee_id)
-- SELECT referred_by, id
-- FROM profiles
-- WHERE referred_by IS NOT NULL
-- AND NOT EXISTS (
--     SELECT 1 FROM referrals WHERE referee_id = profiles.id
-- )
-- ON CONFLICT (referee_id) DO NOTHING;

