-- Migration 255: Enforce Phone Number on Registration
-- Ensures that any user registering an account must provide a valid phone number (at least 10 digits).
-- This prevents bypassing frontend phone validation via direct Supabase Auth API calls.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
    normalized_phone := regexp_replace(COALESCE(user_phone, ''), '\D', '', 'g');

    -- STRICT CHECK: Reject signup if phone number is missing or less than 10 digits
    IF user_phone IS NULL OR length(normalized_phone) < 10 THEN
        RAISE EXCEPTION 'A valid phone number (at least 10 digits) is required to register an account.';
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

    -- Insert profile with validated phone number
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
$function$;
