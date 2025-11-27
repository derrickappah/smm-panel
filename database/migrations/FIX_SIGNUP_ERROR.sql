-- Quick Fix for Signup Error
-- This creates a simple, working handle_new_user function that will work immediately
-- Run this FIRST in Supabase SQL Editor to fix signups, then run ADD_REFERRAL_SYSTEM.sql

-- Simple version that works with or without referral system
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_phone_number TEXT;
    user_name TEXT;
    has_phone_column BOOLEAN;
BEGIN
    -- Get name from metadata or email
    user_name := COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1));
    
    -- Get phone number from metadata (may be NULL)
    user_phone_number := NEW.raw_user_meta_data->>'phone_number';
    
    -- Check if phone_number column exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'phone_number'
    ) INTO has_phone_column;
    
    -- Insert profile based on what columns exist
    IF has_phone_column THEN
        INSERT INTO public.profiles (id, email, name, phone_number, balance, role)
        VALUES (
            NEW.id,
            NEW.email,
            user_name,
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
            user_name,
            0.0,
            'user'
        )
        ON CONFLICT (id) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify the function was created
SELECT 
    'handle_new_user function updated successfully' as status,
    proname as function_name
FROM pg_proc 
WHERE proname = 'handle_new_user' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

