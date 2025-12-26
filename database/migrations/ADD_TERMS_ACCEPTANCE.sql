-- Add Terms and Conditions Acceptance
-- This migration adds terms_accepted_at column to profiles table
-- and updates handle_new_user function to store terms acceptance timestamp
-- Run this in Supabase SQL Editor

-- Step 1: Add terms_accepted_at column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.terms_accepted_at IS 'Timestamp when user accepted terms and conditions during signup';

-- Step 2: Update handle_new_user function to include terms acceptance
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
    
    -- Generate referral code if column exists (ALWAYS generate for new users)
    generated_code := NULL;
    IF has_referral_code_col THEN
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
                    generated_code := NULL; -- Will use fallback below
                END;
            END IF;
            
            -- Fallback generation if function doesn't exist or failed
            IF generated_code IS NULL OR generated_code = '' OR length(generated_code) < 4 THEN
                generated_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text || NEW.id::text), 1, 8));
            END IF;
            
            -- Final safety check
            IF generated_code IS NULL OR generated_code = '' THEN
                generated_code := 'REF' || upper(substr(md5(NEW.id::text || clock_timestamp()::text), 1, 8));
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Ultimate fallback
            generated_code := 'REF' || upper(substr(md5(NEW.id::text), 1, 8));
        END;
    END IF;
    
    -- Get referral code from metadata (safely handle NULL, empty string, or missing key)
    referral_code_from_meta := NULL;
    referrer_id := NULL;
    
    IF has_referral_code_col THEN
        BEGIN
            -- Safely extract referral code from metadata
            referral_code_from_meta := upper(trim(COALESCE(
                NULLIF(TRIM(NEW.raw_user_meta_data->>'referral_code'), ''),
                ''
            )));
            
            -- Only look up referrer if we have a non-empty code
            IF referral_code_from_meta IS NOT NULL AND referral_code_from_meta != '' AND length(referral_code_from_meta) >= 3 THEN
                BEGIN
                    SELECT id INTO referrer_id
                    FROM profiles
                    WHERE upper(trim(COALESCE(referral_code, ''))) = referral_code_from_meta
                    AND id != NEW.id  -- Prevent self-referral
                    AND id IS NOT NULL
                    LIMIT 1;
                EXCEPTION WHEN OTHERS THEN
                    referrer_id := NULL; -- If lookup fails, just continue without referrer
                END;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- If anything fails, just continue without referral
            referral_code_from_meta := NULL;
            referrer_id := NULL;
        END;
    END IF;
    
    -- Insert profile based on available columns
    -- Handle all combinations of optional columns
    BEGIN
        -- Build the INSERT statement dynamically based on available columns
        IF has_phone AND has_referral_code_col AND has_referred_by_col AND has_terms_accepted_col THEN
            -- All columns available
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
            -- Phone, referral_code, referred_by, but no terms_accepted_at
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
            -- Phone, referral_code, terms_accepted_at, but no referred_by
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code, terms_accepted_at)
            VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code, terms_accepted_at)
            ON CONFLICT (id) DO NOTHING;
        ELSIF has_phone AND has_referral_code_col THEN
            -- Phone and referral_code, but no referred_by or terms_accepted_at
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code)
            VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', generated_code)
            ON CONFLICT (id) DO NOTHING;
        ELSIF has_phone AND has_terms_accepted_col THEN
            -- Phone and terms_accepted_at, but no referral columns
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role, terms_accepted_at)
            VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user', terms_accepted_at)
            ON CONFLICT (id) DO NOTHING;
        ELSIF has_phone THEN
            -- Only phone
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role)
            VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user')
            ON CONFLICT (id) DO NOTHING;
        ELSIF has_referral_code_col AND has_referred_by_col AND has_terms_accepted_col THEN
            -- Referral columns and terms_accepted_at, no phone
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
            -- Referral columns, no phone or terms_accepted_at
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
            -- Referral_code and terms_accepted_at, no phone or referred_by
            INSERT INTO public.profiles (id, email, name, balance, role, referral_code, terms_accepted_at)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code, terms_accepted_at)
            ON CONFLICT (id) DO NOTHING;
        ELSIF has_referral_code_col THEN
            -- Only referral_code, no phone, referred_by, or terms_accepted_at
            INSERT INTO public.profiles (id, email, name, balance, role, referral_code)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', generated_code)
            ON CONFLICT (id) DO NOTHING;
        ELSIF has_terms_accepted_col THEN
            -- Only terms_accepted_at, no phone or referral columns
            INSERT INTO public.profiles (id, email, name, balance, role, terms_accepted_at)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user', terms_accepted_at)
            ON CONFLICT (id) DO NOTHING;
        ELSE
            -- Basic insert (no phone, no referral columns, no terms_accepted_at)
            INSERT INTO public.profiles (id, email, name, balance, role)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user')
            ON CONFLICT (id) DO NOTHING;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- If the main insert fails, try the most basic insert
        RAISE WARNING 'Primary insert failed: %, trying fallback', SQLERRM;
        BEGIN
            INSERT INTO public.profiles (id, email, name, balance, role)
            VALUES (NEW.id, NEW.email, user_name, 0.0, 'user')
            ON CONFLICT (id) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Fallback insert also failed: %', SQLERRM;
        END;
    END;
    
    -- Create referral record if referrer found (AFTER profile is created)
    IF referrer_id IS NOT NULL AND referrer_id != NEW.id THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals') THEN
            BEGIN
                INSERT INTO public.referrals (referrer_id, referee_id)
                VALUES (referrer_id, NEW.id)
                ON CONFLICT (referee_id) DO NOTHING;
            EXCEPTION WHEN OTHERS THEN
                -- Don't fail signup if referral insert fails
                RAISE WARNING 'Referral insert failed: %', SQLERRM;
            END;
        END IF;
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Ultimate fallback - try absolute minimum insert
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify the function was created
SELECT 
    'handle_new_user function updated successfully with terms acceptance support' as status,
    proname as function_name
FROM pg_proc 
WHERE proname = 'handle_new_user' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

