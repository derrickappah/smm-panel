-- Migration: Add video_url to services table
ALTER TABLE services ADD COLUMN IF NOT EXISTS video_url TEXT;
