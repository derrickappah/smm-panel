# SMMGen API Integration Setup

## ⚠️ Important: API Endpoint Issue

**Current Status (January 2026):** The configured SMMGen API endpoint `https://smmgen.com/api/v2` is returning 404 Not Found errors. This indicates the API may have changed or been moved.

### Troubleshooting Steps:
1. Check Vercel function logs for detailed error information
2. Verify your SMMGen API key is valid and active
3. Contact SMMGen support for the correct API endpoint
4. Consider alternative SMM service providers if SMMGen API is discontinued

### Alternative Providers:
If SMMGen is no longer available, consider:
- **SMMCost**: Alternative API provider
- **JBSMM Panel**: Another SMM service API
- **Local SMM providers**: Check with local service providers

You have **three options** for integrating with SMMGen API:

## Option 1: Vercel Serverless Functions (Recommended) ✅

**No separate backend server needed!** The app includes serverless functions that run on Vercel.

### Setup:

1. **Add environment variables in Vercel:**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add:
     ```
     SMMGEN_API_URL=https://smmgen.com/api/v2
     SMMGEN_API_KEY=your-actual-smmgen-api-key
     ```
   - Enable for **Production**, **Preview**, and **Development**

2. **The serverless functions are in `/api/smmgen/`:**
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

- In production, the frontend automatically uses `/api/smmgen/*` endpoints
- These are Vercel serverless functions that proxy requests to SMMGen
- Your API key is never exposed to the frontend

### Error Diagnostics:

The serverless functions now include enhanced error handling:
- **Network connectivity tests** before API calls
- **Detailed error logging** with specific error types
- **Endpoint validation** (404 detection)
- **Timeout handling** (20-second limit)
- **Clear error messages** for troubleshooting

## Option 2: Separate Backend Server

If you prefer a separate backend:

1. **Deploy the backend folder** to Railway, Render, Heroku, etc.
2. **Set backend environment variables:**
   ```
   SMMGEN_API_URL=https://smmgen.com/api/v2
   SMMGEN_API_KEY=your-smmgen-api-key
   PORT=5000
   ```
3. **Add to Vercel environment variables:**
   ```
   REACT_APP_BACKEND_URL=https://your-backend-app.railway.app
   ```

## Option 3: Direct API Calls (Not Recommended)

⚠️ **Security Warning:** This exposes your API key in the frontend code!

You can call SMMGen API directly, but:
- ❌ API key will be visible in browser
- ❌ May have CORS issues
- ❌ Not secure for production

If you still want to try:
1. Set in Vercel environment variables:
   ```
   REACT_APP_SMMGEN_API_KEY=your-api-key
   REACT_APP_SMMGEN_API_URL=https://smmgen.com/api/v2
   ```
2. The app will attempt direct calls (may fail due to CORS)

## Recommendation

**Use Option 1 (Vercel Serverless Functions)** - It's the easiest, most secure, and requires no separate backend deployment!

