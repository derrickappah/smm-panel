-- Diagnostic script to check referral system status
-- Run this to see what's happening

-- 1. Check if referral codes exist
SELECT 
    'Users with referral codes' as check_type,
    COUNT(*) as count
FROM profiles 
WHERE referral_code IS NOT NULL AND referral_code != '';

-- 2. Check referral table
SELECT 
    'Total referrals' as check_type,
    COUNT(*) as count
FROM referrals;

-- 3. Check users with referred_by set
SELECT 
    'Users referred by someone' as check_type,
    COUNT(*) as count
FROM profiles 
WHERE referred_by IS NOT NULL;

-- 4. Check recent signups (last 10)
SELECT 
    id,
    email,
    referral_code,
    referred_by,
    created_at
FROM profiles
ORDER BY created_at DESC
LIMIT 10;

-- 5. Check if trigger exists
SELECT 
    'Trigger exists' as check_type,
    COUNT(*) as count
FROM pg_trigger
WHERE tgname = 'on_auth_user_created';

-- 6. Check if handle_new_user function exists
SELECT 
    'Function exists' as check_type,
    COUNT(*) as count
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';

-- 7. Check RLS policies on referrals
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'referrals';

-- 8. Test referral code lookup (replace with actual code)
-- SELECT id, email, referral_code 
-- FROM profiles 
-- WHERE upper(trim(referral_code)) = upper(trim('YOUR_CODE_HERE'));

