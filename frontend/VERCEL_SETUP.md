# Vercel Deployment Setup

This guide will help you configure your application for deployment on Vercel.

## Environment Variables Setup

**CRITICAL:** You must configure environment variables in Vercel for your app to work properly.

### Step 1: Go to Vercel Dashboard

1. Go to https://vercel.com and sign in
2. Select your project
3. Go to **Settings** → **Environment Variables**

### Step 2: Add Required Environment Variables

Add the following environment variables:

#### Required for Authentication:
```
REACT_APP_SUPABASE_URL=https://your-project-id.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key-here
```

#### Required for Payments (if using Paystack):
```
REACT_APP_PAYSTACK_PUBLIC_KEY=pk_test_your-paystack-key
```

#### Optional (if using backend proxy):
```
REACT_APP_BACKEND_URL=https://your-backend-url.com
```

### Step 3: Get Your Supabase Credentials

1. Go to https://supabase.com
2. Select your project
3. Go to **Project Settings** → **API**
4. Copy:
   - **Project URL** → Use for `REACT_APP_SUPABASE_URL`
   - **anon public** key → Use for `REACT_APP_SUPABASE_ANON_KEY`

### Step 4: Set Environment Variables in Vercel

1. In Vercel Dashboard → Settings → Environment Variables
2. Click **Add New**
3. For each variable:
   - **Key**: Enter the variable name (e.g., `REACT_APP_SUPABASE_URL`)
   - **Value**: Enter the actual value
   - **Environment**: Select **Production**, **Preview**, and **Development** (or just Production if you only deploy to production)
4. Click **Save**

### Step 5: Redeploy

After adding environment variables:
1. Go to **Deployments** tab
2. Click the **⋯** menu on the latest deployment
3. Click **Redeploy**
4. Or push a new commit to trigger a new deployment

## Common Issues

### Error: 422 Unprocessable Content from Supabase

This usually means:
1. **Environment variables not set**: Make sure `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` are configured in Vercel
2. **Email confirmation required**: Check Supabase Dashboard → Authentication → Settings and disable email confirmation for testing
3. **Email already registered**: The user already has an account - they should log in instead
4. **Database not set up**: Make sure you've run the database schema SQL in Supabase

### Error: "Failed to execute 'clone' on 'Response'"

This is a secondary error caused by the monitoring tool (rrweb-recorder) trying to clone a response that's already been consumed. The real issue is the underlying 422 error from Supabase. Fix the Supabase configuration issue first.

### Verify Environment Variables

To check if environment variables are set correctly:
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Verify all required variables are listed
3. Make sure they're enabled for the correct environments (Production/Preview/Development)

## Testing After Deployment

1. Try to sign up with a new email
2. Check the browser console for any errors
3. If you see 422 errors, verify:
   - Environment variables are set in Vercel
   - Supabase project is active
   - Database tables are created
   - RLS policies are configured

## Additional Resources

- [Vercel Environment Variables Documentation](https://vercel.com/docs/concepts/projects/environment-variables)
- [Supabase Documentation](https://supabase.com/docs)
- See `TROUBLESHOOTING.md` for more error solutions

