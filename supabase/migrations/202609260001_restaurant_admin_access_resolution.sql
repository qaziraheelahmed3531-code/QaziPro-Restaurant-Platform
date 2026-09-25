begin;

-- Invitation lifecycle metadata is kept beside the canonical invitation. Auth
-- provider tokens may expire independently, but an expired/revoked QaziPro
-- invitation must never create or reactivate a membership.
alter table public.staff_invitations
  add column if not exists expires_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists revoked_at timestamptz;

update public.staff_invitations
set expires_at=coalesce(expires_at,created_at+interval '7 days')
where status='PENDING';

alter table public.staff_invitations
  drop constraint if exists staff_invitations_status_check;
alter table public.staff_invitations
  add constraint staff_invitations_status_check
  check(status in ('PENDING','ACTIVATED','EXPIRED','REVOKED'));

create or replace function public.claim_staff_invitations() returns void
language plpgsql security definer set search_path=public as $$
declare v_email text; invitation public.staff_invitations; v_id uuid; v_branch_ids uuid[];
begin
  select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_email is null then return; end if;

  update public.staff_invitations
  set status='EXPIRED',is_active=false,updated_at=now()
  where email=v_email and status='PENDING' and expires_at is not null and expires_at<=now();

  for invitation in
    select * from public.staff_invitations
    where email=v_email and status='PENDING' and is_active
      and (expires_at is null or expires_at>now())
    order by business_id
  loop
    perform 1 from public.businesses where id=invitation.business_id for update;
    select * into invitation from public.staff_invitations
    where id=invitation.id and status='PENDING' and is_active
      and (expires_at is null or expires_at>now())
    for update;
    if not found then continue; end if;

    select coalesce(array_agg(selected.branch_id),'{}'::uuid[]) into v_branch_ids
    from unnest(invitation.branch_ids) as selected(branch_id)
    where exists(
      select 1 from public.branches b
      where b.id=selected.branch_id and b.business_id=invitation.business_id and b.is_active
    );
    if invitation.role<>'OWNER' and cardinality(v_branch_ids)=0 then continue; end if;

    insert into public.staff_memberships(business_id,user_id,branch_id,role,is_active,permissions_customized)
    values(invitation.business_id,auth.uid(),case when invitation.role='OWNER' then null else v_branch_ids[1] end,invitation.role,true,true)
    on conflict(business_id,user_id) do update
      set branch_id=excluded.branch_id,role=excluded.role,is_active=true,
          permissions_customized=true,updated_at=now()
    returning id into v_id;

    delete from public.staff_membership_branches where membership_id=v_id;
    if invitation.role<>'OWNER' then
      insert into public.staff_membership_branches(membership_id,business_id,branch_id,created_at)
      select v_id,invitation.business_id,selected.branch_id,now()
      from unnest(v_branch_ids) as selected(branch_id);
    end if;
    delete from public.staff_membership_permissions where membership_id=v_id;
    insert into public.staff_membership_permissions
      select v_id,unnest(invitation.permissions) on conflict do nothing;
    insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
    values(invitation.business_id,auth.uid(),'STAFF_ACTIVATED','staff_memberships',v_id::text,jsonb_build_object('branch_ids',v_branch_ids,'invitation_id',invitation.id));
    update public.staff_invitations
      set status='ACTIVATED',activated_user_id=auth.uid(),accepted_at=now(),updated_at=now()
      where id=invitation.id;
  end loop;
end;
$$;

-- This is the single post-authentication authorization resolver for every
-- Restaurant Admin login method. It never grants access from email alone.
create or replace function public.resolve_restaurant_admin_access(p_business_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_user uuid:=auth.uid(); v_email text; v_membership public.staff_memberships;
  v_business public.businesses; v_lifecycle text; v_branch_ids uuid[]:='{}';
  v_capability text; v_entitlement record; v_invitation record; v_reason text;
begin
  if v_user is null then return jsonb_build_object('allowed',false,'reason','AUTHENTICATION_REQUIRED'); end if;
  select lower(email) into v_email from auth.users where id=v_user;

  if p_business_id is not null then
    select * into v_membership from public.staff_memberships
    where user_id=v_user and business_id=p_business_id
    order by is_active desc,updated_at desc limit 1;
  else
    select * into v_membership from public.staff_memberships
    where user_id=v_user order by is_active desc,updated_at desc limit 1;
  end if;

  if v_membership.id is null then
    select status,is_active,expires_at into v_invitation from public.staff_invitations
    where email=v_email and (p_business_id is null or business_id=p_business_id)
    order by updated_at desc limit 1;
    v_reason:=case
      when v_invitation.status='EXPIRED' or (v_invitation.status='PENDING' and v_invitation.expires_at<=now()) then 'INVITATION_EXPIRED'
      when v_invitation.status='REVOKED' or (v_invitation.status='PENDING' and not v_invitation.is_active) then 'INVITATION_REVOKED'
      when v_invitation.status='ACTIVATED' then 'MEMBERSHIP_LINK_INCOMPLETE'
      when v_invitation.status='PENDING' then 'INVITATION_INCOMPLETE'
      else 'NO_MEMBERSHIP' end;
    return jsonb_build_object('allowed',false,'reason',v_reason);
  end if;

  select * into v_business from public.businesses where id=v_membership.business_id;
  select lifecycle::text into v_lifecycle from public.restaurant_onboarding
    where business_id=v_membership.business_id order by updated_at desc limit 1;

  if v_membership.role='OWNER' then
    select coalesce(array_agg(id order by sort_order,id),'{}') into v_branch_ids
    from public.branches where business_id=v_membership.business_id and is_active;
  else
    select coalesce(array_agg(distinct branch_id),'{}') into v_branch_ids from (
      select assignment.branch_id from public.staff_membership_branches assignment
      join public.branches branch on branch.id=assignment.branch_id
      where assignment.membership_id=v_membership.id and branch.business_id=v_membership.business_id and branch.is_active
      union
      select branch.id from public.branches branch
      where branch.id=v_membership.branch_id and branch.business_id=v_membership.business_id and branch.is_active
    ) scoped;
  end if;

  v_capability:=case v_membership.role::text
    when 'CASHIER' then 'pos.web' when 'KITCHEN' then 'kitchen'
    when 'WAITER' then 'waiter' when 'RIDER' then 'rider'
    else 'admin.restaurant' end;
  select * into v_entitlement from public.runtime_entitlement_internal(v_membership.business_id,null,v_capability);

  v_reason:=case
    when not v_membership.is_active then 'MEMBERSHIP_INACTIVE'
    when v_business.id is null then 'BUSINESS_NOT_FOUND'
    when not v_business.is_active then 'RESTAURANT_INACTIVE'
    when v_lifecycle in ('SUSPENDED','OFFBOARDING','ARCHIVED') then 'RESTAURANT_SUSPENDED'
    when v_membership.role<>'OWNER' and cardinality(v_branch_ids)=0 then 'BRANCH_ACCESS_MISSING'
    when not coalesce(v_entitlement.enabled,false) then coalesce(v_entitlement.reason,'ENTITLEMENT_DISABLED')
    else 'AUTHORIZED' end;

  return jsonb_build_object(
    'allowed',v_reason='AUTHORIZED','reason',v_reason,
    'membershipId',v_membership.id,'businessId',v_membership.business_id,
    'businessName',coalesce(v_business.name,'Restaurant'),'role',v_membership.role,
    'membershipActive',v_membership.is_active,'businessActive',coalesce(v_business.is_active,false),
    'lifecycle',coalesce(v_lifecycle,'UNTRACKED'),'branchIds',to_jsonb(v_branch_ids),
    'capability',v_capability,'entitlementReason',coalesce(v_entitlement.reason,'ENTITLEMENT_MISSING')
  );
end;
$$;

revoke all on function public.resolve_restaurant_admin_access(uuid) from public,anon;
grant execute on function public.resolve_restaurant_admin_access(uuid) to authenticated,service_role;

-- Platform-only view of the same canonical membership/runtime facts used by
-- Restaurant Admin. This prevents Restaurant 360 from displaying a misleading
-- ACTIVE badge while hiding an explicit lifecycle or entitlement blocker.
create or replace function public.platform_restaurant_access_summary(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
begin
  if not public.has_platform_permission('restaurants.view') then
    raise exception 'PLATFORM_PERMISSION_DENIED' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',membership.id,'user_id',membership.user_id,'email',auth_user.email,
      'role',membership.role,'is_active',membership.is_active,
      'last_sign_in_at',auth_user.last_sign_in_at,'created_at',membership.created_at,'updated_at',membership.updated_at,
      'branch_ids',case when membership.role='OWNER' then
        coalesce((select jsonb_agg(branch.id order by branch.sort_order,branch.id) from public.branches branch where branch.business_id=membership.business_id and branch.is_active),'[]')
      else coalesce((select jsonb_agg(assignment.branch_id order by branch.sort_order,branch.id) from public.staff_membership_branches assignment join public.branches branch on branch.id=assignment.branch_id where assignment.membership_id=membership.id and branch.is_active),'[]') end,
      'access_reason',case
        when not membership.is_active then 'MEMBERSHIP_INACTIVE'
        when not business.is_active then 'RESTAURANT_INACTIVE'
        when onboarding.lifecycle::text in ('SUSPENDED','OFFBOARDING','ARCHIVED') then 'RESTAURANT_SUSPENDED'
        when membership.role<>'OWNER' and not exists(select 1 from public.staff_membership_branches assignment join public.branches branch on branch.id=assignment.branch_id where assignment.membership_id=membership.id and branch.is_active) then 'BRANCH_ACCESS_MISSING'
        when not entitlement.enabled then entitlement.reason
        else 'AUTHORIZED' end
    ) order by membership.created_at)
    from public.staff_memberships membership
    join public.businesses business on business.id=membership.business_id
    join auth.users auth_user on auth_user.id=membership.user_id
    left join lateral (select item.lifecycle from public.restaurant_onboarding item where item.business_id=membership.business_id order by item.updated_at desc limit 1) onboarding on true
    cross join lateral public.runtime_entitlement_internal(membership.business_id,null,case membership.role::text when 'CASHIER' then 'pos.web' when 'KITCHEN' then 'kitchen' when 'WAITER' then 'waiter' when 'RIDER' then 'rider' else 'admin.restaurant' end) entitlement
    where membership.business_id=p_business_id
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.platform_restaurant_access_summary(uuid) from public,anon;
grant execute on function public.platform_restaurant_access_summary(uuid) to authenticated,service_role;

create or replace function public.platform_update_restaurant_membership(
  p_business_id uuid,
  p_membership_id uuid,
  p_role public.staff_role,
  p_active boolean,
  p_branch_ids uuid[],
  p_reason text
) returns void language plpgsql security definer set search_path=public,auth as $$
declare v_before public.staff_memberships; v_branch_ids uuid[];
begin
  if not public.has_platform_permission('restaurants.edit') then
    raise exception 'PLATFORM_PERMISSION_DENIED' using errcode='42501';
  end if;
  if char_length(btrim(coalesce(p_reason,'')))<3 then
    raise exception 'AUDIT_REASON_REQUIRED' using errcode='22023';
  end if;
  perform 1 from public.businesses where id=p_business_id for update;
  select * into v_before from public.staff_memberships
    where id=p_membership_id and business_id=p_business_id for update;
  if v_before.id is null then raise exception 'MEMBERSHIP_NOT_FOUND' using errcode='P0002'; end if;

  select coalesce(array_agg(branch.id order by branch.sort_order,branch.id),'{}') into v_branch_ids
  from public.branches branch
  where branch.business_id=p_business_id and branch.is_active and branch.id=any(coalesce(p_branch_ids,'{}'));
  if p_role<>'OWNER' and p_active and cardinality(v_branch_ids)=0 then
    raise exception 'ACTIVE_BRANCH_REQUIRED' using errcode='22023';
  end if;

  update public.staff_memberships set role=p_role,is_active=p_active,
    branch_id=case when p_role='OWNER' then null else v_branch_ids[1] end,
    updated_at=now() where id=p_membership_id and business_id=p_business_id;
  delete from public.staff_membership_branches where membership_id=p_membership_id;
  if p_role<>'OWNER' then
    insert into public.staff_membership_branches(membership_id,business_id,branch_id)
      select p_membership_id,p_business_id,branch_id from unnest(v_branch_ids) selected(branch_id);
  end if;
  insert into public.platform_audit_logs(actor_user_id,action,target_type,target_id,business_id,reason,before_data,after_data)
  values(auth.uid(),'RESTAURANT_MEMBERSHIP_UPDATED','staff_memberships',p_membership_id::text,p_business_id,btrim(p_reason),to_jsonb(v_before),jsonb_build_object('role',p_role,'is_active',p_active,'branch_ids',v_branch_ids));
end;
$$;

revoke all on function public.platform_update_restaurant_membership(uuid,uuid,public.staff_role,boolean,uuid[],text) from public,anon;
grant execute on function public.platform_update_restaurant_membership(uuid,uuid,public.staff_role,boolean,uuid[],text) to authenticated;

commit;
