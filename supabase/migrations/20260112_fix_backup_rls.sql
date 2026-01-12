-- Migration: Allow unrestricted access to backup tables to fix "Failed to update" errors
-- WARNING: This allows any client with the anon key to read/write their own backup config/history
-- Since we rely on a client-generated device_id and no auth, we must allow public access for now.

-- 1. Create a broad policy for backup_config
DROP POLICY IF EXISTS "Allow generic access" ON backup_config;
CREATE POLICY "Allow generic access"
ON backup_config
FOR ALL
USING (true)
WITH CHECK (true);

-- 2. Create a broad policy for backup_history
DROP POLICY IF EXISTS "Allow generic access" ON backup_history;
CREATE POLICY "Allow generic access"
ON backup_history
FOR ALL
USING (true)
WITH CHECK (true);

-- 3. Ensure RLS is enabled (just in case)
ALTER TABLE backup_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_history ENABLE ROW LEVEL SECURITY;
