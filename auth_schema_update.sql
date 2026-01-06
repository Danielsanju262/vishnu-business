-- Add pin_version column to track PIN updates
-- When PIN is updated, this version increments and all devices must re-verify

do $$
begin
    -- Add pin_version column if it doesn't exist
    if not exists (select 1 from information_schema.columns where table_name = 'app_settings' and column_name = 'pin_version') then
        alter table app_settings add column pin_version integer default 1;
    end if;
end $$;

-- Create table to track authorized devices (for fingerprint management)
create table if not exists authorized_devices (
    id uuid default uuid_generate_v4() primary key,
    device_id text not null unique,
    device_name text,
    fingerprint_enabled boolean default false,
    last_pin_verified_at timestamp with time zone,
    verified_pin_version integer default 0,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table authorized_devices enable row level security;

-- Allow all access (since this is a single-user app)
create policy "Enable all access for all users" on authorized_devices for all using (true) with check (true);
