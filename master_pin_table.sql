-- Create app_settings table for storing master PIN
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    master_pin TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure only one row can exist
    CONSTRAINT single_row CHECK (id = 1)
);

-- Enable RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read/write (since we're using PIN-based auth, not user-based)
-- In production, you might want to add more restrictions
CREATE POLICY "Allow all access to app_settings" ON app_settings
    FOR ALL USING (true) WITH CHECK (true);
