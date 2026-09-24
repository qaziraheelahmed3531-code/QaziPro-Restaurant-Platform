begin;

-- Preserve customized staff grants while applying the runtime entitlement
-- boundary. The first entitlement migration accidentally consulted only role
-- defaults, which denied valid branch-scoped custom staff permissions.
create or replace function public.has_permission(target_business uuid,requested_permission text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare role_granted boolean; capability_granted boolean;
begin
  select exists(
    select 1
    from public.staff_memberships membership
    where membership.business_id=target_business
      and membership.user_id=auth.uid()
      and membership.is_active
      and (
        membership.role::text='OWNER'
        or (
          membership.permissions_customized
          and exists(
            select 1 from public.staff_membership_permissions custom_permission
            where custom_permission.membership_id=membership.id
              and custom_permission.permission_code=requested_permission
          )
        )
        or (
          not membership.permissions_customized
          and exists(
            select 1 from public.admin_role_permissions role_permission
            where role_permission.role=membership.role
              and role_permission.permission_code=requested_permission
          )
        )
      )
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

revoke all on function public.has_permission(uuid,text) from public,anon;
grant execute on function public.has_permission(uuid,text) to authenticated,service_role;

commit;
