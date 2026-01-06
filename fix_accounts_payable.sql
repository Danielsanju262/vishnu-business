-- Enable UUID extension just in case
create extension if not exists "uuid-ossp";

-- Ensure 'suppliers' table exists and has correct schema
create table if not exists suppliers (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Ensure 'accounts_payable' table exists and has correct schema
create table if not exists accounts_payable (
  id uuid default uuid_generate_v4() primary key,
  supplier_id uuid references suppliers(id),
  amount numeric not null,
  due_date date not null,
  note text,
  status text default 'pending',
  recorded_at timestamptz default now()
);

-- Enable RLS on both tables
alter table suppliers enable row level security;
alter table accounts_payable enable row level security;

-- DROP existing policies to clean up any bad state
drop policy if exists "Enable all" on suppliers;
drop policy if exists "Enable all" on accounts_payable;

-- CREATE fresh policies granting full access to everyone (public)
-- Using 'using (true) with check (true)' allows select, insert, update, delete
create policy "Enable all" on suppliers for all using (true) with check (true);
create policy "Enable all" on accounts_payable for all using (true) with check (true);
