-- Fix Referrals Table Insert Using Deferred Trigger
-- This ensures the referral insert happens AFTER the profile transaction commits

-- Step 1: Create a function that will be called AFTER the profile is committed
CREATE OR REPLACE FUNCTION process_referral_after_signup()
RETURNS TRIGGER AS $$
DECLARE
    referral_code_from_meta TEXT;
    referrer_id UUID;
BEGIN
    -- Get referral code from the user's metadata
    referral_code_from_meta := upper(trim(COALESCE(NEW.raw_user_meta_data->>'referral_code', '')));
    
    -- Only proceed if referral code was provided
    IF referral_code_from_meta IS NOT NULL AND referral_code_from_meta != '' THEN
        -- Find the referrer
        SELECT id INTO referrer_id
        FROM profiles
        WHERE upper(trim(COALESCE(referral_code, ''))) = referral_code_from_meta
        AND id != NEW.id
        LIMIT 1;
        
        -- If referrer found, create referral record
        IF referrer_id IS NOT NULL THEN
            -- Check if referrals table exists
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals') THEN
                BEGIN
                    INSERT INTO public.referrals (referrer_id, referee_id, created_at)
                    VALUES (referrer_id, NEW.id, NOW())
                    ON CONFLICT (referee_id) DO NOTHING;
                    
                    RAISE NOTICE 'Referral created via deferred trigger: referrer=%, referee=%', referrer_id, NEW.id;
                EXCEPTION WHEN OTHERS THEN
                    RAISE WARNING 'Deferred trigger referral insert failed: %', SQLERRM;
                END;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Create a DEFERRED trigger that runs AFTER the transaction commits
-- This ensures the profile exists when we try to create the referral
DROP TRIGGER IF EXISTS on_auth_user_created_deferred ON auth.users;
CREATE CONSTRAINT TRIGGER on_auth_user_created_deferred
    AFTER INSERT ON auth.users
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION process_referral_after_signup();

-- Step 3: Update handle_new_user to still set referred_by but not create referral record
-- (The deferred trigger will handle the referral record creation)
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
    
    -- Find referrer (for setting referred_by field)
    referrer_id := NULL;
    IF has_referral_code_col AND referral_code_from_meta IS NOT NULL AND referral_code_from_meta != '' THEN
        BEGIN
            SELECT id INTO referrer_id
            FROM profiles
            WHERE upper(trim(COALESCE(referral_code, ''))) = referral_code_from_meta
            AND id != NEW.id
            LIMIT 1;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;
    
    -- Insert profile with referral_code and referred_by
    -- NOTE: We set referred_by here, but the referral record will be created by the deferred trigger
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
    
    -- NOTE: We do NOT create the referral record here anymore
    -- The deferred trigger will handle it after the transaction commits
    
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

-- Step 4: Ensure RLS allows inserts
DROP POLICY IF EXISTS "Allow trigger to insert referrals" ON referrals;
CREATE POLICY "Allow trigger to insert referrals" 
    ON referrals FOR INSERT 
    WITH CHECK (true);

GRANT ALL ON referrals TO postgres, service_role;
GRANT INSERT, SELECT ON referrals TO anon, authenticated;

-- Step 5: Verification
SELECT 
    'Deferred trigger setup complete' as status,
    (SELECT COUNT(*) FROM profiles WHERE referral_code IS NOT NULL) as users_with_codes,
    (SELECT COUNT(*) FROM referrals) as total_referrals;

