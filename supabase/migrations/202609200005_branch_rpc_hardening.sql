begin;

-- Fresh staging projects load seed businesses after migrations. Keep required
-- POS tenders available for both existing and newly-created restaurants.
create or replace function public.ensure_default_pos_payment_methods()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.pos_payment_methods(business_id,code,name,kind,requires_reference,sort_order)
  values
    (new.id,'CASH','Cash','CASH',false,10),
    (new.id,'EASYPAISA','Easypaisa','WALLET',false,20),
    (new.id,'JAZZCASH','JazzCash','WALLET',false,30),
    (new.id,'CARD','Card','CARD',false,40),
    (new.id,'CREDIT_CARD','Credit card','CARD',false,50)
  on conflict(business_id,code) do nothing;
  return new;
end;
$$;
drop trigger if exists business_default_pos_payment_methods on public.businesses;
create trigger business_default_pos_payment_methods after insert on public.businesses
for each row execute function public.ensure_default_pos_payment_methods();
insert into public.pos_payment_methods(business_id,code,name,kind,requires_reference,sort_order)
select business.id,defaults.code,defaults.name,defaults.kind,defaults.requires_reference,defaults.sort_order
from public.businesses business cross join (values
  ('CASH','Cash','CASH',false,10),('EASYPAISA','Easypaisa','WALLET',false,20),
  ('JAZZCASH','JazzCash','WALLET',false,30),('CARD','Card','CARD',false,40),
  ('CREDIT_CARD','Credit card','CARD',false,50)
) defaults(code,name,kind,requires_reference,sort_order)
on conflict(business_id,code) do nothing;

-- Security-definer commands must enforce the same branch boundary as RLS.
create or replace function public.enforce_branch_owned_write()
returns trigger language plpgsql security definer set search_path=public as $$
declare row_data jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
declare target_business uuid:=nullif(row_data->>'business_id','')::uuid;
declare target_branch uuid:=nullif(row_data->>'branch_id','')::uuid;
declare branch_business uuid;
begin
  if target_business is not null and target_branch is not null then
    select business_id into branch_business from public.branches where id=target_branch;
    if branch_business is null or branch_business<>target_business then
      raise exception 'Branch does not belong to this business.' using errcode='23514';
    end if;
  end if;
  if auth.uid() is not null and target_business is not null and target_branch is not null
    and not public.staff_can_access_branch(target_business,target_branch) then
    raise exception 'Branch access denied.' using errcode='42501';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

-- This trigger calls a protected helper during ordinary authenticated status
-- updates. Run only the trigger body with definer rights; user identity and
-- branch authorization are still evaluated explicitly.
create or replace function public.enforce_rider_delivery_workflow()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.status=new.status or new.service_mode<>'DELIVERY' or not public.rider_portal_is_enabled(new.business_id) then return new; end if;
  if (old.status='READY' and new.status='OUT_FOR_DELIVERY') or (old.status='OUT_FOR_DELIVERY' and new.status='DELIVERED') then
    if auth.uid() is null or new.rider_id<>auth.uid() or not public.has_permission(new.business_id,'rider.use') then
      raise exception 'Rider portal is enabled. The assigned rider must complete this delivery step.' using errcode='22023';
    end if;
  end if;
  return new;
end;
$$;

alter table public.audit_logs add column if not exists branch_id uuid references public.branches(id) on delete set null;
create index if not exists audit_logs_business_branch_created_idx on public.audit_logs(business_id,branch_id,created_at desc);
update public.audit_logs audit
set branch_id=orders.branch_id
from public.orders orders
where audit.branch_id is null and audit.entity_type='orders' and audit.entity_id=orders.id::text;
update public.audit_logs audit
set branch_id=(audit.metadata->>'branch_id')::uuid
where audit.branch_id is null and audit.metadata->>'branch_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

create or replace function public.assign_audit_branch()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.branch_id is null and new.metadata->>'branch_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    new.branch_id:=(new.metadata->>'branch_id')::uuid;
  end if;
  if new.branch_id is null and new.entity_type='orders' then
    select branch_id into new.branch_id from public.orders where id::text=new.entity_id;
  end if;
  if new.branch_id is not null and not exists(select 1 from public.branches where id=new.branch_id and business_id=new.business_id) then
    raise exception 'Audit branch does not belong to this business.' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists assign_audit_branch on public.audit_logs;
create trigger assign_audit_branch before insert or update on public.audit_logs for each row execute function public.assign_audit_branch();
drop policy if exists audit_permission_read on public.audit_logs;
create policy audit_permission_read on public.audit_logs for select to authenticated using(
  public.has_permission(business_id,'audit.read') and (
    public.staff_can_access_branch(business_id,branch_id) or exists(
      select 1 from public.staff_memberships membership
      where membership.business_id=audit_logs.business_id and membership.user_id=auth.uid() and membership.role='OWNER' and membership.is_active
    )
  )
);

-- Child kitchen rows must not retain the older business-wide policies.
drop policy if exists kitchen_items_read on public.order_items;
create policy kitchen_items_read on public.order_items for select to authenticated using(exists(
  select 1 from public.orders order_record
  where order_record.id=order_items.order_id
    and public.staff_can_access_branch(order_record.business_id,order_record.branch_id)
    and public.has_permission(order_record.business_id,'kds.use')
    and order_record.status in ('CONFIRMED','PREPARING','READY')
));
drop policy if exists kitchen_modifiers_read on public.order_item_modifiers;
create policy kitchen_modifiers_read on public.order_item_modifiers for select to authenticated using(exists(
  select 1 from public.order_items item
  join public.orders order_record on order_record.id=item.order_id
  where item.id=order_item_modifiers.order_item_id
    and public.staff_can_access_branch(order_record.business_id,order_record.branch_id)
    and public.has_permission(order_record.business_id,'kds.use')
    and order_record.status in ('CONFIRMED','PREPARING','READY')
));

drop policy if exists membership_permission_read on public.staff_membership_permissions;
create policy membership_permission_read on public.staff_membership_permissions for select to authenticated using(exists(
  select 1 from public.staff_memberships target
  where target.id=staff_membership_permissions.membership_id and (
    target.user_id=auth.uid()
    or exists(select 1 from public.staff_memberships caller where caller.business_id=target.business_id and caller.user_id=auth.uid() and caller.role='OWNER' and caller.is_active)
    or exists(select 1 from public.staff_membership_branches target_access where target_access.membership_id=target.id and public.staff_can_access_branch(target.business_id,target_access.branch_id) and public.has_permission(target.business_id,'staff.manage'))
  )
));

do $$
declare target_table text;
begin
  foreach target_table in array array[
    'orders','register_shifts','pos_held_orders','payment_transactions','ingredients',
    'purchases','stock_movements','wastage','invoices','pos_order_replacements',
    'rider_live_locations','pos_offline_devices','branch_product_overrides'
  ] loop
    execute format('drop trigger if exists enforce_branch_owned_write on public.%I',target_table);
    execute format('create trigger enforce_branch_owned_write before insert or update or delete on public.%I for each row execute function public.enforce_branch_owned_write()',target_table);
  end loop;
end $$;

create or replace function public.enforce_invoice_line_branch_write()
returns trigger language plpgsql security definer set search_path=public as $$
declare target_invoice uuid:=case when tg_op='DELETE' then old.invoice_id else new.invoice_id end;
declare invoice_record public.invoices;
begin
  select * into invoice_record from public.invoices where id=target_invoice;
  if auth.uid() is not null and (not found or not public.staff_can_access_branch(invoice_record.business_id,invoice_record.branch_id)) then
    raise exception 'Branch access denied.' using errcode='42501';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
drop trigger if exists enforce_invoice_line_branch_write on public.invoice_lines;
create trigger enforce_invoice_line_branch_write before insert or update or delete on public.invoice_lines
for each row execute function public.enforce_invoice_line_branch_write();

create or replace function public.invoice_document(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare inv public.invoices; paid integer;
begin
  select * into inv from public.invoices where id=p_id;
  if not found or not public.staff_can_access_branch(inv.business_id,inv.branch_id)
    or not public.has_permission(inv.business_id,'invoices.read') then
    raise exception 'Invoice access denied.' using errcode='42501';
  end if;
  paid:=public.invoice_paid(inv.id);
  return to_jsonb(inv)||jsonb_build_object('paid',paid,'balance',greatest(0,inv.total-paid),
    'payment_status',case when paid>=inv.total and inv.status<>'DRAFT' then 'PAID' when paid>0 then 'PARTIALLY_PAID' else 'UNPAID' end,
    'lines',coalesce((select jsonb_agg(to_jsonb(line) order by sort_order) from public.invoice_lines line where invoice_id=inv.id),'[]'),
    'payments',coalesce((select jsonb_agg(jsonb_build_object('id',payment.id,'amount',payment.amount,'method',payment.payment_method,'status',payment.status,'created_at',payment.created_at) order by payment.created_at) from public.payment_transactions payment where (inv.order_id is not null and payment.order_id=inv.order_id) or (inv.order_id is null and payment.invoice_id=inv.id)),'[]'));
end;
$$;

create or replace function public.invoice_list(p_business_id uuid,p_search text default '',p_status text default '',p_from date default null,p_to date default null,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_permission(p_business_id,'invoices.read') then raise exception 'Invoice access denied.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(row_data order by row_data->>'created_at' desc) from (
    select to_jsonb(invoice)||jsonb_build_object('paid',public.invoice_paid(invoice.id),'balance',greatest(0,invoice.total-public.invoice_paid(invoice.id)),
      'payment_status',case when public.invoice_paid(invoice.id)>=invoice.total and invoice.status<>'DRAFT' then 'PAID' when public.invoice_paid(invoice.id)>0 then 'PARTIALLY_PAID' else 'UNPAID' end) row_data
    from public.invoices invoice
    where invoice.business_id=p_business_id
      and public.staff_can_access_branch(invoice.business_id,invoice.branch_id)
      and (coalesce(p_status,'')='' or invoice.status=p_status or (p_status='PAID' and invoice.status<>'DRAFT' and public.invoice_paid(invoice.id)>=invoice.total) or (p_status='PARTIALLY_PAID' and public.invoice_paid(invoice.id)>0 and public.invoice_paid(invoice.id)<invoice.total) or (p_status='UNPAID' and public.invoice_paid(invoice.id)=0))
      and (coalesce(p_search,'')='' or concat_ws(' ',invoice.invoice_number,invoice.order_number,invoice.customer_name,invoice.customer_phone) ilike '%'||left(p_search,100)||'%')
      and (p_from is null or invoice.invoice_date>=p_from) and (p_to is null or invoice.invoice_date<=p_to)
    order by invoice.created_at desc limit 51 offset greatest(0,least(p_offset,100000))
  ) scoped),'[]');
end;
$$;

create or replace function public.restaurant_report(p_business_id uuid,p_start timestamptz,p_end timestamptz,p_branch_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; bucket text; report_timezone text;
begin
  if not public.has_permission(p_business_id,'reports.read') and not public.has_permission(p_business_id,'dashboard.view') then
    raise exception 'Reporting access denied.' using errcode='42501';
  end if;
  if p_branch_id is not null and not public.staff_can_access_branch(p_business_id,p_branch_id) then
    raise exception 'Branch reporting access denied.' using errcode='42501';
  end if;
  if p_end<=p_start or p_end-p_start>interval '370 days' then
    raise exception 'Invalid report range.' using errcode='22023';
  end if;
  select timezone into report_timezone from public.businesses where id=p_business_id;
  bucket:=case when p_end-p_start<=interval '2 days' then 'hour' when p_end-p_start<=interval '62 days' then 'day' else 'month' end;
  with scoped_orders as (
    select * from public.orders
    where business_id=p_business_id and created_at>=p_start and created_at<p_end and status<>'CANCELLED'
      and public.staff_can_access_branch(business_id,branch_id)
      and (p_branch_id is null or branch_id=p_branch_id)
  ), refund_total as (
    select coalesce(sum(refund.amount),0)::integer value from public.refunds refund join scoped_orders scoped on scoped.id=refund.order_id where refund.status='SUCCEEDED'
  )
  select jsonb_build_object(
    'summary',jsonb_build_object(
      'grossSales',coalesce(sum(scoped.subtotal),0),'discounts',coalesce(sum(scoped.discount),0),
      'deliveryFees',coalesce(sum(scoped.delivery_fee),0),'tax',coalesce(sum(scoped.tax),0),
      'refunds',(select value from refund_total),'netSales',coalesce(sum(scoped.total),0)-(select value from refund_total),
      'orderCount',count(scoped.id),'averageOrder',case when count(scoped.id)=0 then 0 else round(avg(scoped.total)) end
    ),
    'trend',(select coalesce(jsonb_agg(row_to_json(trend_row) order by trend_row.bucket),'[]'::jsonb) from (select date_trunc(bucket,created_at,report_timezone) bucket,sum(total)::integer value,count(*)::integer orders from scoped_orders group by 1) trend_row),
    'channels',(select coalesce(jsonb_agg(row_to_json(channel_row) order by channel_row.value desc),'[]'::jsonb) from (select case when channel='WEBSITE' then channel||'_'||service_mode::text else channel end label,sum(total)::integer value,count(*)::integer orders from scoped_orders group by 1) channel_row),
    'payments',(select coalesce(jsonb_agg(row_to_json(payment_row) order by payment_row.value desc),'[]'::jsonb) from (select payment.payment_method label,sum(payment.amount)::integer value,count(*)::integer transactions from public.payment_transactions payment where payment.business_id=p_business_id and payment.created_at>=p_start and payment.created_at<p_end and payment.status in ('PAID','PARTIALLY_REFUNDED','REFUNDED') and public.staff_can_access_branch(payment.business_id,payment.branch_id) and (p_branch_id is null or payment.branch_id=p_branch_id) group by payment.payment_method) payment_row),
    'topProducts',(select coalesce(jsonb_agg(row_to_json(product_row) order by product_row.net_sales desc),'[]'::jsonb) from (select item.product_name label,sum(item.quantity)::integer quantity,sum(item.line_total)::integer gross_sales,round(sum(case when order_row.subtotal>0 then item.line_total::numeric*(order_row.subtotal-order_row.discount)/order_row.subtotal else 0 end))::integer net_sales from public.order_items item join scoped_orders order_row on order_row.id=item.order_id group by item.product_name order by 4 desc limit 10) product_row),
    'topCategories',(select coalesce(jsonb_agg(row_to_json(category_row) order by category_row.value desc),'[]'::jsonb) from (select coalesce(category.name,'Deals') label,sum(item.line_total)::integer value from public.order_items item join scoped_orders order_row on order_row.id=item.order_id left join public.products product on product.id=item.product_id left join public.categories category on category.id=product.category_id group by category.name) category_row),
    'posSections',(select coalesce(jsonb_agg(row_to_json(section_row) order by section_row.value desc),'[]'::jsonb) from (select coalesce(item.pos_section_name,'Unassigned') label,sum(item.quantity)::integer quantity,sum(item.line_total)::integer value,round(sum(case when order_row.subtotal>0 then item.line_total::numeric*(order_row.subtotal-order_row.discount)/order_row.subtotal else 0 end))::integer net_sales,count(distinct order_row.id)::integer orders from public.order_items item join scoped_orders order_row on order_row.id=item.order_id where order_row.channel='POS' group by coalesce(item.pos_section_name,'Unassigned')) section_row),
    'peakHours',(select coalesce(jsonb_agg(row_to_json(hour_row) order by hour_row."hour"),'[]'::jsonb) from (select extract(hour from created_at at time zone coalesce(report_timezone,'Asia/Karachi'))::integer as "hour",sum(total)::integer value,count(*)::integer orders from scoped_orders group by 1) hour_row),
    'statuses',(select coalesce(jsonb_agg(row_to_json(status_row)),'[]'::jsonb) from (select status label,count(*)::integer count from public.orders where business_id=p_business_id and created_at>=p_start and created_at<p_end and public.staff_can_access_branch(business_id,branch_id) and (p_branch_id is null or branch_id=p_branch_id) group by status) status_row),
    'customers',jsonb_build_object(
      'new',(select count(distinct candidate.customer_id) from scoped_orders candidate where candidate.customer_id is not null and not exists(select 1 from public.orders historical where historical.business_id=p_business_id and historical.customer_id=candidate.customer_id and historical.created_at<p_start and historical.status<>'CANCELLED' and public.staff_can_access_branch(historical.business_id,historical.branch_id))),
      'returning',(select count(distinct candidate.customer_id) from scoped_orders candidate where candidate.customer_id is not null and exists(select 1 from public.orders historical where historical.business_id=p_business_id and historical.customer_id=candidate.customer_id and historical.created_at<p_start and historical.status<>'CANCELLED' and public.staff_can_access_branch(historical.business_id,historical.branch_id)))
    ),
    'inventory',(select jsonb_build_object('stockValue',coalesce(sum(current_stock*cost_per_unit),0),'lowStock',count(*) filter(where current_stock<=minimum_stock),'activeIngredients',count(*)) from public.ingredients where business_id=p_business_id and is_active and public.staff_can_access_branch(business_id,branch_id) and (p_branch_id is null or branch_id=p_branch_id)),
    'shifts',(select jsonb_build_object('count',count(*),'difference',coalesce(sum(difference),0)) from public.register_shifts where business_id=p_business_id and opened_at>=p_start and opened_at<p_end and public.staff_can_access_branch(business_id,branch_id) and (p_branch_id is null or branch_id=p_branch_id))
  ) into result
  from scoped_orders scoped;
  return result;
end;
$$;

create or replace function public.waiter_performance(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_permission(p_business_id,'staff.manage') then raise exception 'Staff access denied.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.waiter_name,row_data.branch_name) from (
    select membership.user_id,coalesce(nullif(profile.full_name,''),auth_user.email) waiter_name,auth_user.email,
      access.branch_id,concat_ws(' — ',coalesce(branch.restaurant_name,branch.name),branch.city) branch_name,
      count(order_record.id)::integer order_count,
      (count(order_record.id) filter(where order_record.status not in ('DELIVERED','CANCELLED')))::integer active_orders,
      (count(order_record.id) filter(where order_record.status='DELIVERED'))::integer completed_orders,
      coalesce(sum(order_record.total) filter(where order_record.status<>'CANCELLED'),0)::bigint total_sales,
      max(order_record.created_at) last_order_at
    from public.staff_memberships membership
    join public.staff_membership_branches access on access.membership_id=membership.id
    join auth.users auth_user on auth_user.id=membership.user_id
    left join public.profiles profile on profile.id=membership.user_id
    join public.branches branch on branch.id=access.branch_id
    left join public.orders order_record on order_record.waiter_id=membership.user_id and order_record.branch_id=access.branch_id
    where membership.business_id=p_business_id and membership.role='WAITER' and membership.is_active
      and public.staff_can_access_branch(p_business_id,access.branch_id)
    group by membership.user_id,profile.full_name,auth_user.email,access.branch_id,branch.restaurant_name,branch.name,branch.city
  ) row_data),'[]'::jsonb);
end;
$$;

create or replace function public.rider_performance(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_permission(p_business_id,'staff.manage') then raise exception 'Staff access denied.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.rider_name,row_data.branch_name) from (
    select membership.user_id,coalesce(nullif(profile.full_name,''),auth_user.email) rider_name,auth_user.email,
      access.branch_id,concat_ws(' — ',coalesce(branch.restaurant_name,branch.name),branch.city) branch_name,
      count(order_record.id)::integer deliveries,
      count(order_record.id) filter(where order_record.status='OUT_FOR_DELIVERY')::integer active_deliveries,
      count(order_record.id) filter(where order_record.status='DELIVERED')::integer completed_deliveries,
      coalesce(sum(order_record.total) filter(where order_record.cash_received_at is not null),0)::bigint cash_collected,
      max(order_record.delivered_at) last_delivery_at
    from public.staff_memberships membership
    join public.staff_membership_branches access on access.membership_id=membership.id
    join auth.users auth_user on auth_user.id=membership.user_id
    left join public.profiles profile on profile.id=membership.user_id
    join public.branches branch on branch.id=access.branch_id
    left join public.orders order_record on order_record.rider_id=membership.user_id and order_record.branch_id=access.branch_id
    where membership.business_id=p_business_id and membership.role='RIDER' and membership.is_active
      and public.staff_can_access_branch(p_business_id,access.branch_id)
    group by membership.user_id,profile.full_name,auth_user.email,access.branch_id,branch.restaurant_name,branch.name,branch.city
  ) row_data),'[]'::jsonb);
end;
$$;

-- The staff command is security definer, so its result must be scoped here as
-- well as through table RLS. Owners see the business; managers see only staff
-- or invitations that overlap one of their assigned branches.
create or replace function public.staff_directory(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_permission(p_business_id,'staff.manage') then raise exception 'Staff access denied.' using errcode='42501'; end if;
  return jsonb_build_object(
    'members',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',membership.id,'email',auth_user.email,'name',auth_user.raw_user_meta_data->>'full_name',
        'role',membership.role,'is_active',membership.is_active,'created_at',membership.created_at,'last_sign_in_at',auth_user.last_sign_in_at,
        'branch_id',membership.branch_id,
        'branch_ids',case when membership.role='OWNER' then coalesce((select jsonb_agg(branch.id order by branch.sort_order,branch.id) from public.branches branch where branch.business_id=membership.business_id and branch.is_active),'[]'::jsonb) else coalesce((select jsonb_agg(access.branch_id order by branch.sort_order,branch.id) from public.staff_membership_branches access join public.branches branch on branch.id=access.branch_id where access.membership_id=membership.id),'[]'::jsonb) end,
        'branch_name',case when membership.role='OWNER' then 'All branches' else coalesce((select string_agg(concat_ws(' - ',coalesce(branch.restaurant_name,branch.name),branch.city),', ' order by branch.sort_order,branch.id) from public.staff_membership_branches access join public.branches branch on branch.id=access.branch_id where access.membership_id=membership.id),'Not assigned') end,
        'permissions',case when membership.role='OWNER' then coalesce((select jsonb_agg(code order by code) from public.admin_permissions),'[]'::jsonb) when membership.permissions_customized then coalesce((select jsonb_agg(permission_code order by permission_code) from public.staff_membership_permissions where membership_id=membership.id),'[]'::jsonb) else coalesce((select jsonb_agg(permission_code order by permission_code) from public.admin_role_permissions where role=membership.role),'[]'::jsonb) end
      ) order by auth_user.email)
      from public.staff_memberships membership join auth.users auth_user on auth_user.id=membership.user_id
      where membership.business_id=p_business_id and (
        exists(select 1 from public.staff_memberships caller where caller.business_id=p_business_id and caller.user_id=auth.uid() and caller.role='OWNER' and caller.is_active)
        or exists(select 1 from public.staff_membership_branches target_access where target_access.membership_id=membership.id and public.staff_can_access_branch(p_business_id,target_access.branch_id))
      )
    ),'[]'::jsonb),
    'invitations',coalesce((
      select jsonb_agg((to_jsonb(invitation)-'invited_by'-'activated_user_id')||jsonb_build_object(
        'branch_name',case when invitation.role='OWNER' then 'All branches' else coalesce((select string_agg(concat_ws(' - ',coalesce(branch.restaurant_name,branch.name),branch.city),', ' order by branch.sort_order,branch.id) from unnest(invitation.branch_ids) assigned(branch_id) join public.branches branch on branch.id=assigned.branch_id),'Not assigned') end
      ) order by invitation.email)
      from public.staff_invitations invitation
      where invitation.business_id=p_business_id and invitation.status='PENDING' and (
        exists(select 1 from public.staff_memberships caller where caller.business_id=p_business_id and caller.user_id=auth.uid() and caller.role='OWNER' and caller.is_active)
        or exists(select 1 from unnest(invitation.branch_ids) assigned(branch_id) where public.staff_can_access_branch(p_business_id,assigned.branch_id))
      )
    ),'[]'::jsonb)
  );
end;
$$;

-- POS cash providers are internal ledger payments, not external gateways. Keep
-- gateway/card refunds behind their adapter while allowing authorized cash
-- refunds to reconcile against an assigned branch register.
create or replace function public.record_manual_refund(p_payment_id uuid,p_amount integer,p_reason text)
returns public.refunds language plpgsql security definer set search_path=public as $$
declare payment public.payment_transactions; result public.refunds; refunded_total integer; cash_shift uuid;
begin
  select * into payment from public.payment_transactions where id=p_payment_id for update;
  if not found
    or not public.has_permission(payment.business_id,'payments.refund')
    or not public.staff_can_access_branch(payment.business_id,payment.branch_id)
  then
    raise exception 'Refund access denied.' using errcode='42501';
  end if;
  if payment.provider not in ('CASH','MANUAL_INVOICE','POS_CASH','OFFLINE_POS_CASH','RIDER_CASH','DELIVERY_CONFIRMATION') then
    raise exception 'This provider requires its configured refund adapter.' using errcode='0A000';
  end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'A refund reason is required.' using errcode='22023'; end if;
  if payment.payment_method='CASH' then
    select id into cash_shift from public.register_shifts
    where branch_id=payment.branch_id and opened_by=auth.uid() and status='OPEN'
    order by opened_at desc limit 1 for update;
    if cash_shift is null then
      select id into cash_shift from public.register_shifts where id=payment.shift_id and status='OPEN' for update;
    end if;
    if cash_shift is null then raise exception 'Open a register shift to record returned cash.' using errcode='22023'; end if;
  end if;
  select coalesce(sum(amount),0) into refunded_total from public.refunds where payment_id=payment.id and status='SUCCEEDED';
  if p_amount<=0 or refunded_total+p_amount>payment.amount then raise exception 'Refund amount is invalid.' using errcode='22023'; end if;
  insert into public.refunds(business_id,payment_id,order_id,amount,reason,status,requested_by,completed_at,cash_shift_id)
  values(payment.business_id,payment.id,payment.order_id,p_amount,left(btrim(p_reason),500),'SUCCEEDED',auth.uid(),now(),cash_shift)
  returning * into result;
  refunded_total:=refunded_total+p_amount;
  update public.payment_transactions set status=case when refunded_total=amount then 'REFUNDED' else 'PARTIALLY_REFUNDED' end,refunded_at=now() where id=payment.id;
  update public.orders set payment_status=case when refunded_total=payment.amount then 'REFUNDED'::public.payment_status else 'PARTIALLY_REFUNDED'::public.payment_status end where id=payment.order_id;
  insert into public.notifications(business_id,notification_type,title,message,entity_type,entity_id,dedupe_key)
  values(payment.business_id,'REFUND','Refund recorded','Refund recorded for payment '||payment.id,'refunds',result.id::text,'refund-'||result.id);
  return result;
end;
$$;

-- A manual invoice has no order_id, but it still needs the same one-time,
-- same-business link to its void predecessor as an order invoice.
create or replace function public.guard_finalized_invoice()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.status in ('FINALIZED','VOID') and
    (to_jsonb(new)-array['status','void_reason','voided_at','updated_at','reissued_from'])
      is distinct from
    (to_jsonb(old)-array['status','void_reason','voided_at','updated_at','reissued_from'])
  then
    raise exception 'Finalized invoices cannot be rewritten. Void and reissue instead.' using errcode='22023';
  end if;
  if old.reissued_from is distinct from new.reissued_from and (
    old.reissued_from is not null
    or new.reissued_from is null
    or not exists(
      select 1 from public.invoices predecessor
      where predecessor.id=new.reissued_from
        and predecessor.business_id=old.business_id
        and predecessor.order_id is not distinct from old.order_id
        and predecessor.status='VOID'
    )
  ) then
    raise exception 'Invoice reissue linkage is invalid.' using errcode='22023';
  end if;
  if old.status='VOID' or (old.status='FINALIZED' and new.status not in ('FINALIZED','VOID')) then
    raise exception 'Invalid invoice transition.' using errcode='22023';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_branch_owned_write(),public.enforce_invoice_line_branch_write(),public.assign_audit_branch(),public.enforce_rider_delivery_workflow() from public,anon,authenticated;
revoke all on function public.invoice_document(uuid),public.invoice_list(uuid,text,text,date,date,integer),public.restaurant_report(uuid,timestamptz,timestamptz,uuid),public.waiter_performance(uuid),public.rider_performance(uuid),public.staff_directory(uuid) from public,anon;
grant execute on function public.invoice_document(uuid),public.invoice_list(uuid,text,text,date,date,integer),public.restaurant_report(uuid,timestamptz,timestamptz,uuid),public.waiter_performance(uuid),public.rider_performance(uuid),public.staff_directory(uuid) to authenticated;

commit;
