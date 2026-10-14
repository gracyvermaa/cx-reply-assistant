-- Brands: the companies whose customers the agents are helping
create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- Knowledge base: one row per policy, always tied to a brand
create table kb_entries (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  title text not null,          -- e.g. "Refund policy"
  content text not null,        -- the actual policy text
  updated_at timestamptz default now()
);

-- Customers belong to one brand
create table customers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null
);

-- Basic order info (mock data)
create table orders (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  product text not null,
  status text not null,         -- e.g. "delivered"
  delivered_on date,
  total numeric(10, 2)
);

-- One conversation per customer issue
create table conversations (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  order_id uuid references orders(id),
  created_at timestamptz default now()
);

-- Every message in a conversation, from the customer or the agent
create table messages (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender text not null check (sender in ('customer', 'agent')),
  body text not null,
  created_at timestamptz default now()
);

-- Log of every AI reply attempt, so we can review what the AI saw and said
create table ai_generations (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  customer_message text not null,
  retrieved_context jsonb,      -- the KB entries that were used
  ai_response text,
  agent_edited_response text,   -- filled in if the agent changes the draft
  final_response text,          -- what was actually sent
  needs_human boolean default false,
  created_at timestamptz default now()
);

-- Indexes so lookups by brand stay fast
create index on kb_entries (brand_id);
create index on messages (conversation_id, created_at);
create index on ai_generations (conversation_id);