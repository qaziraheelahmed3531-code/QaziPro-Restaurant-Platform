do $test$
#variable_conflict use_variable
declare
 business uuid:=gen_random_uuid(); branch uuid:=gen_random_uuid(); other_branch uuid:=gen_random_uuid();
 actor uuid:=gen_random_uuid(); cashier uuid:=gen_random_uuid(); membership uuid; category uuid:=gen_random_uuid(); product uuid:=gen_random_uuid();
 device uuid:=gen_random_uuid(); device2 uuid:=gen_random_uuid(); snapshot uuid; snapshot2 uuid; request jsonb; result jsonb; replay jsonb; denied boolean;
 ingredient uuid:=gen_random_uuid(); order_id uuid; second_id uuid;
begin
 insert into public.businesses(id,name,slug,city,is_active) values(business,'Desktop rollback fixture','qa-desktop-'||business,'Fixture',true);
 insert into public.service_entitlements(business_id,capability_key,source,enabled)
 select business,key,'OVERRIDE',true from unnest(array['admin.restaurant','pos.desktop','pos.web','inventory','kitchen','ordering.pickup','ordering.delivery']) key;
 insert into public.branches(id,business_id,name,code,address,city) values(branch,business,'Counter A','A','Fixture','Fixture'),(other_branch,business,'Counter B','B','Fixture','Fixture');
 insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values(actor,'desktop-'||actor||'@example.test','{}','{}'),(cashier,'desktop-'||cashier||'@example.test','{}','{}');
 insert into public.staff_memberships(business_id,branch_id,user_id,role,is_active) values(business,branch,actor,'OWNER',true);
 insert into public.staff_memberships(business_id,branch_id,user_id,role,is_active,permissions_customized) values(business,branch,cashier,'CASHIER',true,true) returning id into membership;
 insert into public.staff_membership_permissions(membership_id,permission_code) values(membership,'pos.use'),(membership,'desktop_pos.use');
 insert into public.categories(id,business_id,name,slug) values(category,business,'Food','food');
 insert into public.products(id,business_id,category_id,name,slug,base_price,is_active,is_available) values(product,business,category,'Test meal','test-meal',1000,true,true);
 insert into public.ingredients(id,business_id,branch_id,name,unit,current_stock) values(ingredient,business,branch,'Test ingredient','piece',20);
 insert into public.recipes(business_id,product_id,ingredient_id,quantity) values(business,product,ingredient,1);
 insert into public.business_operating_settings(business_id,tax_rate_bps) values(business,1000) on conflict(business_id) do update set tax_rate_bps=1000;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 snapshot:=public.register_desktop_pos_catalog(branch,device,'Counter A','0.1.0');
 snapshot2:=public.register_desktop_pos_catalog(branch,device2,'Counter B','0.1.0');
 if (select (rules->>'taxRateBps')::integer from public.pos_catalog_snapshots where id=snapshot)<>1000 then raise exception 'Tax snapshot missing';end if;
 request:=jsonb_build_object('deviceId',device,'catalogVersionId',snapshot,'offlineOrderId',gen_random_uuid(),'offlineShiftId',gen_random_uuid(),'soldAt',now(),'branchId',branch,'openingCash',0,'shiftOpenedAt',now(),'customerName','Fixture','customerPhone','Counter','orderType','TAKEAWAY','cashReceived',1100,'paymentMethodCode','CASH','tax',100,'total',1100,'items',jsonb_build_array(jsonb_build_object('itemKind','product','productId',product,'name','Test meal','quantity',1,'unitBasePrice',1000,'unitModifierPrice',0,'unitPrice',1000,'modifiers','[]'::jsonb)));
 -- Future admin config must not reprice already collected offline cash.
 update public.products set base_price=2000 where id=product;
 update public.business_operating_settings set tax_rate_bps=2000 where business_id=business;
 result:=public.sync_offline_pos_order(request);order_id:=(result->>'id')::uuid;
 if (result->>'total')::integer<>1100 then raise exception 'Offline snapshot total changed';end if;
 if (select tax from public.orders where id=order_id)<>100 then raise exception 'Tax not reconciled';end if;
 replay:=public.sync_offline_pos_order(request);
 if replay->>'id'<>result->>'id' or (select count(*) from public.payment_transactions p where p.order_id=(result->>'id')::uuid)<>1 then raise exception 'Duplicate sale/payment';end if;
 if (select amount from public.payment_transactions p where p.order_id=(result->>'id')::uuid)<>1100 then raise exception 'Payment omitted tax';end if;
 result:=public.sync_offline_pos_order(request||jsonb_build_object('deviceId',device2,'catalogVersionId',snapshot2,'offlineOrderId',gen_random_uuid(),'offlineShiftId',gen_random_uuid()));second_id:=(result->>'id')::uuid;
 if second_id=order_id then raise exception 'Device order identities collided';end if;
 denied:=false;begin perform public.sync_offline_pos_order(request||jsonb_build_object('offlineOrderId',gen_random_uuid(),'tax',0,'total',1000));exception when sqlstate '22023' then denied:=true;end;if not denied then raise exception 'Forged total accepted';end if;
 denied:=false;begin perform public.sync_offline_pos_order(request||jsonb_build_object('branchId',other_branch,'offlineOrderId',gen_random_uuid()));exception when sqlstate '42501' then denied:=true;end;if not denied then raise exception 'Cross-branch device accepted';end if;
 perform public.set_pos_order_stage(order_id,'PREPARING');perform public.set_pos_order_stage(order_id,'READY');perform public.set_pos_order_stage(order_id,'DELIVERED');
 perform public.sync_offline_pos_order(request||jsonb_build_object('operationalStatus','DELIVERED'));
 if (select current_stock from public.ingredients where id=ingredient)<>19 then raise exception 'Inventory was not consumed once';end if;
 if (select count(*) from public.inventory_consumptions c where c.order_id=order_id)<>1 then raise exception 'Inventory duplicated';end if;
 perform set_config('request.jwt.claim.sub',cashier::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',cashier,'role','authenticated')::text,true);
 denied:=false;begin perform public.cancel_pos_order(second_id,'Cashier denial');exception when sqlstate '42501' then denied:=true;end;if not denied then raise exception 'Unauthorized refund accepted';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform public.cancel_pos_order(second_id,'Manager test');perform public.cancel_pos_order(second_id,'Manager replay');
 if (select count(*) from public.refunds r where r.order_id=second_id)<>1 then raise exception 'Duplicate refund';end if;
 if (select amount from public.refunds r where r.order_id=second_id)<>1100 then raise exception 'Refund omitted tax';end if;
 update public.pos_offline_devices set is_active=false where id=device;
 denied:=false;begin perform public.sync_offline_pos_order(request||jsonb_build_object('offlineOrderId',gen_random_uuid()));exception when sqlstate '42501' then denied:=true;end;if not denied then raise exception 'Disabled device accepted';end if;
 update public.pos_offline_devices set is_active=true where id=device;
 update public.service_entitlements set enabled=false where business_id=business and capability_key='pos.desktop';
 denied:=false;begin perform public.sync_offline_pos_order(request||jsonb_build_object('offlineOrderId',gen_random_uuid()));exception when sqlstate '42501' then denied:=true;end;if not denied then raise exception 'Revoked entitlement accepted';end if;
end $test$;
select 'DESKTOP_DATABASE_CHECKS_PASSED' as result;
