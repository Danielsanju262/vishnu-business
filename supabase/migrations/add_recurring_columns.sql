-- Add recurring goal columns to user_goals table
-- These columns support recurring goals (monthly, weekly, yearly)

-- Add is_recurring column (defaults to false for existing goals)
ALTER TABLE user_goals 
ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false;

-- Add recurrence_type column (monthly, weekly, yearly)
ALTER TABLE user_goals 
ADD COLUMN IF NOT EXISTS recurrence_type text CHECK (recurrence_type IS NULL OR recurrence_type IN ('monthly', 'weekly', 'yearly'));

-- Add rollover_preference column (for handling surplus funds)
ALTER TABLE user_goals 
ADD COLUMN IF NOT EXISTS rollover_preference text CHECK (rollover_preference IS NULL OR rollover_preference IN ('ask', 'immediate', 'first_of_month'));
