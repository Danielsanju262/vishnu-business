-- Recurring Reminder Configs Table
-- Stores rules for automatically generating payment reminders

CREATE TABLE IF NOT EXISTS recurring_reminder_configs (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
    amount numeric NOT NULL,
    frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
    
    -- Configuration for timing
    day_of_week int, -- 1-7 for Weekly (1=Monday)
    day_of_month int, -- 1-31 for Monthly
    time_of_day time NOT NULL DEFAULT '09:00',
    
    -- Scheduling logic
    last_generated_at timestamptz,
    next_run_at timestamptz NOT NULL,
    
    is_active boolean DEFAULT true,
    note text,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE recurring_reminder_configs ENABLE ROW LEVEL SECURITY;

-- Policy for full access
DROP POLICY IF EXISTS "Enable all operations on recurring_reminder_configs" ON recurring_reminder_configs;

CREATE POLICY "Enable all operations on recurring_reminder_configs"
    ON recurring_reminder_configs
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Index for finding due reminders quickly
CREATE INDEX IF NOT EXISTS idx_recurring_next_run 
    ON recurring_reminder_configs(next_run_at) 
    WHERE is_active = true;
