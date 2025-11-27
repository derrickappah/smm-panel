-- Test Referral System
-- Run this to check if referral system is working

-- 1. Check if referral codes exist
SELECT 
    'Step 1: Users with referral codes' as test_step,
    COUNT(*) as count,
    STRING_AGG(referral_code, ', ') as sample_codes
FROM profiles 
WHERE referral_code IS NOT NULL
LIMIT 5;

-- 2. Show a sample referral code to use for testing
SELECT 
    'Step 2: Sample referral code to test with' as test_step,
    id,
    email,
    referral_code
FROM profiles
WHERE referral_code IS NOT NULL
LIMIT 1;

-- 3. Check if any users have referred_by set
SELECT 
    'Step 3: Users who were referred' as test_step,
    COUNT(*) as count
FROM profiles
WHERE referred_by IS NOT NULL;

-- 4. Check referrals table
SELECT 
    'Step 4: Referrals table entries' as test_step,
    COUNT(*) as total_referrals,
    COUNT(CASE WHEN bonus_awarded = true THEN 1 END) as bonuses_awarded
FROM referrals;

-- 5. Show recent referrals
SELECT 
    'Step 5: Recent referrals' as test_step,
    r.id,
    r.referrer_id,
    r.referee_id,
    r.bonus_awarded,
    p1.email as referrer_email,
    p2.email as referee_email
FROM referrals r
LEFT JOIN profiles p1 ON r.referrer_id = p1.id
LEFT JOIN profiles p2 ON r.referee_id = p2.id
ORDER BY r.created_at DESC
LIMIT 5;

-- 6. Test referral code lookup function
-- Replace 'REFXXXXX' with an actual code from step 2
SELECT 
    'Step 6: Test lookup (replace REFXXXXX with actual code)' as test_step,
    id,
    email,
    referral_code
FROM profiles
WHERE upper(trim(COALESCE(referral_code, ''))) = 'REFXXXXX';

-- 7. Check RLS policies
SELECT 
    'Step 7: RLS policies on referrals' as test_step,
    policyname,
    cmd,
    roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'referrals';

