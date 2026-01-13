-- Migration: Add goal tracking and allocation fields
-- Date: 2026-01-13
-- Description: Adds fields for EMI goal tracking, surplus inclusion, and date-based progress calculation

-- Add new columns to user_goals table
ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS goal_type TEXT DEFAULT 'auto';
ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS allocated_amount NUMERIC DEFAULT 0;
ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS allocation_start_date DATE;
ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS include_surplus BOOLEAN DEFAULT false;
ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT true;
ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);

-- Add comments for documentation
COMMENT ON COLUMN user_goals.goal_type IS 'Type of goal: auto (auto-tracked from sales), emi (manual allocation), manual (manual entry)';
COMMENT ON COLUMN user_goals.allocated_amount IS 'Total amount manually allocated to this goal (for EMI goals)';
COMMENT ON COLUMN user_goals.allocation_start_date IS 'Date from which to start counting net profit for this goal';
COMMENT ON COLUMN user_goals.include_surplus IS 'Whether to include previous surplus in progress calculation';
COMMENT ON COLUMN user_goals.reminder_enabled IS 'Whether to send daily reminders about this goal';
COMMENT ON COLUMN user_goals.completed_at IS 'Timestamp when goal was marked as completed';
COMMENT ON COLUMN user_goals.product_id IS 'Product ID for product-specific sales goals';

-- Update existing goals to have default values
UPDATE user_goals 
SET 
    goal_type = CASE 
        WHEN metric_type = 'manual_check' THEN 'emi'
        ELSE 'auto'
    END,
    allocated_amount = COALESCE(current_amount, 0),
    reminder_enabled = true
WHERE goal_type IS NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_goals_goal_type ON user_goals(goal_type);
CREATE INDEX IF NOT EXISTS idx_user_goals_allocation_start_date ON user_goals(allocation_start_date) WHERE allocation_start_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_goals_completed_at ON user_goals(completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_goals_product_id ON user_goals(product_id) WHERE product_id IS NOT NULL;
