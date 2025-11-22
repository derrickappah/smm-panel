# Database Troubleshooting Guide

If you're still getting errors after running `SUPABASE_DATABASE_SETUP.sql`, follow these steps:

## Step 1: Verify Database Setup

Run `VERIFY_DATABASE_SETUP.sql` in your Supabase SQL Editor to check:
- ✅ All tables exist
- ✅ RLS is enabled
- ✅ Policies are created
- ✅ Triggers and functions exist

## Step 2: Check Your Profile Exists

The most common issue is that your user profile doesn't exist in the `profiles` table.

### Check if your profile exists:
1. Go to Supabase Dashboard → **Table Editor** → **profiles**
2. Look for a row with your user ID (from auth.users)
3. If it doesn't exist, create it manually:

```sql
-- Replace YOUR_USER_ID with your actual user ID from auth.users
-- Replace YOUR_EMAIL with your email
INSERT INTO profiles (id, email, name, balance, role)
VALUES (
    'YOUR_USER_ID_HERE',
    'YOUR_EMAIL_HERE',
    'Your Name',
    0.0,
    'user'
)
ON CONFLICT (id) DO NOTHING;
```

### Get your user ID:
Run this in SQL Editor:
```sql
SELECT id, email FROM auth.users;
```

## Step 3: Check RLS Policies

Make sure the INSERT policy for transactions exists:

```sql
-- Check if the policy exists
SELECT * FROM pg_policies 
WHERE tablename = 'transactions' 
AND policyname = 'Users can create own transactions';
```

If it doesn't exist, run this:
```sql
CREATE POLICY "Users can create own transactions" 
ON transactions FOR INSERT 
WITH CHECK (auth.uid() = user_id);
```

## Step 4: Test Direct Insert

Test if you can insert a transaction directly in SQL Editor:

```sql
-- Replace YOUR_USER_ID with your actual user ID
INSERT INTO transactions (user_id, amount, type, status)
VALUES (
    'YOUR_USER_ID_HERE',
    10.00,
    'deposit',
    'pending'
)
RETURNING *;
```

If this works, the issue is with the app's RLS policies or authentication.

## Step 5: Common Issues

### Issue: "Foreign key constraint violation"
**Solution:** Your profile doesn't exist. Create it using Step 2 above.

### Issue: "Permission denied"
**Solution:** RLS policies aren't set up correctly. Re-run the RLS policy section from `SUPABASE_DATABASE_SETUP.sql`.

### Issue: "Table does not exist"
**Solution:** Tables weren't created. Check the Table Editor and re-run the CREATE TABLE statements.

### Issue: Still getting 500 errors
**Solution:** 
1. Check Supabase Dashboard → **Logs** → **Postgres Logs** for detailed error messages
2. Check if your Supabase project is active (not paused)
3. Verify your `.env` file has the correct Supabase URL and key

## Step 6: Manual Profile Creation Script

If the trigger isn't working, use this to create your profile:

```sql
-- This will create a profile for all existing users who don't have one
INSERT INTO profiles (id, email, name, balance, role)
SELECT 
    u.id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'name', SPLIT_PART(u.email, '@', 1)),
    0.0,
    'user'
FROM auth.users u
WHERE NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;
```

## Still Having Issues?

1. **Check Browser Console**: Look for the actual error message (not just "Response body is already used")
2. **Check Supabase Logs**: Go to Dashboard → Logs → Postgres Logs
3. **Verify Environment Variables**: Make sure `.env` file has correct values
4. **Restart Dev Server**: After making changes, restart with `npm start`

