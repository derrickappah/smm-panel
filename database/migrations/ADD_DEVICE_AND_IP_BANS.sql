-- Migration: Add Device and IP Ban Infrastructure
-- This creates the banned_identifiers table, adds columns to profiles, and updates triggers.

-- 1. Create table for banned IPs and browser fingerprints
CREATE TABLE IF NOT EXISTS public.banned_identifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('ip', 'fingerprint')),
    value TEXT NOT NULL UNIQUE,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS for security, but allow read-access to authenticated and anon for validation
ALTER TABLE public.banned_identifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to banned_identifiers"
    ON public.banned_identifiers FOR SELECT
    TO public
    USING (true);

-- 2. Add columns to profiles table to log IP and fingerprint
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS registration_ip TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;

-- 3. Trigger to auto-ban IP and Fingerprint when a user is banned in auth.users
CREATE OR REPLACE FUNCTION public.sync_banned_user_identifiers()
RETURNS TRIGGER AS $$
DECLARE
    user_ip TEXT;
    user_fingerprint TEXT;
BEGIN
    IF NEW.banned_until IS NOT NULL AND NEW.banned_until > now() THEN
        -- Get IP and fingerprint from profiles
        SELECT registration_ip, device_fingerprint 
        INTO user_ip, user_fingerprint
        FROM public.profiles
        WHERE id = NEW.id;
        
        -- Insert IP if not null
        IF user_ip IS NOT NULL AND user_ip != '' THEN
            INSERT INTO public.banned_identifiers (type, value, reason)
            VALUES ('ip', user_ip, 'Linked to banned user: ' || COALESCE(NEW.email, NEW.id::text))
            ON CONFLICT (value) DO NOTHING;
        END IF;
        
        -- Insert fingerprint if not null
        IF user_fingerprint IS NOT NULL AND user_fingerprint != '' THEN
            INSERT INTO public.banned_identifiers (type, value, reason)
            VALUES ('fingerprint', user_fingerprint, 'Linked to banned user: ' || COALESCE(NEW.email, NEW.id::text))
            ON CONFLICT (value) DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_banned
AFTER UPDATE OF banned_until ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_banned_user_identifiers();

-- 4. Re-create public.handle_new_user() trigger function to enforce bans on registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
    client_ip TEXT;
    device_fingerprint TEXT;
    request_headers TEXT;
BEGIN
    -- Get basic user info with safe defaults
    user_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
        SPLIT_PART(NEW.email, '@', 1)
    );
    
    user_phone := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone_number'), '');
    device_fingerprint := NULLIF(TRIM(NEW.raw_user_meta_data->>'fingerprint'), '');
    
    -- Extract IP from Supabase/PostgREST request headers
    BEGIN
        request_headers := current_setting('request.headers', true);
        IF request_headers IS NOT NULL THEN
            -- Check x-forwarded-for first (get first IP in list)
            client_ip := SPLIT_PART(request_headers::jsonb->>'x-forwarded-for', ',', 1);
            IF client_ip IS NULL OR client_ip = '' THEN
                client_ip := request_headers::jsonb->>'cf-connecting-ip';
            END IF;
            IF client_ip IS NULL OR client_ip = '' THEN
                client_ip := request_headers::jsonb->>'x-real-ip';
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        client_ip := NULL;
    END;

    -- Clean IP whitespace
    client_ip := TRIM(client_ip);
    
    -- Spam blocklist checks
    IF LOWER(user_name) IN ('saviour peprah', 'patrick akom', 'isaac amo', 'oboy sikaba', 'makidonia yhung lord', 'obviously')
       OR LOWER(user_name) LIKE '%makidonia%'
       OR LOWER(user_name) LIKE '%yhung%'
       OR NEW.email LIKE '%saviouv%kdgdrpeprah%'
       OR NEW.email LIKE '%saviourpeprah%'
       OR NEW.email LIKE '%akompat%'
       OR NEW.email LIKE '%akompha%'
       OR NEW.email LIKE '%isaacamo%'
       OR NEW.email LIKE '%oboysikab%'
       OR NEW.email LIKE '%@gmil.com'
       OR NEW.email LIKE '%qwertycvbbbnn%'
       OR NEW.email LIKE '%makidonia%'
       OR NEW.email LIKE '%yhung%'
       -- Block names with no vowels (consonant mash, e.g., Jsjsh, fsgs, Ghhh)
       OR NOT (LOWER(user_name) ~ '[aeiouy]')
       -- Block names with 5+ consecutive consonants (consonant mash, e.g., Oqijshshh)
       OR LOWER(user_name) ~ '[bcdfghjklmnpqrstvwxyz]{5,}'
       -- Block emails with no vowels in prefix (consonant mash, e.g., gfjbmv, fsgst)
       OR NOT (LOWER(SPLIT_PART(NEW.email, '@', 1)) ~ '[aeiouy]')
       -- Block emails with no vowels in domain name (consonant mash, e.g., @ksnkk.com, @ksjxj.com)
       OR NOT (LOWER(SPLIT_PART(SPLIT_PART(NEW.email, '@', 2), '.', 1)) ~ '[aeiouy]')
       -- Block emails with 5+ consecutive consonants (consonant mash, e.g., obottttrty, qwertycvbbbnn)
       OR LOWER(SPLIT_PART(NEW.email, '@', 1)) ~ '[bcdfghjklmnpqrstvwxyz]{5,}'
       -- Block reused phone numbers from banned users
       OR (user_phone IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.profiles p
           JOIN auth.users u ON p.id = u.id
           WHERE p.phone_number = user_phone AND u.banned_until IS NOT NULL
       ))
       -- Block phone number series used by spambots
       OR (user_phone IS NOT NULL AND (
           user_phone LIKE '05924545%' 
           OR user_phone LIKE '05824545%'
       ))
       -- Block phone numbers already in use to prevent multi-accounting flood
       OR (user_phone IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.profiles WHERE phone_number = user_phone
       ))
       -- NEW: Block banned IPs
       OR (client_ip IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.banned_identifiers WHERE type = 'ip' AND value = client_ip
       ))
       -- NEW: Block banned fingerprints
       OR (device_fingerprint IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.banned_identifiers WHERE type = 'fingerprint' AND value = device_fingerprint
       ))
    THEN
        RAISE EXCEPTION 'Registration blocked due to suspicious activity';
    END IF;

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
        SET registration_ip = client_ip,
            device_fingerprint = device_fingerprint
        WHERE id = NEW.id;

    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Registration blocked due to suspicious activity' THEN
            RAISE EXCEPTION 'Registration blocked due to suspicious activity';
        END IF;
        
        RAISE WARNING 'Primary insert failed: %, trying fallback', SQLERRM;
        BEGIN
            INSERT INTO public.profiles (id, email, name, balance, role)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user')
            ON CONFLICT (id) DO NOTHING;
            
            UPDATE public.profiles
            SET registration_ip = client_ip,
                device_fingerprint = device_fingerprint
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
        IF SQLERRM = 'Registration blocked due to suspicious activity' THEN
            RAISE EXCEPTION 'Registration blocked due to suspicious activity';
        END IF;
        
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
            SET registration_ip = client_ip,
                device_fingerprint = device_fingerprint
            WHERE id = NEW.id;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Ultimate fallback also failed: %', SQLERRM;
        END;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Backfill banned identifiers from activity_logs for already banned users
INSERT INTO public.banned_identifiers (type, value, reason)
SELECT DISTINCT 'ip', log.ip_address, 'Re-harvested IP from activity logs of banned user: ' || u.email
FROM auth.users u
JOIN public.activity_logs log ON u.id = log.user_id
WHERE u.banned_until IS NOT NULL AND u.banned_until > now()
  AND log.ip_address IS NOT NULL AND log.ip_address != '' AND log.ip_address != '127.0.0.1' AND log.ip_address != '::1'
ON CONFLICT (value) DO NOTHING;
