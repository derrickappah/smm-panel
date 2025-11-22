# Supabase Setup for Frontend

This application now uses Supabase directly in the frontend (no backend server needed).

## Setup Instructions

1. **Create Supabase Project:**
   - Go to https://supabase.com and create a new project
   - Wait for the project to be fully provisioned

2. **Get Your Credentials:**
   - Go to Project Settings → API
   - Copy the **Project URL** (REACT_APP_SUPABASE_URL)
   - Copy the **anon public key** (REACT_APP_SUPABASE_ANON_KEY)

3. **Set Up Database Schema:**
   - Go to the SQL Editor in your Supabase dashboard
   - Create a new file or paste the SQL schema
   - You'll need to create tables: `profiles`, `services`, `orders`, `transactions`
   - See the database schema documentation for the full SQL

4. **Configure Environment Variables:**
   - Update `frontend/.env` with your Supabase credentials:
     ```
     REACT_APP_SUPABASE_URL=https://your-project-id.supabase.co
     REACT_APP_SUPABASE_ANON_KEY=your-anon-key-here
     ```

5. **Install Dependencies:**
   ```bash
   cd frontend
   npm install
   ```

6. **Start the Application:**
   ```bash
   npm start
   ```

## Database Schema

You need to create the following tables in Supabase:

- **profiles** - User profiles (extends auth.users)
- **services** - Available services
- **orders** - User orders
- **transactions** - Deposits and transactions

Make sure to:
- Enable Row Level Security (RLS)
- Set up proper RLS policies
- Create a trigger to auto-create profiles on user signup

## Features

- ✅ Direct Supabase Auth (no backend needed)
- ✅ Real-time data with Supabase subscriptions
- ✅ Row Level Security for data protection
- ✅ Automatic session management

## Troubleshooting

- **"Missing Supabase environment variables"**: Make sure `.env` file has correct credentials
- **"Table does not exist"**: Run the database schema SQL in Supabase SQL Editor
- **Authentication errors**: Check RLS policies are set up correctly
- **CORS errors**: Supabase handles CORS automatically, no configuration needed

