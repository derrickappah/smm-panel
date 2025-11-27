-- Emergency Fix: Simple Working Signup Function
-- This creates a minimal handle_new_user function that WILL work
-- Run this FIRST to restore signups, then we can add referral features

-- Step 1: Create the simplest possible working function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_name TEXT;
    user_phone TEXT;
    has_phone BOOLEAN;
BEGIN
    -- Get user name
    user_name := COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1));
    
    -- Get phone number
    user_phone := NEW.raw_user_meta_data->>'phone_number';
    
    -- Check if phone_number column exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'phone_number'
    ) INTO has_phone;
    
    -- Insert profile - simplest version that works
    IF has_phone THEN
        INSERT INTO public.profiles (id, email, name, phone_number, balance, role)
        VALUES (NEW.id, NEW.email, user_name, user_phone, 0.0, 'user')
        ON CONFLICT (id) DO NOTHING;
    ELSE
        INSERT INTO public.profiles (id, email, name, balance, role)
        VALUES (NEW.id, NEW.email, user_name, 0.0, 'user')
        ON CONFLICT (id) DO NOTHING;
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- If anything fails, try the absolute simplest insert
    BEGIN
        INSERT INTO public.profiles (id, email, name, balance, role)
        VALUES (NEW.id, NEW.email, user_name, 0.0, 'user')
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        -- Even if this fails, return NEW to not block signup
        -- The profile can be created manually if needed
        RAISE WARNING 'Profile creation failed: %', SQLERRM;
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify it was created
SELECT 
    'handle_new_user function created (simple version)' as status,
    proname as function_name
FROM pg_proc 
WHERE proname = 'handle_new_user' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

