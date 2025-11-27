-- Debug and Fix Referral Insert Issue
-- This will help identify why referrals table isn't updating

-- Step 1: Check if there are any referral codes in profiles
SELECT 
    'Users with referral codes:' as check_type,
    COUNT(*) as count
FROM profiles 
WHERE referral_code IS NOT NULL;

-- Step 2: Check if referrals table has any data
SELECT 
    'Referrals table count:' as check_type,
    COUNT(*) as count
FROM referrals;

-- Step 3: Check recent signups to see if they have referred_by set
SELECT 
    'Recent signups with referred_by:' as check_type,
    id,
    email,
    referral_code,
    referred_by,
    created_at
FROM profiles
ORDER BY created_at DESC
LIMIT 10;

-- Step 4: Test the referral code lookup
-- Replace 'REFXXXXX' with an actual referral code from your profiles table
SELECT 
    'Test referral lookup:' as check_type,
    id,
    email,
    referral_code
FROM profiles
WHERE referral_code IS NOT NULL
LIMIT 5;

-- Step 5: Update handle_new_user function with better logging and fixes
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
    referral_found BOOLEAN := false;
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
    
    -- Generate referral code if column exists
    IF has_referral_code_col THEN
        generated_code := generate_referral_code();
        
        -- Get referral code from metadata (case-insensitive, trimmed)
        referral_code_from_meta := upper(trim(COALESCE(NEW.raw_user_meta_data->>'referral_code', '')));
        
        -- Find referrer if code provided
        IF referral_code_from_meta IS NOT NULL AND referral_code_from_meta != '' THEN
            -- Case-insensitive lookup with trim
            SELECT id INTO referrer_id
            FROM profiles
            WHERE upper(trim(COALESCE(referral_code, ''))) = referral_code_from_meta
            AND id != NEW.id  -- Prevent self-referral
            LIMIT 1;
            
            -- Check if referrer was found
            IF referrer_id IS NOT NULL THEN
                referral_found := true;
            END IF;
        END IF;
    END IF;
    
    -- Insert profile
    IF has_phone AND has_referral_code_col THEN
        -- With phone and referral columns
        IF referral_found THEN
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code, referred_by)
            VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code, referrer_id)
            ON CONFLICT (id) DO UPDATE SET
                referral_code = EXCLUDED.referral_code,
                referred_by = EXCLUDED.referred_by;
        ELSE
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code)
            VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code)
            ON CONFLICT (id) DO UPDATE SET
                referral_code = EXCLUDED.referral_code;
        END IF;
    ELSIF has_phone THEN
        -- With phone, no referral columns
        INSERT INTO public.profiles (id, email, name, phone_number, balance, role)
        VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user')
        ON CONFLICT (id) DO NOTHING;
    ELSIF has_referral_code_col THEN
        -- With referral columns, no phone
        IF referral_found THEN
            INSERT INTO public.profiles (id, email, name, balance, role, referral_code, referred_by)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code, referrer_id)
            ON CONFLICT (id) DO UPDATE SET
                referral_code = EXCLUDED.referral_code,
                referred_by = EXCLUDED.referred_by;
        ELSE
            INSERT INTO public.profiles (id, email, name, balance, role, referral_code)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code)
            ON CONFLICT (id) DO UPDATE SET
                referral_code = EXCLUDED.referral_code;
        END IF;
    ELSE
        -- Basic insert
        INSERT INTO public.profiles (id, email, name, balance, role)
        VALUES (NEW.id, NEW.email, user_name, 0.0, 'user')
        ON CONFLICT (id) DO NOTHING;
    END IF;
    
    -- Create referral record if referrer found (AFTER profile is created)
    IF referral_found AND referrer_id IS NOT NULL AND referrer_id != NEW.id THEN
        BEGIN
            -- Use INSERT with ON CONFLICT to handle duplicates gracefully
            INSERT INTO public.referrals (referrer_id, referee_id)
            VALUES (referrer_id, NEW.id)
            ON CONFLICT (referee_id) DO NOTHING;
            
            -- Log success (visible in Supabase logs)
            RAISE NOTICE 'Referral record created: referrer_id=%, referee_id=%', referrer_id, NEW.id;
        EXCEPTION WHEN OTHERS THEN
            -- Log error but don't fail signup
            RAISE WARNING 'Failed to insert referral record for referee_id=%: %', NEW.id, SQLERRM;
        END;
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Ultimate fallback - try basic insert
    BEGIN
        INSERT INTO public.profiles (id, email, name, balance, role)
        VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)), 0.0, 'user')
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Profile creation failed: %', SQLERRM;
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Verify RLS policies allow inserts
SELECT 
    'Referrals RLS policies:' as check_type,
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'referrals';

-- Step 7: Ensure the trigger insert policy exists and is correct
DROP POLICY IF EXISTS "Allow trigger to insert referrals" ON referrals;
CREATE POLICY "Allow trigger to insert referrals" 
    ON referrals FOR INSERT 
    WITH CHECK (true);

-- Step 8: Grant explicit permissions
GRANT INSERT, SELECT ON referrals TO postgres, anon, authenticated, service_role;

-- Step 9: Test query - check if you can manually insert (for testing)
-- Uncomment and run this manually with a test referrer_id and referee_id to verify permissions
-- INSERT INTO referrals (referrer_id, referee_id) 
-- VALUES ('<referrer-uuid>', '<referee-uuid>')
-- ON CONFLICT (referee_id) DO NOTHING;

