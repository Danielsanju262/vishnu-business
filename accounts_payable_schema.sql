create table suppliers (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);
alter table suppliers enable row level security;
create policy "Enable all" on suppliers for all using (true) with check (true);

create table accounts_payable (
  id uuid default uuid_generate_v4() primary key,
  supplier_id uuid references suppliers(id),
  amount numeric not null,
  due_date date not null,
  note text,
  status text default 'pending',
  recorded_at timestamptz default now()
);
alter table accounts_payable enable row level security;
create policy "Enable all" on accounts_payable for all using (true) with check (true);
