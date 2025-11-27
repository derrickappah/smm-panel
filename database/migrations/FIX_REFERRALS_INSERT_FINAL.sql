-- Final Fix for Referrals Table Not Updating
-- This ensures referrals are created when users sign up with referral codes

-- Step 1: Check current state
SELECT 
    'Current referrals count:' as status,
    COUNT(*) as count
FROM referrals;

-- Step 2: Update handle_new_user function with better referral insertion
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
    referral_inserted BOOLEAN := false;
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
            -- Case-insensitive lookup with proper NULL handling
            SELECT id INTO referrer_id
            FROM profiles
            WHERE upper(trim(COALESCE(referral_code, ''))) = referral_code_from_meta
            AND id != NEW.id  -- Prevent self-referral
            LIMIT 1;
        END IF;
    END IF;
    
    -- Insert profile first
    IF has_phone AND has_referral_code_col THEN
        -- With phone and referral columns
        IF referrer_id IS NOT NULL AND referrer_id != NEW.id THEN
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
        IF referrer_id IS NOT NULL AND referrer_id != NEW.id THEN
            INSERT INTO public.profiles (id, email, name, balance, role, referral_code, referred_by)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code, referrer_id)
            ON CONFLICT (id) DO UPDATE SET
                referral_code = EXCLUDED.referral_code,
                referred_by = EXCLUDED.referral_code;
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
    -- This is critical - must happen after profile exists
    IF referrer_id IS NOT NULL AND referrer_id != NEW.id THEN
        -- Check if referrals table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals') THEN
            BEGIN
                -- Try to insert referral record
                INSERT INTO public.referrals (referrer_id, referee_id)
                VALUES (referrer_id, NEW.id)
                ON CONFLICT (referee_id) DO NOTHING;
                
                -- Check if insert was successful
                GET DIAGNOSTICS referral_inserted = ROW_COUNT;
                
                -- Log for debugging
                IF referral_inserted > 0 THEN
                    RAISE NOTICE 'SUCCESS: Referral created - referrer_id=%, referee_id=%', referrer_id, NEW.id;
                ELSE
                    RAISE WARNING 'Referral insert returned 0 rows - may be duplicate or conflict';
                END IF;
            EXCEPTION WHEN OTHERS THEN
                -- Log detailed error
                RAISE WARNING 'FAILED to insert referral: referrer_id=%, referee_id=%, error=%', referrer_id, NEW.id, SQLERRM;
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
        VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)), 0.0, 'user')
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Profile creation failed: %', SQLERRM;
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Ensure RLS allows trigger inserts
-- Drop and recreate the policy to ensure it's correct
DROP POLICY IF EXISTS "Allow trigger to insert referrals" ON referrals;
CREATE POLICY "Allow trigger to insert referrals" 
    ON referrals FOR INSERT 
    WITH CHECK (true);

-- Step 4: Grant explicit permissions (ensure service_role can insert)
GRANT ALL ON referrals TO postgres, service_role;
GRANT INSERT, SELECT ON referrals TO anon, authenticated;

-- Step 5: Verify the function was created
SELECT 
    'Function updated successfully' as status,
    proname as function_name
FROM pg_proc 
WHERE proname = 'handle_new_user' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Step 6: Test query - show recent signups with referral codes
SELECT 
    'Recent signups with referral metadata:' as test,
    id,
    email,
    referral_code,
    referred_by,
    created_at
FROM profiles
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 5;

