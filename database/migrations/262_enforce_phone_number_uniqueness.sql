-- Migration 262: Enforce Phone Number Uniqueness on Registrations and Updates
-- Ensures no new account can be created with a phone number that is already registered.
-- Also ensures existing users cannot update their phone number to a duplicate one.

-- 1. Helper function for consistent phone normalization (Ghana format standard: 0XXXXXXXXX)
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS \$\$
DECLARE
    cleaned text;
BEGIN
    IF p_phone IS NULL THEN
        RETURN NULL;
    END IF;
    cleaned := regexp_replace(p_phone, '\D', '', 'g');
    IF length(cleaned) = 0 THEN
        RETURN NULL;
    END IF;
    -- If 233XXXXXXXXX (12 digits) -> convert to 0XXXXXXXXX
    IF length(cleaned) = 12 AND cleaned LIKE '233%' THEN
        cleaned := '0' || substr(cleaned, 4);
    -- If 9 digits (missing leading 0) -> convert to 0XXXXXXXXX
    ELSIF length(cleaned) = 9 THEN
        cleaned := '0' || cleaned;
    END IF;
    RETURN cleaned;
END;
\$\$;

-- 2. Expression index to make phone uniqueness checks fast
CREATE INDEX IF NOT EXISTS idx_profiles_normalized_phone 
ON public.profiles (public.normalize_phone(phone_number)) 
WHERE phone_number IS NOT NULL AND phone_number != '';

-- 3. Public RPC function to check if phone is already registered (used by API & UI)
CREATE OR REPLACE FUNCTION public.check_phone_registered(p_phone text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS \$\$
DECLARE
    norm text;
BEGIN
    norm := public.normalize_phone(p_phone);
    IF norm IS NULL OR length(norm) < 10 THEN
        RETURN false;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE public.normalize_phone(phone_number) = norm
    );
END;
\$\$;

GRANT EXECUTE ON FUNCTION public.check_phone_registered(text) TO anon, authenticated, service_role;

-- 4. Update block_anonymous_signup (BEFORE INSERT ON auth.users)
-- Blocks signup before the auth.users record is created if phone is already registered.
CREATE OR REPLACE FUNCTION public.block_anonymous_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS \\$
DECLARE
    v_raw_phone TEXT;
    v_norm_phone TEXT;
BEGIN
    -- Block explicit anonymous sign-ins (Supabase feature)
    IF (NEW.is_anonymous = true) THEN
        RAISE EXCEPTION 'Security Violation: Anonymous sign-ins are disabled.';
    END IF;

    -- Auto-confirm email to bypass SMTP rate limits and email verification blocks
    NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, NOW());
    NEW.confirmed_at := COALESCE(NEW.confirmed_at, NOW());

    -- Extract phone from metadata and check uniqueness
    v_raw_phone := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone_number'), '');
    IF v_raw_phone IS NOT NULL THEN
        v_norm_phone := public.normalize_phone(v_raw_phone);
        IF v_norm_phone IS NOT NULL AND length(v_norm_phone) >= 10 THEN
            IF EXISTS (
                SELECT 1 FROM public.profiles
                WHERE public.normalize_phone(phone_number) = v_norm_phone
                  AND id != NEW.id
            ) THEN
                RAISE EXCEPTION 'This phone number is already registered to another account. Please log in instead.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
\\$;

-- 5. Update handle_new_user (AFTER INSERT ON auth.users)
-- Second line of defense ensuring uniqueness when inserting into public.profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS \\$
DECLARE
    user_name TEXT;
    user_phone TEXT;
    normalized_phone TEXT;
    referral_code_from_meta TEXT;
    referrer_id UUID;
    generated_code TEXT;
    terms_accepted_at TIMESTAMPTZ;
BEGIN
    -- Extract and validate phone number
    user_phone := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone_number'), '');
    normalized_phone := public.normalize_phone(user_phone);

    -- STRICT CHECK: Reject signup if phone number is missing or less than 10 digits
    IF normalized_phone IS NULL OR length(normalized_phone) < 10 THEN
        RAISE EXCEPTION 'A valid phone number (at least 10 digits) is required to register an account.';
    END IF;

    -- STRICT CHECK: Reject signup if phone number is already registered to another account
    IF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE public.normalize_phone(phone_number) = normalized_phone
          AND id != NEW.id
    ) THEN
        RAISE EXCEPTION 'This phone number is already registered to another account. Please log in instead.';
    END IF;

    -- Get basic user info with safe defaults
    user_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
        SPLIT_PART(NEW.email, '@', 1)
    );
    
    -- Extract terms acceptance timestamp from metadata
    BEGIN
        terms_accepted_at := (NEW.raw_user_meta_data->>'terms_accepted_at')::TIMESTAMPTZ;
    EXCEPTION WHEN OTHERS THEN
        terms_accepted_at := NOW();
    END;
    IF terms_accepted_at IS NULL THEN
        terms_accepted_at := NOW();
    END IF;

    -- Generate referral code
    BEGIN
        IF EXISTS (
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public' AND p.proname = 'generate_referral_code'
        ) THEN
            generated_code := generate_referral_code();
        END IF;
    EXCEPTION WHEN OTHERS THEN
        generated_code := NULL;
    END;
    
    IF generated_code IS NULL OR generated_code = '' OR length(generated_code) < 4 THEN
        generated_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text || NEW.id::text), 1, 8));
    END IF;

    -- Get referral code from metadata
    referral_code_from_meta := upper(trim(COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'referral_code'), ''),
        ''
    )));
    referrer_id := NULL;
    
    IF referral_code_from_meta != '' AND length(referral_code_from_meta) >= 3 THEN
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

    -- Insert profile with normalized phone number
    INSERT INTO public.profiles (
        id,
        email,
        name,
        phone_number,
        balance,
        role,
        referral_code,
        referred_by,
        terms_accepted_at
    )
    VALUES (
        NEW.id,
        NEW.email,
        user_name,
        normalized_phone,
        0.0,
        'user',
        generated_code,
        referrer_id,
        terms_accepted_at
    )
    ON CONFLICT (id) DO UPDATE SET
        phone_number = EXCLUDED.phone_number,
        name = EXCLUDED.name,
        terms_accepted_at = COALESCE(profiles.terms_accepted_at, EXCLUDED.terms_accepted_at);

    -- Create referral record if applicable
    IF referrer_id IS NOT NULL AND referrer_id != NEW.id THEN
        BEGIN
            INSERT INTO public.referrals (referrer_id, referee_id)
            VALUES (referrer_id, NEW.id)
            ON CONFLICT (referee_id) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Referral insert failed: %', SQLERRM;
        END;
    END IF;

    RETURN NEW;
END;
\\$;

-- 6. Update validate_profile_update (BEFORE UPDATE ON profiles)
-- Prevents updating phone number to one already in use by another user
CREATE OR REPLACE FUNCTION public.validate_profile_update()
RETURNS TRIGGER AS \$\$
BEGIN
    IF (NEW.balance IS DISTINCT FROM OLD.balance OR NEW.role IS DISTINCT FROM OLD.role) THEN
        IF current_user IN ('authenticated', 'anon') THEN
            IF OLD.role != 'admin' THEN
                RAISE EXCEPTION 'Security Violation: Direct modification of balance or role is not allowed.';
            END IF;
        END IF;
    END IF;

    -- Check phone number uniqueness if modified
    IF (NEW.phone_number IS DISTINCT FROM OLD.phone_number AND NEW.phone_number IS NOT NULL AND TRIM(NEW.phone_number) != '') THEN
        IF EXISTS (
            SELECT 1 FROM public.profiles
            WHERE public.normalize_phone(phone_number) = public.normalize_phone(NEW.phone_number)
              AND id != NEW.id
        ) THEN
            RAISE EXCEPTION 'This phone number is already registered to another account.';
        END IF;
    END IF;

    RETURN NEW;
END;
\$\$ LANGUAGE plpgsql SECURITY DEFINER;
