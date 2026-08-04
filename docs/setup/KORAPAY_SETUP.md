# Korapay Payment Integration Setup

This guide explains how to set up Korapay payment integration using serverless functions to bypass CORS restrictions.

## Overview

Korapay's API doesn't allow direct browser requests due to CORS restrictions. We've implemented serverless functions that act as a proxy between your frontend and Korapay's API.

## Serverless Functions

Three serverless functions are configured:

1. **`api/payments/korapay/initiate.js`** (or `/api/korapay-init`) - Initializes Korapay payments
2. **`api/payments/korapay/verify.js`** (or `/api/korapay-verify`) - Verifies payment status & credits balance
3. **`api/payments/korapay/webhook.js`** - Webhook for automatic background notification handling
4. **`api/manual-verify-korapay-deposit.js`** - Admin manual verification & re-sync endpoint

## Setup Steps

### 1. Get Korapay API Keys

1. Sign up for a Korapay account at [Korapay](https://korapay.com)
2. Navigate to your dashboard and get your:
   - **Public Key** (starts with `pk_`) - Used on frontend (optional)
   - **Secret Key** (starts with `sk_`) - Used on server (REQUIRED)

### 2. Configure Environment Variables

Add the following environment variable to your hosting platform (Vercel, Netlify, etc.):

```
KORAPAY_SECRET_KEY=sk_your_secret_key_here
```

### 3. Configure Callback URLs

In your Korapay dashboard, set up the following callback URLs:

- **Callback URL**: `https://yourdomain.com/payment/success?provider=korapay`
- **Webhook URL**: `https://yourdomain.com/api/payments/korapay/webhook`

## API Endpoint Reference

### Initialize Payment
```
POST /api/payments/korapay/initiate
Headers: Authorization: Bearer <user_jwt_token>
Body: {
  amount: number,
  description?: string
}
```

### Verify Payment
```
POST /api/payments/korapay/verify
Headers: Authorization: Bearer <user_jwt_token>
Body: {
  reference: string
}
```

### Admin Manual Verification
```
POST /api/manual-verify-korapay-deposit
Headers: Authorization: Bearer <admin_jwt_token>
Body: {
  transactionId?: string,
  reference?: string
}
```

## Security Notes

- **Never expose your secret key** in frontend code
- Always use environment variables for sensitive keys
- The secret key should only be used in serverless functions
- Regularly rotate your API keys for security

