-- Create login_activity table to track all login attempts
CREATE TABLE IF NOT EXISTS login_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    login_method TEXT NOT NULL, -- 'master_pin', 'super_admin_pin', 'biometrics', 'security_bypass'
    is_authorized_device BOOLEAN NOT NULL DEFAULT false,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_login_activity_created_at ON login_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_activity_device_id ON login_activity(device_id);
CREATE INDEX IF NOT EXISTS idx_login_activity_is_authorized ON login_activity(is_authorized_device);

-- Enable RLS
ALTER TABLE login_activity ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (or anon for now since app uses anon key)
CREATE POLICY "Allow all operations on login_activity" ON login_activity
    FOR ALL USING (true) WITH CHECK (true);

-- Create function to cleanup old login activity (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_login_activity()
RETURNS void AS $$
BEGIN
    DELETE FROM login_activity WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;
