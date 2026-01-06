-- Add pin_history column to app_settings if it doesn't exist
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name = 'app_settings' and column_name = 'pin_history') then
        alter table app_settings add column pin_history text[] default array[]::text[];
    end if;
end $$;
