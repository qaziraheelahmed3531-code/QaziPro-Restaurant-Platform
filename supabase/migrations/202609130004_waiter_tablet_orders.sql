begin;

insert into public.admin_permissions(code,description,permission_group)
values ('waiter.use','Waiter tablet ordering','Operations')
on conflict(code) do update set description=excluded.description,permission_group=excluded.permission_group;

insert into public.admin_role_permissions(role,permission_code)
values ('WAITER','waiter.use')
on conflict do nothing;

alter table public.orders
  add column waiter_id uuid references auth.users(id) on delete set null,
  add column waiter_name text,
  add column table_reference text;

create index orders_waiter_created_idx on public.orders(waiter_id,created_at desc) where waiter_id is not null;
create index orders_branch_waiter_queue_idx on public.orders(branch_id,payment_status,created_at) where waiter_id is not null and status <> 'CANCELLED';

create policy waiter_own_orders_read on public.orders for select to authenticated
using(waiter_id=auth.uid() and public.staff_can_access_branch(business_id,branch_id));

create or replace function public.create_waiter_pos_order(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  target_business uuid;
  target_branch uuid;
  order_result jsonb;
  target_order public.orders;
  waiter_display text;
  table_label text:=nullif(left(btrim(p_payload->>'tableReference'),80),'');
begin
  begin target_branch:=(p_payload->>'branchId')::uuid;
  exception when invalid_text_representation then raise exception 'Select a valid restaurant.' using errcode='22023'; end;
  select business_id into target_business from public.branches where id=target_branch and is_active;
  if target_business is null or not public.has_permission(target_business,'waiter.use') or not public.staff_can_access_branch(target_business,target_branch) then
    raise exception 'Waiter access denied for this restaurant.' using errcode='42501';
  end if;
  if table_label is null then raise exception 'Enter the table or guest reference.' using errcode='22023'; end if;
  select coalesce(nullif(btrim(profile.full_name),''),nullif(split_part(auth_user.email,'@',1),''),'Waiter')
  into waiter_display from auth.users auth_user left join public.profiles profile on profile.id=auth_user.id where auth_user.id=auth.uid();

  order_result:=public.create_order_authoritative(jsonb_build_object(
    'channel','POS','branchId',target_branch,'serviceMode','PICKUP','paymentMethod','CASH_ON_DELIVERY',
    'customerName',coalesce(nullif(left(btrim(p_payload->>'guestName'),120),''),'Table '||table_label),
    'customerPhone','Waiter table order','deliveryInstructions',nullif(left(btrim(p_payload->>'notes'),500),''),
    'items',p_payload->'items'
  ),null);

  update public.orders set
    channel='POS',operational_order_type='DINE_IN',waiter_id=auth.uid(),waiter_name=waiter_display,
    table_reference=table_label,order_notes=nullif(left(btrim(p_payload->>'notes'),500),''),status='CONFIRMED'
  where id=(order_result->>'id')::uuid returning * into target_order;

  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_business,auth.uid(),'WAITER_ORDER_SENT','orders',target_order.id::text,jsonb_build_object('branch_id',target_branch,'table_reference',table_label,'total',target_order.total));

  return (order_result-'guestTrackingToken')||jsonb_build_object(
    'status',target_order.status,'channel','POS','orderType','DINE_IN','tokenNumber',target_order.token_number,
    'waiterName',waiter_display,'tableReference',table_label
  );
end; $$;

create or replace function public.waiter_dashboard(p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare target_business uuid; local_day date; zone text;
begin
  select branch.business_id,business.timezone,(now() at time zone business.timezone)::date
  into target_business,zone,local_day from public.branches branch join public.businesses business on business.id=branch.business_id
  where branch.id=p_branch_id and branch.is_active;
  if target_business is null or not public.has_permission(target_business,'waiter.use') or not public.staff_can_access_branch(target_business,p_branch_id) then
    raise exception 'Waiter access denied for this restaurant.' using errcode='42501';
  end if;
  return jsonb_build_object(
    'todayOrders',(select count(*) from public.orders where waiter_id=auth.uid() and branch_id=p_branch_id and (created_at at time zone zone)::date=local_day),
    'activeOrders',(select count(*) from public.orders where waiter_id=auth.uid() and branch_id=p_branch_id and status not in ('DELIVERED','CANCELLED')),
    'completedOrders',(select count(*) from public.orders where waiter_id=auth.uid() and branch_id=p_branch_id and status='DELIVERED'),
    'todaySales',(select coalesce(sum(total),0) from public.orders where waiter_id=auth.uid() and branch_id=p_branch_id and status<>'CANCELLED' and (created_at at time zone zone)::date=local_day),
    'recentOrders',coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc) from (
      select id,order_number,token_number,table_reference,total,status,payment_status,created_at
      from public.orders where waiter_id=auth.uid() and branch_id=p_branch_id order by created_at desc limit 20
    ) row_data),'[]'::jsonb)
  );
end; $$;

create or replace function public.waiter_performance(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_permission(p_business_id,'staff.manage') then raise exception 'Staff access denied.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.waiter_name) from (
    select membership.user_id,coalesce(nullif(profile.full_name,''),auth_user.email) waiter_name,auth_user.email,
      membership.branch_id,concat_ws(' — ',coalesce(branch.restaurant_name,branch.name),branch.city) branch_name,
      count(order_record.id)::integer order_count,
      (count(order_record.id) filter(where order_record.status not in ('DELIVERED','CANCELLED')))::integer active_orders,
      (count(order_record.id) filter(where order_record.status='DELIVERED'))::integer completed_orders,
      coalesce(sum(order_record.total) filter(where order_record.status<>'CANCELLED'),0)::bigint total_sales,
      max(order_record.created_at) last_order_at
    from public.staff_memberships membership
    join auth.users auth_user on auth_user.id=membership.user_id
    left join public.profiles profile on profile.id=membership.user_id
    left join public.branches branch on branch.id=membership.branch_id
    left join public.orders order_record on order_record.waiter_id=membership.user_id and order_record.branch_id=membership.branch_id
    where membership.business_id=p_business_id and membership.role='WAITER' and membership.is_active
    group by membership.user_id,profile.full_name,auth_user.email,membership.branch_id,branch.restaurant_name,branch.name,branch.city
  ) row_data),'[]'::jsonb);
end; $$;

create or replace function public.settle_waiter_pos_order(p_order_id uuid,p_shift_id uuid,p_cash_received integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target_order public.orders; shift_record public.register_shifts; existing_payment public.payment_transactions; received integer:=greatest(0,coalesce(p_cash_received,0));
begin
  select * into target_order from public.orders where id=p_order_id and channel='POS' and waiter_id is not null for update;
  if not found or not public.has_permission(target_order.business_id,'pos.use') or not public.staff_can_access_branch(target_order.business_id,target_order.branch_id) then
    raise exception 'Waiter POS order is unavailable.' using errcode='42501';
  end if;
  if target_order.status='CANCELLED' then raise exception 'Cancelled orders cannot be paid.' using errcode='22023'; end if;
  select * into existing_payment from public.payment_transactions where order_id=target_order.id and status in ('PAID','PARTIALLY_REFUNDED','REFUNDED') limit 1;
  if found then return jsonb_build_object('id',target_order.id,'orderNumber',target_order.order_number,'total',target_order.total,'change',greatest(0,received-target_order.total),'idempotent',true); end if;
  select * into shift_record from public.register_shifts where id=p_shift_id and branch_id=target_order.branch_id and opened_by=auth.uid() and status='OPEN' for update;
  if not found then raise exception 'Open your register shift before collecting payment.' using errcode='22023'; end if;
  if received<target_order.total then raise exception 'Cash received is less than the order total.' using errcode='22023'; end if;
  insert into public.payment_transactions(business_id,branch_id,order_id,shift_id,provider,payment_method,idempotency_key,amount,status,paid_at)
  values(target_order.business_id,target_order.branch_id,target_order.id,shift_record.id,'CASH','CASH','waiter-pos-'||target_order.id,target_order.total,'PAID',now());
  update public.orders set payment_status='PAID',payment_reference='CASH' where id=target_order.id;
  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_order.business_id,auth.uid(),'WAITER_ORDER_PAID','orders',target_order.id::text,jsonb_build_object('shift_id',shift_record.id,'amount',target_order.total));
  return jsonb_build_object('id',target_order.id,'orderNumber',target_order.order_number,'total',target_order.total,'change',received-target_order.total,'tokenNumber',target_order.token_number);
end; $$;

revoke all on function public.create_waiter_pos_order(jsonb),public.waiter_dashboard(uuid),public.waiter_performance(uuid),public.settle_waiter_pos_order(uuid,uuid,integer) from public,anon;
grant execute on function public.create_waiter_pos_order(jsonb),public.waiter_dashboard(uuid),public.settle_waiter_pos_order(uuid,uuid,integer) to authenticated;
grant execute on function public.waiter_performance(uuid) to authenticated;

commit;
