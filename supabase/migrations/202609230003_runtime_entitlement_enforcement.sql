begin;

-- Runtime access is resolved in one database-authoritative place. Package
-- defaults are combined with time-bounded restaurant overrides/add-ons; an
-- override always wins. The result also accounts for restaurant, branch,
-- lifecycle and subscription suspension state.
create or replace function public.runtime_entitlement_internal(
  p_business_id uuid,
  p_branch_id uuid,
  p_capability_key text
)
returns table(
  enabled boolean,
  reason text,
  effective_source text,
  package_code text,
  limit_value integer
)
language sql
stable
security definer
set search_path=public
as $$
  with tenant as (
    select
      business.id,
      business.is_active,
      subscription.status subscription_status,
      subscription.package_id,
      package.code package_code,
      onboarding.lifecycle
    from public.businesses business
    left join public.restaurant_subscriptions subscription on subscription.business_id=business.id
    left join public.service_packages package on package.id=subscription.package_id
    left join lateral (
      select item.lifecycle
      from public.restaurant_onboarding item
      where item.business_id=business.id
      order by item.updated_at desc,item.created_at desc
      limit 1
    ) onboarding on true
    where business.id=p_business_id
  ), candidates as (
    select entitlement.enabled,entitlement.source,entitlement.limit_value,
      case entitlement.source when 'OVERRIDE' then 40 when 'ADD_ON' then 30 when 'TRIAL' then 20 else 9 end priority,
      entitlement.updated_at
    from public.service_entitlements entitlement
    where entitlement.business_id=p_business_id
      and entitlement.capability_key=p_capability_key
      and entitlement.effective_from<=now()
      and (entitlement.effective_until is null or entitlement.effective_until>now())
      and entitlement.source<>'PACKAGE'
    union all
    select package_entitlement.enabled,'PACKAGE',package_entitlement.limit_value,10,subscription.updated_at
    from public.restaurant_subscriptions subscription
    join public.package_entitlements package_entitlement on package_entitlement.package_id=subscription.package_id
    where subscription.business_id=p_business_id and package_entitlement.capability_key=p_capability_key
    union all
    -- Existing restaurants pre-date packages. A backfilled PACKAGE row keeps
    -- their verified behaviour while still making the entitlement explicit.
    select entitlement.enabled,'PACKAGE',entitlement.limit_value,9,entitlement.updated_at
    from public.service_entitlements entitlement
    where entitlement.business_id=p_business_id
      and entitlement.capability_key=p_capability_key
      and entitlement.source='PACKAGE'
      and entitlement.effective_from<=now()
      and (entitlement.effective_until is null or entitlement.effective_until>now())
      and not exists(
        select 1 from public.restaurant_subscriptions subscription
        join public.package_entitlements package_entitlement on package_entitlement.package_id=subscription.package_id
        where subscription.business_id=p_business_id and package_entitlement.capability_key=p_capability_key
      )
  ), chosen as (
    select candidate.enabled,candidate.source,candidate.limit_value
    from candidates candidate
    order by candidate.priority desc,candidate.updated_at desc
    limit 1
  )
  select
    case
      when tenant.id is null then false
      when not tenant.is_active then false
      when p_branch_id is not null and not exists(
        select 1 from public.branches branch
        where branch.id=p_branch_id and branch.business_id=p_business_id and branch.is_active
      ) then false
      when tenant.lifecycle::text in ('SUSPENDED','OFFBOARDING','ARCHIVED') then false
      when tenant.subscription_status in ('SUSPENDED','CANCELLED') then false
      else coalesce(chosen.enabled,false)
    end enabled,
    case
      when tenant.id is null then 'BUSINESS_NOT_FOUND'
      when not tenant.is_active then 'BUSINESS_INACTIVE'
      when p_branch_id is not null and not exists(
        select 1 from public.branches branch
        where branch.id=p_branch_id and branch.business_id=p_business_id and branch.is_active
      ) then 'BRANCH_UNAVAILABLE'
      when tenant.lifecycle::text in ('SUSPENDED','OFFBOARDING','ARCHIVED') then 'RESTAURANT_SUSPENDED'
      when tenant.subscription_status in ('SUSPENDED','CANCELLED') then 'SUBSCRIPTION_'||tenant.subscription_status
      when chosen.source is null then 'ENTITLEMENT_MISSING'
      when not chosen.enabled then 'ENTITLEMENT_DISABLED'
      else 'ENABLED'
    end reason,
    coalesce(chosen.source,'NONE') effective_source,
    tenant.package_code,
    chosen.limit_value
  from (select 1) seed
  left join tenant on true
  left join chosen on true;
$$;

revoke all on function public.runtime_entitlement_internal(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.resolve_runtime_entitlement(
  p_business_id uuid,
  p_branch_id uuid,
  p_capability_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare result record;
begin
  if auth.role()<>'service_role'
    and not exists(select 1 from public.staff_memberships membership where membership.business_id=p_business_id and membership.user_id=auth.uid() and membership.is_active)
    and not public.has_platform_permission('restaurants.view') then
    raise exception 'Entitlement access denied.' using errcode='42501';
  end if;
  select * into result from public.runtime_entitlement_internal(p_business_id,p_branch_id,lower(btrim(p_capability_key)));
  return jsonb_build_object(
    'enabled',coalesce(result.enabled,false),
    'reason',coalesce(result.reason,'ENTITLEMENT_MISSING'),
    'source',coalesce(result.effective_source,'NONE'),
    'packageCode',result.package_code,
    'limit',result.limit_value
  );
end;
$$;

create or replace function public.resolve_runtime_entitlements(
  p_business_id uuid,
  p_branch_id uuid,
  p_capability_keys text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare capability text; result jsonb:='{}'::jsonb;
begin
  if coalesce(array_length(p_capability_keys,1),0)>50 then raise exception 'Too many capabilities requested.' using errcode='22023'; end if;
  foreach capability in array p_capability_keys loop
    result:=result||jsonb_build_object(capability,public.resolve_runtime_entitlement(p_business_id,p_branch_id,capability));
  end loop;
  return result;
end;
$$;

revoke all on function public.resolve_runtime_entitlement(uuid,uuid,text),public.resolve_runtime_entitlements(uuid,uuid,text[]) from public,anon;
grant execute on function public.resolve_runtime_entitlement(uuid,uuid,text),public.resolve_runtime_entitlements(uuid,uuid,text[]) to authenticated,service_role;

-- Make the entitlement model explicit for restaurants created before the
-- platform package catalogue existed. New restaurants continue to inherit the
-- package selected by Super Admin.
insert into public.service_entitlements(business_id,capability_key,enabled,source,notes)
select business.id,capability.key,true,'PACKAGE','Legacy runtime baseline made explicit during entitlement rollout'
from public.businesses business
cross join (values
  ('admin.restaurant'),('pos.web'),('pos.desktop'),('inventory'),('kitchen'),
  ('waiter'),('rider'),('website.ordering'),('ordering.delivery'),
  ('ordering.pickup'),('loyalty'),('reports.advanced'),('mobile.android'),('mobile.ios')
) capability(key)
where not exists(
  select 1 from public.service_entitlements entitlement
  where entitlement.business_id=business.id and entitlement.capability_key=capability.key
)
on conflict do nothing;

-- Staff permission checks remain the role boundary and now also include the
-- effective commercial/runtime boundary. Feature-specific roles do not need
-- the full Restaurant Admin entitlement.
create or replace function public.has_permission(target_business uuid,requested_permission text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare role_granted boolean; capability_granted boolean;
begin
  select exists(
    select 1 from public.staff_memberships membership
    left join public.admin_role_permissions role_permission on role_permission.role=membership.role
    where membership.business_id=target_business and membership.user_id=auth.uid() and membership.is_active
      and (membership.role::text='OWNER' or role_permission.permission_code=requested_permission)
  ) into role_granted;
  if not role_granted then return false; end if;

  if requested_permission='waiter.use' then
    select enabled into capability_granted from public.runtime_entitlement_internal(target_business,null,'waiter');
  elsif requested_permission='rider.use' then
    select enabled into capability_granted from public.runtime_entitlement_internal(target_business,null,'rider');
  elsif requested_permission='kds.use' then
    select enabled into capability_granted from public.runtime_entitlement_internal(target_business,null,'kitchen');
  elsif requested_permission='pos.use' then
    select enabled into capability_granted from public.runtime_entitlement_internal(target_business,null,'pos.web');
  elsif requested_permission='desktop_pos.use' then
    select enabled into capability_granted from public.runtime_entitlement_internal(target_business,null,'pos.desktop');
  elsif requested_permission like 'inventory.%' or requested_permission in ('ingredients.manage','recipes.manage','purchases.manage','suppliers.manage','wastage.manage') then
    select enabled into capability_granted from public.runtime_entitlement_internal(target_business,null,'inventory');
  elsif requested_permission='loyalty.manage' then
    select enabled into capability_granted from public.runtime_entitlement_internal(target_business,null,'loyalty');
  elsif requested_permission='reports.read' then
    select enabled into capability_granted from public.runtime_entitlement_internal(target_business,null,'reports.advanced');
  elsif requested_permission in ('orders.read','orders.manage','notifications.read') then
    select bool_or(status.enabled) into capability_granted
    from (values('admin.restaurant'),('pos.web'),('pos.desktop'),('kitchen'),('waiter'),('rider')) requested(key)
    cross join lateral public.runtime_entitlement_internal(target_business,null,requested.key) status;
  elsif requested_permission in ('register.manage','receipts.print') then
    select bool_or(status.enabled) into capability_granted
    from (values('pos.web'),('pos.desktop')) requested(key)
    cross join lateral public.runtime_entitlement_internal(target_business,null,requested.key) status;
  else
    select enabled into capability_granted from public.runtime_entitlement_internal(target_business,null,'admin.restaurant');
  end if;
  return coalesce(capability_granted,false);
end;
$$;

-- This trigger is the final server-side boundary even when a caller bypasses
-- application navigation and invokes an order RPC directly.
create or replace function public.enforce_order_runtime_entitlement()
returns trigger language plpgsql security definer set search_path=public as $$
declare allowed boolean;
begin
  if new.channel='WEBSITE' then
    select bool_or(status.enabled) into allowed
    from (values('website.ordering'),('mobile.android'),('mobile.ios')) requested(key)
    cross join lateral public.runtime_entitlement_internal(new.business_id,new.branch_id,requested.key) status;
  else
    select bool_or(status.enabled) into allowed
    from (values('pos.web'),('pos.desktop'),('waiter')) requested(key)
    cross join lateral public.runtime_entitlement_internal(new.business_id,new.branch_id,requested.key) status;
  end if;
  if not coalesce(allowed,false) then raise exception 'Ordering capability is disabled for this restaurant.' using errcode='42501'; end if;
  select enabled into allowed from public.runtime_entitlement_internal(
    new.business_id,new.branch_id,case when new.service_mode='DELIVERY' then 'ordering.delivery' else 'ordering.pickup' end
  );
  if not coalesce(allowed,false) then raise exception '% ordering is disabled for this restaurant.',initcap(lower(new.service_mode::text)) using errcode='42501'; end if;
  return new;
end;
$$;
drop trigger if exists enforce_order_runtime_entitlement on public.orders;
create trigger enforce_order_runtime_entitlement before insert on public.orders
for each row execute function public.enforce_order_runtime_entitlement();
revoke all on function public.enforce_order_runtime_entitlement() from public,anon,authenticated;

-- Desktop RPCs use pos.use for staff authorization historically. Add a
-- desktop-specific guard without duplicating resolver rules in the clients.
create or replace function public.enforce_desktop_pos_entitlement()
returns trigger language plpgsql security definer set search_path=public as $$
declare allowed boolean;
begin
  select enabled into allowed from public.runtime_entitlement_internal(new.business_id,new.branch_id,'pos.desktop');
  if not coalesce(allowed,false) then raise exception 'Desktop POS capability is disabled.' using errcode='42501'; end if;
  return new;
end;
$$;
drop trigger if exists enforce_desktop_pos_device_entitlement on public.pos_offline_devices;
create trigger enforce_desktop_pos_device_entitlement before insert or update on public.pos_offline_devices
for each row execute function public.enforce_desktop_pos_entitlement();
drop trigger if exists enforce_desktop_pos_snapshot_entitlement on public.pos_catalog_snapshots;
create trigger enforce_desktop_pos_snapshot_entitlement before insert on public.pos_catalog_snapshots
for each row execute function public.enforce_desktop_pos_entitlement();
revoke all on function public.enforce_desktop_pos_entitlement() from public,anon,authenticated;

commit;
