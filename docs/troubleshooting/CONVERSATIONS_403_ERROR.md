# Troubleshooting: 403 Error on Conversations Endpoint

## Problem

You're seeing 403 (Forbidden) errors when trying to access the conversations endpoint:
```
spihsvdchouynfbsotwq.supabase.co/rest/v1/conversations?select=*:1  
Failed to load resource: the server responded with a status of 403 ()
Error getting/creating conversation: Object
```

## Root Cause

The 403 error occurs because **Row Level Security (RLS) policies** are blocking the request. The `conversations` table has RLS enabled with the following policies:

1. **Users can SELECT their own conversations**: `user_id = auth.uid()`
2. **Admins can SELECT all conversations**: `public.is_admin()` returns true

The error happens when:
- A query is made without proper authentication (no JWT token)
- A query is made without the required `user_id` filter
- The `is_admin()` function is missing or not working correctly
- Queries are made before authentication completes

## Solutions Applied

### 1. Database Migration: Ensure `is_admin()` Function Exists

Created `database/migrations/ENSURE_IS_ADMIN_FUNCTION.sql` to ensure the `is_admin()` function exists and is properly configured:

```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

**Action Required**: Run this migration in your Supabase SQL Editor.

### 2. Frontend: Added Authentication Checks

Updated the following files to add proper authentication checks before making queries:

#### `frontend/src/lib/support-analytics.ts`
- Added `checkAuth()` helper function to verify authentication
- Added error handling for RLS permission errors (code `42501`)
- All admin queries now check authentication first

#### `frontend/src/hooks/useAdminStats.js`
- Added authentication check before querying conversations
- Added proper error handling for permission errors
- Set `retry: false` to prevent retrying on auth errors

#### `frontend/src/contexts/support-context.tsx`
- Added authentication verification in `getOrCreateConversation()`
- Added user ID validation to ensure `userRole.userId` matches `auth.uid()`
- Added authentication check in `loadAllConversations()` for admins
- Improved error handling for RLS permission errors

## How to Fix

### Step 1: Run the Database Migration

1. Open your Supabase Dashboard
2. Go to SQL Editor
3. Run the migration: `database/migrations/ENSURE_IS_ADMIN_FUNCTION.sql`

### Step 2: Verify Authentication

Make sure your Supabase client is properly initialized with authentication:

```javascript
// Check that session exists before making queries
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  // User is not authenticated
  console.error('User not authenticated');
}
```

### Step 3: Check User Role

For admin queries, verify the user has admin role:

```javascript
// Check if user is admin
const { data: profile } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', userId)
  .single();

const isAdmin = profile?.role === 'admin';
```

### Step 4: Verify RLS Policies

Check that your RLS policies are correctly set up:

```sql
-- Check existing policies
SELECT * FROM pg_policies 
WHERE tablename = 'conversations';
```

You should see:
- "Users can view their own conversations" (SELECT)
- "Admins can view all conversations" (SELECT)
- "Users can create their own conversations" (INSERT)
- "Admins can update all conversations" (UPDATE)

## Common Issues

### Issue 1: Query Made Before Authentication

**Symptom**: 403 errors on page load

**Solution**: Ensure queries only run after authentication is confirmed:

```javascript
useEffect(() => {
  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      // Now safe to make queries
      loadConversations();
    }
  };
  checkAuth();
}, []);
```

### Issue 2: `is_admin()` Function Missing

**Symptom**: Admin queries fail with 403

**Solution**: Run the `ENSURE_IS_ADMIN_FUNCTION.sql` migration

### Issue 3: User ID Mismatch

**Symptom**: Users can't access their own conversations

**Solution**: Ensure `userRole.userId` matches `auth.uid()`:

```javascript
const { data: { user } } = await supabase.auth.getUser();
if (user?.id !== userRole?.userId) {
  console.error('User ID mismatch');
}
```

## Testing

After applying fixes, test:

1. **Regular User**: Should be able to view/create their own conversation
2. **Admin User**: Should be able to view all conversations
3. **Unauthenticated**: Should get proper error messages, not 403

## Additional Notes

- The error code `42501` indicates insufficient privileges (RLS blocking)
- The error code `PGRST301` also indicates permission denied
- Always check authentication before making queries that require RLS
- The `is_admin()` function uses `SECURITY DEFINER` to bypass RLS when checking admin status

