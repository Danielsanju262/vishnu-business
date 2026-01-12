-- Add recurrence fields to user_goals if they don't exist
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name = 'user_goals' and column_name = 'is_recurring') then
        alter table user_goals add column is_recurring boolean default false;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'user_goals' and column_name = 'recurrence_type') then
        alter table user_goals add column recurrence_type text check (recurrence_type in ('monthly', 'weekly', 'yearly'));
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'user_goals' and column_name = 'rollover_preference') then
        alter table user_goals add column rollover_preference text default 'ask' check (rollover_preference in ('ask', 'immediate', 'first_of_month'));
    end if;
end $$;
