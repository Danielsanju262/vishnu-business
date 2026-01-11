-- Create table to store Google OAuth refresh tokens
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS google_oauth_tokens (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT UNIQUE NOT NULL,
    refresh_token TEXT NOT NULL,
    access_token TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS policies (tokens should only be accessed via Edge Functions with service role)
ALTER TABLE google_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- No direct access from client - only via Edge Functions
-- The Edge Function uses the service role key which bypasses RLS

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_google_oauth_tokens_device_id ON google_oauth_tokens(device_id);

-- Add comment for documentation
COMMENT ON TABLE google_oauth_tokens IS 'Stores Google OAuth refresh tokens for persistent Drive backup authentication';
