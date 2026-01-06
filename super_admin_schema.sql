-- Super Admin PIN Schema Update
-- Run this in your Supabase SQL Editor

-- Add super_admin_pin and super_admin_email columns to app_settings
do $$
begin
    -- Add super_admin_pin column if it doesn't exist
    if not exists (select 1 from information_schema.columns where table_name = 'app_settings' and column_name = 'super_admin_pin') then
        alter table app_settings add column super_admin_pin text;
    end if;
    
    -- Add super_admin_email column if it doesn't exist
    if not exists (select 1 from information_schema.columns where table_name = 'app_settings' and column_name = 'super_admin_email') then
        alter table app_settings add column super_admin_email text;
    end if;
end $$;

-- Update authorized_devices to track last_active_at
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name = 'authorized_devices' and column_name = 'last_active_at') then
        alter table authorized_devices add column last_active_at timestamp with time zone default timezone('utc'::text, now());
    end if;
end $$;
