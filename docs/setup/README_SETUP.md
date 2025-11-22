# Quick Setup Guide

## ⚠️ IMPORTANT: Configure Supabase First!

Before running the app, you **must** configure your Supabase credentials.

## Step 1: Get Supabase Credentials

1. Go to https://supabase.com
2. Sign up or log in
3. Create a new project (or use existing)
4. Wait for project to be ready
5. Go to **Project Settings** → **API**
6. Copy:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (long string)

## Step 2: Update .env File

Open `frontend/.env` and replace the placeholder values:

```env
REACT_APP_SUPABASE_URL=https://your-actual-project-id.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-actual-anon-key-here
REACT_APP_PAYSTACK_PUBLIC_KEY=pk_test_your-paystack-public-key
REACT_APP_BACKEND_URL=http://localhost:5000
```

**Replace:**
- `https://your-project-id.supabase.co` → Your actual Supabase URL
- `your-anon-key-here` → Your actual anon key
- `pk_test_your-paystack-public-key` → Your Paystack public key (get it from [Paystack Dashboard](https://dashboard.paystack.com/#/settings/developer))
- `http://localhost:5000` → Backend proxy server URL (default, change if backend runs on different port)

## Step 3: Set Up Database

1. Go to your Supabase project
2. Open **SQL Editor**
3. Open the file `SUPABASE_DATABASE_SETUP.sql` from the project root
4. Copy the entire SQL script and paste it into the SQL Editor
5. Click **Run** to execute the script
6. Verify tables were created by going to **Table Editor** and checking for:
   - `profiles`
   - `services`
   - `orders`
   - `transactions`

**Note:** The SQL script in `SUPABASE_DATABASE_SETUP.sql` is the most up-to-date version with all RLS policies. You can also use the schema below as reference.

## Step 4: Run the App

```bash
cd frontend
npm install
npm start
```

## Database Schema

Run this SQL in Supabase SQL Editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    balance DECIMAL(10, 2) DEFAULT 0.0,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Services table
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform TEXT NOT NULL,
    service_type TEXT NOT NULL,
    name TEXT NOT NULL,
    rate DECIMAL(10, 2) NOT NULL,
    min_quantity INTEGER NOT NULL,
    max_quantity INTEGER NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    link TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    total_cost DECIMAL(10, 2) NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('deposit', 'order')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies (basic - adjust as needed)
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Anyone can view services" ON services FOR SELECT USING (true);
CREATE POLICY "Users can view own orders" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own orders" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own transactions" ON transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own transactions" ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name, balance, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
        0.0,
        'user'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## Troubleshooting

**Error: "Failed to fetch" or "ERR_NAME_NOT_RESOLVED"**
- ✅ Check that `.env` file has real Supabase credentials (not placeholders)
- ✅ Restart the dev server after updating `.env`
- ✅ Verify Supabase project is active

**Error: "Supabase not configured"**
- ✅ Make sure `.env` file exists in `frontend/` directory
- ✅ Check that variable names start with `REACT_APP_`
- ✅ Restart the dev server

**Error: "Table does not exist"**
- ✅ Run the database schema SQL in Supabase SQL Editor
- ✅ Check that all tables were created successfully

