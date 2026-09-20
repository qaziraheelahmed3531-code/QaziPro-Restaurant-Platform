begin;

create table public.pos_sections (
  id uuid primary key default extensions.gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  description text not null default '',
  color text not null default '#211d1b' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create index pos_sections_business_order_idx
  on public.pos_sections(business_id, is_active, sort_order, name);

create trigger pos_sections_updated_at before update on public.pos_sections
for each row execute function public.set_updated_at();

alter table public.products
  add column if not exists pos_section_id uuid references public.pos_sections(id) on delete set null;
create index if not exists products_pos_section_idx on public.products(pos_section_id, is_active, is_available);

insert into public.pos_sections(business_id, name, description, sort_order, is_active)
select category.business_id, category.name, 'Imported from the storefront category.', category.sort_order, category.is_active
from public.categories category
on conflict (business_id, name) do nothing;

update public.products product
set pos_section_id = section.id
from public.categories category
join public.pos_sections section
  on section.business_id = category.business_id and section.name = category.name
where product.category_id = category.id and product.pos_section_id is null;

create or replace function public.validate_product_pos_section()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.pos_section_id is not null and not exists (
    select 1 from public.pos_sections section
    where section.id=new.pos_section_id and section.business_id=new.business_id
  ) then
    raise exception 'The POS section must belong to the same restaurant.' using errcode='23514';
  end if;
  return new;
end; $$;

create trigger products_validate_pos_section
before insert or update of business_id,pos_section_id on public.products
for each row execute function public.validate_product_pos_section();

alter table public.order_items
  add column if not exists pos_section_id uuid references public.pos_sections(id) on delete set null,
  add column if not exists pos_section_name text;

create or replace function public.snapshot_order_item_pos_section()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.product_id is not null and (new.pos_section_id is null or new.pos_section_name is null) then
    select section.id,section.name into new.pos_section_id,new.pos_section_name
    from public.products product
    left join public.pos_sections section on section.id=product.pos_section_id
    where product.id=new.product_id;
  end if;
  return new;
end; $$;

create trigger order_items_snapshot_pos_section
before insert or update of product_id on public.order_items
for each row execute function public.snapshot_order_item_pos_section();

update public.order_items item
set pos_section_id=section.id,pos_section_name=section.name
from public.products product
join public.pos_sections section on section.id=product.pos_section_id
where item.product_id=product.id and item.pos_section_name is null;

alter table public.invoice_settings
  add column if not exists receipt_logo_size integer not null default 72 check (receipt_logo_size between 24 and 200),
  add column if not exists receipt_logo_alignment text not null default 'CENTER' check (receipt_logo_alignment in ('LEFT','CENTER','RIGHT')),
  add column if not exists receipt_header_alignment text not null default 'CENTER' check (receipt_header_alignment in ('LEFT','CENTER','RIGHT')),
  add column if not exists show_branch_name boolean not null default true,
  add column if not exists show_order_number boolean not null default true,
  add column if not exists show_token boolean not null default true,
  add column if not exists show_order_date boolean not null default true,
  add column if not exists show_order_type boolean not null default true,
  add column if not exists show_customer_name boolean not null default true,
  add column if not exists show_customer_phone boolean not null default true,
  add column if not exists show_payment_method boolean not null default true;

alter table public.pos_sections enable row level security;
create policy pos_sections_read on public.pos_sections for select to authenticated using (
  public.has_permission(business_id,'pos.use') or public.has_permission(business_id,'products.manage')
  or public.has_permission(business_id,'settings.manage') or public.has_permission(business_id,'reports.read')
);
create policy pos_sections_manage on public.pos_sections for all to authenticated
using (public.has_permission(business_id,'settings.manage'))
with check (public.has_permission(business_id,'settings.manage'));
grant select,insert,update,delete on public.pos_sections to authenticated;

create or replace function public.set_pos_order_stage(p_order_id uuid, p_status public.order_status)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target public.orders; expected public.order_status;
begin
  select * into target from public.orders where id=p_order_id for update;
  if not found or target.channel<>'POS' or not public.staff_can_access_branch(target.business_id,target.branch_id)
    or not public.has_permission(target.business_id,'pos.use') then
    raise exception 'POS order access denied.' using errcode='42501';
  end if;
  if target.status in ('CANCELLED','DELIVERED') then
    return jsonb_build_object('id',target.id,'status',target.status,'idempotent',true);
  end if;
  expected:=case target.status
    when 'CONFIRMED' then 'PREPARING'::public.order_status
    when 'PREPARING' then 'READY'::public.order_status
    when 'READY' then 'DELIVERED'::public.order_status
    else null end;
  if expected is null or p_status<>expected then
    raise exception 'Order must move from % to % before continuing.',target.status,coalesce(expected::text,'the next stage') using errcode='22023';
  end if;
  update public.orders set status=p_status where id=target.id returning * into target;
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
  for row_data in select id,status from public.orders where business_id=target_business and branch_id=p_branch_id
    and channel='POS' and status in ('CONFIRMED','PREPARING','READY') order by created_at for update
  loop
    if row_data.status='CONFIRMED' then perform public.set_pos_order_stage(row_data.id,'PREPARING'); end if;
    if row_data.status in ('CONFIRMED','PREPARING') then perform public.set_pos_order_stage(row_data.id,'READY'); end if;
    perform public.set_pos_order_stage(row_data.id,'DELIVERED');
    completed:=completed+1;
  end loop;
  return completed;
end; $$;

create or replace function public.sync_offline_pos_order(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  target_branch uuid; target_business uuid; existing_sale public.orders; sold_at timestamptz;
  replaced_at timestamptz; replacement_minutes integer; tender public.pos_payment_methods;
  tender_code text:=upper(btrim(coalesce(p_payload->>'paymentMethodCode','CASH')));
  tender_reference text:=nullif(left(btrim(coalesce(p_payload->>'paymentReference','')),120),'');
  result jsonb; target_order_id uuid; target_status public.order_status; current_status public.order_status; target_shift_id uuid;
begin
  target_branch := (p_payload->>'branchId')::uuid;
  select business_id into target_business from public.branches where id=target_branch and is_active;
  if target_business is null or not public.staff_can_access_branch(target_business,target_branch)
    or not public.has_permission(target_business,'pos.use') then raise exception 'Offline POS restaurant access denied.' using errcode='42501'; end if;
  select * into tender from public.pos_payment_methods where business_id=target_business and code=tender_code;
  if not found then raise exception 'The offline payment method is no longer configured.' using errcode='22023'; end if;
  if tender.requires_reference and tender_reference is null then raise exception 'Payment sender or transaction reference is required.' using errcode='22023'; end if;
  if tender_reference is not null and tender_reference ~ '[\r\n\t]' then raise exception 'Payment reference contains invalid characters.' using errcode='22023'; end if;
  if jsonb_typeof(p_payload->'replacement')='object' then
    select * into existing_sale from public.orders where business_id=target_business
      and offline_device_id=(p_payload->>'deviceId')::uuid and offline_order_id=p_payload->>'offlineOrderId';
    sold_at:=coalesce(existing_sale.offline_sold_at,(p_payload->>'soldAt')::timestamptz);
    replaced_at:=(p_payload->'replacement'->>'createdAt')::timestamptz;
    select coalesce(pos_replacement_window_minutes,10) into replacement_minutes from public.business_operating_settings where business_id=target_business;
    replacement_minutes:=coalesce(replacement_minutes,10);
    if replaced_at<sold_at or replaced_at>sold_at+make_interval(mins=>replacement_minutes) or replaced_at>now()+interval '5 minutes' then
      raise exception 'The configured POS replacement window has expired.' using errcode='22023';
    end if;
  end if;
  result:=public.sync_offline_pos_order_internal(p_payload);
  target_order_id:=(result->>'id')::uuid;
  select shift_id into target_shift_id from public.payment_transactions where business_id=target_business and order_id=target_order_id
    and idempotency_key='offline-pos:'||(p_payload->>'deviceId')||':'||(p_payload->>'offlineOrderId');
  if tender.kind<>'CASH' then
    update public.payment_transactions set provider='OFFLINE_POS_'||tender.code,payment_method=tender.code,
      provider_transaction_id=tender_reference,metadata_safe=metadata_safe||jsonb_build_object('methodName',tender.name,'kind',tender.kind,'reference',tender_reference),updated_at=now()
    where business_id=target_business and order_id=target_order_id and idempotency_key='offline-pos:'||(p_payload->>'deviceId')||':'||(p_payload->>'offlineOrderId');
    update public.orders set payment_method='ONLINE',payment_reference=coalesce(tender_reference,tender.code) where id=target_order_id;
    if target_shift_id is not null then
      update public.register_shifts set expected_cash=opening_cash+coalesce((select sum(payment.amount) from public.payment_transactions payment
        where payment.shift_id=target_shift_id and payment.payment_method='CASH' and payment.status in ('PAID','PARTIALLY_REFUNDED','REFUNDED')),0),updated_at=now()
      where id=target_shift_id;
    end if;
  else update public.orders set payment_reference='CASH' where id=target_order_id; end if;
  target_status:=case upper(coalesce(p_payload->>'operationalStatus','CONFIRMED')) when 'PREPARING' then 'PREPARING'::public.order_status when 'READY' then 'READY'::public.order_status when 'DELIVERED' then 'DELIVERED'::public.order_status else 'CONFIRMED'::public.order_status end;
  select status into current_status from public.orders where id=target_order_id;
  if current_status='CONFIRMED' and target_status in ('PREPARING','READY','DELIVERED') then perform public.set_pos_order_stage(target_order_id,'PREPARING'); current_status:='PREPARING'; end if;
  if current_status='PREPARING' and target_status in ('READY','DELIVERED') then perform public.set_pos_order_stage(target_order_id,'READY'); current_status:='READY'; end if;
  if current_status='READY' and target_status='DELIVERED' then perform public.set_pos_order_stage(target_order_id,'DELIVERED'); current_status:='DELIVERED'; end if;
  return result||jsonb_build_object('paymentMethod',tender.code,'paymentMethodName',tender.name,'change',case when tender.kind='CASH' then coalesce((result->>'change')::integer,0) else 0 end,'status',current_status);
end; $$;

create or replace function public.restaurant_report(p_business_id uuid,p_start timestamptz,p_end timestamptz,p_branch_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; bucket text; report_timezone text;
begin
  if not public.has_permission(p_business_id,'reports.read') and not public.has_permission(p_business_id,'dashboard.view') then raise exception 'Reporting access denied.' using errcode='42501'; end if;
  if p_end<=p_start or p_end-p_start>interval '370 days' then raise exception 'Invalid report range.' using errcode='22023'; end if;
  select timezone into report_timezone from public.businesses where id=p_business_id;
  bucket:=case when p_end-p_start<=interval '2 days' then 'hour' when p_end-p_start<=interval '62 days' then 'day' else 'month' end;
  with scoped_orders as (
    select * from public.orders where business_id=p_business_id and created_at>=p_start and created_at<p_end and status<>'CANCELLED' and (p_branch_id is null or branch_id=p_branch_id)
  ), refund_total as (
    select coalesce(sum(r.amount),0)::integer value from public.refunds r join scoped_orders o on o.id=r.order_id where r.status='SUCCEEDED'
  ) select jsonb_build_object(
    'summary',jsonb_build_object('grossSales',coalesce(sum(o.subtotal),0),'discounts',coalesce(sum(o.discount),0),'deliveryFees',coalesce(sum(o.delivery_fee),0),'tax',coalesce(sum(o.tax),0),'refunds',(select value from refund_total),'netSales',coalesce(sum(o.total),0)-(select value from refund_total),'orderCount',count(o.id),'averageOrder',case when count(o.id)=0 then 0 else round(avg(o.total)) end),
    'trend',(select coalesce(jsonb_agg(row_to_json(t) order by t.bucket),'[]') from (select date_trunc(bucket,created_at,report_timezone) bucket,sum(total)::integer value,count(*)::integer orders from scoped_orders group by 1)t),
    'channels',(select coalesce(jsonb_agg(row_to_json(c) order by c.value desc),'[]') from (select case when channel='WEBSITE' then channel||'_'||service_mode::text else channel end label,sum(total)::integer value,count(*)::integer orders from scoped_orders group by 1)c),
    'payments',(select coalesce(jsonb_agg(row_to_json(p) order by p.value desc),'[]') from (select payment_method label,sum(amount)::integer value,count(*)::integer transactions from public.payment_transactions where business_id=p_business_id and created_at>=p_start and created_at<p_end and status in ('PAID','PARTIALLY_REFUNDED','REFUNDED') and (p_branch_id is null or branch_id=p_branch_id) group by payment_method)p),
    'topProducts',(select coalesce(jsonb_agg(row_to_json(product_row) order by product_row.net_sales desc),'[]') from (select item.product_name label,sum(item.quantity)::integer quantity,sum(item.line_total)::integer gross_sales,round(sum(case when o.subtotal>0 then item.line_total::numeric*(o.subtotal-o.discount)/o.subtotal else 0 end))::integer net_sales from public.order_items item join scoped_orders o on o.id=item.order_id group by item.product_name order by 4 desc limit 10)product_row),
    'topCategories',(select coalesce(jsonb_agg(row_to_json(category_row) order by category_row.value desc),'[]') from (select coalesce(category.name,'Deals') label,sum(item.line_total)::integer value from public.order_items item join scoped_orders o on o.id=item.order_id left join public.products product on product.id=item.product_id left join public.categories category on category.id=product.category_id group by category.name)category_row),
    'posSections',(select coalesce(jsonb_agg(row_to_json(section_row) order by section_row.value desc),'[]') from (select coalesce(item.pos_section_name,'Unassigned') label,sum(item.quantity)::integer quantity,sum(item.line_total)::integer value,round(sum(case when o.subtotal>0 then item.line_total::numeric*(o.subtotal-o.discount)/o.subtotal else 0 end))::integer net_sales,count(distinct o.id)::integer orders from public.order_items item join scoped_orders o on o.id=item.order_id where o.channel='POS' group by coalesce(item.pos_section_name,'Unassigned'))section_row),
    'peakHours',(select coalesce(jsonb_agg(row_to_json(hour_row) order by hour_row."hour"),'[]') from (select extract(hour from created_at at time zone coalesce((select timezone from public.businesses where id=p_business_id),'Asia/Karachi'))::integer as "hour",sum(total)::integer value,count(*)::integer orders from scoped_orders group by 1)hour_row),
    'statuses',(select coalesce(jsonb_agg(row_to_json(status_row)),'[]') from (select status label,count(*)::integer count from public.orders where business_id=p_business_id and created_at>=p_start and created_at<p_end and (p_branch_id is null or branch_id=p_branch_id) group by status)status_row),
    'customers',jsonb_build_object('new',(select count(distinct x.customer_id) from scoped_orders x where x.customer_id is not null and not exists(select 1 from public.orders old where old.business_id=p_business_id and old.customer_id=x.customer_id and old.created_at<p_start and old.status<>'CANCELLED')),'returning',(select count(distinct x.customer_id) from scoped_orders x where x.customer_id is not null and exists(select 1 from public.orders old where old.business_id=p_business_id and old.customer_id=x.customer_id and old.created_at<p_start and old.status<>'CANCELLED'))),
    'inventory',(select jsonb_build_object('stockValue',coalesce(sum(current_stock*cost_per_unit),0),'lowStock',count(*) filter(where current_stock<=minimum_stock),'activeIngredients',count(*)) from public.ingredients where business_id=p_business_id and is_active and (p_branch_id is null or branch_id=p_branch_id)),
    'shifts',(select jsonb_build_object('count',count(*),'difference',coalesce(sum(difference),0)) from public.register_shifts where business_id=p_business_id and opened_at>=p_start and opened_at<p_end and (p_branch_id is null or branch_id=p_branch_id))
  ) into result from scoped_orders o;
  return result;
end; $$;

revoke all on function public.set_pos_order_stage(uuid,public.order_status),public.complete_all_pos_orders(uuid),public.sync_offline_pos_order(jsonb) from public,anon;
grant execute on function public.set_pos_order_stage(uuid,public.order_status),public.complete_all_pos_orders(uuid),public.sync_offline_pos_order(jsonb) to authenticated;

commit;
