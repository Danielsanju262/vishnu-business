-- Migration: Goal Completion System Enhancement
-- Date: 2026-02-17
-- Description: Adds 'incomplete' status support, parent_goal_id for recurring chains,
--              and completed_date for tracking when goals were completed/closed

do $$
begin
    -- Add parent_goal_id to track recurring goal chains
    if not exists (select 1 from information_schema.columns where table_name = 'user_goals' and column_name = 'parent_goal_id') then
        alter table user_goals add column parent_goal_id uuid references user_goals(id);
    end if;

    -- Add closed_date to track when incomplete goals were closed
    if not exists (select 1 from information_schema.columns where table_name = 'user_goals' and column_name = 'closed_date') then
        alter table user_goals add column closed_date timestamp;
    end if;
end $$;

-- Note: The 'status' column is TEXT type, so 'incomplete' value can be stored without schema changes.
-- Existing statuses: 'active', 'completed', 'archived'
-- New status: 'incomplete' (for auto-tracked recurring goals that missed deadline)

-- Create index for faster queries on parent_goal_id
CREATE INDEX IF NOT EXISTS idx_user_goals_parent_goal_id ON user_goals(parent_goal_id) WHERE parent_goal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_goals_status ON user_goals(status);
