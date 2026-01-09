-- Insights Schema for Daily Business Assistant
-- Run this in your Supabase SQL editor

-- 1. Insight Items Table - Stores tasks and insights
CREATE TABLE IF NOT EXISTS insight_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN ('task', 'insight')),
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning')),
  source TEXT CHECK (source IN ('sales', 'payments', 'expenses', 'payables', 'general')),
  generated_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE insight_items ENABLE ROW LEVEL SECURITY;

-- RLS Policy (open access like other tables)
CREATE POLICY "Enable all access for insight_items" ON insight_items 
  FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE insight_items;

-- 2. Insight Preferences Table - User settings for notifications
CREATE TABLE IF NOT EXISTS insight_preferences (
  id INTEGER PRIMARY KEY DEFAULT 1,
  notification_enabled BOOLEAN DEFAULT true,
  notification_time TIME DEFAULT '06:00:00',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE insight_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Enable all access for insight_preferences" ON insight_preferences 
  FOR ALL USING (true) WITH CHECK (true);

-- Insert default preferences
INSERT INTO insight_preferences (id, notification_enabled, notification_time) 
VALUES (1, true, '06:00:00')
ON CONFLICT (id) DO NOTHING;
