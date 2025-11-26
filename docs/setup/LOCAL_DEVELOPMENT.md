# Local Development Guide

## Running Serverless Functions Locally

This project uses Vercel serverless functions for API endpoints. To run them locally, you need Vercel CLI.

### Quick Start

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Link your project** (optional, but recommended):
   ```bash
   vercel link
   ```

4. **Create `.env.local` file** in the root directory:
   ```
   KORAPAY_SECRET_KEY=sk_your_test_key_here
   PAYSTACK_SECRET_KEY=sk_test_your_key_here
   ```

5. **Run development server**:
   ```bash
   vercel dev
   ```

   This will:
   - Start your React app on `http://localhost:3000`
   - Make serverless functions available at `http://localhost:3000/api/*`
   - Load environment variables from `.env.local`

### Testing Payment Integrations Locally

#### For Korapay:

Since Korapay needs to redirect back to your app, localhost won't work directly. Use one of these options:

**Option 1: Use ngrok (Best for testing)**
```bash
# Terminal 1: Start your app
vercel dev

# Terminal 2: Start ngrok
ngrok http 3000

# Use the ngrok URL (e.g., https://abc123.ngrok.io) in:
# - Korapay dashboard callback settings
# - Update callback_url in code temporarily for testing
```

**Option 2: Deploy to Vercel Preview**
- Push to a branch
- Vercel creates a preview deployment
- Use the preview URL for testing
- This is the most reliable method

**Option 3: Mock the API responses**
- Temporarily modify serverless functions to return mock data
- Good for UI/UX testing without actual payments

### Available API Endpoints (Local)

When running `vercel dev`, these endpoints are available:

- `http://localhost:3000/api/korapay-init` - Initialize Korapay payment
- `http://localhost:3000/api/korapay-verify` - Verify Korapay payment
- `http://localhost:3000/api/korapay-callback` - Handle Korapay webhook
- `http://localhost:3000/api/verify-paystack-payment` - Verify Paystack payment

### Environment Variables

Create `.env.local` in the root directory with:

```env
# Korapay
KORAPAY_SECRET_KEY=sk_test_your_key_here

# Paystack
PAYSTACK_SECRET_KEY=sk_test_your_key_here

# Supabase (if not using .env in frontend folder)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Troubleshooting

**"Functions not found" or 404 errors:**
- Make sure you're using `vercel dev`, not `npm start`
- Check that `api/` folder exists in the root directory
- Verify `vercel.json` has the correct rewrites

**"Environment variable not found":**
- Create `.env.local` in the root directory (not in `frontend/`)
- Restart `vercel dev` after adding variables
- Check variable names match exactly (case-sensitive)

**"CORS errors":**
- Serverless functions should handle CORS automatically
- If issues persist, check function headers in `api/*.js` files

**"Callback not working":**
- Localhost URLs won't work for external service callbacks
- Use ngrok or deploy to a preview environment
- Check that callback URLs in payment provider dashboards match

### Development Workflow

1. **Start development**:
   ```bash
   vercel dev
   ```

2. **Make changes**:
   - Frontend code: Hot reloads automatically
   - Serverless functions: Restart `vercel dev` after changes

3. **Test API endpoints**:
   ```bash
   curl -X POST http://localhost:3000/api/korapay-init \
     -H "Content-Type: application/json" \
     -d '{"amount": 10, "reference": "test123", "customer": {"name": "Test", "email": "test@example.com"}}'
   ```

4. **Check logs**:
   - Serverless function logs appear in the terminal running `vercel dev`
   - Frontend logs appear in browser console

### Production vs Local Development

| Feature | Local (`vercel dev`) | Production |
|---------|---------------------|------------|
| Serverless Functions | ✅ Works | ✅ Works |
| Environment Variables | `.env.local` | Vercel Dashboard |
| Callback URLs | Need ngrok | Use production URL |
| Hot Reload | ✅ Yes | N/A |
| API Endpoints | `localhost:3000/api/*` | `yourdomain.com/api/*` |

