-- Repair deployed email validation; preserve canonical authorization and audit behavior.
create or replace function public.save_staff_by_email_v2(
  p_business_id uuid,p_branch_ids uuid[],p_email text,p_role public.staff_role,p_active boolean,p_permissions text[]
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user uuid; v_id uuid; v_old public.staff_memberships; v_email text:=lower(btrim(p_email));
  v_owner boolean; v_code text; v_inv public.staff_invitations; v_branch_ids uuid[];
begin
  perform 1 from public.businesses where id=p_business_id for update;
  if not public.has_permission(p_business_id,'staff.manage') then raise exception 'Staff access denied.' using errcode='42501'; end if;
  select exists(select 1 from public.staff_memberships where business_id=p_business_id and user_id=auth.uid() and role='OWNER' and is_active) into v_owner;
  select coalesce(array_agg(distinct selected.branch_id order by selected.branch_id),'{}'::uuid[])
  into v_branch_ids
  from unnest(coalesce(p_branch_ids,'{}'::uuid[])) as selected(branch_id);
  if p_role<>'OWNER' and cardinality(v_branch_ids)=0 then raise exception 'Select at least one active branch.' using errcode='22023'; end if;
  if exists(
    select 1
    from unnest(v_branch_ids) as selected(branch_id)
    where not exists(
      select 1 from public.branches b
      where b.id=selected.branch_id and b.business_id=p_business_id and b.is_active
    )
  ) then
    raise exception 'One or more selected branches are unavailable.' using errcode='22023';
  end if;
  if not v_owner and exists(
    select 1 from unnest(v_branch_ids) as selected(branch_id)
    where not public.staff_can_access_branch(p_business_id,selected.branch_id)
  ) then raise exception 'You can assign only your allowed branches.' using errcode='42501'; end if;
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(v_email)>254 then raise exception 'Enter a valid employee email.' using errcode='22023'; end if;
  if p_role='OWNER' and not v_owner then raise exception 'Only an owner can assign owner access.' using errcode='42501'; end if;
  foreach v_code in array coalesce(p_permissions,'{}') loop
    if not exists(select 1 from public.admin_permissions where code=v_code) or not public.has_permission(p_business_id,v_code) then raise exception 'You cannot grant that permission.' using errcode='42501'; end if;
  end loop;
  select id into v_user from auth.users where lower(email)=v_email and email_confirmed_at is not null limit 1;
  if v_user is not null then
    select * into v_old from public.staff_memberships where business_id=p_business_id and user_id=v_user;
    if v_old.role='OWNER' and not v_owner then raise exception 'Only owners can change owner access.' using errcode='42501'; end if;
    insert into public.staff_memberships(business_id,user_id,branch_id,role,is_active,permissions_customized)
    values(p_business_id,v_user,case when p_role='OWNER' then null else v_branch_ids[1] end,p_role,p_active,true)
    on conflict(business_id,user_id) do update set branch_id=excluded.branch_id,role=excluded.role,is_active=excluded.is_active,permissions_customized=true,updated_at=now()
    returning id into v_id;
    delete from public.staff_membership_branches where membership_id=v_id;
    if p_role<>'OWNER' then
      insert into public.staff_membership_branches(membership_id,business_id,branch_id)
      select v_id,p_business_id,selected.branch_id
      from unnest(v_branch_ids) as selected(branch_id);
    end if;
    delete from public.staff_membership_permissions where membership_id=v_id;
    insert into public.staff_membership_permissions select v_id,unnest(coalesce(p_permissions,'{}')) on conflict do nothing;
    update public.staff_invitations set status='ACTIVATED',branch_id=coalesce(v_branch_ids[1],branch_id),branch_ids=v_branch_ids,activated_user_id=v_user,updated_at=now() where business_id=p_business_id and email=v_email;
    insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
    values(p_business_id,auth.uid(),case when v_old.id is null then 'STAFF_ACTIVATED' when not p_active then 'STAFF_DEACTIVATED' else 'PERMISSION_CHANGED' end,'staff_memberships',v_id::text,jsonb_build_object('email',v_email,'role',p_role,'branch_ids',v_branch_ids));
    return jsonb_build_object('status','ACTIVE','id',v_id,'email',v_email,'branch_ids',v_branch_ids);
  end if;
  select * into v_inv from public.staff_invitations where business_id=p_business_id and email=v_email;
  if v_inv.role='OWNER' and not v_owner then raise exception 'Only owners can change owner invitations.' using errcode='42501'; end if;
  insert into public.staff_invitations(business_id,branch_id,branch_ids,email,role,is_active,permissions,invited_by)
  values(p_business_id,coalesce(v_branch_ids[1],(select id from public.branches where business_id=p_business_id and is_active order by sort_order,id limit 1)),v_branch_ids,v_email,p_role,p_active,coalesce(p_permissions,'{}'),auth.uid())
  on conflict(business_id,email) do update set branch_id=excluded.branch_id,branch_ids=excluded.branch_ids,role=excluded.role,is_active=excluded.is_active,permissions=excluded.permissions,status='PENDING',delivery_status='NOT_SENT',updated_at=now()
  returning id into v_id;
  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
  values(p_business_id,auth.uid(),'STAFF_INVITED','staff_invitations',v_id::text,jsonb_build_object('email',v_email,'role',p_role,'branch_ids',v_branch_ids));
  return jsonb_build_object('status','PENDING','id',v_id,'email',v_email,'branch_ids',v_branch_ids);
end;
$$;

revoke all on function public.save_staff_by_email_v2(uuid,uuid[],text,public.staff_role,boolean,text[]) from public,anon;
grant execute on function public.save_staff_by_email_v2(uuid,uuid[],text,public.staff_role,boolean,text[]) to authenticated;
