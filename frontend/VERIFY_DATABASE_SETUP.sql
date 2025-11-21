-- Database Verification Script
-- Run this to check if everything is set up correctly

-- 1. Check if tables exist
SELECT 
    'Tables Check' as check_type,
    table_name,
    CASE 
        WHEN table_name IN ('profiles', 'services', 'orders', 'transactions') 
        THEN '✅ EXISTS' 
        ELSE '❌ MISSING' 
    END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'services', 'orders', 'transactions')
ORDER BY table_name;

-- 2. Check RLS is enabled
SELECT 
    'RLS Check' as check_type,
    tablename as table_name,
    CASE 
        WHEN rowsecurity = true THEN '✅ ENABLED'
        ELSE '❌ DISABLED'
    END as status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'services', 'orders', 'transactions')
ORDER BY tablename;

-- 3. Check RLS Policies for transactions table
SELECT 
    'Policy Check' as check_type,
    schemaname,
    tablename,
    policyname,
    CASE 
        WHEN cmd = 'SELECT' THEN 'SELECT ✅'
        WHEN cmd = 'INSERT' THEN 'INSERT ✅'
        WHEN cmd = 'UPDATE' THEN 'UPDATE ✅'
        ELSE cmd
    END as policy_type
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'transactions'
ORDER BY policyname;

-- 4. Check if trigger exists
SELECT 
    'Trigger Check' as check_type,
    trigger_name,
    event_manipulation,
    event_object_table,
    CASE 
        WHEN trigger_name = 'on_auth_user_created' THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table = 'users'
AND trigger_name = 'on_auth_user_created';

-- 5. Check function exists
SELECT 
    'Function Check' as check_type,
    routine_name,
    routine_type,
    CASE 
        WHEN routine_name = 'handle_new_user' THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'handle_new_user';

-- 6. Test if you can see your profile (replace with your user ID)
-- Uncomment and replace the UUID below with your actual user ID
-- SELECT * FROM profiles WHERE id = 'YOUR_USER_ID_HERE';

