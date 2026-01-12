-- Migration: Add backup configuration and history tables for server-side scheduled backups
-- Run this in Supabase SQL Editor

-- 1. Create backup configuration table
CREATE TABLE IF NOT EXISTS backup_config (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT UNIQUE NOT NULL,
    enabled BOOLEAN DEFAULT true,
    backup_time TIME DEFAULT '07:00:00', -- Default 7 AM
    last_backup_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE backup_config ENABLE ROW LEVEL SECURITY;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_backup_config_device_id ON backup_config(device_id);

COMMENT ON TABLE backup_config IS 'Stores backup configuration per device for server-side scheduled backups';


-- 2. Create backup history table
CREATE TABLE IF NOT EXISTS backup_history (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT NOT NULL,
    file_name TEXT,
    file_size INTEGER,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
    error_message TEXT,
    backup_type TEXT DEFAULT 'scheduled' CHECK (backup_type IN ('scheduled', 'manual', 'auto')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE backup_history ENABLE ROW LEVEL SECURITY;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_backup_history_device_id ON backup_history(device_id);
CREATE INDEX IF NOT EXISTS idx_backup_history_created_at ON backup_history(created_at DESC);

COMMENT ON TABLE backup_history IS 'Stores backup history for tracking and debugging';


-- 3. Enable pg_cron extension (required for scheduled jobs)
-- Note: This needs to be enabled via Supabase Dashboard > Database > Extensions
-- Or run: CREATE EXTENSION IF NOT EXISTS pg_cron;


-- 4. Create the scheduled job to run at 7 AM IST (1:30 AM UTC)
-- IST is UTC+5:30, so 7:00 AM IST = 1:30 AM UTC
-- 
-- IMPORTANT: Run this AFTER deploying the Edge Function
-- You can run this in the SQL Editor:
/*
SELECT cron.schedule(
    'daily-backup-7am-ist',           -- Job name
    '30 1 * * *',                     -- Cron expression: 1:30 AM UTC = 7:00 AM IST
    $$
    SELECT net.http_post(
        url := 'https://YOUR_SUPABASE_PROJECT.supabase.co/functions/v1/scheduled-backup',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
        body := '{}'::jsonb
    ) AS request_id;
    $$
);
*/

-- To check scheduled jobs:
-- SELECT * FROM cron.job;

-- To delete a scheduled job:
-- SELECT cron.unschedule('daily-backup-7am-ist');
