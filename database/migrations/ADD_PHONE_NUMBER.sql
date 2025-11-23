-- Add Phone Number to Profiles Table
-- This migration adds a phone_number column to the profiles table
-- Run this in Supabase SQL Editor

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS phone_number TEXT;

COMMENT ON COLUMN profiles.phone_number IS 'User phone number for contact purposes';

-- Optional: Add an index if you frequently query by phone number
-- CREATE INDEX IF NOT EXISTS idx_profiles_phone_number ON profiles(phone_number);

