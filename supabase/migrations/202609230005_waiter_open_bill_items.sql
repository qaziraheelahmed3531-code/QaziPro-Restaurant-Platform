begin;

-- A waiter may add a second round to the same open table bill. Product,
-- variant and modifier prices are still resolved by create_order_authoritative;
-- the temporary validated order is merged into the locked open bill inside
-- this transaction, so a second active bill can never be created.
create or replace function public.create_waiter_table_order(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  table_record public.restaurant_tables;
  existing_session public.restaurant_table_sessions;
  existing_order public.orders;
  order_result jsonb;
  temporary_order public.orders;
  new_subtotal integer;
  tax_rate_value integer:=0;
  new_tax integer;
begin
  begin
    select * into table_record
    from public.restaurant_tables
    where id=(p_payload->>'tableId')::uuid
    for update;
  exception when invalid_text_representation then
    raise exception 'Select a valid active table.' using errcode='22023';
  end;

  if not found or not table_record.is_active
    or not public.staff_can_access_branch(table_record.business_id,table_record.branch_id)
    or not public.has_permission(table_record.business_id,'waiter.use') then
    raise exception 'Select a valid active table.' using errcode='42501';
  end if;

  select * into existing_session
  from public.restaurant_table_sessions
  where table_id=table_record.id and status='OPEN'
  for update;

  if not found then
    order_result:=public.create_waiter_pos_order(
      (p_payload-'tableId')||jsonb_build_object(
        'branchId',table_record.branch_id,
        'tableReference',table_record.name
      )
    );
    insert into public.restaurant_table_sessions(business_id,branch_id,table_id,order_id,opened_by)
    values(table_record.business_id,table_record.branch_id,table_record.id,(order_result->>'id')::uuid,auth.uid());
    return order_result||jsonb_build_object(
      'tableId',table_record.id,
      'tableName',table_record.name,
      'appended',false
    );
  end if;

  select * into existing_order
  from public.orders
  where id=existing_session.order_id
  for update;
  if not found or existing_order.business_id<>table_record.business_id
    or existing_order.branch_id<>table_record.branch_id
    or existing_order.status not in ('CONFIRMED','PREPARING')
    or existing_order.payment_status<>'UNPAID' then
    raise exception 'The open bill cannot accept more items.' using errcode='22023';
  end if;

  order_result:=public.create_order_authoritative(jsonb_build_object(
    'channel','POS',
    'branchId',table_record.branch_id,
    'serviceMode','PICKUP',
    'paymentMethod','CASH_ON_DELIVERY',
    'customerName',coalesce(nullif(left(btrim(p_payload->>'guestName'),120),''),existing_order.customer_name),
    'customerPhone','Waiter table order',
    'deliveryInstructions',nullif(left(btrim(p_payload->>'notes'),500),''),
    'items',p_payload->'items'
  ),null);
  select * into temporary_order from public.orders where id=(order_result->>'id')::uuid for update;

  update public.order_items set order_id=existing_order.id where order_id=temporary_order.id;
  delete from public.orders where id=temporary_order.id;

  select coalesce(sum(line_total),0)::integer into new_subtotal
  from public.order_items where order_id=existing_order.id;
  select coalesce(settings.tax_rate_bps,0) into tax_rate_value
  from public.business_operating_settings settings
  where settings.business_id=existing_order.business_id;
  tax_rate_value:=coalesce(tax_rate_value,0);
  new_tax:=round(greatest(0,new_subtotal-existing_order.discount)::numeric*tax_rate_value/10000)::integer;

  update public.orders set
    subtotal=new_subtotal,
    tax=new_tax,
    total=greatest(0,new_subtotal-discount+new_tax+delivery_fee),
    order_notes=case
      when nullif(left(btrim(p_payload->>'notes'),500),'') is null then order_notes
      when order_notes is null then nullif(left(btrim(p_payload->>'notes'),500),'')
      else left(order_notes||E'\nAdditional round: '||left(btrim(p_payload->>'notes'),500),1000)
    end
  where id=existing_order.id
  returning * into existing_order;

  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
  values(existing_order.business_id,auth.uid(),'WAITER_ITEMS_ADDED','orders',existing_order.id::text,
    jsonb_build_object('branch_id',existing_order.branch_id,'table_id',table_record.id,'subtotal',existing_order.subtotal,'total',existing_order.total));

  return jsonb_build_object(
    'id',existing_order.id,
    'orderNumber',existing_order.order_number,
    'status',existing_order.status,
    'subtotal',existing_order.subtotal,
    'discount',existing_order.discount,
    'tax',existing_order.tax,
    'deliveryFee',existing_order.delivery_fee,
    'total',existing_order.total,
    'channel','POS',
    'orderType','DINE_IN',
    'tokenNumber',existing_order.token_number,
    'waiterName',existing_order.waiter_name,
    'tableReference',existing_order.table_reference,
    'tableId',table_record.id,
    'tableName',table_record.name,
    'appended',true
  );
end;
$$;

revoke all on function public.create_waiter_table_order(jsonb) from public,anon;
grant execute on function public.create_waiter_table_order(jsonb) to authenticated;

commit;
