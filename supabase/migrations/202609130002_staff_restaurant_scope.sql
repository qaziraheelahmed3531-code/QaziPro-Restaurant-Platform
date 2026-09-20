begin;

-- Staff invitations and non-owner memberships are tied to the restaurant branch
-- selected by the inviter. Owners remain business-wide by design.
alter table public.branches
  add constraint branches_business_id_id_unique unique (business_id, id);

alter table public.staff_memberships add column branch_id uuid;
alter table public.staff_invitations add column branch_id uuid;

update public.staff_memberships membership
set branch_id = (
  select branch.id from public.branches branch
  where branch.business_id = membership.business_id and branch.is_active
  order by branch.sort_order, branch.created_at, branch.id
  limit 1
)
where membership.role <> 'OWNER' and membership.branch_id is null;

update public.staff_invitations invitation
set branch_id = (
  select branch.id from public.branches branch
  where branch.business_id = invitation.business_id and branch.is_active
  order by branch.sort_order, branch.created_at, branch.id
  limit 1
)
where invitation.branch_id is null;

alter table public.staff_memberships
  add constraint staff_memberships_business_branch_fk foreign key (business_id, branch_id) references public.branches(business_id, id),
  add constraint staff_memberships_restaurant_scope check (role = 'OWNER' or branch_id is not null);

alter table public.staff_invitations
  alter column branch_id set not null,
  add constraint staff_invitations_business_branch_fk foreign key (business_id, branch_id) references public.branches(business_id, id);

create index staff_memberships_branch_id_idx on public.staff_memberships(branch_id) where is_active;
create index staff_invitations_branch_id_idx on public.staff_invitations(branch_id) where status = 'PENDING';

create or replace function public.staff_can_access_branch(target_business uuid, target_branch uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.staff_memberships membership
    where membership.business_id = target_business
      and membership.user_id = auth.uid()
      and membership.is_active
      and (membership.role = 'OWNER' or membership.branch_id = target_branch)
  );
$$;

drop function public.save_staff_by_email(uuid,text,public.staff_role,boolean,text[]);

create function public.save_staff_by_email(p_business_id uuid,p_branch_id uuid,p_email text,p_role public.staff_role,p_active boolean,p_permissions text[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user uuid;
  v_id uuid;
  v_old public.staff_memberships;
  v_email text := lower(btrim(p_email));
  v_owner boolean;
  v_code text;
  v_inv public.staff_invitations;
  v_membership_branch uuid;
begin
  perform 1 from public.businesses where id=p_business_id for update;
  if not public.has_permission(p_business_id,'staff.manage') then raise exception 'Staff access denied.' using errcode='42501'; end if;
  if not exists(select 1 from public.branches where id=p_branch_id and business_id=p_business_id and is_active) then raise exception 'Select an active restaurant branch.' using errcode='22023'; end if;
  select exists(select 1 from public.staff_memberships where business_id=p_business_id and user_id=auth.uid() and role='OWNER' and is_active) into v_owner;
  if v_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' or length(v_email)>254 then raise exception 'Enter a valid employee email.' using errcode='22023'; end if;
  if p_role='OWNER' and not v_owner then raise exception 'Only an owner can assign owner access.' using errcode='42501'; end if;
  foreach v_code in array coalesce(p_permissions,'{}') loop
    if not exists(select 1 from public.admin_permissions where code=v_code) or not public.has_permission(p_business_id,v_code) then raise exception 'You cannot grant that permission.' using errcode='42501'; end if;
  end loop;
  v_membership_branch := case when p_role='OWNER' then null else p_branch_id end;
  select id into v_user from auth.users where lower(email)=v_email and email_confirmed_at is not null limit 1;
  if v_user is not null then
    select * into v_old from public.staff_memberships where business_id=p_business_id and user_id=v_user;
    if v_old.role='OWNER' and not v_owner then raise exception 'Only owners can change owner access.' using errcode='42501'; end if;
    insert into public.staff_memberships(business_id,user_id,branch_id,role,is_active,permissions_customized)
    values(p_business_id,v_user,v_membership_branch,p_role,p_active,true)
    on conflict(business_id,user_id) do update set branch_id=excluded.branch_id,role=excluded.role,is_active=excluded.is_active,permissions_customized=true,updated_at=now()
    returning id into v_id;
    delete from public.staff_membership_permissions where membership_id=v_id;
    insert into public.staff_membership_permissions select v_id,unnest(coalesce(p_permissions,'{}')) on conflict do nothing;
    update public.staff_invitations set status='ACTIVATED',branch_id=p_branch_id,activated_user_id=v_user,updated_at=now() where business_id=p_business_id and email=v_email;
    insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
    values(p_business_id,auth.uid(),case when v_old.id is null then 'STAFF_ACTIVATED' when not p_active then 'STAFF_DEACTIVATED' else 'PERMISSION_CHANGED' end,'staff_memberships',v_id::text,jsonb_build_object('email',v_email,'role',p_role,'branch_id',p_branch_id));
    if v_old.id is not null and v_old.role<>p_role then insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id) values(p_business_id,auth.uid(),'ROLE_CHANGED','staff_memberships',v_id::text); end if;
    return jsonb_build_object('status','ACTIVE','id',v_id,'email',v_email,'branch_id',p_branch_id);
  end if;
  select * into v_inv from public.staff_invitations where business_id=p_business_id and email=v_email;
  if v_inv.role='OWNER' and not v_owner then raise exception 'Only owners can change owner invitations.' using errcode='42501'; end if;
  insert into public.staff_invitations(business_id,branch_id,email,role,is_active,permissions,invited_by)
  values(p_business_id,p_branch_id,v_email,p_role,p_active,coalesce(p_permissions,'{}'),auth.uid())
  on conflict(business_id,email) do update set branch_id=excluded.branch_id,role=excluded.role,is_active=excluded.is_active,permissions=excluded.permissions,status='PENDING',delivery_status='NOT_SENT',updated_at=now()
  returning id into v_id;
  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
  values(p_business_id,auth.uid(),'STAFF_INVITED','staff_invitations',v_id::text,jsonb_build_object('email',v_email,'role',p_role,'branch_id',p_branch_id));
  return jsonb_build_object('status','PENDING','id',v_id,'email',v_email,'branch_id',p_branch_id);
end; $$;

create or replace function public.claim_staff_invitations() returns void language plpgsql security definer set search_path=public as $$
declare v_email text; invitation public.staff_invitations; v_id uuid; v_membership_branch uuid;
begin
  select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_email is null then return; end if;
  for invitation in select * from public.staff_invitations where email=v_email and status='PENDING' and is_active order by business_id loop
    perform 1 from public.businesses where id=invitation.business_id for update;
    select * into invitation from public.staff_invitations where id=invitation.id and status='PENDING' and is_active for update;
    if not found then continue; end if;
    if not exists(select 1 from public.branches where id=invitation.branch_id and business_id=invitation.business_id and is_active) then continue; end if;
    v_membership_branch := case when invitation.role='OWNER' then null else invitation.branch_id end;
    insert into public.staff_memberships(business_id,user_id,branch_id,role,is_active,permissions_customized)
    values(invitation.business_id,auth.uid(),v_membership_branch,invitation.role,true,true)
    on conflict(business_id,user_id) do update set branch_id=excluded.branch_id,role=excluded.role,is_active=true,permissions_customized=true,updated_at=now()
    returning id into v_id;
    delete from public.staff_membership_permissions where membership_id=v_id;
    insert into public.staff_membership_permissions select v_id,unnest(invitation.permissions) on conflict do nothing;
    insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
    values(invitation.business_id,auth.uid(),'STAFF_ACTIVATED','staff_memberships',v_id::text,jsonb_build_object('branch_id',invitation.branch_id));
    update public.staff_invitations set status='ACTIVATED',activated_user_id=auth.uid(),updated_at=now() where id=invitation.id;
  end loop;
end; $$;

create or replace function public.staff_directory(p_business_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_permission(p_business_id,'staff.manage') then raise exception 'Staff access denied.' using errcode='42501'; end if;
  return jsonb_build_object(
    'members',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'email',u.email,'name',u.raw_user_meta_data->>'full_name','role',m.role,'is_active',m.is_active,'created_at',m.created_at,'last_sign_in_at',u.last_sign_in_at,
      'branch_id',m.branch_id,'branch_name',case when m.role='OWNER' then 'All restaurants' else concat_ws(' — ',coalesce(b.restaurant_name,b.name),b.city) end,
      'permissions',case when m.role='OWNER' then (select jsonb_agg(code) from public.admin_permissions) when m.permissions_customized then coalesce((select jsonb_agg(permission_code) from public.staff_membership_permissions where membership_id=m.id),'[]') else coalesce((select jsonb_agg(permission_code) from public.admin_role_permissions where role=m.role),'[]') end
    ) order by u.email) from public.staff_memberships m join auth.users u on u.id=m.user_id left join public.branches b on b.id=m.branch_id where m.business_id=p_business_id),'[]'),
    'invitations',coalesce((select jsonb_agg((to_jsonb(i)-'invited_by'-'activated_user_id') || jsonb_build_object('branch_name',concat_ws(' — ',coalesce(b.restaurant_name,b.name),b.city))) from public.staff_invitations i join public.branches b on b.id=i.branch_id where i.business_id=p_business_id and i.status='PENDING'),'[]')
  );
end; $$;

revoke all on function public.staff_can_access_branch(uuid,uuid),public.save_staff_by_email(uuid,uuid,text,public.staff_role,boolean,text[]) from public,anon;
grant execute on function public.staff_can_access_branch(uuid,uuid),public.save_staff_by_email(uuid,uuid,text,public.staff_role,boolean,text[]) to authenticated;

commit;
