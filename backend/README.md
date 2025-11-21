# SMMGen Backend Proxy Server

This backend server acts as a proxy to handle SMMGen API requests, avoiding CORS issues when calling from the frontend.

## Setup

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Configure environment variables:**
   Create a `.env` file in the `backend` directory:
   ```env
   SMMGEN_API_URL=https://smmgen.com/api/v2
   SMMGEN_API_KEY=your-smmgen-api-key-here
   PORT=5000
   ```

3. **Start the server:**
   ```bash
   npm start
   ```
   
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

## API Endpoints

- `POST /api/smmgen/services` - Fetch all services from SMMGen
- `POST /api/smmgen/order` - Place an order via SMMGen
  - Body: `{ service: string, link: string, quantity: number }`
- `POST /api/smmgen/status` - Get order status from SMMGen
  - Body: `{ order: string }`
- `POST /api/smmgen/balance` - Get account balance from SMMGen
- `GET /health` - Health check endpoint

## Frontend Configuration

Make sure your frontend `.env` file includes:
```env
REACT_APP_BACKEND_URL=http://localhost:5000
```

## Notes

- The backend proxy handles all SMMGen API calls to avoid CORS restrictions
- API keys are stored securely on the backend, not exposed to the frontend
- The server runs on port 5000 by default

