-- Fix Referrals Table Not Being Updated
-- This fixes issues with referrals table not getting populated on signup
-- Run this in Supabase SQL Editor

-- Step 1: Make referral code lookup case-insensitive and add better error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    referral_code_from_meta TEXT;
    referrer_profile_id UUID;
    generated_code TEXT;
    user_phone_number TEXT;
    has_phone_column BOOLEAN;
    has_referral_columns BOOLEAN;
    referral_insert_result TEXT;
BEGIN
    -- Check if phone_number column exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'phone_number'
    ) INTO has_phone_column;
    
    -- Check if referral columns exist
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'referral_code'
    ) INTO has_referral_columns;
    
    -- Get phone number if column exists
    IF has_phone_column THEN
        user_phone_number := NEW.raw_user_meta_data->>'phone_number';
    ELSE
        user_phone_number := NULL;
    END IF;
    
    -- Generate unique referral code for new user (only if referral system is set up)
    IF has_referral_columns THEN
        -- Check if generate_referral_code function exists before calling it
        IF EXISTS (
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public' AND p.proname = 'generate_referral_code'
        ) THEN
            generated_code := generate_referral_code();
        ELSE
            -- Fallback: generate a simple code if function doesn't exist
            generated_code := 'REF' || upper(substr(md5(random()::text || NEW.id::text), 1, 8));
        END IF;
        
        -- Get referral code from signup metadata if provided (convert to uppercase for consistency)
        referral_code_from_meta := upper(trim(NEW.raw_user_meta_data->>'referral_code'));
        
        -- If referral code provided, find the referrer (case-insensitive match)
        IF referral_code_from_meta IS NOT NULL AND referral_code_from_meta != '' THEN
            -- Case-insensitive lookup
            SELECT id INTO referrer_profile_id
            FROM profiles
            WHERE upper(trim(referral_code)) = referral_code_from_meta
            LIMIT 1;
            
            -- Only set referred_by if valid referrer found and not self-referral
            IF referrer_profile_id IS NOT NULL AND referrer_profile_id != NEW.id THEN
                -- Insert profile with referral info
                IF has_phone_column THEN
                    INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code, referred_by)
                    VALUES (
                        NEW.id,
                        NEW.email,
                        COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
                        user_phone_number,
                        0.0,
                        'user',
                        generated_code,
                        referrer_profile_id
                    )
                    ON CONFLICT (id) DO NOTHING;
                ELSE
                    INSERT INTO public.profiles (id, email, name, balance, role, referral_code, referred_by)
                    VALUES (
                        NEW.id,
                        NEW.email,
                        COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
                        0.0,
                        'user',
                        generated_code,
                        referrer_profile_id
                    )
                    ON CONFLICT (id) DO NOTHING;
                END IF;
                
                -- Create referral relationship record (only if referrals table exists)
                -- Use SECURITY DEFINER context to bypass RLS if needed
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals') THEN
                    BEGIN
                        INSERT INTO public.referrals (referrer_id, referee_id)
                        VALUES (referrer_profile_id, NEW.id)
                        ON CONFLICT (referee_id) DO NOTHING;
                    EXCEPTION WHEN OTHERS THEN
                        -- Log error but don't fail the signup
                        -- The referral relationship can be created later if needed
                        RAISE WARNING 'Failed to insert referral record: %', SQLERRM;
                    END;
                END IF;
            ELSE
                -- Invalid referral code or self-referral - insert without referred_by
                IF has_phone_column THEN
                    INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code)
                    VALUES (
                        NEW.id,
                        NEW.email,
                        COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
                        user_phone_number,
                        0.0,
                        'user',
                        generated_code
                    )
                    ON CONFLICT (id) DO NOTHING;
                ELSE
                    INSERT INTO public.profiles (id, email, name, balance, role, referral_code)
                    VALUES (
                        NEW.id,
                        NEW.email,
                        COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
                        0.0,
                        'user',
                        generated_code
                    )
                    ON CONFLICT (id) DO NOTHING;
                END IF;
            END IF;
        ELSE
            -- No referral code provided - insert without referred_by
            IF has_phone_column THEN
                INSERT INTO public.profiles (id, email, name, phone_number, balance, role, referral_code)
                VALUES (
                    NEW.id,
                    NEW.email,
                    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
                    user_phone_number,
                    0.0,
                    'user',
                    generated_code
                )
                ON CONFLICT (id) DO NOTHING;
            ELSE
                INSERT INTO public.profiles (id, email, name, balance, role, referral_code)
                VALUES (
                    NEW.id,
                    NEW.email,
                    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
                    0.0,
                    'user',
                    generated_code
                )
                ON CONFLICT (id) DO NOTHING;
            END IF;
        END IF;
    ELSE
        -- Referral system not set up yet - use basic profile creation
        IF has_phone_column THEN
            INSERT INTO public.profiles (id, email, name, phone_number, balance, role)
            VALUES (
                NEW.id,
                NEW.email,
                COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
                user_phone_number,
                0.0,
                'user'
            )
            ON CONFLICT (id) DO NOTHING;
        ELSE
            INSERT INTO public.profiles (id, email, name, balance, role)
            VALUES (
                NEW.id,
                NEW.email,
                COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
                0.0,
                'user'
            )
            ON CONFLICT (id) DO NOTHING;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Ensure RLS policies allow the trigger to insert into referrals table
-- The function runs as SECURITY DEFINER, but we should also ensure the policy allows inserts
DROP POLICY IF EXISTS "Allow trigger to insert referrals" ON referrals;
CREATE POLICY "Allow trigger to insert referrals" 
    ON referrals FOR INSERT 
    WITH CHECK (true);

-- Step 3: Grant necessary permissions
GRANT INSERT ON referrals TO postgres, anon, authenticated, service_role;

-- Verify the function was updated
SELECT 
    'handle_new_user function updated successfully' as status,
    proname as function_name,
    prosrc as function_source
FROM pg_proc 
WHERE proname = 'handle_new_user' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
LIMIT 1;

