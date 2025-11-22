# Fix Admin Dashboard RLS Issue

## Problem
The admin dashboard is only showing data for the logged-in user instead of all users, orders, and transactions. This is caused by Row Level Security (RLS) policies that don't properly allow admins to view all data.

## Solution

### Step 1: Run the Fix Script
1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Open the file `database/fixes/FIX_ADMIN_RLS.sql` from your project
4. Copy the entire SQL script
5. Paste it into the SQL Editor
6. Click **Run** to execute

### Step 2: Verify Your User is Admin
Make sure your user account has `role = 'admin'` in the profiles table:

```sql
-- Check your current role
SELECT id, email, role FROM profiles WHERE id = auth.uid();

-- If you're not admin, update it (replace YOUR_USER_ID with your actual user ID)
UPDATE profiles SET role = 'admin' WHERE id = 'YOUR_USER_ID';
```

### Step 3: Test the Fix
1. Refresh your admin dashboard
2. You should now see all users, orders, and transactions
3. If you still only see your own data, check the browser console for error messages

## What the Fix Does

The `database/fixes/FIX_ADMIN_RLS.sql` script:

1. **Creates a Security Definer Function**: `is_admin()` function that bypasses RLS to check if a user is an admin. This prevents circular dependency issues.

2. **Recreates Admin Policies**: Sets up proper RLS policies that allow admins to:
   - View all profiles
   - Update all profiles
   - View all orders
   - Update all orders
   - View all transactions
   - Update all transactions

3. **Grants Permissions**: Ensures the function is accessible to authenticated users.

## Troubleshooting

### Still Only Seeing Own Data?

1. **Verify you're admin**:
   ```sql
   SELECT role FROM profiles WHERE id = auth.uid();
   ```
   Should return `admin`

2. **Check if policies exist**:
   ```sql
   SELECT tablename, policyname 
   FROM pg_policies 
   WHERE schemaname = 'public' 
   AND policyname LIKE '%Admin%';
   ```

3. **Check if function exists**:
   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'is_admin';
   ```

4. **Test the function**:
   ```sql
   SELECT public.is_admin();
   ```
   Should return `true` if you're an admin

### Error: "permission denied" or "policy violation"

This means the RLS policies aren't set up correctly. Re-run the `database/fixes/FIX_ADMIN_RLS.sql` script.

### Error: "function does not exist"

The `is_admin()` function wasn't created. Make sure you ran the entire `database/fixes/FIX_ADMIN_RLS.sql` script, not just parts of it.

## Alternative: Temporary Disable RLS (NOT RECOMMENDED FOR PRODUCTION)

If you need to quickly test, you can temporarily disable RLS:

```sql
-- DISABLE RLS (ONLY FOR TESTING!)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
```

**⚠️ WARNING**: Never disable RLS in production! This removes all security. Re-enable it immediately after testing:

```sql
-- RE-ENABLE RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
```

## Need Help?

If you're still having issues:
1. Check the browser console for specific error messages
2. Check Supabase logs in the Dashboard → Logs
3. Verify your user role is set to 'admin' in the profiles table
4. Make sure you ran the complete `database/fixes/FIX_ADMIN_RLS.sql` script

