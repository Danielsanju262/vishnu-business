-- AI Memory & Personal Assistant Schema

-- 1. AI Memories: Stores loose facts and preferences
-- Bucket examples: 'user_preference', 'business_fact', 'learned_behavior'
create table if not exists ai_memories (
  id uuid primary key default uuid_generate_v4(),
  bucket text not null, -- 'preference', 'fact', 'context'
  content text not null,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. User Goals: Structured tracking for goals (e.g., Pay EMI, Reach Profit)
-- 'metric_type': 'net_profit', 'revenue', 'sales_count', 'manual'
-- 'status': 'active', 'completed', 'archived'
-- 'reset_condition': For goals like "Monthly Profit"
create table if not exists user_goals (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  target_amount numeric, -- e.g. 15000 (for EMI)
  current_amount numeric default 0, -- Tracked progress
  deadline date,
  metric_type text not null check (metric_type in ('net_profit', 'revenue', 'sales_count', 'manual_check')),
  status text default 'active' check (status in ('active', 'completed', 'archived')),
  start_tracking_date timestamptz default now(), -- To calculate "Profit SINCE X"
  metadata jsonb default '{}', -- For extra rules like "recurring: monthly"
  is_recurring boolean default false, -- Whether this goal repeats
  recurrence_type text check (recurrence_type is null or recurrence_type in ('monthly', 'weekly', 'yearly')),
  rollover_preference text check (rollover_preference is null or rollover_preference in ('ask', 'immediate', 'first_of_month')),
  created_at timestamptz default now()
);

-- 3. AI Chat Sessions: To group messages
create table if not exists ai_chat_sessions (
  id uuid primary key default uuid_generate_v4(),
  title text,
  last_message_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 4. AI Chat Messages: The actual history
create table if not exists ai_chat_messages (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references ai_chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  tool_calls jsonb, -- If the AI used tools
  created_at timestamptz default now()
);

-- 5. AI Config: Bot naming
create table if not exists ai_config (
  key text primary key, -- e.g. 'bot_name', 'user_name'
  value text not null,
  updated_at timestamptz default now()
);

-- RLS Policies
alter table ai_memories enable row level security;
create policy "Enable all access for ai_memories" on ai_memories for all using (true) with check (true);

alter table user_goals enable row level security;
create policy "Enable all access for user_goals" on user_goals for all using (true) with check (true);

alter table ai_chat_sessions enable row level security;
create policy "Enable all access for ai_chat_sessions" on ai_chat_sessions for all using (true) with check (true);

alter table ai_chat_messages enable row level security;
create policy "Enable all access for ai_chat_messages" on ai_chat_messages for all using (true) with check (true);

alter table ai_config enable row level security;
create policy "Enable all access for ai_config" on ai_config for all using (true) with check (true);

-- Functions needed?
-- Maybe a function to calculate net profit in a date range for the AI to call easily?
