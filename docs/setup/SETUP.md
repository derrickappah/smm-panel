# Quick Setup Guide

## Step 1: Install Dependencies

```bash
cd backend
npm install
```

## Step 2: Configure Environment

Create a `.env` file in the `backend` directory:

```env
SMMGEN_API_URL=https://smmgen.com/api/v2
SMMGEN_API_KEY=05b299d99f4ef2052da5...
PORT=5000
```

**Important:** Replace `05b299d99f4ef2052da5...` with your actual SMMGen API key.

## Step 3: Start the Backend Server

```bash
npm start
```

You should see:
```
🚀 SMMGen Proxy Server running on http://localhost:5000
📡 SMMGen API URL: https://smmgen.com/api/v2
🔑 API Key configured: Yes
```

## Step 4: Update Frontend Configuration

Make sure your `frontend/.env` file includes:

```env
REACT_APP_BACKEND_URL=http://localhost:5000
```

## Step 5: Restart Frontend

Restart your frontend dev server to load the new environment variable.

## Troubleshooting

- **"Backend proxy server not running"**: Make sure the backend server is running on port 5000
- **"SMMGen API key not configured"**: Check your `backend/.env` file has the correct API key
- **CORS errors**: The backend proxy should handle this. Make sure you're calling the backend, not SMMGen directly

