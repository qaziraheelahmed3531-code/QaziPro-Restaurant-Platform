begin;

-- A tenant-specific, transaction-local teardown marker is not authorization.
-- Re-check the active Platform Owner identity as well. Ordinary restaurant
-- writes, cross-branch operations and invoice edits retain their guards.
create or replace function public.platform_permanent_delete_scope(p_business_id uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select p_business_id is not null
    and current_setting('qazipro.permanent_delete_business',true)=p_business_id::text
    and public.has_platform_permission('restaurants.edit')
    and exists (
      select 1 from public.platform_staff s
        join public.platform_staff_roles a on a.staff_user_id=s.user_id
        join public.platform_roles r on r.id=a.role_id
      where s.user_id=auth.uid() and s.status='ACTIVE' and s.access_revoked_at is null and r.key='PLATFORM_OWNER'
    );
$$;
revoke all on function public.platform_permanent_delete_scope(uuid) from public,anon;
grant execute on function public.platform_permanent_delete_scope(uuid) to authenticated;

create or replace function public.enforce_branch_owned_write()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  row_data jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_business uuid:=nullif(row_data->>'business_id','')::uuid;
  target_branch uuid:=nullif(row_data->>'branch_id','')::uuid;
  branch_business uuid;
begin
  if tg_op='DELETE' and target_business is not null then
    if not exists(select 1 from public.businesses where id=target_business)
      or public.platform_permanent_delete_scope(target_business) then return old; end if;
  end if;
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

create or replace function public.enforce_invoice_line_branch_write()
returns trigger language plpgsql security definer set search_path=public as $$
declare target_invoice uuid:=case when tg_op='DELETE' then old.invoice_id else new.invoice_id end;
declare invoice_record public.invoices;
begin
  select * into invoice_record from public.invoices where id=target_invoice;
  if tg_op='DELETE' and public.platform_permanent_delete_scope(invoice_record.business_id) then return old; end if;
  if auth.uid() is not null and (invoice_record.id is null or not public.staff_can_access_branch(invoice_record.business_id,invoice_record.branch_id)) then
    raise exception 'Branch access denied.' using errcode='42501';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create or replace function public.guard_invoice_lines()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and exists(select 1 from public.invoices i where i.id=old.invoice_id
    and public.platform_permanent_delete_scope(i.business_id)) then return old; end if;
  if exists(select 1 from public.invoices where id=case when tg_op='DELETE' then old.invoice_id else new.invoice_id end and status<>'DRAFT') then
    raise exception 'Finalized invoice lines cannot be changed.' using errcode='22023';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

-- Match the legacy admin audit policy: cascades after the parent disappears
-- cannot insert a tenant audit FK. The durable platform deletion audit stays.
create or replace function public.record_operational_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare data jsonb; target_business uuid;
begin
  data:=coalesce(to_jsonb(new),to_jsonb(old)); target_business:=nullif(data->>'business_id','')::uuid;
  if target_business is not null and auth.uid() is not null
    and exists(select 1 from public.businesses where id=target_business) then
    insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
      values(target_business,auth.uid(),upper(tg_op),tg_table_name,coalesce(data->>'id',data->>'order_id'),jsonb_build_object('source','operations-trigger'));
  end if;
  return coalesce(new,old);
end;
$$;

create or replace function public.platform_delete_restaurant(p_business_id uuid,p_confirm_slug text,p_reason text)
returns boolean language plpgsql security definer set search_path=public,auth as $$
declare target public.businesses;
declare previous_scope text:=current_setting('qazipro.permanent_delete_business',true);
begin
  if not public.has_platform_permission('restaurants.edit') or not exists (
    select 1 from public.platform_staff s
      join public.platform_staff_roles a on a.staff_user_id=s.user_id
      join public.platform_roles r on r.id=a.role_id
    where s.user_id=auth.uid() and s.status='ACTIVE' and s.access_revoked_at is null and r.key='PLATFORM_OWNER'
  ) then raise exception 'Platform owner required' using errcode='42501'; end if;
  if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'A detailed audit reason is required' using errcode='22023'; end if;
  select * into target from public.businesses where id=p_business_id for update;
  if not found then raise exception 'Restaurant no longer exists' using errcode='22023'; end if;
  if p_confirm_slug is distinct from target.slug then raise exception 'Restaurant confirmation does not match' using errcode='22023'; end if;
  perform set_config('qazipro.permanent_delete_business',p_business_id::text,true);

  delete from public.customer_notification_outbox where business_id=p_business_id;
  delete from public.customer_broadcasts where business_id=p_business_id;
  delete from public.refunds where business_id=p_business_id;
  delete from public.invoice_lines where invoice_id in(select id from public.invoices where business_id=p_business_id);
  delete from public.payment_transactions where business_id=p_business_id;
  delete from public.pos_order_replacements where business_id=p_business_id;
  delete from public.invoices where business_id=p_business_id;
  delete from public.cash_movements where business_id=p_business_id;
  delete from public.restaurant_table_sessions where business_id=p_business_id;
  delete from public.orders where business_id=p_business_id;
  delete from public.stock_movements where business_id=p_business_id;
  delete from public.wastage where business_id=p_business_id;
  delete from public.purchases where business_id=p_business_id;
  delete from public.register_shifts where business_id=p_business_id;
  delete from public.staff_invitations where business_id=p_business_id;
  delete from public.support_tickets where business_id=p_business_id;
  delete from public.restaurant_onboarding where business_id=p_business_id;
  delete from public.restaurant_subscriptions where business_id=p_business_id;
  delete from public.invoice_sequences where business_id=p_business_id;
  delete from public.invoice_settings where business_id=p_business_id;
  delete from public.platform_tasks where business_id=p_business_id;
  delete from public.platform_incidents where business_id=p_business_id;
  delete from public.deployment_records where business_id=p_business_id;
  insert into public.platform_audit_logs(actor_user_id,action,target_type,target_id,business_id,reason,after_data)
    values(auth.uid(),'RESTAURANT_PERMANENTLY_DELETED','businesses',p_business_id::text,p_business_id,p_reason,
      jsonb_build_object('name',target.name,'slug',target.slug));
  delete from public.businesses where id=p_business_id;
  perform set_config('qazipro.permanent_delete_business',coalesce(previous_scope,''),true);
  return true;
end;
$$;
revoke all on function public.platform_delete_restaurant(uuid,text,text) from public,anon;
grant execute on function public.platform_delete_restaurant(uuid,text,text) to authenticated;

commit;
