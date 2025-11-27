-- Generate Referral Codes for All Users and Fix Referral System
-- This will generate codes for existing users and ensure the system works

-- Step 1: Generate referral codes for ALL existing users who don't have one
-- This uses the generate_referral_code function if it exists, otherwise generates directly
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
                -- Use the function
                new_code := generate_referral_code();
            ELSE
                -- Generate directly
                new_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text || user_record.id::text), 1, 8));
            END IF;
            
            -- Check if code exists
            SELECT EXISTS(SELECT 1 FROM profiles WHERE referral_code = new_code) INTO code_exists;
            
            EXIT WHEN NOT code_exists OR attempts > 10;
            attempts := attempts + 1;
        END LOOP;
        
        -- Update user with generated code
        UPDATE profiles
        SET referral_code = new_code
        WHERE id = user_record.id
        AND (referral_code IS NULL OR referral_code = '' OR referral_code = 'NULL');
        
        RAISE NOTICE 'Generated referral code % for user %', new_code, user_record.id;
    END LOOP;
    
    RAISE NOTICE 'Finished generating referral codes';
END $$;

-- Step 2: Verify codes were generated
SELECT 
    'Step 2: Verification' as step,
    COUNT(*) as total_users,
    COUNT(CASE WHEN referral_code IS NOT NULL AND referral_code != '' THEN 1 END) as users_with_codes,
    COUNT(CASE WHEN referral_code IS NULL OR referral_code = '' THEN 1 END) as users_without_codes
FROM profiles;

-- Step 3: Show sample codes
SELECT 
    'Step 3: Sample referral codes' as step,
    id,
    email,
    referral_code
FROM profiles
WHERE referral_code IS NOT NULL
LIMIT 5;

-- Step 4: Completely rewrite handle_new_user function with better logic
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
    
    -- Get referral code from metadata FIRST
    referral_code_from_meta := upper(trim(COALESCE(NEW.raw_user_meta_data->>'referral_code', '')));
    
    -- Find referrer BEFORE creating profile
    referrer_id := NULL;
    IF has_referral_code_col AND referral_code_from_meta IS NOT NULL AND referral_code_from_meta != '' THEN
        RAISE NOTICE 'Looking for referrer with code: %', referral_code_from_meta;
        
        SELECT id INTO referrer_id
        FROM profiles
        WHERE upper(trim(COALESCE(referral_code, ''))) = referral_code_from_meta
        AND id != NEW.id
        LIMIT 1;
        
        IF referrer_id IS NOT NULL THEN
            RAISE NOTICE 'Referrer FOUND: id=%', referrer_id;
        ELSE
            RAISE WARNING 'Referrer NOT found for code: %', referral_code_from_meta;
        END IF;
    END IF;
    
    -- CRITICAL: Generate referral code for new user (ALWAYS if column exists)
    -- This MUST happen and MUST succeed - no conditional failures allowed
    IF has_referral_code_col THEN
        -- Generate code FIRST before any other operations
        BEGIN
            -- Try to use the function first
            IF EXISTS (
                SELECT 1 FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE n.nspname = 'public' AND p.proname = 'generate_referral_code'
            ) THEN
                BEGIN
                    generated_code := generate_referral_code();
                EXCEPTION WHEN OTHERS THEN
                    -- If function fails, use direct generation
                    generated_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text || NEW.id::text), 1, 8));
                END;
            ELSE
                -- Function doesn't exist, generate directly
                generated_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text || NEW.id::text), 1, 8));
            END IF;
            
            -- Triple-check code is valid (not null, not empty, proper format)
            IF generated_code IS NULL OR generated_code = '' OR length(generated_code) < 4 THEN
                generated_code := 'REF' || upper(substr(md5(NEW.id::text || clock_timestamp()::text || random()::text), 1, 8));
            END IF;
            
            -- Ensure it starts with REF
            IF NOT generated_code LIKE 'REF%' THEN
                generated_code := 'REF' || upper(substr(generated_code, 1, 8));
            END IF;
            
            RAISE NOTICE 'Generated referral code for new user: %', generated_code;
        EXCEPTION WHEN OTHERS THEN
            -- Ultimate fallback - this MUST work
            generated_code := 'REF' || upper(substr(md5(NEW.id::text || clock_timestamp()::text), 1, 8));
            RAISE WARNING 'Code generation had error, used ultimate fallback: %', SQLERRM;
        END;
        
        -- Final validation - if still no code, generate one more time
        IF generated_code IS NULL OR generated_code = '' THEN
            generated_code := 'REF' || upper(substr(md5(NEW.id::text), 1, 8));
        END IF;
    END IF;
    
    -- Insert profile - ALWAYS include referral_code if column exists and code was generated
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
                referral_code = COALESCE(EXCLUDED.referral_code, profiles.referral_code),
                referred_by = COALESCE(EXCLUDED.referred_by, profiles.referred_by);
        ELSE
            INSERT INTO public.profiles (id, email, name, balance, role, referral_code)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code)
            ON CONFLICT (id) DO UPDATE SET
                referral_code = COALESCE(EXCLUDED.referral_code, profiles.referral_code);
        END IF;
    ELSE
        INSERT INTO public.profiles (id, email, name, balance, role)
        VALUES (NEW.id, NEW.email, user_name, 0.0, 'user')
        ON CONFLICT (id) DO NOTHING;
    END IF;
    
    -- Create referral record AFTER profile is created
    IF referrer_id IS NOT NULL AND referrer_id != NEW.id AND has_referral_code_col THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals') THEN
            BEGIN
                INSERT INTO public.referrals (referrer_id, referee_id, created_at)
                VALUES (referrer_id, NEW.id, NOW())
                ON CONFLICT (referee_id) DO NOTHING;
                
                -- Verify insertion
                IF EXISTS (SELECT 1 FROM referrals WHERE referee_id = NEW.id) THEN
                    RAISE NOTICE 'SUCCESS: Referral record created - referrer_id=%, referee_id=%', referrer_id, NEW.id;
                ELSE
                    RAISE WARNING 'Referral insert completed but record not found - referrer_id=%, referee_id=%', referrer_id, NEW.id;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'EXCEPTION: Referral insert failed - referrer_id=%, referee_id=%, error=%', referrer_id, NEW.id, SQLERRM;
            END;
        END IF;
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user exception: %', SQLERRM;
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

-- Step 5: Ensure permissions
GRANT ALL ON referrals TO postgres, service_role;
GRANT INSERT, SELECT ON referrals TO anon, authenticated;

DROP POLICY IF EXISTS "Allow trigger to insert referrals" ON referrals;
CREATE POLICY "Allow trigger to insert referrals" 
    ON referrals FOR INSERT 
    WITH CHECK (true);

-- Step 6: Final verification
SELECT 
    'Final Status' as step,
    (SELECT COUNT(*) FROM profiles WHERE referral_code IS NOT NULL) as users_with_codes,
    (SELECT COUNT(*) FROM referrals) as total_referrals,
    (SELECT COUNT(*) FROM profiles WHERE referred_by IS NOT NULL) as referred_users;

