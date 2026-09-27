-- All fixture data and outbox side effects roll back before any worker can see them.
begin;
do $$
declare b uuid; branch uuid; category uuid; product uuid:=gen_random_uuid(); t public.restaurant_tables;
  payload jsonb; result jsonb; retry jsonb; order_id_value uuid; key_value text:=gen_random_uuid()::text;
begin
  select br.id,br.business_id into branch,b from public.branches br
  where br.is_active
    and exists(select 1 from public.runtime_entitlement_internal(br.business_id,br.id,'website.ordering') where enabled)
    and exists(select 1 from public.runtime_entitlement_internal(br.business_id,br.id,'waiter') where enabled) limit 1;
  if b is null then raise exception 'No eligible staging branch'; end if;
  -- Temporary branch configuration is visible only inside this transaction.
  update public.branches set temporarily_closed=false,online_ordering_enabled=true,pickup_enabled=false where id=branch;
  update public.business_hours set is_closed=false,opens_at='00:00',closes_at='23:59:59' where branch_id=branch;
  select id into category from public.categories where business_id=b limit 1;
  insert into public.products(id,business_id,category_id,slug,name,base_price) values(product,b,category,'qr-test-'||product,'QR transaction fixture',1234);
  insert into public.restaurant_tables(business_id,branch_id,code,name) values(b,branch,'QR-'||left(key_value,8),'QR transaction fixture') returning * into t;
  if not exists(select 1 from public.resolve_public_table(b,t.public_token)) then raise exception 'Valid QR denied'; end if;
  if exists(select 1 from public.resolve_public_table(gen_random_uuid(),t.public_token)) then raise exception 'Cross-business QR accepted'; end if;
  payload:=jsonb_build_object('branchId',branch,'idempotencyKey',key_value,'serviceMode','DINE_IN','tableToken',t.public_token,'customerName','Rollback fixture','customerPhone','00000000000','items',jsonb_build_array(jsonb_build_object('productId',product,'quantity',2)));
  result:=public.create_order_with_loyalty(payload,null);
  order_id_value:=(result->>'id')::uuid;
  retry:=public.create_order_with_loyalty(payload,null);
  if result->>'id' <> retry->>'id' or (result->>'subtotal')::integer<>2468 then raise exception 'Idempotency/pricing failed'; end if;
  if not exists(select 1 from public.orders where id=order_id_value and service_mode='DINE_IN' and operational_order_type='DINE_IN' and table_reference=t.name and channel='WEBSITE' and delivery_fee=0) then raise exception 'Order context failed'; end if;
  if (select count(*) from public.restaurant_table_sessions where table_id=t.id and status='OPEN')<>1 then raise exception 'Bill count failed'; end if;
  begin
    perform public.create_order_with_loyalty(payload||jsonb_build_object('idempotencyKey',gen_random_uuid()),null);
    raise exception 'Second active bill accepted';
  exception when sqlstate '22023' then null; end;
  begin
    update public.restaurant_tables set is_active=false where id=t.id;
    raise exception 'Occupied table deactivated';
  exception when sqlstate '23514' then null; end;
  begin
    perform public.create_order_with_loyalty(payload||jsonb_build_object('idempotencyKey',gen_random_uuid(),'tableToken',repeat('0',48)),null);
    raise exception 'Invalid QR accepted';
  exception when sqlstate '22023' then null; end;
  update public.orders set status='CANCELLED' where id=order_id_value;
  if exists(select 1 from public.restaurant_table_sessions where table_id=t.id and status='OPEN') then raise exception 'Table not released'; end if;
  update public.restaurant_tables set is_active=false where id=t.id;
  if exists(select 1 from public.resolve_public_table(b,t.public_token)) then raise exception 'Inactive table accepted'; end if;
  if has_function_privilege('anon','public.create_order_authoritative(jsonb,uuid)','execute') then raise exception 'Anonymous order RPC bypass'; end if;
end; $$;
rollback;
select 'PASS: public QR, cross-business denial, inactive table, server pricing, dine-in with pickup disabled, idempotent replay, open-bill conflict, deactivation guard, table release and RPC grants. All fixtures rolled back.' as result;
