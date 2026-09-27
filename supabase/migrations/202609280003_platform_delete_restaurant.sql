begin;

-- One transaction removes the tenant's records in foreign-key order. The
-- platform audit trail intentionally survives, detached from the deleted row.
create or replace function public.platform_delete_restaurant(
  p_business_id uuid, p_confirm_slug text, p_reason text
) returns boolean language plpgsql security definer set search_path=public,auth as $$
declare target public.businesses;
begin
  if not public.has_platform_permission('restaurants.edit') or not exists (
    select 1 from public.platform_staff s
      join public.platform_staff_roles a on a.staff_user_id=s.user_id
      join public.platform_roles r on r.id=a.role_id
    where s.user_id=auth.uid() and s.status='ACTIVE' and s.access_revoked_at is null
      and r.key='PLATFORM_OWNER'
  ) then raise exception 'Platform owner required' using errcode='42501'; end if;
  if length(btrim(coalesce(p_reason,''))) < 10 then raise exception 'A detailed audit reason is required' using errcode='22023'; end if;
  select * into target from public.businesses where id=p_business_id for update;
  if not found then raise exception 'Restaurant no longer exists' using errcode='22023'; end if;
  if p_confirm_slug is distinct from target.slug then
    raise exception 'Restaurant confirmation does not match' using errcode='22023';
  end if;

  -- These operational/financial references have RESTRICT or NO ACTION FKs.
  delete from public.customer_notification_outbox where business_id=p_business_id;
  delete from public.customer_broadcasts where business_id=p_business_id;
  delete from public.refunds where business_id=p_business_id;
  delete from public.invoice_lines where invoice_id in (select id from public.invoices where business_id=p_business_id);
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
    values(auth.uid(),'RESTAURANT_PERMANENTLY_DELETED','businesses',p_business_id::text,p_business_id,
      p_reason,jsonb_build_object('name',target.name,'slug',target.slug));
  delete from public.businesses where id=p_business_id;
  return true;
end;
$$;
revoke all on function public.platform_delete_restaurant(uuid,text,text) from public;
revoke all on function public.platform_delete_restaurant(uuid,text,text) from anon;
grant execute on function public.platform_delete_restaurant(uuid,text,text) to authenticated;

commit;
