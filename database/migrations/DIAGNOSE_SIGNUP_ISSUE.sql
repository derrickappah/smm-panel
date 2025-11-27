-- Diagnostic Script: Check what's causing signup failures
-- Run this to see what columns/tables exist and what might be missing

-- Check if profiles table exists and what columns it has
SELECT 
    'Profiles table columns:' as check_type,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'profiles'
ORDER BY ordinal_position;

-- Check if referrals table exists
SELECT 
    'Referrals table exists:' as check_type,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'referrals'
    ) THEN 'YES' ELSE 'NO' END as status;

-- Check if handle_new_user function exists and show its definition
SELECT 
    'handle_new_user function:' as check_type,
    proname as function_name,
    CASE WHEN prosrc IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as status,
    length(prosrc) as function_length
FROM pg_proc 
WHERE proname = 'handle_new_user' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Check if generate_referral_code function exists
SELECT 
    'generate_referral_code function:' as check_type,
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'generate_referral_code'
    ) THEN 'EXISTS' ELSE 'MISSING' END as status;

-- Check trigger exists
SELECT 
    'Trigger on_auth_user_created:' as check_type,
    tgname as trigger_name,
    tgenabled as enabled
FROM pg_trigger
WHERE tgname = 'on_auth_user_created';

-- Check RLS policies on referrals table
SELECT 
    'Referrals RLS policies:' as check_type,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'referrals';

