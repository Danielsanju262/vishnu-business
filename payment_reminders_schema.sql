-- Payment Reminders Table for cross-device real-time sync
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

-- Enable RLS
alter table payment_reminders enable row level security;

-- RLS Policy
create policy "Enable all access for all users" on payment_reminders for all using (true) with check (true);

-- Enable Realtime for all tables
-- Note: Run this in your Supabase SQL editor
alter publication supabase_realtime add table customers;
alter publication supabase_realtime add table products;
alter publication supabase_realtime add table transactions;
alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table expense_presets;
alter publication supabase_realtime add table payment_reminders;
