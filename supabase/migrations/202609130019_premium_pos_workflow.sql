begin;

alter table public.business_operating_settings
  add column if not exists pos_recent_order_limit integer not null default 10
  check (pos_recent_order_limit between 5 and 50);

create table public.pos_payment_methods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_]{2,30}$'),
  name text not null check (char_length(btrim(name)) between 2 and 50),
  kind text not null check (kind in ('CASH','WALLET','CARD','OTHER')),
  requires_reference boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, code)
);

create index pos_payment_methods_business_order_idx
  on public.pos_payment_methods(business_id, is_active, sort_order, name);

create trigger pos_payment_methods_updated_at
before update on public.pos_payment_methods
for each row execute function public.set_updated_at();

insert into public.pos_payment_methods(business_id, code, name, kind, requires_reference, sort_order)
select business.id, defaults.code, defaults.name, defaults.kind, defaults.requires_reference, defaults.sort_order
from public.businesses business
cross join (values
  ('CASH','Cash','CASH',false,10),
  ('EASYPAISA','Easypaisa','WALLET',false,20),
  ('JAZZCASH','JazzCash','WALLET',false,30),
  ('CARD','Card','CARD',false,40),
  ('CREDIT_CARD','Credit card','CARD',false,50)
) defaults(code,name,kind,requires_reference,sort_order)
on conflict (business_id,code) do nothing;

alter table public.pos_payment_methods enable row level security;
create policy pos_payment_methods_read on public.pos_payment_methods
for select to authenticated using (
  public.has_permission(business_id,'pos.use')
  or public.has_permission(business_id,'settings.manage')
  or public.has_permission(business_id,'payments.read')
);
create policy pos_payment_methods_manage on public.pos_payment_methods
for all to authenticated
using (public.has_permission(business_id,'settings.manage'))
with check (public.has_permission(business_id,'settings.manage'));
grant select,insert,update,delete on public.pos_payment_methods to authenticated;

create or replace function public.protect_last_active_pos_payment_method()
returns trigger language plpgsql set search_path=public as $$
declare target_business uuid:=coalesce(old.business_id,new.business_id);
begin
  if old.is_active and (tg_op='DELETE' or not coalesce(new.is_active,false) or new.business_id<>old.business_id)
    and not exists(select 1 from public.pos_payment_methods where business_id=target_business and is_active and id<>old.id) then
    raise exception 'Keep at least one active POS payment method.' using errcode='23514';
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
create trigger pos_payment_methods_keep_one_active
before update or delete on public.pos_payment_methods
for each row execute function public.protect_last_active_pos_payment_method();

create or replace function public.create_pos_order(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  target_business uuid;
  shift_record public.register_shifts;
  order_result jsonb;
  target_order public.orders;
  existing public.orders;
  tender public.pos_payment_methods;
  tender_code text := upper(btrim(coalesce(p_payload->>'paymentMethodCode','CASH')));
  tender_reference text := nullif(left(btrim(coalesce(p_payload->>'paymentReference','')),120),'');
  received integer;
begin
  select business_id into target_business from public.branches where id=(p_payload->>'branchId')::uuid and is_active;
  if target_business is null or not public.staff_can_access_branch(target_business,(p_payload->>'branchId')::uuid)
    or not public.has_permission(target_business,'pos.use') then
    raise exception 'POS access denied.' using errcode='42501';
  end if;
  if nullif(p_payload->>'clientReference','') is not null then
    select * into existing from public.orders where business_id=target_business and client_reference=p_payload->>'clientReference';
    if found then
      return jsonb_build_object('id',existing.id,'orderNumber',existing.order_number,'tokenNumber',existing.token_number,
        'total',existing.total,'change',0,'paymentMethod',coalesce(existing.payment_reference,tender_code),'idempotent',true);
    end if;
  end if;
  select * into tender from public.pos_payment_methods
  where business_id=target_business and code=tender_code and is_active for share;
  if not found then raise exception 'Choose an active POS payment method.' using errcode='22023'; end if;
  if tender.requires_reference and tender_reference is null then
    raise exception 'Enter the payment sender or transaction reference.' using errcode='22023';
  end if;
  if tender_reference is not null and tender_reference ~ '[\r\n\t]' then
    raise exception 'Payment reference contains invalid characters.' using errcode='22023';
  end if;
  select * into shift_record from public.register_shifts
  where id=(p_payload->>'shiftId')::uuid and branch_id=(p_payload->>'branchId')::uuid
    and opened_by=auth.uid() and status='OPEN' for update;
  if not found then raise exception 'Open your register shift before taking a counter sale.' using errcode='22023'; end if;
  order_result:=public.create_order_authoritative(jsonb_build_object(
    'channel','POS','branchId',p_payload->>'branchId','serviceMode','PICKUP',
    'paymentMethod','CASH_ON_DELIVERY',
    'customerName',coalesce(nullif(left(btrim(p_payload->>'customerName'),120),''),'Counter guest'),
    'customerPhone',coalesce(nullif(left(btrim(p_payload->>'customerPhone'),40),''),'Counter'),
    'deliveryInstructions',nullif(left(btrim(p_payload->>'notes'),500),''),'items',p_payload->'items'
  ),null);
  update public.orders set
    channel='POS',
    operational_order_type=coalesce(nullif(p_payload->>'orderType',''),'TAKEAWAY'),
    client_reference=nullif(p_payload->>'clientReference',''),
    order_notes=nullif(left(btrim(p_payload->>'notes'),500),''),
    status='CONFIRMED',
    payment_method=case when tender.kind='CASH' then 'CASH_ON_DELIVERY'::public.payment_method else 'ONLINE'::public.payment_method end,
    payment_reference=coalesce(tender_reference,tender.code)
  where id=(order_result->>'id')::uuid returning * into target_order;
  received:=coalesce(nullif(p_payload->>'cashReceived','')::integer,0);
  if tender.kind='CASH' and received < target_order.total then
    raise exception 'Cash received is less than the order total.' using errcode='22023';
  end if;
  insert into public.payment_transactions(
    business_id,branch_id,order_id,shift_id,provider,payment_method,provider_transaction_id,
    idempotency_key,amount,status,paid_at,metadata_safe
  ) values (
    target_business,target_order.branch_id,target_order.id,shift_record.id,'POS_'||tender.code,tender.code,
    tender_reference,'pos-'||target_order.id,target_order.total,'PAID',now(),
    jsonb_build_object('methodName',tender.name,'kind',tender.kind,'reference',tender_reference)
  );
  update public.orders set payment_status='PAID' where id=target_order.id;
  return (order_result-'guestTrackingToken')||jsonb_build_object(
    'tokenNumber',target_order.token_number,
    'change',case when tender.kind='CASH' then received-target_order.total else 0 end,
    'paymentMethod',tender.code,'paymentMethodName',tender.name,'channel','POS','status','CONFIRMED'
  );
end; $$;

create or replace function public.set_pos_order_stage(p_order_id uuid, p_status public.order_status)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target public.orders;
begin
  select * into target from public.orders where id=p_order_id for update;
  if not found or target.channel<>'POS' or not public.staff_can_access_branch(target.business_id,target.branch_id)
    or not public.has_permission(target.business_id,'pos.use') then
    raise exception 'POS order access denied.' using errcode='42501';
  end if;
  if target.status in ('CANCELLED','DELIVERED') then
    return jsonb_build_object('id',target.id,'status',target.status,'idempotent',true);
  end if;
  if p_status not in ('PREPARING','READY','DELIVERED') then
    raise exception 'Choose Preparing, Ready or Delivered.' using errcode='22023';
  end if;
  if target.status='CONFIRMED' and p_status in ('PREPARING','READY','DELIVERED') then
    update public.orders set status='PREPARING' where id=target.id;
    target.status:='PREPARING';
  end if;
  if target.status='PREPARING' and p_status in ('READY','DELIVERED') then
    update public.orders set status='READY' where id=target.id;
    target.status:='READY';
  end if;
  if target.status='READY' and p_status='DELIVERED' then
    update public.orders set status='DELIVERED' where id=target.id;
    target.status:='DELIVERED';
  end if;
  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
  values(target.business_id,auth.uid(),'POS_ORDER_STAGE_UPDATED','orders',target.id::text,jsonb_build_object('status',target.status));
  return jsonb_build_object('id',target.id,'status',target.status,'idempotent',false);
end; $$;

create or replace function public.complete_all_pos_orders(p_branch_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare target_business uuid; row_data record; completed integer:=0;
begin
  select business_id into target_business from public.branches where id=p_branch_id and is_active;
  if target_business is null or not public.staff_can_access_branch(target_business,p_branch_id)
    or not public.has_permission(target_business,'pos.use') then
    raise exception 'POS order access denied.' using errcode='42501';
  end if;
  for row_data in
    select id from public.orders
    where business_id=target_business and branch_id=p_branch_id and channel='POS'
      and status in ('CONFIRMED','PREPARING','READY') order by created_at for update
  loop
    perform public.set_pos_order_stage(row_data.id,'DELIVERED');
    completed:=completed+1;
  end loop;
  return completed;
end; $$;

create or replace function public.sync_offline_pos_order(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  target_branch uuid;
  target_business uuid;
  existing_sale public.orders;
  sold_at timestamptz;
  replaced_at timestamptz;
  replacement_minutes integer;
  tender public.pos_payment_methods;
  tender_code text:=upper(btrim(coalesce(p_payload->>'paymentMethodCode','CASH')));
  tender_reference text:=nullif(left(btrim(coalesce(p_payload->>'paymentReference','')),120),'');
  result jsonb;
  target_order_id uuid;
  target_status public.order_status;
  target_shift_id uuid;
begin
  target_branch := (p_payload->>'branchId')::uuid;
  select business_id into target_business from public.branches where id=target_branch and is_active;
  if target_business is null or not public.staff_can_access_branch(target_business,target_branch)
    or not public.has_permission(target_business,'pos.use') then
    raise exception 'Offline POS restaurant access denied.' using errcode='42501';
  end if;
  select * into tender from public.pos_payment_methods
  where business_id=target_business and code=tender_code;
  if not found then raise exception 'The offline payment method is no longer configured.' using errcode='22023'; end if;
  if tender.requires_reference and tender_reference is null then
    raise exception 'Payment sender or transaction reference is required.' using errcode='22023';
  end if;
  if tender_reference is not null and tender_reference ~ '[\r\n\t]' then
    raise exception 'Payment reference contains invalid characters.' using errcode='22023';
  end if;
  if jsonb_typeof(p_payload->'replacement')='object' then
    select * into existing_sale from public.orders
    where business_id=target_business and offline_device_id=(p_payload->>'deviceId')::uuid
      and offline_order_id=p_payload->>'offlineOrderId';
    sold_at := coalesce(existing_sale.offline_sold_at,(p_payload->>'soldAt')::timestamptz);
    replaced_at := (p_payload->'replacement'->>'createdAt')::timestamptz;
    select coalesce(pos_replacement_window_minutes,10) into replacement_minutes
    from public.business_operating_settings where business_id=target_business;
    replacement_minutes := coalesce(replacement_minutes,10);
    if replaced_at < sold_at or replaced_at > sold_at + make_interval(mins=>replacement_minutes)
      or replaced_at > now()+interval '5 minutes' then
      raise exception 'The configured POS replacement window has expired.' using errcode='22023';
    end if;
  end if;

  result:=public.sync_offline_pos_order_internal(p_payload);
  target_order_id:=(result->>'id')::uuid;
  select shift_id into target_shift_id from public.payment_transactions
  where business_id=target_business and order_id=target_order_id and idempotency_key='offline-pos:'||(p_payload->>'deviceId')||':'||(p_payload->>'offlineOrderId');

  if tender.kind<>'CASH' then
    update public.payment_transactions set
      provider='OFFLINE_POS_'||tender.code,
      payment_method=tender.code,
      provider_transaction_id=tender_reference,
      metadata_safe=metadata_safe||jsonb_build_object('methodName',tender.name,'kind',tender.kind,'reference',tender_reference),
      updated_at=now()
    where business_id=target_business and order_id=target_order_id
      and idempotency_key='offline-pos:'||(p_payload->>'deviceId')||':'||(p_payload->>'offlineOrderId');
    update public.orders set payment_method='ONLINE',payment_reference=coalesce(tender_reference,tender.code)
    where id=target_order_id;
    if target_shift_id is not null then
      update public.register_shifts set
        expected_cash=opening_cash+coalesce((select sum(payment.amount) from public.payment_transactions payment
          where payment.shift_id=target_shift_id and payment.payment_method='CASH'
          and payment.status in ('PAID','PARTIALLY_REFUNDED','REFUNDED')),0),updated_at=now()
      where id=target_shift_id;
    end if;
  else
    update public.orders set payment_reference='CASH' where id=target_order_id;
  end if;

  target_status:=case upper(coalesce(p_payload->>'operationalStatus','CONFIRMED'))
    when 'PREPARING' then 'PREPARING'::public.order_status
    when 'READY' then 'READY'::public.order_status
    when 'DELIVERED' then 'DELIVERED'::public.order_status
    else 'CONFIRMED'::public.order_status end;
  if target_status<>'CONFIRMED' then perform public.set_pos_order_stage(target_order_id,target_status); end if;
  return result||jsonb_build_object('paymentMethod',tender.code,'paymentMethodName',tender.name,
    'change',case when tender.kind='CASH' then coalesce((result->>'change')::integer,0) else 0 end,'status',target_status);
end; $$;

revoke all on function public.create_pos_order(jsonb),public.set_pos_order_stage(uuid,public.order_status),public.complete_all_pos_orders(uuid),public.sync_offline_pos_order(jsonb) from public,anon;
grant execute on function public.create_pos_order(jsonb),public.set_pos_order_stage(uuid,public.order_status),public.complete_all_pos_orders(uuid),public.sync_offline_pos_order(jsonb) to authenticated;

commit;
