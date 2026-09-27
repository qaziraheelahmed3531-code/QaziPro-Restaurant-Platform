begin;
-- Events remain in canonical incident/deployment records. Only per-user read
-- receipts live here; restaurant operational notifications remain unchanged.
create table public.platform_attention_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null check (length(event_key) between 1 and 200),
  read_at timestamptz not null default now(),
  primary key (user_id,event_key)
);
alter table public.platform_attention_receipts enable row level security;
create policy own_attention_read on public.platform_attention_receipts for select to authenticated
  using (user_id=auth.uid() and exists(select 1 from public.platform_staff where user_id=auth.uid() and status='ACTIVE' and (access_revoked_at is null or access_revoked_at>now())));
create policy own_attention_insert on public.platform_attention_receipts for insert to authenticated
  with check (user_id=auth.uid() and exists(select 1 from public.platform_staff where user_id=auth.uid() and status='ACTIVE' and (access_revoked_at is null or access_revoked_at>now())));
grant select,insert on public.platform_attention_receipts to authenticated;
commit;
