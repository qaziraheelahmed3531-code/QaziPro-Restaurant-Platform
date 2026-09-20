begin;

-- Keep waiter cash settlement idempotent without assigning a row that the
-- function never reads. This removes the database linter warning while
-- preserving the existing locking, authorization and ledger behavior.
create or replace function public.settle_waiter_pos_order(p_order_id uuid,p_shift_id uuid,p_cash_received integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  target_order public.orders;
  shift_record public.register_shifts;
  received integer:=greatest(0,coalesce(p_cash_received,0));
begin
  select * into target_order from public.orders where id=p_order_id and channel='POS' and waiter_id is not null for update;
  if not found or not public.has_permission(target_order.business_id,'pos.use') or not public.staff_can_access_branch(target_order.business_id,target_order.branch_id) then
    raise exception 'Waiter POS order is unavailable.' using errcode='42501';
  end if;
  if target_order.status='CANCELLED' then raise exception 'Cancelled orders cannot be paid.' using errcode='22023'; end if;
  perform 1 from public.payment_transactions where order_id=target_order.id and status in ('PAID','PARTIALLY_REFUNDED','REFUNDED') limit 1;
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

revoke all on function public.settle_waiter_pos_order(uuid,uuid,integer) from public,anon;
grant execute on function public.settle_waiter_pos_order(uuid,uuid,integer) to authenticated;

commit;
