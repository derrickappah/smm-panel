-- Simple Direct Fix for Referrals Table Insert
-- This version uses extensive logging to diagnose the issue

-- Step 1: Update handle_new_user with better logging and simpler logic
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
    
    RAISE NOTICE '=== handle_new_user START for user: % ===', NEW.id;
    
    -- Check what columns exist
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone_number'
    ) INTO has_phone;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'referral_code'
    ) INTO has_referral_code_col;
    
    RAISE NOTICE 'Column checks: has_phone=%, has_referral_code_col=%', has_phone, has_referral_code_col;
    
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
                    RAISE NOTICE 'Generated code using function: %', generated_code;
                EXCEPTION WHEN OTHERS THEN
                    generated_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text || NEW.id::text), 1, 8));
                    RAISE NOTICE 'Generated code using fallback: %', generated_code;
                END;
            ELSE
                generated_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text || NEW.id::text), 1, 8));
                RAISE NOTICE 'Generated code (no function): %', generated_code;
            END IF;
            
            IF generated_code IS NULL OR generated_code = '' OR length(generated_code) < 4 THEN
                generated_code := 'REF' || upper(substr(md5(NEW.id::text || clock_timestamp()::text), 1, 8));
                RAISE NOTICE 'Regenerated code (validation): %', generated_code;
            END IF;
            
            IF NOT generated_code LIKE 'REF%' THEN
                generated_code := 'REF' || upper(substr(generated_code, 1, 8));
            END IF;
        EXCEPTION WHEN OTHERS THEN
            generated_code := 'REF' || upper(substr(md5(NEW.id::text), 1, 8));
            RAISE WARNING 'Code generation exception: %, using: %', SQLERRM, generated_code;
        END;
    END IF;
    
    -- Get referral code from metadata
    referral_code_from_meta := upper(trim(COALESCE(NEW.raw_user_meta_data->>'referral_code', '')));
    RAISE NOTICE 'Referral code from metadata: [%]', referral_code_from_meta;
    
    -- Find referrer - MUST use public.profiles explicitly and check table exists first
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
                
                IF referrer_id IS NULL THEN
                    RAISE WARNING 'Referrer NOT found for code: [%]', referral_code_from_meta;
                ELSE
                    RAISE NOTICE 'Referrer FOUND: id=%, code=%', referrer_id, referral_code_from_meta;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'Error looking up referrer: %', SQLERRM;
                referrer_id := NULL;
            END;
        ELSE
            RAISE WARNING 'Profiles table does not exist yet';
        END IF;
    END IF;
    
    -- Insert profile - ensure table exists first
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
        IF has_phone AND has_referral_code_col THEN
            IF referrer_id IS NOT NULL THEN
                INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code, referred_by)
                VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code, referrer_id)
                ON CONFLICT (id) DO UPDATE SET
                    referral_code = COALESCE(EXCLUDED.referral_code, public.profiles.referral_code, generated_code),
                    referred_by = COALESCE(EXCLUDED.referred_by, public.profiles.referred_by);
                RAISE NOTICE 'Profile inserted with referrer';
            ELSE
                INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code)
                VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code)
                ON CONFLICT (id) DO UPDATE SET
                    referral_code = COALESCE(EXCLUDED.referral_code, public.profiles.referral_code, generated_code);
                RAISE NOTICE 'Profile inserted without referrer';
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
    
    -- CRITICAL: Create referral record AFTER profile is created
    IF referrer_id IS NOT NULL AND referrer_id != NEW.id AND has_referral_code_col THEN
        -- Check if referrals table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals') THEN
            RAISE NOTICE 'Attempting to create referral record: referrer=%, referee=%', referrer_id, NEW.id;
            
            -- Try multiple times with different approaches
            BEGIN
                -- Approach 1: Direct insert with explicit schema
                INSERT INTO public.referrals (referrer_id, referee_id, created_at)
                VALUES (referrer_id, NEW.id, NOW())
                ON CONFLICT (referee_id) DO NOTHING;
                
                -- Verify using explicit schema and table alias to avoid ambiguity
                SELECT EXISTS (
                    SELECT 1 FROM public.referrals r
                    WHERE r.referee_id = NEW.id AND r.referrer_id = referrer_id
                ) INTO referral_inserted;
                
                IF referral_inserted THEN
                    RAISE NOTICE 'SUCCESS: Referral record created (direct insert)';
                ELSE
                    RAISE WARNING 'Direct insert completed but record not found';
                    
                    -- Retry with explicit conflict handling
                    BEGIN
                        INSERT INTO public.referrals (referrer_id, referee_id, created_at)
                        VALUES (referrer_id, NEW.id, NOW())
                        ON CONFLICT (referee_id) DO UPDATE SET
                            referrer_id = EXCLUDED.referrer_id,
                            created_at = EXCLUDED.created_at;
                        
                        SELECT EXISTS (
                            SELECT 1 FROM public.referrals r
                            WHERE r.referee_id = NEW.id
                        ) INTO referral_inserted;
                        
                        IF referral_inserted THEN
                            RAISE NOTICE 'SUCCESS: Referral record created (retry with update)';
                        END IF;
                    EXCEPTION WHEN OTHERS THEN
                        RAISE WARNING 'Retry insert failed: %', SQLERRM;
                    END;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'Referral insert exception: %', SQLERRM;
                RAISE WARNING 'Error code: %, Error detail: %', SQLSTATE, SQLERRM;
            END;
        ELSE
            RAISE WARNING 'Referrals table does not exist - skipping referral creation';
        END IF;
    ELSE
        IF referrer_id IS NULL THEN
            RAISE NOTICE 'No referrer_id, skipping referral record creation';
        ELSIF referrer_id = NEW.id THEN
            RAISE NOTICE 'Self-referral prevented';
        ELSIF NOT has_referral_code_col THEN
            RAISE NOTICE 'Referral code column does not exist';
        END IF;
    END IF;
    
    RAISE NOTICE '=== handle_new_user END for user: % ===', NEW.id;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user EXCEPTION: %, SQLSTATE: %', SQLERRM, SQLSTATE;
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

-- Step 2: Ensure RLS allows inserts
DROP POLICY IF EXISTS "Allow trigger to insert referrals" ON referrals;
CREATE POLICY "Allow trigger to insert referrals" 
    ON referrals FOR INSERT 
    WITH CHECK (true);

-- Also create a policy that allows service_role to insert
DROP POLICY IF EXISTS "Service role can insert referrals" ON referrals;
CREATE POLICY "Service role can insert referrals"
    ON referrals FOR INSERT
    TO service_role
    WITH CHECK (true);

GRANT ALL ON referrals TO postgres, service_role;
GRANT INSERT, SELECT ON referrals TO anon, authenticated;

-- Step 3: Verification
SELECT 
    'Simple direct fix applied' as status,
    (SELECT COUNT(*) FROM profiles WHERE referral_code IS NOT NULL) as users_with_codes,
    (SELECT COUNT(*) FROM referrals) as total_referrals;

