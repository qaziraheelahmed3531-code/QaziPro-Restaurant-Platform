begin;

create or replace function public.create_pos_order(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  target_business uuid;
  shift_record public.register_shifts;
  order_result jsonb;
  target_order public.orders;
  existing public.orders;
  tender public.pos_payment_methods;
  tender_code text := upper(btrim(coalesce(p_payload->>'paymentMethodCode','CASH')));
  tender_reference text := nullif(left(btrim(coalesce(p_payload->>'paymentReference','')),120),'');
  received integer;
begin
  select business_id into target_business from public.branches where id=(p_payload->>'branchId')::uuid and is_active;
  if target_business is null or not public.staff_can_access_branch(target_business,(p_payload->>'branchId')::uuid)
    or not public.has_permission(target_business,'pos.use') then
    raise exception 'POS access denied.' using errcode='42501';
  end if;
  if nullif(p_payload->>'clientReference','') is not null then
    select * into existing from public.orders where business_id=target_business and client_reference=p_payload->>'clientReference';
    if found then
      return jsonb_build_object('id',existing.id,'orderNumber',existing.order_number,'tokenNumber',existing.token_number,
        'total',existing.total,'change',0,'paymentMethod',coalesce(existing.payment_reference,tender_code),'idempotent',true);
    end if;
  end if;
  select * into tender from public.pos_payment_methods
  where business_id=target_business and code=tender_code and is_active for share;
  if not found then raise exception 'Choose an active POS payment method.' using errcode='22023'; end if;
  if tender.requires_reference and tender_reference is null then
    raise exception 'Enter the payment sender or transaction reference.' using errcode='22023';
  end if;
  if tender_reference is not null and tender_reference ~ '[\r\n\t]' then
    raise exception 'Payment reference contains invalid characters.' using errcode='22023';
  end if;
  select * into shift_record from public.register_shifts
  where id=(p_payload->>'shiftId')::uuid and branch_id=(p_payload->>'branchId')::uuid
    and opened_by=auth.uid() and status='OPEN' for update;
  if not found then raise exception 'Open your register shift before taking a counter sale.' using errcode='22023'; end if;
  order_result:=public.create_order_authoritative(jsonb_build_object(
    'channel','POS','branchId',p_payload->>'branchId','serviceMode','PICKUP','paymentMethod','CASH_ON_DELIVERY',
    'customerName',coalesce(nullif(left(btrim(p_payload->>'customerName'),120),''),'Counter guest'),
    'customerPhone',coalesce(nullif(left(btrim(p_payload->>'customerPhone'),40),''),'Counter'),
    'deliveryInstructions',nullif(left(btrim(p_payload->>'notes'),500),''),'items',p_payload->'items'
  ),null);
  update public.orders set
    channel='POS',operational_order_type=coalesce(nullif(p_payload->>'orderType',''),'TAKEAWAY'),
    client_reference=nullif(p_payload->>'clientReference',''),order_notes=nullif(left(btrim(p_payload->>'notes'),500),''),
    status='CONFIRMED',payment_method=case when tender.kind='CASH' then 'CASH_ON_DELIVERY'::public.payment_method else 'ONLINE'::public.payment_method end,
    payment_reference=coalesce(tender_reference,tender.code)
  where id=(order_result->>'id')::uuid returning * into target_order;
  received:=coalesce(nullif(p_payload->>'cashReceived','')::integer,0);
  if tender.kind='CASH' and received < target_order.total then
    raise exception 'Cash received is less than the order total.' using errcode='22023';
  end if;
  insert into public.payment_transactions(
    business_id,branch_id,order_id,shift_id,provider,payment_method,provider_transaction_id,
    idempotency_key,amount,status,paid_at,metadata_safe
  ) values (
    target_business,target_order.branch_id,target_order.id,shift_record.id,'POS_'||tender.code,tender.code,
    tender_reference,'pos-'||target_order.id,target_order.total,'PAID',now(),
    jsonb_build_object('methodName',tender.name,'kind',tender.kind,'reference',tender_reference)
  );
  update public.orders set payment_status='PAID' where id=target_order.id;
  return (order_result-'guestTrackingToken')||jsonb_build_object(
    'tokenNumber',target_order.token_number,'change',case when tender.kind='CASH' then received-target_order.total else 0 end,
    'paymentMethod',tender.code,'paymentMethodName',tender.name,'channel','POS','status','CONFIRMED'
  );
end; $$;

revoke all on function public.create_pos_order(jsonb) from public,anon;
grant execute on function public.create_pos_order(jsonb) to authenticated;

commit;
