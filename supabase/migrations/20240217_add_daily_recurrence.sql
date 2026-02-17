-- Migration: Add daily recurrence type support
-- Date: 2026-02-17
-- Description: Adds 'daily' as a valid recurrence type for goals

-- Drop existing check constraint and recreate with 'daily' included
do $$
begin
    -- Drop old constraint if it exists
    if exists (
        select 1 from information_schema.constraint_column_usage
        where table_name = 'user_goals' and column_name = 'recurrence_type'
    ) then
        alter table user_goals drop constraint if exists user_goals_recurrence_type_check;
    end if;

    -- Add updated constraint that includes 'daily'
    alter table user_goals add constraint user_goals_recurrence_type_check
        check (recurrence_type in ('daily', 'weekly', 'monthly', 'yearly'));
exception
    when others then
        raise notice 'Could not update recurrence_type constraint: %', SQLERRM;
end $$;
