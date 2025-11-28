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

#### Required for Paystack Webhook (Server-Side):
```
PAYSTACK_SECRET_KEY=sk_test_your-paystack-secret-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

**Note:** These are required for the Paystack webhook endpoint (`/api/paystack-webhook`) to work properly:
- `PAYSTACK_SECRET_KEY`: Your Paystack secret key (starts with `sk_`). Get this from Paystack Dashboard → Settings → API Keys & Webhooks
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (for server-side database operations). Get this from Supabase Dashboard → Project Settings → API → service_role key (keep this secret!)
- The webhook can use either `SUPABASE_URL` or `REACT_APP_SUPABASE_URL` (already set above)

#### Required for SMMGen Integration (if using SMMGen):
```
SMMGEN_API_URL=https://smmgen.com/api/v2
SMMGEN_API_KEY=your-smmgen-api-key-here
```

**Note:** These are used by Vercel serverless functions (in `/api/smmgen` folder). The API key stays secure on the server side.

#### Optional (if using separate backend proxy instead of serverless functions):
```
REACT_APP_BACKEND_URL=https://your-backend-url.com
```

**Note:** By default, the app uses Vercel serverless functions (no separate backend needed). Only set `REACT_APP_BACKEND_URL` if you want to use a separate backend server.

### Step 3: Get Your Supabase Credentials

1. Go to https://supabase.com
2. Select your project
3. Go to **Project Settings** → **API**
4. Copy:
   - **Project URL** → Use for `REACT_APP_SUPABASE_URL`
   - **anon public** key → Use for `REACT_APP_SUPABASE_ANON_KEY`
   - **service_role** key → Use for `SUPABASE_SERVICE_ROLE_KEY` (⚠️ Keep this secret! Only use server-side)

**Important:** The `service_role` key has admin privileges and bypasses Row Level Security. Never expose it in client-side code. Only use it in serverless functions.

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

### Error: Paystack Webhook "Invalid webhook signature" (401)

If you see `POST 401` errors on `/api/paystack-webhook` with "Invalid webhook signature":

1. **Verify `PAYSTACK_SECRET_KEY` is set correctly:**
   - Go to Vercel Dashboard → Settings → Environment Variables
   - Ensure `PAYSTACK_SECRET_KEY` is set with your Paystack secret key (starts with `sk_`)
   - Make sure you're using the correct key (test vs live)
   - The key in Vercel must match the key in your Paystack Dashboard

2. **Check Paystack Dashboard webhook configuration:**
   - Go to Paystack Dashboard → Settings → API Keys & Webhooks
   - Verify your webhook URL is correct: `https://your-domain.com/api/paystack-webhook`
   - Ensure the webhook is enabled

3. **Verify Supabase credentials:**
   - Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel
   - Ensure `REACT_APP_SUPABASE_URL` or `SUPABASE_URL` is set

4. **Redeploy after adding variables:**
   - After adding environment variables, you must redeploy for changes to take effect
   - Go to Deployments → Click ⋯ on latest deployment → Redeploy

5. **Note on signature verification:**
   - Paystack signs the exact raw request body
   - Vercel automatically parses JSON bodies, which may cause signature mismatches
   - If issues persist, check Vercel logs for detailed error information

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

## SMMGen Integration Setup

### Option 1: Use Vercel Serverless Functions (Recommended - No Separate Backend Needed!)

The app includes Vercel serverless functions in the `/api/smmgen` folder. These run on Vercel's edge network and don't require a separate backend server.

1. **Set SMMGen environment variables in Vercel:**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add:
     ```
     SMMGEN_API_URL=https://smmgen.com/api/v2
     SMMGEN_API_KEY=your-actual-smmgen-api-key
     ```
   - Enable for **Production**, **Preview**, and **Development**

2. **That's it!** The serverless functions will automatically:
   - Handle SMMGen API calls
   - Keep your API key secure (server-side only)
   - Avoid CORS issues (same domain)
   - Work seamlessly with your frontend

### Option 2: Use Separate Backend Server

If you prefer a separate backend server:

1. Deploy the `backend` folder to:
   - [Railway](https://railway.app)
   - [Render](https://render.com)
   - [Heroku](https://heroku.com)
   - [Fly.io](https://fly.io)

2. Set environment variables in your backend:
   ```
   SMMGEN_API_URL=https://smmgen.com/api/v2
   SMMGEN_API_KEY=your-smmgen-api-key
   PORT=5000
   ```

3. Add to Vercel environment variables:
   ```
   REACT_APP_BACKEND_URL=https://your-backend-app.railway.app
   ```

### Option 3: Use Without SMMGen

If you don't configure SMMGen:
- The app will work normally
- Orders will be created locally in your Supabase database
- SMMGen integration will be automatically skipped
- No errors will be shown (graceful degradation)

## Additional Resources

- [Vercel Environment Variables Documentation](https://vercel.com/docs/concepts/projects/environment-variables)
- [Supabase Documentation](https://supabase.com/docs)
- See `TROUBLESHOOTING.md` for more error solutions

