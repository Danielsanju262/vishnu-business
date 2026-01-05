-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Customers Table
create table if not exists customers (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Products Table
create table if not exists products (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  unit text not null, -- 'kg', 'ltr', 'pcs'
  category text default 'general', -- 'general' or 'ghee' (triggers special logic)
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Transactions Table (Sales)
create table if not exists transactions (
  id uuid default uuid_generate_v4() primary key,
  date date not null default CURRENT_DATE,
  customer_id uuid references customers(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  quantity numeric not null,
  buy_price numeric default 0, -- 0 for Ghee (calculated via expenses)
  sell_price numeric not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Expenses Table
create table if not exists expenses (
  id uuid default uuid_generate_v4() primary key,
  date date not null default CURRENT_DATE,
  title text not null, -- e.g., 'Petrol', 'Dalda'
  amount numeric not null,
  is_ghee_ingredient boolean default false, -- If true, counts towards Ghee COGS
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Expense Presets (Quick Custom Expenses)
create table if not exists expense_presets (
  id uuid default uuid_generate_v4() primary key,
  label text not null,
  is_ghee_ingredient boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS Policies
alter table customers enable row level security;
alter table products enable row level security;
alter table transactions enable row level security;
alter table expenses enable row level security;
alter table expense_presets enable row level security;

create policy "Enable all access for all users" on customers for all using (true) with check (true);
create policy "Enable all access for all users" on products for all using (true) with check (true);
create policy "Enable all access for all users" on transactions for all using (true) with check (true);
create policy "Enable all access for all users" on expenses for all using (true) with check (true);
create policy "Enable all access for all users" on expense_presets for all using (true) with check (true);
