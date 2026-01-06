-- COPY AND PASTE THIS ENTIRE BLOCK INTO YOUR SUPABASE SQL EDITOR --

-- 1. Create the payment_reminders table
create table if not exists payment_reminders (
  id uuid default uuid_generate_v4() primary key,
  customer_id uuid references customers(id) on delete set null,
  amount numeric not null,
  due_date date not null,
  note text,
  status text default 'pending' check (status in ('pending', 'paid')),
  recorded_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable Security (Row Level Security)
alter table payment_reminders enable row level security;

-- 3. Allow access (Since this is a personal app, we allow all access)
create policy "Enable all access for all users" on payment_reminders for all using (true) with check (true);

-- 4. Enable Real-time (Optional, but good to have)
alter publication supabase_realtime add table payment_reminders;

-- 5. Force cache refresh (helps with PGRST205 error)
NOTIFY pgrst, 'reload config';
