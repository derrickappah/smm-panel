# JB SMM Panel API Integration Setup

You have **three options** for integrating with JB SMM Panel API:

## Option 1: Vercel Serverless Functions (Recommended) ✅

**No separate backend server needed!** The app includes serverless functions that run on Vercel.

### Setup:

1. **Add environment variables in Vercel:**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add:
     ```
     JBSMMPANEL_API_URL=https://jbsmmpanel.com/api/v2
     JBSMMPANEL_API_KEY=your-actual-jbsmmpanel-api-key
     ```
   - Enable for **Production**, **Preview**, and **Development**

2. **The serverless functions are in `/api/jbsmmpanel/`:**
   - `services.js` - Fetch services
   - `order.js` - Place orders
   - `status.js` - Check order status
   - `balance.js` - Get account balance

3. **Benefits:**
   - ✅ No separate backend deployment needed
   - ✅ API keys stay secure (server-side only)
   - ✅ No CORS issues (same domain)
   - ✅ Automatic scaling
   - ✅ Works seamlessly with Vercel

### How It Works:

- In production, the frontend automatically uses `/api/jbsmmpanel/*` endpoints
- These are Vercel serverless functions that proxy requests to JB SMM Panel
- Your API key is never exposed to the frontend

## Option 2: Separate Backend Server

If you prefer a separate backend:

1. **Deploy the backend folder** to Railway, Render, Heroku, etc.
2. **Set backend environment variables:**
   ```
   JBSMMPANEL_API_URL=https://jbsmmpanel.com/api/v2
   JBSMMPANEL_API_KEY=your-jbsmmpanel-api-key
   PORT=5000
   ```
3. **Add to Vercel environment variables:**
   ```
   REACT_APP_BACKEND_URL=https://your-backend-app.railway.app
   ```

## Option 3: Direct API Calls (Not Recommended)

⚠️ **Security Warning:** This exposes your API key in the frontend code!

You can call JB SMM Panel API directly, but:
- ❌ API key will be visible in browser
- ❌ May have CORS issues
- ❌ Not secure for production

If you still want to try:
1. Set in Vercel environment variables:
   ```
   REACT_APP_JBSMMPANEL_API_KEY=your-api-key
   REACT_APP_JBSMMPANEL_API_URL=https://jbsmmpanel.com/api/v2
   ```
2. The app will attempt direct calls (may fail due to CORS)

## API Details

- **API Base URL**: `https://jbsmmpanel.com/api/v2`
- **Method**: POST for all endpoints
- **Authentication**: API key passed as `key` parameter in request body
- **Service IDs**: Numeric (INTEGER)
- **Order IDs**: Numeric (INTEGER)

## Database Setup

Before using JB SMM Panel integration, you need to run the database migrations:

1. Run `database/migrations/ADD_JBSMMPANEL_COLUMNS.sql` to add the required columns
2. Run `database/migrations/UPDATE_PLACE_ORDER_FUNCTION_JBSMMPANEL.sql` to update the order placement function

## Recommendation

**Use Option 1 (Vercel Serverless Functions)** - It's the easiest, most secure, and requires no separate backend deployment!
