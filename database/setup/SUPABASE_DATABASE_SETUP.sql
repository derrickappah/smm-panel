-- Complete Database Setup Script for BoostUp GH
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables if they exist (be careful in production!)
-- DROP TABLE IF EXISTS transactions CASCADE;
-- DROP TABLE IF EXISTS orders CASCADE;
-- DROP TABLE IF EXISTS services CASCADE;
-- DROP TABLE IF EXISTS profiles CASCADE;

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
    smmgen_service_id TEXT, -- SMMGen API service ID for integration
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
    smmgen_order_id TEXT, -- SMMGen API order ID for tracking
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

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Anyone can view services" ON services;
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Users can create own orders" ON orders;
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can create own transactions" ON transactions;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all transactions" ON transactions;
DROP POLICY IF EXISTS "Admins can update transactions" ON transactions;
DROP POLICY IF EXISTS "Admins can update orders" ON orders;

-- Profiles RLS Policies
CREATE POLICY "Users can view own profile" 
    ON profiles FOR SELECT 
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
    ON profiles FOR UPDATE 
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" 
    ON profiles FOR INSERT 
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" 
    ON profiles FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Services RLS Policies
CREATE POLICY "Anyone can view services" 
    ON services FOR SELECT 
    USING (true);

-- Orders RLS Policies
CREATE POLICY "Users can view own orders" 
    ON orders FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own orders" 
    ON orders FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all orders" 
    ON orders FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update orders" 
    ON orders FOR UPDATE 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Transactions RLS Policies
CREATE POLICY "Users can view own transactions" 
    ON transactions FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own transactions" 
    ON transactions FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all transactions" 
    ON transactions FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update transactions" 
    ON transactions FOR UPDATE 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name, balance, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
        0.0,
        'user'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Verify tables were created
SELECT 
    table_name,
    CASE WHEN table_name IN ('profiles', 'services', 'orders', 'transactions') 
         THEN '✅ Created' 
         ELSE '❌ Missing' 
    END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'services', 'orders', 'transactions')
ORDER BY table_name;

