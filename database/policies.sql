-- Turn on row level security for every table
alter table brands enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table kb_entries enable row level security;
alter table ai_generations enable row level security;

-- Read-only tables
create policy "read brands" on brands
  for select to anon, authenticated using (true);

create policy "read customers" on customers
  for select to anon, authenticated using (true);

create policy "read orders" on orders
  for select to anon, authenticated using (true);

create policy "read conversations" on conversations
  for select to anon, authenticated using (true);

-- Messages: read and add, never edit or delete
create policy "read messages" on messages
  for select to anon, authenticated using (true);

-- a new message must carry the same brand as the conversation it joins
create policy "add messages" on messages
  for insert to anon, authenticated
  with check (
    sender in ('customer', 'agent')
    and exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and c.brand_id = messages.brand_id
    )
  );

-- Knowledge base: fully manageable from the KB page
create policy "read kb" on kb_entries
  for select to anon, authenticated using (true);

create policy "add kb" on kb_entries
  for insert to anon, authenticated with check (true);

create policy "edit kb" on kb_entries
  for update to anon, authenticated using (true) with check (true);

create policy "delete kb" on kb_entries
  for delete to anon, authenticated using (true);

-- ai_generations: no policies on purpose.
-- With RLS on and no policy, the browser cannot touch it.
-- Only the Edge Functions (service role) read and write the logs.

-- PRODUCTION NOTE: this demo has no login, so "anon" means everyone.
-- With Supabase Auth, each policy above would instead check brand membership:
--   using (brand_id in (select brand_id from agent_brands where user_id = auth.uid()))
-- so an agent could only ever see their own brand's rows.