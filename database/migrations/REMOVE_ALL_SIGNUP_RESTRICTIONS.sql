-- Migration: Remove All Signup Restrictions
-- Completely removes spambot blocklists, duplicate phone validations, name validations, consonant checks, and fingerprint registration blocks from public.handle_new_user() trigger function.

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
    
    -- Client identifiers
    v_client_ip TEXT;
    v_device_fingerprint TEXT;
    v_request_headers TEXT;
BEGIN
    -- Get basic user info with safe defaults
    user_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
        SPLIT_PART(NEW.email, '@', 1)
    );
    
    user_phone := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone_number'), '');
    v_device_fingerprint := NULLIF(TRIM(NEW.raw_user_meta_data->>'fingerprint'), '');
    
    -- Extract IP from Supabase/PostgREST request headers
    BEGIN
        v_request_headers := current_setting('request.headers', true);
        IF v_request_headers IS NOT NULL THEN
            -- Check x-forwarded-for first (get first IP in list)
            v_client_ip := SPLIT_PART(v_request_headers::jsonb->>'x-forwarded-for', ',', 1);
            IF v_client_ip IS NULL OR v_client_ip = '' THEN
                v_client_ip := v_request_headers::jsonb->>'cf-connecting-ip';
            END IF;
            IF v_client_ip IS NULL OR v_client_ip = '' THEN
                v_client_ip := v_request_headers::jsonb->>'x-real-ip';
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_client_ip := NULL;
    END;

    -- Clean IP whitespace
    v_client_ip := TRIM(v_client_ip);
    
    -- ALL SIGNUP RESTRICTIONS REMOVED AS REQUESTED BY USER

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
        
        -- UPDATE columns to record client IP and fingerprint
        UPDATE public.profiles
        SET registration_ip = v_client_ip,
            device_fingerprint = v_device_fingerprint
        WHERE id = NEW.id;

    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Primary insert failed: %, trying fallback', SQLERRM;
        BEGIN
            INSERT INTO public.profiles (id, email, name, balance, role)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user')
            ON CONFLICT (id) DO NOTHING;
            
            UPDATE public.profiles
            SET registration_ip = v_client_ip,
                device_fingerprint = v_device_fingerprint
            WHERE id = NEW.id;
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
            
            UPDATE public.profiles
            SET registration_ip = v_client_ip,
                device_fingerprint = v_device_fingerprint
            WHERE id = NEW.id;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Ultimate fallback also failed: %', SQLERRM;
        END;
        RETURN NEW;
END;
$function$;
