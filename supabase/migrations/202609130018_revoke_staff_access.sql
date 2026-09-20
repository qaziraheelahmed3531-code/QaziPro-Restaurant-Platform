begin;

create or replace function public.revoke_staff_access(p_business_id uuid, p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.staff_memberships;
  v_member public.staff_memberships;
  v_invitation public.staff_invitations;
  v_email text;
begin
  perform 1 from public.businesses where id = p_business_id for update;

  select * into v_actor
  from public.staff_memberships
  where business_id = p_business_id and user_id = auth.uid() and is_active
  for update;

  if not found or not public.has_permission(p_business_id, 'staff.manage') then
    raise exception 'Staff access denied.' using errcode = '42501';
  end if;

  select * into v_member
  from public.staff_memberships
  where id = p_staff_id and business_id = p_business_id
  for update;

  if found then
    if v_member.user_id = auth.uid() then
      raise exception 'You cannot remove your own access.' using errcode = '22023';
    end if;
    if v_member.role = 'OWNER' and v_actor.role <> 'OWNER' then
      raise exception 'Only an owner can remove owner access.' using errcode = '42501';
    end if;
    if v_actor.role <> 'OWNER' and v_member.branch_id is distinct from v_actor.branch_id then
      raise exception 'You can remove staff only from your assigned restaurant.' using errcode = '42501';
    end if;

    select lower(email) into v_email from auth.users where id = v_member.user_id;
    delete from public.staff_invitations
    where business_id = p_business_id and lower(email) = v_email;
    delete from public.staff_memberships where id = v_member.id;

    insert into public.audit_logs(business_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      p_business_id,
      auth.uid(),
      'STAFF_ACCESS_REMOVED',
      'staff_memberships',
      v_member.id::text,
      jsonb_build_object('email', v_email, 'role', v_member.role, 'branch_id', v_member.branch_id)
    );

    return jsonb_build_object('kind', 'MEMBERSHIP', 'email', v_email);
  end if;

  select * into v_invitation
  from public.staff_invitations
  where id = p_staff_id and business_id = p_business_id and status = 'PENDING'
  for update;

  if not found then
    raise exception 'Staff member or pending invitation was not found.' using errcode = '22023';
  end if;
  if v_invitation.role = 'OWNER' and v_actor.role <> 'OWNER' then
    raise exception 'Only an owner can remove owner access.' using errcode = '42501';
  end if;
  if v_actor.role <> 'OWNER' and v_invitation.branch_id is distinct from v_actor.branch_id then
    raise exception 'You can remove staff only from your assigned restaurant.' using errcode = '42501';
  end if;

  delete from public.staff_invitations where id = v_invitation.id;
  insert into public.audit_logs(business_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_business_id,
    auth.uid(),
    'STAFF_INVITATION_CANCELLED',
    'staff_invitations',
    v_invitation.id::text,
    jsonb_build_object('email', v_invitation.email, 'role', v_invitation.role, 'branch_id', v_invitation.branch_id)
  );

  return jsonb_build_object('kind', 'INVITATION', 'email', v_invitation.email);
end;
$$;

revoke all on function public.revoke_staff_access(uuid, uuid) from public, anon;
grant execute on function public.revoke_staff_access(uuid, uuid) to authenticated;

commit;
