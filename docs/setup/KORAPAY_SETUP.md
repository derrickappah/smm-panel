# Korapay Payment Integration Setup

This guide explains how to set up Korapay payment integration using serverless functions to bypass CORS restrictions.

## Overview

Korapay's API doesn't allow direct browser requests due to CORS restrictions. We've implemented serverless functions that act as a proxy between your frontend and Korapay's API.

## Serverless Functions

Three serverless functions have been created:

1. **`api/korapay-init.js`** - Initializes Korapay payments
2. **`api/korapay-verify.js`** - Verifies payment status
3. **`api/korapay-callback.js`** - Handles payment callbacks

## Setup Steps

### 1. Get Korapay API Keys

1. Sign up for a Korapay account at [Korapay](https://korapay.com)
2. Navigate to your dashboard and get your:
   - **Public Key** (starts with `pk_`) - Used on frontend (optional, not needed for serverless approach)
   - **Secret Key** (starts with `sk_`) - Used on server (REQUIRED)

### 2. Configure Environment Variables

Add the following environment variable to your hosting platform (Vercel, Netlify, etc.):

```
KORAPAY_SECRET_KEY=sk_your_secret_key_here
```

**For Vercel:**
1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add `KORAPAY_SECRET_KEY` with your secret key value
4. Redeploy your application

### 3. Update Korapay API Endpoint (if needed)

The serverless function uses the endpoint:
```
https://api.korapay.com/merchant/api/v1/charges/initialize
```

If Korapay uses a different endpoint, update it in `api/korapay-init.js` at line 70.

### 4. Configure Callback URLs

In your Korapay dashboard, set up the following callback URLs:

- **Callback URL**: `https://yourdomain.com/payment/callback?method=korapay`
- **Webhook URL**: `https://yourdomain.com/api/korapay-callback`

### 5. Test the Integration

1. Make a test deposit using Korapay
2. You should be redirected to Korapay's payment page
3. After payment, you'll be redirected back to `/payment/callback`
4. The callback page will verify the payment and update your balance

## How It Works

1. **User initiates payment**: Frontend calls `/api/korapay-init` with payment details
2. **Serverless function**: Makes API call to Korapay (bypasses CORS)
3. **Redirect**: User is redirected to Korapay's payment page
4. **Payment completion**: Korapay redirects back to `/payment/callback?reference=...`
5. **Verification**: Callback page verifies payment via `/api/korapay-verify`
6. **Update**: Transaction and balance are updated in the database

## Local Development Setup

### Running Serverless Functions Locally

To test Korapay integration on localhost, you need to use Vercel CLI:

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Link your project**:
   ```bash
   vercel link
   ```

4. **Set environment variables locally**:
   Create a `.env.local` file in the root directory:
   ```
   KORAPAY_SECRET_KEY=sk_your_secret_key_here
   ```

5. **Run development server with serverless functions**:
   ```bash
   vercel dev
   ```
   This will start both your frontend and serverless functions on localhost.

### Important Notes for Local Development

⚠️ **Callback URLs won't work on localhost directly** because Korapay needs to redirect to a publicly accessible URL.

**Option 1: Use ngrok (Recommended for testing)**
1. Install ngrok: `npm install -g ngrok` or download from [ngrok.com](https://ngrok.com)
2. Start your app: `vercel dev` (runs on port 3000 by default)
3. In another terminal, run: `ngrok http 3000`
4. Use the ngrok URL (e.g., `https://abc123.ngrok.io`) for:
   - Callback URL in Korapay dashboard: `https://abc123.ngrok.io/payment/callback?method=korapay`
   - Update callback_url in your code to use ngrok URL during development

**Option 2: Test on deployed environment**
- Deploy to Vercel preview/staging environment
- Use the deployed URL for testing
- This is the most reliable way to test payment flows

**Option 3: Mock the payment flow**
- For UI testing, you can temporarily mock the serverless function responses
- This won't test actual payment processing but helps with UI development

### Local Development Workflow

1. Start local dev server: `vercel dev`
2. Frontend runs on: `http://localhost:3000`
3. API functions available at: `http://localhost:3000/api/korapay-init`
4. Set up ngrok for callbacks (if testing full flow)
5. Use ngrok URL in Korapay dashboard for callbacks

## Troubleshooting

### "Korapay is not configured on the server"
- Make sure `KORAPAY_SECRET_KEY` is set in your environment variables
- For localhost: Check `.env.local` file exists and has the key
- For production: Verify in Vercel dashboard → Settings → Environment Variables
- Redeploy your application after adding the environment variable

### "Failed to initialize Korapay payment"
- Check that your Korapay secret key is correct
- Verify the API endpoint URL matches Korapay's documentation
- Check serverless function logs for detailed error messages
- For localhost: Make sure you're using `vercel dev` not just `npm start`

### Payment verification fails
- Ensure the callback URL is correctly configured in Korapay dashboard
- For localhost: Use ngrok URL or test on deployed environment
- Check that the reference parameter is being passed correctly
- Verify the transaction exists in your database with the correct reference

### Functions not working on localhost
- Make sure you're using `vercel dev` command, not just `npm start`
- The regular React dev server won't run serverless functions
- Install Vercel CLI: `npm install -g vercel`

## API Endpoint Reference

### Initialize Payment
```
POST /api/korapay-init
Body: {
  amount: number,
  currency: 'GHS',
  reference: string,
  customer: { name: string, email: string },
  notification_url: string,
  callback_url: string
}
```

### Verify Payment
```
POST /api/korapay-verify
Body: {
  reference: string
}
```

## Security Notes

- **Never expose your secret key** in frontend code
- Always use environment variables for sensitive keys
- The secret key should only be used in serverless functions
- Regularly rotate your API keys for security

