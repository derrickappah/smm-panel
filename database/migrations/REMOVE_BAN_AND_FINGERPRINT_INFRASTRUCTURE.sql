-- Migration: Remove Ban and Fingerprint Infrastructure
-- Reverts triggers, tables, functions, and columns related to IP/fingerprint tracking.

-- 1. Drop trigger and function for auto-ban syncing
DROP TRIGGER IF EXISTS on_auth_user_banned ON auth.users;
DROP FUNCTION IF EXISTS public.sync_banned_user_identifiers();

-- 2. Drop active user ban verification function
DROP FUNCTION IF EXISTS public.is_user_banned(uuid);
DROP FUNCTION IF EXISTS public.is_user_banned;

-- 3. Drop banned_identifiers table
DROP TABLE IF EXISTS public.banned_identifiers;

-- 4. Redefine public.handle_new_user() without IP/fingerprint tracking
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    user_name TEXT;
    user_phone TEXT;
    referral_code_from_meta TEXT;
    referrer_id UUID;
    generated_code TEXT;
    terms_accepted_at TIMESTAMPTZ;
    has_phone BOOLEAN;
    has_referral_code_col BOOLEAN;
    has_referred_by_col BOOLEAN;
    has_terms_accepted_col BOOLEAN;
BEGIN
    -- Get basic user info with safe defaults
    user_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
        SPLIT_PART(NEW.email, '@', 1)
    );
    
    user_phone := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone_number'), '');
    
    -- Extract terms acceptance timestamp from metadata
    BEGIN
        terms_accepted_at := (NEW.raw_user_meta_data->>'terms_accepted_at')::TIMESTAMPTZ;
    EXCEPTION WHEN OTHERS THEN
        terms_accepted_at := NULL;
    END;
    
    -- Check what columns exist
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone_number'
    ) INTO has_phone;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'referral_code'
    ) INTO has_referral_code_col;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'referred_by'
    ) INTO has_referred_by_col;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'terms_accepted_at'
    ) INTO has_terms_accepted_col;
    
    -- Generate referral code if column exists
    generated_code := NULL;
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
                    generated_code := NULL;
                END;
            END IF;
            
            IF generated_code IS NULL OR generated_code = '' OR length(generated_code) < 4 THEN
                generated_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text || NEW.id::text), 1, 8));
            END IF;
        EXCEPTION WHEN OTHERS THEN
            generated_code := 'REF' || upper(substr(md5(NEW.id::text), 1, 8));
        END;
    END IF;
    
    -- Get referral code from metadata
    referral_code_from_meta := NULL;
    referrer_id := NULL;
    
    IF has_referral_code_col THEN
        BEGIN
            referral_code_from_meta := upper(trim(COALESCE(
                NULLIF(TRIM(NEW.raw_user_meta_data->>'referral_code'), ''),
                ''
            )));
            
            IF referral_code_from_meta IS NOT NULL AND referral_code_from_meta != '' AND length(referral_code_from_meta) >= 3 THEN
                BEGIN
                    SELECT id INTO referrer_id
                    FROM profiles
                    WHERE upper(trim(COALESCE(referral_code, ''))) = referral_code_from_meta
                    AND id != NEW.id
                    LIMIT 1;
                EXCEPTION WHEN OTHERS THEN
                    referrer_id := NULL;
                END;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            referral_code_from_meta := NULL;
            referrer_id := NULL;
        END;
    END IF;
    
    -- Insert profile based on available columns
    BEGIN
        IF has_phone AND has_referral_code_col AND has_referred_by_col AND has_terms_accepted_col THEN
            IF referrer_id IS NOT NULL AND referrer_id != NEW.id THEN
                INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code, referred_by, terms_accepted_at)
                VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code, referrer_id, terms_accepted_at)
                ON CONFLICT (id) DO NOTHING;
            ELSE
                INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code, terms_accepted_at)
                VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code, terms_accepted_at)
                ON CONFLICT (id) DO NOTHING;
            END IF;
        ELSIF has_phone AND has_referral_code_col AND has_referred_by_col THEN
            IF referrer_id IS NOT NULL AND referrer_id != NEW.id THEN
                INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code, referred_by)
                VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code, referrer_id)
                ON CONFLICT (id) DO NOTHING;
            ELSE
                INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code)
                VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code)
                ON CONFLICT (id) DO NOTHING;
            END IF;
        ELSIF has_phone AND has_referral_code_col AND has_terms_accepted_col THEN
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code, terms_accepted_at)
            VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code, terms_accepted_at)
            ON CONFLICT (id) DO NOTHING;
        ELSIF has_phone AND has_referral_code_col THEN
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code)
            VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code)
            ON CONFLICT (id) DO NOTHING;
        ELSIF has_phone AND has_terms_accepted_col THEN
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role, terms_accepted_at)
            VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', terms_accepted_at)
            ON CONFLICT (id) DO NOTHING;
        ELSIF has_phone THEN
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role)
            VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user')
            ON CONFLICT (id) DO NOTHING;
        ELSIF has_referral_code_col AND has_referred_by_col AND has_terms_accepted_col THEN
            IF referrer_id IS NOT NULL AND referrer_id != NEW.id THEN
                INSERT INTO public.profiles (id, email, name, balance, role, referral_code, referred_by, terms_accepted_at)
                VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code, referrer_id, terms_accepted_at)
                ON CONFLICT (id) DO NOTHING;
            ELSE
                INSERT INTO public.profiles (id, email, name, balance, role, referral_code, terms_accepted_at)
                VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code, terms_accepted_at)
                ON CONFLICT (id) DO NOTHING;
            END IF;
        ELSIF has_referral_code_col AND has_referred_by_col THEN
            IF referrer_id IS NOT NULL AND referrer_id != NEW.id THEN
                INSERT INTO public.profiles (id, email, name, balance, role, referral_code, referred_by)
                VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code, referrer_id)
                ON CONFLICT (id) DO NOTHING;
            ELSE
                INSERT INTO public.profiles (id, email, name, balance, role, referral_code)
                VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code)
                ON CONFLICT (id) DO NOTHING;
            END IF;
        ELSIF has_referral_code_col AND has_terms_accepted_col THEN
            INSERT INTO public.profiles (id, email, name, balance, role, referral_code, terms_accepted_at)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code, terms_accepted_at)
            ON CONFLICT (id) DO NOTHING;
        ELSIF has_referral_code_col THEN
            INSERT INTO public.profiles (id, email, name, balance, role, referral_code)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code)
            ON CONFLICT (id) DO NOTHING;
        ELSIF has_terms_accepted_col THEN
            INSERT INTO public.profiles (id, email, name, balance, role, terms_accepted_at)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', terms_accepted_at)
            ON CONFLICT (id) DO NOTHING;
        ELSE
            INSERT INTO public.profiles (id, email, name, balance, role)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user')
            ON CONFLICT (id) DO NOTHING;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Primary insert failed: %, trying fallback', SQLERRM;
        BEGIN
            INSERT INTO public.profiles (id, email, name, balance, role)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user')
            ON CONFLICT (id) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Fallback insert also failed: %', SQLERRM;
        END;
    END;
    
    -- Create referral record
    IF referrer_id IS NOT NULL AND referrer_id != NEW.id THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals') THEN
            BEGIN
                INSERT INTO public.referrals (referrer_id, referee_id)
                VALUES (referrer_id, NEW.id)
                ON CONFLICT (referee_id) DO NOTHING;
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'Referral insert failed: %', SQLERRM;
            END;
        END IF;
    END IF;
    
    RETURN NEW;
EXCEPTION 
    WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user exception: %, SQLSTATE: %', SQLERRM, SQLSTATE;
        BEGIN
            INSERT INTO public.profiles (id, email, name, balance, role)
            VALUES (
                NEW.id, 
                NEW.email, 
                COALESCE(
                    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
                    SPLIT_PART(NEW.email, '@', 1)
                ), 
                0.0, 
                'user'
            )
            ON CONFLICT (id) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Ultimate fallback also failed: %', SQLERRM;
        END;
        RETURN NEW;
END;
$function$;

-- 5. Drop the IP and fingerprint columns from public.profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS registration_ip CASCADE;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS device_fingerprint CASCADE;
