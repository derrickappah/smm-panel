-- Add Moolre Verified Phones Table
-- This table stores phone numbers that have been verified via OTP for Moolre payments
-- Once a phone number + channel combination is verified, OTP is not required for subsequent transactions
-- Run this in Supabase SQL Editor

-- Create the moolre_verified_phones table
CREATE TABLE IF NOT EXISTS moolre_verified_phones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('13', '14', '15')), -- 13=MTN, 14=Vodafone, 15=AirtelTigo
    verified_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, phone_number, channel)
);

-- Add comments for documentation
COMMENT ON TABLE moolre_verified_phones IS 'Stores phone numbers that have been verified via Moolre OTP. Once verified, OTP is not required for subsequent transactions.';
COMMENT ON COLUMN moolre_verified_phones.user_id IS 'User who owns this verified phone number';
COMMENT ON COLUMN moolre_verified_phones.phone_number IS 'Normalized phone number (spaces, dashes removed)';
COMMENT ON COLUMN moolre_verified_phones.channel IS 'Mobile Money network: 13=MTN, 14=Vodafone, 15=AirtelTigo';
COMMENT ON COLUMN moolre_verified_phones.verified_at IS 'Timestamp when phone number was verified via OTP';

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_moolre_verified_phones_user_id ON moolre_verified_phones(user_id);
CREATE INDEX IF NOT EXISTS idx_moolre_verified_phones_phone_channel ON moolre_verified_phones(user_id, phone_number, channel);

-- Enable Row Level Security
ALTER TABLE moolre_verified_phones ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own verified phones" ON moolre_verified_phones;
DROP POLICY IF EXISTS "Users can insert own verified phones" ON moolre_verified_phones;
DROP POLICY IF EXISTS "Users can delete own verified phones" ON moolre_verified_phones;

-- RLS Policies
CREATE POLICY "Users can view own verified phones" 
    ON moolre_verified_phones FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own verified phones" 
    ON moolre_verified_phones FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own verified phones" 
    ON moolre_verified_phones FOR DELETE 
    USING (auth.uid() = user_id);

-- Grant permissions to service_role for backend operations
GRANT SELECT, INSERT ON moolre_verified_phones TO service_role;
