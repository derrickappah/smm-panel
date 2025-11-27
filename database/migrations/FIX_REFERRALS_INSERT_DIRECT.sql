-- Direct Fix for Referrals Table Insert
-- This uses a more direct approach to ensure referrals are created

-- Step 1: Create a helper function that explicitly creates referrals
-- This can be called from the trigger or manually
CREATE OR REPLACE FUNCTION create_referral_record(p_referrer_id UUID, p_referee_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    result BOOLEAN := false;
BEGIN
    -- Check if both IDs exist
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_referrer_id) THEN
        RAISE WARNING 'Referrer ID does not exist: %', p_referrer_id;
        RETURN false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_referee_id) THEN
        RAISE WARNING 'Referee ID does not exist: %', p_referee_id;
        RETURN false;
    END IF;
    
    -- Insert referral record
    BEGIN
        INSERT INTO public.referrals (referrer_id, referee_id, created_at)
        VALUES (p_referrer_id, p_referee_id, NOW())
        ON CONFLICT (referee_id) DO NOTHING;
        
        -- Verify it was created
        IF EXISTS (SELECT 1 FROM referrals WHERE referee_id = p_referee_id) THEN
            result := true;
            RAISE NOTICE 'Referral record created successfully: referrer=%, referee=%', p_referrer_id, p_referee_id;
        ELSE
            RAISE WARNING 'Insert completed but record not found';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Error creating referral: %', SQLERRM;
        result := false;
    END;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Update handle_new_user to use the helper function
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
    referral_created BOOLEAN;
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
    
    -- Generate referral code FIRST
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
        BEGIN
            SELECT id INTO referrer_id
            FROM profiles
            WHERE upper(trim(COALESCE(referral_code, ''))) = referral_code_from_meta
            AND id != NEW.id
            LIMIT 1;
            
            IF referrer_id IS NOT NULL THEN
                RAISE NOTICE 'Referrer found: id=%, code=%', referrer_id, referral_code_from_meta;
            ELSE
                RAISE WARNING 'Referrer NOT found for code: %', referral_code_from_meta;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Error looking up referrer: %', SQLERRM;
        END;
    END IF;
    
    -- Insert profile
    IF has_phone AND has_referral_code_col THEN
        IF referrer_id IS NOT NULL THEN
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code, referred_by)
            VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code, referrer_id)
            ON CONFLICT (id) DO UPDATE SET
                referral_code = COALESCE(EXCLUDED.referral_code, profiles.referral_code, generated_code),
                referred_by = COALESCE(EXCLUDED.referred_by, profiles.referred_by);
        ELSE
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code)
            VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code)
            ON CONFLICT (id) DO UPDATE SET
                referral_code = COALESCE(EXCLUDED.referral_code, profiles.referral_code, generated_code);
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
                referral_code = COALESCE(EXCLUDED.referral_code, profiles.referral_code, generated_code),
                referred_by = COALESCE(EXCLUDED.referred_by, profiles.referred_by);
        ELSE
            INSERT INTO public.profiles (id, email, name, balance, role, referral_code)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code)
            ON CONFLICT (id) DO UPDATE SET
                referral_code = COALESCE(EXCLUDED.referral_code, profiles.referral_code, generated_code);
        END IF;
    ELSE
        INSERT INTO public.profiles (id, email, name, balance, role)
        VALUES (NEW.id, NEW.email, user_name, 0.0, 'user')
        ON CONFLICT (id) DO NOTHING;
    END IF;
    
    -- CRITICAL: Create referral record using helper function
    -- This happens AFTER profile is created
    IF referrer_id IS NOT NULL AND referrer_id != NEW.id AND has_referral_code_col THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals') THEN
            -- Use the helper function which has better error handling
            SELECT create_referral_record(referrer_id, NEW.id) INTO referral_created;
            
            IF NOT referral_created THEN
                RAISE WARNING 'Helper function returned false for referral creation';
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user exception: %', SQLERRM;
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

-- Step 3: Ensure RLS allows the helper function
DROP POLICY IF EXISTS "Allow trigger to insert referrals" ON referrals;
CREATE POLICY "Allow trigger to insert referrals" 
    ON referrals FOR INSERT 
    WITH CHECK (true);

-- Also allow the helper function to insert
GRANT ALL ON referrals TO postgres, service_role;
GRANT INSERT, SELECT ON referrals TO anon, authenticated;

-- Step 4: Test the helper function manually (uncomment to test)
-- Replace UUIDs with actual IDs from your database
-- SELECT create_referral_record('referrer-uuid-here', 'referee-uuid-here');

-- Step 5: Verify setup
SELECT 
    'Setup complete' as status,
    (SELECT COUNT(*) FROM profiles WHERE referral_code IS NOT NULL) as users_with_codes,
    (SELECT COUNT(*) FROM referrals) as total_referrals;

