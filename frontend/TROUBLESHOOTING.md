# Troubleshooting Guide

## Common Errors and Solutions

### Error: "Failed to execute 'clone' on 'Response': Response body is already used"

This error is usually caused by a monitoring/recording tool (like rrweb-recorder) trying to clone the response. The main issue is the underlying 400 error from Supabase.

**Solution:**
1. Check the browser console for the actual Supabase error message
2. The 400 error usually means:
   - Database tables don't exist yet
   - Email confirmation is required
   - Invalid request format

### Error: 400 Bad Request from Supabase

**Possible causes:**

1. **Database tables not created:**
   - Go to Supabase SQL Editor
   - Run the database schema from `README_SETUP.md`
   - Make sure all tables (profiles, services, orders, transactions) are created

2. **Email confirmation required:**
   - Go to Supabase Dashboard → Authentication → Settings
   - Disable "Enable email confirmations" for development
   - Or check your email and confirm the account

3. **RLS (Row Level Security) blocking requests:**
   - Make sure RLS policies are set up correctly
   - Check that policies allow users to insert into profiles table

### Error: "Table does not exist"

**Solution:**
1. Go to Supabase Dashboard → SQL Editor
2. Run the complete database schema SQL
3. Verify tables exist: Go to Table Editor and check for:
   - `profiles`
   - `services`
   - `orders`
   - `transactions`

### Error: "Profile creation failed"

**Solution:**
- The trigger should auto-create profiles, but if it fails:
  1. Check if the trigger function exists
  2. Verify the trigger is attached to `auth.users` table
  3. Manually create profile if needed via SQL Editor

### Check Database Setup

Run this in Supabase SQL Editor to verify setup:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'services', 'orders', 'transactions');

-- Check if trigger exists
SELECT trigger_name 
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';
```

### Disable Email Confirmation (for development)

1. Go to Supabase Dashboard
2. Authentication → Settings
3. Under "Email Auth", toggle OFF "Enable email confirmations"
4. Save changes

This allows users to sign up and login immediately without email confirmation.

