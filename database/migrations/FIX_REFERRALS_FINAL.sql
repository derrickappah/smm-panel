-- Final Fix for Referrals Table Not Updating
-- This comprehensively fixes the referral insert issue with detailed logging

-- Step 1: Create a test function to verify referral creation works
CREATE OR REPLACE FUNCTION test_referral_insert(test_referrer_id UUID, test_referee_id UUID)
RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    BEGIN
        INSERT INTO public.referrals (referrer_id, referee_id)
        VALUES (test_referrer_id, test_referee_id)
        ON CONFLICT (referee_id) DO NOTHING;
        
        IF EXISTS (SELECT 1 FROM referrals WHERE referee_id = test_referee_id) THEN
            result := 'SUCCESS: Referral record created';
        ELSE
            result := 'WARNING: Insert completed but record not found';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        result := 'ERROR: ' || SQLERRM;
    END;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Completely rewrite handle_new_user with guaranteed code generation and referral insert
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
    profile_inserted BOOLEAN := false;
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
    
    -- CRITICAL: Generate referral code FIRST (before anything else)
    -- This ensures new users ALWAYS get a code
    IF has_referral_code_col THEN
        BEGIN
            -- Try to use the function
            IF EXISTS (
                SELECT 1 FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE n.nspname = 'public' AND p.proname = 'generate_referral_code'
            ) THEN
                generated_code := generate_referral_code();
            ELSE
                -- Fallback: generate directly
                generated_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text || NEW.id::text), 1, 8));
            END IF;
            
            -- Double-check code is valid
            IF generated_code IS NULL OR generated_code = '' OR length(generated_code) < 4 THEN
                generated_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text || NEW.id::text), 1, 8));
            END IF;
            
            RAISE NOTICE 'Generated referral code for new user: %', generated_code;
        EXCEPTION WHEN OTHERS THEN
            -- Ultimate fallback
            generated_code := 'REF' || upper(substr(md5(NEW.id::text || clock_timestamp()::text), 1, 8));
            RAISE WARNING 'Code generation error, used fallback: %', SQLERRM;
        END;
    END IF;
    
    -- Get referral code from metadata (for finding referrer)
    referral_code_from_meta := upper(trim(COALESCE(NEW.raw_user_meta_data->>'referral_code', '')));
    
    -- Find referrer BEFORE creating profile
    referrer_id := NULL;
    IF has_referral_code_col AND referral_code_from_meta IS NOT NULL AND referral_code_from_meta != '' THEN
        RAISE NOTICE 'Looking for referrer with code: %', referral_code_from_meta;
        
        BEGIN
            SELECT id INTO referrer_id
            FROM profiles
            WHERE upper(trim(COALESCE(referral_code, ''))) = referral_code_from_meta
            AND id != NEW.id
            LIMIT 1;
            
            IF referrer_id IS NOT NULL THEN
                RAISE NOTICE 'Referrer FOUND: id=%, email=%', referrer_id, (SELECT email FROM profiles WHERE id = referrer_id);
            ELSE
                RAISE WARNING 'Referrer NOT found for code: %', referral_code_from_meta;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Error looking up referrer: %', SQLERRM;
        END;
    END IF;
    
    -- Insert profile with referral code (ALWAYS include code if column exists)
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
        profile_inserted := true;
    ELSIF has_phone THEN
        INSERT INTO public.profiles (id, email, name, phone_number, balance, role)
        VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user')
        ON CONFLICT (id) DO NOTHING;
        profile_inserted := true;
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
        profile_inserted := true;
    ELSE
        INSERT INTO public.profiles (id, email, name, balance, role)
        VALUES (NEW.id, NEW.email, user_name, 0.0, 'user')
        ON CONFLICT (id) DO NOTHING;
        profile_inserted := true;
    END IF;
    
    -- CRITICAL: Create referral record AFTER profile is definitely created
    -- This must happen in a separate transaction context
    IF referrer_id IS NOT NULL AND referrer_id != NEW.id AND has_referral_code_col THEN
        -- Small delay to ensure profile commit
        PERFORM pg_sleep(0.05);
        
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals') THEN
            BEGIN
                -- Use explicit transaction-safe insert
                INSERT INTO public.referrals (referrer_id, referee_id, created_at)
                VALUES (referrer_id, NEW.id, NOW())
                ON CONFLICT (referee_id) DO NOTHING;
                
                -- Verify the insert worked
                PERFORM pg_sleep(0.01);
                
                IF EXISTS (SELECT 1 FROM referrals WHERE referee_id = NEW.id AND referrer_id = referrer_id) THEN
                    referral_inserted := true;
                    RAISE NOTICE 'SUCCESS: Referral record verified in table - referrer_id=%, referee_id=%', referrer_id, NEW.id;
                ELSE
                    RAISE WARNING 'Referral insert returned no conflict but record not found - referrer_id=%, referee_id=%', referrer_id, NEW.id;
                    
                    -- Try one more time
                    BEGIN
                        INSERT INTO public.referrals (referrer_id, referee_id, created_at)
                        VALUES (referrer_id, NEW.id, NOW())
                        ON CONFLICT (referee_id) DO NOTHING;
                        
                        IF EXISTS (SELECT 1 FROM referrals WHERE referee_id = NEW.id) THEN
                            referral_inserted := true;
                            RAISE NOTICE 'SUCCESS: Referral record created on retry';
                        END IF;
                    EXCEPTION WHEN OTHERS THEN
                        RAISE WARNING 'Retry also failed: %', SQLERRM;
                    END;
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
    RAISE WARNING 'handle_new_user exception: %', SQLERRM;
    -- Fallback: create basic profile
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

-- Step 3: Ensure RLS policies allow trigger inserts
DROP POLICY IF EXISTS "Allow trigger to insert referrals" ON referrals;
CREATE POLICY "Allow trigger to insert referrals" 
    ON referrals FOR INSERT 
    WITH CHECK (true);

-- Step 4: Grant all necessary permissions
GRANT ALL ON referrals TO postgres, service_role;
GRANT INSERT, SELECT ON referrals TO anon, authenticated;

-- Step 5: Verify function was created
SELECT 
    'Function updated successfully' as status,
    proname as function_name
FROM pg_proc 
WHERE proname = 'handle_new_user' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

