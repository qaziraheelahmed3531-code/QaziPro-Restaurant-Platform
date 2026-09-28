begin;

-- Keep all pricing, stock, invoice and kitchen triggers on the canonical order
-- transaction. Permit authorized counter staff to use its existing table path.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.create_order_authoritative(jsonb,uuid)'::regprocedure) into definition;
  if position('Use the canonical waiter action for staff table orders.' in definition)=0 then
    raise exception 'Unexpected authoritative order definition; inspect before applying POS integration.';
  end if;
  definition:=replace(definition,
    'if channel_value<>''WEBSITE'' then raise exception ''Use the canonical waiter action for staff table orders.'' using errcode=''22023''; end if;',
    'if channel_value=''POS'' and (not public.has_permission(branch_record.business_id,''pos.use'') or not public.staff_can_access_branch(branch_record.business_id,branch_record.id)) then raise exception ''Table order access denied.'' using errcode=''42501''; end if;');
  definition:=replace(definition,
    'if not exists(select 1 from public.resolve_public_table(branch_record.business_id,p_payload->>''tableToken'')) then',
    'if channel_value=''WEBSITE'' and not exists(select 1 from public.resolve_public_table(branch_record.business_id,p_payload->>''tableToken'')) then');
  definition:=replace(definition,
    'values(branch_record.business_id,branch_record.id,table_record.id,new_order_id,null,''QR'');',
    'values(branch_record.business_id,branch_record.id,table_record.id,new_order_id,case when channel_value=''POS'' then auth.uid() end,case when channel_value=''POS'' then ''WAITER'' else ''QR'' end);');
  execute definition;
end;
$migration$;

create or replace function public.create_pos_order(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  target_business uuid; target_branch uuid; shift_record public.register_shifts;
  result jsonb; target_order public.orders; existing public.orders;
  previous public.checkout_idempotency; tender public.pos_payment_methods;
  table_record public.restaurant_tables; received integer; request_hash text;
  reference text:=nullif(btrim(p_payload->>'clientReference'),'');
  request_key text; order_type text:=coalesce(nullif(p_payload->>'orderType',''),'TAKEAWAY');
  tender_code text:=upper(btrim(coalesce(p_payload->>'paymentMethodCode','CASH')));
  tender_reference text:=nullif(left(btrim(coalesce(p_payload->>'paymentReference','')),120),'');
begin
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>100000 then
    raise exception 'Invalid POS request.' using errcode='22023';
  end if;
  target_branch:=(p_payload->>'branchId')::uuid;
  select business_id into target_business from public.branches where id=target_branch and is_active;
  if auth.uid() is null or target_business is null
    or not public.staff_can_access_branch(target_business,target_branch)
    or not public.has_permission(target_business,'pos.use')
    or not coalesce((select enabled from public.runtime_entitlement_internal(target_business,target_branch,'pos.web')),false) then
    raise exception 'POS access denied.' using errcode='42501';
  end if;
  if reference is null or reference !~ '^[A-Za-z0-9._:-]{8,124}$' then
    raise exception 'A valid sale reference is required.' using errcode='22023';
  end if;
  request_key:='pos:'||reference;
  request_hash:=encode(extensions.digest((p_payload||jsonb_build_object('actor',auth.uid()))::text,'sha256'),'hex');
  -- Serialize before checking replay, including concurrent requests on one shift.
  perform pg_advisory_xact_lock(hashtextextended(target_business::text||':pos:'||reference,0));
  select * into previous from public.checkout_idempotency
    where business_id=target_business and branch_id=target_branch and idempotency_key=request_key;
  if found then
    if previous.request_hash<>request_hash then
      raise exception 'This sale reference belongs to a different request. Check the original sale.' using errcode='22023';
    end if;
    return previous.response_payload||jsonb_build_object('idempotent',true);
  end if;
  select * into existing from public.orders where business_id=target_business and client_reference=reference;
  if found then
    if existing.branch_id<>target_branch or existing.channel<>'POS'
      or not exists(select 1 from public.payment_transactions p join public.register_shifts s on s.id=p.shift_id
        where p.order_id=existing.id and s.opened_by=auth.uid() and s.id=(p_payload->>'shiftId')::uuid) then
      raise exception 'Sale reference is unavailable.' using errcode='42501';
    end if;
    return jsonb_build_object('id',existing.id,'orderNumber',existing.order_number,'tokenNumber',existing.token_number,
      'total',existing.total,'change',0,'idempotent',true,'status',existing.status);
  end if;
  if order_type not in ('TAKEAWAY','PICKUP','DELIVERY','DINE_IN') then
    raise exception 'Select a supported order type.' using errcode='22023';
  end if;
  if nullif(btrim(p_payload->>'promoCode'),'') is not null and not public.has_permission(target_business,'promotions.manage') then
    raise exception 'Discount permission is required.' using errcode='42501';
  end if;
  select * into tender from public.pos_payment_methods where business_id=target_business and code=tender_code and is_active for share;
  if not found then raise exception 'Choose an active POS payment method.' using errcode='22023'; end if;
  if tender.requires_reference and tender_reference is null then raise exception 'Enter the payment transaction reference.' using errcode='22023'; end if;
  if tender_reference ~ '[\r\n\t]' then raise exception 'Payment reference contains invalid characters.' using errcode='22023'; end if;
  select * into shift_record from public.register_shifts
    where id=(p_payload->>'shiftId')::uuid and business_id=target_business and branch_id=target_branch
      and opened_by=auth.uid() and status='OPEN' for update;
  if not found then raise exception 'Open your register shift before taking a sale.' using errcode='22023'; end if;
  if order_type='DINE_IN' then
    select * into table_record from public.restaurant_tables where id=(p_payload->>'tableId')::uuid
      and business_id=target_business and branch_id=target_branch and is_active;
    if not found then raise exception 'Select an active table in this branch.' using errcode='22023'; end if;
  elsif nullif(p_payload->>'tableId','') is not null then
    raise exception 'Table context must be cleared before changing order type.' using errcode='22023';
  end if;
  if order_type='DELIVERY' and (nullif(btrim(p_payload->>'customerName'),'') is null or nullif(btrim(p_payload->>'customerPhone'),'') is null) then
    raise exception 'Delivery requires customer name and phone.' using errcode='22023';
  end if;
  result:=public.create_order_authoritative(jsonb_build_object(
    'channel','POS','branchId',target_branch,'serviceMode',case when order_type='TAKEAWAY' then 'PICKUP' else order_type end,
    'paymentMethod','CASH_ON_DELIVERY','tableToken',case when order_type='DINE_IN' then table_record.public_token end,
    'customerName',coalesce(nullif(left(btrim(p_payload->>'customerName'),120),''),'Counter guest'),
    'customerPhone',coalesce(nullif(left(btrim(p_payload->>'customerPhone'),40),''),'Counter'),
    'deliveryInstructions',nullif(left(btrim(p_payload->>'notes'),500),''),'items',p_payload->'items',
    'promoCode',p_payload->>'promoCode','deliveryAreaId',case when order_type='DELIVERY' then p_payload->>'deliveryAreaId' end,
    'deliveryAddress',case when order_type='DELIVERY' then p_payload->>'deliveryAddress' end,
    'distanceKm',case when order_type='DELIVERY' then p_payload->>'distanceKm' end,'locationSource','MANUAL_AREA'
  ),null);
  select * into target_order from public.orders where id=(result->>'id')::uuid;
  -- A stale preview must be reviewed before recording any payment. The whole
  -- transaction rolls back, including orders, kitchen/stock triggers and tables.
  if nullif(p_payload->>'expectedTotal','') is not null and (p_payload->>'expectedTotal')::integer<>target_order.total then
    raise exception using errcode='22023',message='POS_TOTAL_CHANGED',
      detail=jsonb_build_object('subtotal',target_order.subtotal,'discount',target_order.discount,'tax',target_order.tax,'deliveryFee',target_order.delivery_fee,'total',target_order.total)::text;
  end if;
  received:=coalesce(nullif(p_payload->>'cashReceived','')::integer,0);
  if tender.kind='CASH' and received<target_order.total then raise exception 'Cash received is less than the order total.' using errcode='22023'; end if;
  update public.orders set operational_order_type=order_type,client_reference=reference,
    order_notes=nullif(left(btrim(p_payload->>'notes'),500),''),status='CONFIRMED',
    payment_method=case when tender.kind='CASH' then 'CASH_ON_DELIVERY'::public.payment_method else 'ONLINE'::public.payment_method end,
    payment_reference=coalesce(tender_reference,tender.code) where id=target_order.id;
  insert into public.payment_transactions(business_id,branch_id,order_id,shift_id,provider,payment_method,provider_transaction_id,idempotency_key,amount,status,paid_at,metadata_safe)
  values(target_business,target_branch,target_order.id,shift_record.id,'POS_'||tender.code,tender.code,tender_reference,
    'pos-'||target_order.id,target_order.total,'PAID',now(),jsonb_build_object('methodName',tender.name,'kind',tender.kind,'reference',tender_reference,'cashReceived',received));
  update public.orders set payment_status='PAID' where id=target_order.id;
  result:=(result-'guestTrackingToken')||jsonb_build_object('tokenNumber',target_order.token_number,
    'change',case when tender.kind='CASH' then received-target_order.total else 0 end,
    'paymentMethod',tender.code,'paymentMethodName',tender.name,'channel','POS','status','CONFIRMED','orderType',order_type);
  insert into public.checkout_idempotency(business_id,branch_id,idempotency_key,request_hash,order_id,response_payload)
    values(target_business,target_branch,request_key,request_hash,target_order.id,result);
  return result;
end;
$$;

-- QR bills join the existing table-payment queue; never admit arbitrary online
-- orders, and retain the existing row lock/payment idempotency and shift guard.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.settle_waiter_pos_order(uuid,uuid,integer)'::regprocedure) into definition;
  if position('channel=''POS'' and waiter_id is not null' in definition)=0 then raise exception 'Unexpected table settlement definition'; end if;
  definition:=replace(definition,'channel=''POS'' and waiter_id is not null',
    '((channel=''POS'' and waiter_id is not null) or (service_mode=''DINE_IN'' and exists(select 1 from public.restaurant_table_sessions s where s.order_id=orders.id)))');
  execute definition;
  select pg_get_functiondef('public.cancel_pos_order(uuid,text)'::regprocedure) into definition;
  if position('not public.has_permission(target.business_id, ''pos.use'')' in definition)=0 then raise exception 'Unexpected POS cancel definition'; end if;
  definition:=replace(definition,'not public.has_permission(target.business_id, ''pos.use'')',
    '(not public.has_permission(target.business_id, ''pos.use'') or not public.has_permission(target.business_id, ''payments.refund''))');
  execute definition;
end;
$migration$;

revoke all on function public.create_pos_order(jsonb) from public,anon;
grant execute on function public.create_pos_order(jsonb) to authenticated;

-- Counter access includes the minimal read surfaces needed to render its own
-- branch's menu/table bill and receipt. No write or cross-branch grants change.
alter policy restaurant_tables_read on public.restaurant_tables using (
  public.staff_can_access_branch(business_id,branch_id) and
  (public.has_permission(business_id,'waiter.use') or public.has_permission(business_id,'settings.manage') or public.has_permission(business_id,'pos.use'))
);
alter policy restaurant_table_sessions_read on public.restaurant_table_sessions using (
  public.staff_can_access_branch(business_id,branch_id) and
  (opened_by=auth.uid() or public.has_permission(business_id,'orders.read') or public.has_permission(business_id,'pos.use'))
);
alter policy operational_settings_read on public.business_operating_settings using (
  public.has_permission(business_id,'kds.use') or public.has_permission(business_id,'orders.manage') or public.has_permission(business_id,'pos.use')
);
do $migration$
declare policy_record record; definition text;
begin
  for policy_record in select tablename,policyname,qual from pg_policies where schemaname='public'
    and policyname in ('own_orders_read','own_order_items_read','own_order_modifiers_read')
  loop
    definition:=regexp_replace(policy_record.qual,
      'has_permission\(([^,]+), ''orders.read''::text\)',
      '(has_permission(\1, ''orders.read''::text) OR has_permission(\1, ''pos.use''::text))','g');
    if definition=policy_record.qual then raise exception 'Inspect order read policy before changing POS scope';end if;
    execute format('alter policy %I on public.%I using (%s)',policy_record.policyname,policy_record.tablename,definition);
  end loop;
end;
$migration$;

-- POS reuses the CRM directory. Restrict its canonical source rows to the
-- caller's allowed branches rather than leaking customers from sibling branches.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.customer_directory(uuid,integer,text)'::regprocedure) into definition;
  if position('where o.business_id=p_business_id' in definition)=0 then raise exception 'Inspect customer directory scope before applying'; end if;
  definition:=replace(definition,'where o.business_id=p_business_id',
    'where o.business_id=p_business_id and public.staff_can_access_branch(o.business_id,o.branch_id)');
  definition:=replace(definition,'join public.products fp on fp.id=f.product_id where f.user_id=g.customer_id',
    'join public.products fp on fp.id=f.product_id where f.user_id=g.customer_id and fp.business_id=p_business_id');
  execute definition;
end;
$migration$;

commit;
