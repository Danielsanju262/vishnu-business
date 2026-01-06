-- RECREATE accounts_payable table to ensure correct schema
-- WARNING: This deletes all data in accounts_payable (which is safe if you couldn't create any yet)

-- 1. Drop the existing table to clear any bad schema/columns
drop table if exists accounts_payable;

-- 2. Create it fresh with the correct 'supplier_id' column
create table accounts_payable (
  id uuid default uuid_generate_v4() primary key,
  supplier_id uuid references suppliers(id), -- This was likely missing or named wrong
  amount numeric not null,
  due_date date not null,
  note text,
  status text default 'pending',
  recorded_at timestamptz default now()
);

-- 3. Re-enable security policies
alter table accounts_payable enable row level security;
create policy "Enable all" on accounts_payable for all using (true) with check (true);

-- 4. Force Supabase API to refresh its cache
NOTIFY pgrst, 'reload config';
