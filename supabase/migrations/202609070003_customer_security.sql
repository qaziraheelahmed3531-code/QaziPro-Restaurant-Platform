-- Customer-owned data and server-authoritative cancellation.
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists date_of_birth date;
alter table public.orders add column if not exists cancelled_at timestamptz;
alter table public.orders add column if not exists cancelled_by text check (cancelled_by is null or cancelled_by in ('CUSTOMER','GUEST','ADMIN','SYSTEM'));
alter table public.orders add column if not exists cancel_reason text;

create table if not exists public.customer_favourites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);
create index if not exists customer_favourites_user_created_idx on public.customer_favourites(user_id, created_at desc);
alter table public.customer_favourites enable row level security;
drop policy if exists customer_favourites_own_all on public.customer_favourites;
create policy customer_favourites_own_all on public.customer_favourites
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.customer_favourites to authenticated;

-- The caller supplies only an already verified session id or a SHA-256 guest
-- token. The row lock + conditional predicates make the 60-second window
-- race-safe when Admin changes status at the same time.
create or replace function public.cancel_customer_order(
  p_order_id uuid,
  p_customer_id uuid default null,
  p_guest_tracking_hash text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare target public.orders;
begin
  select * into target from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.' using errcode = 'P0002'; end if;
  if not ((p_customer_id is not null and target.customer_id = p_customer_id)
      or (p_guest_tracking_hash is not null and target.guest_tracking_hash = p_guest_tracking_hash)) then
    raise exception 'Order access denied.' using errcode = '42501';
  end if;
  if target.status <> 'RECEIVED' or target.created_at < now() - interval '60 seconds' then
    raise exception 'This order can no longer be cancelled.' using errcode = '22023';
  end if;
  if target.payment_status not in ('UNPAID','PENDING') then
    raise exception 'Paid orders require a controlled refund workflow.' using errcode = '22023';
  end if;
  update public.orders
    set status = 'CANCELLED', cancelled_at = now(),
        cancelled_by = case when target.customer_id is null then 'GUEST' else 'CUSTOMER' end,
        cancel_reason = 'Cancelled by customer within allowed window'
  where id = target.id and status = 'RECEIVED' and created_at >= now() - interval '60 seconds';
  if not found then raise exception 'This order can no longer be cancelled.' using errcode = '22023'; end if;
  return jsonb_build_object('ok', true, 'status', 'CANCELLED', 'cancelledAt', now());
end;
$$;
revoke all on function public.cancel_customer_order(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_customer_order(uuid, uuid, text) to service_role;
