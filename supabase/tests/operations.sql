-- Run only against an isolated QA database with all migrations and seed applied.
-- Transactional fixtures roll back. PostgreSQL order-number sequences may advance.
\set ON_ERROR_STOP on
begin;
update public.business_hours set opens_at='00:00',closes_at='23:59:59',is_closed=false;
insert into auth.users(id) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');
insert into public.staff_memberships(business_id,user_id,role) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','OWNER'),
 ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','CASHIER'),
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','KITCHEN'),
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','MANAGER');
insert into public.ingredients(id,business_id,branch_id,name,unit,current_stock,minimum_stock,cost_per_unit)
values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','QA Flour','kg',10,2,100);
insert into public.recipes(business_id,product_id,ingredient_id,quantity)
values('11111111-1111-4111-8111-111111111111','40000000-0000-4000-8000-000000000004','dddddddd-dddd-4ddd-8ddd-dddddddddddd',0.25);

set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $$ declare sale jsonb; retry jsonb; shift public.register_shifts; payload jsonb; begin
  shift:=public.open_register_shift('22222222-2222-4222-8222-222222222222',1000,'QA float');
  payload:=jsonb_build_object('branchId',shift.branch_id,'shiftId',shift.id,'clientReference','qa-pos-retry','cashReceived',1000,'items',jsonb_build_array(jsonb_build_object('productId','40000000-0000-4000-8000-000000000004','quantity',1,'modifiers','[]'::jsonb)));
  sale:=public.create_pos_order(payload);retry:=public.create_pos_order(payload);
  if (sale->>'total')::integer is distinct from 699 or (sale->>'change')::integer is distinct from 301 then raise exception 'POS total/change failed: %',sale; end if;
  if sale->>'id' is distinct from retry->>'id' then raise exception 'POS idempotency failed'; end if;
  if (sale->>'tokenNumber')::integer is distinct from 1 then raise exception 'Token failed'; end if;
  if public.has_permission(shift.business_id,'staff.manage') then raise exception 'Cashier has staff management'; end if;
  begin
    update public.products set base_price=1 where id='40000000-0000-4000-8000-000000000004';
    if found then raise exception 'Cashier changed product price'; end if;
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
do $$ begin
  if public.has_permission('11111111-1111-4111-8111-111111111111','orders.manage') then raise exception 'Kitchen has broad order management'; end if;
  if (select count(*) from public.orders)<>1 then raise exception 'KDS cannot see queued ticket'; end if;
  begin
    update public.orders set status='CANCELLED' where client_reference='qa-pos-retry';
    raise exception 'Kitchen cancelled an order';
  exception when insufficient_privilege then null; end;
end $$;
update public.orders set status='PREPARING' where client_reference='qa-pos-retry';
update public.orders set status='READY' where client_reference='qa-pos-retry';

select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
update public.orders set status='DELIVERED' where client_reference='qa-pos-retry';
update public.orders set status='DELIVERED' where client_reference='qa-pos-retry';
do $$ declare purchase public.purchases; payment public.payment_transactions; report jsonb; shift public.register_shifts; new_shift public.register_shifts; begin
  begin
    update public.ingredients set current_stock=999 where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    raise exception 'Direct stock edit bypassed the ledger';
  exception when insufficient_privilege then null; end;
  if (select current_stock from public.ingredients where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd')<>9.75 then raise exception 'Recipe consumption failed'; end if;
  if (select count(*) from public.inventory_consumptions)<>1 then raise exception 'Consumption duplicated'; end if;
  purchase:=public.create_received_purchase(jsonb_build_object('branchId','22222222-2222-4222-8222-222222222222','items',jsonb_build_array(jsonb_build_object('ingredientId','dddddddd-dddd-4ddd-8ddd-dddddddddddd','quantity',5,'unitCost',120))));
  perform public.receive_purchase(purchase.id);
  perform public.record_wastage('dddddddd-dddd-4ddd-8ddd-dddddddddddd',0.5,'OTHER','QA waste');
  if (select current_stock from public.ingredients where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd')<>14.25 then raise exception 'Receiving/wastage failed'; end if;
  select * into payment from public.payment_transactions limit 1;
  perform public.record_manual_refund(payment.id,100,'QA returned cash');
  report:=public.restaurant_report('11111111-1111-4111-8111-111111111111',now()-interval '1 day',now()+interval '1 day');
  if (report->'summary'->>'orderCount')::integer is distinct from 1 or (report->'summary'->>'netSales')::integer is distinct from 599 then raise exception 'Report reconciliation failed: %',report; end if;
  shift:=public.close_register_shift(payment.shift_id,1599,'QA closing count');
  if shift.expected_cash is distinct from 1599 or shift.difference is distinct from 0 then raise exception 'Refunded cash reconciliation failed: %',shift; end if;
  new_shift:=public.open_register_shift(payment.branch_id,500,'QA next shift');
  perform public.record_manual_refund(payment.id,50,'QA later-shift refund');
  if (public.register_summary(shift.id)->>'expected')::integer is distinct from 1599 then raise exception 'Later refund changed closed drawer'; end if;
  new_shift:=public.close_register_shift(new_shift.id,450,'QA next shift close');
  if new_shift.difference is distinct from 0 then raise exception 'Later refund was not deducted from the active drawer'; end if;
end $$;

select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',true);
do $$ begin
  if not public.has_permission('11111111-1111-4111-8111-111111111111','inventory.manage') then raise exception 'Manager inventory permission missing'; end if;
  if public.has_permission('11111111-1111-4111-8111-111111111111','staff.manage') then raise exception 'Manager can manage owner role'; end if;
end $$;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
do $$ begin
  if (select count(*) from public.orders)<>0 then raise exception 'Customer can read unrelated orders'; end if;
  begin
    perform public.open_register_shift('22222222-2222-4222-8222-222222222222',0,'Unauthorized');
    raise exception 'Customer opened register';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin
    if (select count(*) from public.orders)<>0 then raise exception 'Anonymous order disclosure'; end if;
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: POS, retry, token, kitchen transitions, roles, recipe consumption, purchase receiving, wastage, refund, report, shift reconciliation and order isolation' as result;
rollback;
