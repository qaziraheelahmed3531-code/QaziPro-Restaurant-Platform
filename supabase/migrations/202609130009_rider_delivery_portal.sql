begin;

insert into public.admin_permissions(code,description,permission_group)
values ('rider.use','Rider delivery portal, assigned orders and live location','Operations')
on conflict(code) do update set description=excluded.description,permission_group=excluded.permission_group;
insert into public.admin_role_permissions(role,permission_code) values('RIDER','rider.use') on conflict do nothing;

alter table public.business_operating_settings
  add column if not exists rider_portal_enabled boolean not null default false;

alter table public.orders
  add column if not exists rider_id uuid references auth.users(id) on delete set null,
  add column if not exists rider_name text,
  add column if not exists rider_assigned_at timestamptz,
  add column if not exists picked_up_at timestamptz,
  add column if not exists cash_received_at timestamptz;
create index if not exists orders_rider_active_idx on public.orders(rider_id,status,created_at desc) where rider_id is not null;
create index if not exists orders_rider_ready_idx on public.orders(branch_id,created_at) where service_mode='DELIVERY' and status='READY' and rider_id is null;

create table public.rider_live_locations(
  order_id uuid primary key references public.orders(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  rider_id uuid not null references auth.users(id) on delete cascade,
  latitude numeric(9,6) not null check(latitude between -90 and 90),
  longitude numeric(9,6) not null check(longitude between -180 and 180),
  accuracy_m numeric(8,2) check(accuracy_m is null or accuracy_m between 0 and 5000),
  heading numeric(6,2) check(heading is null or heading between 0 and 360),
  is_active boolean not null default true,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rider_live_locations_rider_idx on public.rider_live_locations(rider_id,updated_at desc);
create trigger rider_live_location_updated_at before update on public.rider_live_locations
for each row execute function public.set_updated_at();

alter table public.rider_live_locations enable row level security;
grant select on public.rider_live_locations to authenticated;
create policy rider_location_staff_read on public.rider_live_locations for select to authenticated using(
  rider_id=auth.uid() or public.has_permission(business_id,'orders.manage') or public.has_permission(business_id,'delivery.manage')
);

create policy rider_delivery_order_read on public.orders for select to authenticated using(
  public.has_permission(business_id,'rider.use')
  and public.staff_can_access_branch(business_id,branch_id)
  and service_mode='DELIVERY'
  and ((status='READY' and rider_id is null) or rider_id=auth.uid())
);
create policy rider_delivery_items_read on public.order_items for select to authenticated using(exists(
  select 1 from public.orders order_record where order_record.id=order_id
  and order_record.service_mode='DELIVERY'
  and ((order_record.status='READY' and order_record.rider_id is null) or order_record.rider_id=auth.uid())
  and public.has_permission(order_record.business_id,'rider.use')
  and public.staff_can_access_branch(order_record.business_id,order_record.branch_id)
));
create policy rider_delivery_modifiers_read on public.order_item_modifiers for select to authenticated using(exists(
  select 1 from public.order_items item join public.orders order_record on order_record.id=item.order_id
  where item.id=order_item_id and order_record.service_mode='DELIVERY'
  and ((order_record.status='READY' and order_record.rider_id is null) or order_record.rider_id=auth.uid())
  and public.has_permission(order_record.business_id,'rider.use')
  and public.staff_can_access_branch(order_record.business_id,order_record.branch_id)
));

create or replace function public.rider_portal_is_enabled(p_business_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select rider_portal_enabled from public.business_operating_settings where business_id=p_business_id),false);
$$;

create or replace function public.rider_dashboard(p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare target_business uuid; zone text; local_day date;
begin
  select business_id into target_business from public.branches where id=p_branch_id and is_active;
  if target_business is null or not public.has_permission(target_business,'rider.use') or not public.staff_can_access_branch(target_business,p_branch_id) then
    raise exception 'Rider access denied.' using errcode='42501';
  end if;
  if not public.rider_portal_is_enabled(target_business) then
    return jsonb_build_object('enabled',false,'availableOrders','[]'::jsonb,'activeOrders','[]'::jsonb,'todayDelivered',0,'todayCash',0);
  end if;
  select timezone into zone from public.businesses where id=target_business;
  local_day:=(now() at time zone coalesce(zone,'Asia/Karachi'))::date;
  return jsonb_build_object(
    'enabled',true,
    'availableOrders',coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.ready_at) from (
      select order_record.id,order_record.order_number,order_record.token_number,order_record.customer_name,order_record.customer_phone,
        order_record.delivery_area_name,order_record.delivery_address,order_record.delivery_instructions,order_record.latitude,order_record.longitude,
        order_record.total,order_record.payment_method,order_record.payment_status,order_record.ready_at,order_record.created_at,
        coalesce((select jsonb_agg(jsonb_build_object('name',item.product_name,'quantity',item.quantity) order by item.created_at) from public.order_items item where item.order_id=order_record.id),'[]'::jsonb) items
      from public.orders order_record where order_record.branch_id=p_branch_id and order_record.service_mode='DELIVERY' and order_record.status='READY' and order_record.rider_id is null
    ) row_data),'[]'::jsonb),
    'activeOrders',coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.picked_up_at) from (
      select order_record.id,order_record.order_number,order_record.token_number,order_record.customer_name,order_record.customer_phone,
        order_record.delivery_area_name,order_record.delivery_address,order_record.delivery_instructions,order_record.latitude,order_record.longitude,
        order_record.total,order_record.payment_method,order_record.payment_status,order_record.picked_up_at,order_record.created_at,
        coalesce((select jsonb_agg(jsonb_build_object('name',item.product_name,'quantity',item.quantity) order by item.created_at) from public.order_items item where item.order_id=order_record.id),'[]'::jsonb) items
      from public.orders order_record where order_record.branch_id=p_branch_id and order_record.rider_id=auth.uid() and order_record.status='OUT_FOR_DELIVERY'
    ) row_data),'[]'::jsonb),
    'todayDelivered',(select count(*) from public.orders where branch_id=p_branch_id and rider_id=auth.uid() and status='DELIVERED' and (delivered_at at time zone coalesce(zone,'Asia/Karachi'))::date=local_day),
    'todayCash',(select coalesce(sum(total),0) from public.orders where branch_id=p_branch_id and rider_id=auth.uid() and status='DELIVERED' and cash_received_at is not null and (delivered_at at time zone coalesce(zone,'Asia/Karachi'))::date=local_day)
  );
end;
$$;

create or replace function public.accept_rider_delivery(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target public.orders; display_name text;
begin
  select * into target from public.orders where id=p_order_id for update;
  if not found or target.service_mode<>'DELIVERY' or target.status<>'READY' or target.rider_id is not null then
    raise exception 'This delivery is no longer available.' using errcode='22023';
  end if;
  if not public.rider_portal_is_enabled(target.business_id) then raise exception 'Rider portal is disabled.' using errcode='22023'; end if;
  if not public.has_permission(target.business_id,'rider.use') or not public.staff_can_access_branch(target.business_id,target.branch_id) then raise exception 'Rider access denied.' using errcode='42501'; end if;
  select coalesce(nullif(profile.full_name,''),auth_user.raw_user_meta_data->>'full_name',auth_user.email) into display_name
  from auth.users auth_user left join public.profiles profile on profile.id=auth_user.id where auth_user.id=auth.uid();
  update public.orders set rider_id=auth.uid(),rider_name=display_name,rider_assigned_at=now(),picked_up_at=now(),status='OUT_FOR_DELIVERY' where id=target.id;
  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
  values(target.business_id,auth.uid(),'RIDER_ACCEPTED_DELIVERY','orders',target.id::text,jsonb_build_object('order_number',target.order_number));
  return jsonb_build_object('id',target.id,'orderNumber',target.order_number,'status','OUT_FOR_DELIVERY','riderName',display_name);
end;
$$;

create or replace function public.publish_rider_location(p_order_id uuid,p_latitude numeric,p_longitude numeric,p_accuracy_m numeric default null,p_heading numeric default null)
returns void language plpgsql security definer set search_path=public as $$
declare target public.orders;
begin
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 or (p_accuracy_m is not null and p_accuracy_m not between 0 and 5000) or (p_heading is not null and p_heading not between 0 and 360) then
    raise exception 'Location reading is invalid.' using errcode='22023';
  end if;
  select * into target from public.orders where id=p_order_id and rider_id=auth.uid() and status='OUT_FOR_DELIVERY';
  if not found or not public.rider_portal_is_enabled(target.business_id) or not public.has_permission(target.business_id,'rider.use') then raise exception 'Active rider delivery was not found.' using errcode='42501'; end if;
  insert into public.rider_live_locations(order_id,business_id,branch_id,rider_id,latitude,longitude,accuracy_m,heading,is_active,recorded_at)
  values(target.id,target.business_id,target.branch_id,auth.uid(),p_latitude,p_longitude,p_accuracy_m,p_heading,true,now())
  on conflict(order_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,accuracy_m=excluded.accuracy_m,heading=excluded.heading,is_active=true,recorded_at=now(),updated_at=now();
end;
$$;

create or replace function public.complete_rider_delivery(p_order_id uuid,p_cash_received boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target public.orders; payment_id uuid;
begin
  select * into target from public.orders where id=p_order_id and rider_id=auth.uid() for update;
  if not found or target.status<>'OUT_FOR_DELIVERY' or not public.rider_portal_is_enabled(target.business_id) or not public.has_permission(target.business_id,'rider.use') then
    raise exception 'Active rider delivery was not found.' using errcode='42501';
  end if;
  if target.payment_method='CASH_ON_DELIVERY' and target.payment_status<>'PAID' and not p_cash_received then
    raise exception 'Confirm that cash was received before completing this delivery.' using errcode='22023';
  end if;
  if target.payment_method='CASH_ON_DELIVERY' and target.payment_status='UNPAID' then
    insert into public.payment_transactions(business_id,branch_id,order_id,provider,payment_method,idempotency_key,amount,status,paid_at,metadata_safe)
    values(target.business_id,target.branch_id,target.id,'RIDER_CASH','CASH','rider-cod-'||target.id,target.total,'PAID',now(),jsonb_build_object('rider_id',auth.uid()))
    on conflict(business_id,idempotency_key) do nothing returning id into payment_id;
    update public.orders set payment_status='PAID',payment_reference='RIDER_CASH',cash_received_at=coalesce(cash_received_at,now()) where id=target.id;
  end if;
  update public.orders set status='DELIVERED' where id=target.id;
  update public.rider_live_locations set is_active=false where order_id=target.id;
  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
  values(target.business_id,auth.uid(),'RIDER_COMPLETED_DELIVERY','orders',target.id::text,jsonb_build_object('cash_received',p_cash_received,'amount',target.total,'payment_id',payment_id));
  return jsonb_build_object('id',target.id,'orderNumber',target.order_number,'status','DELIVERED','paymentStatus',(select payment_status from public.orders where id=target.id),'cashReceived',p_cash_received);
end;
$$;

create or replace function public.enforce_rider_delivery_workflow()
returns trigger language plpgsql set search_path=public as $$
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
create trigger enforce_rider_delivery before update of status on public.orders
for each row execute function public.enforce_rider_delivery_workflow();

create or replace function public.auto_settle_delivered_website_order()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='DELIVERED' and old.status<>'DELIVERED' and new.channel='WEBSITE' and new.payment_method='CASH_ON_DELIVERY' and new.payment_status='UNPAID' and not public.rider_portal_is_enabled(new.business_id) then
    insert into public.payment_transactions(business_id,branch_id,order_id,provider,payment_method,idempotency_key,amount,status,paid_at,metadata_safe)
    values(new.business_id,new.branch_id,new.id,'DELIVERY_CONFIRMATION','CASH','auto-delivered-'||new.id,new.total,'PAID',now(),jsonb_build_object('source','admin-delivered-rider-disabled'))
    on conflict(business_id,idempotency_key) do nothing;
    update public.orders set payment_status='PAID',payment_reference='CASH',cash_received_at=coalesce(cash_received_at,now()) where id=new.id;
  end if;
  return new;
end;
$$;
create trigger auto_settle_website_delivery after update of status on public.orders
for each row execute function public.auto_settle_delivered_website_order();

create or replace function public.rider_performance(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_permission(p_business_id,'staff.manage') then raise exception 'Staff access denied.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.rider_name) from (
    select membership.user_id,coalesce(nullif(profile.full_name,''),auth_user.email) rider_name,auth_user.email,membership.branch_id,
      concat_ws(' — ',coalesce(branch.restaurant_name,branch.name),branch.city) branch_name,
      count(order_record.id)::integer deliveries,
      count(order_record.id) filter(where order_record.status='OUT_FOR_DELIVERY')::integer active_deliveries,
      count(order_record.id) filter(where order_record.status='DELIVERED')::integer completed_deliveries,
      coalesce(sum(order_record.total) filter(where order_record.cash_received_at is not null),0)::bigint cash_collected,
      max(order_record.delivered_at) last_delivery_at
    from public.staff_memberships membership join auth.users auth_user on auth_user.id=membership.user_id
    left join public.profiles profile on profile.id=membership.user_id left join public.branches branch on branch.id=membership.branch_id
    left join public.orders order_record on order_record.rider_id=membership.user_id and order_record.branch_id=membership.branch_id
    where membership.business_id=p_business_id and membership.role='RIDER' and membership.is_active
    group by membership.user_id,profile.full_name,auth_user.email,membership.branch_id,branch.restaurant_name,branch.name,branch.city
  ) row_data),'[]'::jsonb);
end;
$$;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rider_live_locations') then
    alter publication supabase_realtime add table public.rider_live_locations;
  end if;
end $$;

revoke all on function public.rider_portal_is_enabled(uuid),public.rider_dashboard(uuid),public.accept_rider_delivery(uuid),public.publish_rider_location(uuid,numeric,numeric,numeric,numeric),public.complete_rider_delivery(uuid,boolean),public.rider_performance(uuid) from public,anon;
grant execute on function public.rider_dashboard(uuid),public.accept_rider_delivery(uuid),public.publish_rider_location(uuid,numeric,numeric,numeric,numeric),public.complete_rider_delivery(uuid,boolean),public.rider_performance(uuid) to authenticated;

commit;
