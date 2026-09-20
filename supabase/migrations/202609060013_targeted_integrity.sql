begin;
-- Internal helper to reveal only customer profiles allowed by the selected permission.
drop policy own_profile_read on public.profiles;
create policy own_profile_read on public.profiles for select using(id=auth.uid() or exists(
 select 1 from public.orders o where o.customer_id=profiles.id and public.has_permission(o.business_id,'customers.read')
));
create or replace function public.record_manual_refund(p_payment_id uuid,p_amount integer,p_reason text)
returns public.refunds language plpgsql security definer set search_path=public as $$
declare payment public.payment_transactions; result public.refunds; refunded_total integer; cash_shift uuid;
begin
  select * into payment from public.payment_transactions where id=p_payment_id for update;
  if not found or not public.has_permission(payment.business_id,'payments.refund') then raise exception 'Refund access denied.' using errcode='42501'; end if;
  if payment.provider not in ('CASH','MANUAL_INVOICE') then raise exception 'This provider requires its configured refund adapter.' using errcode='0A000'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'A refund reason is required.' using errcode='22023'; end if;
  if payment.payment_method='CASH' then
  select id into cash_shift from public.register_shifts where branch_id=payment.branch_id and opened_by=auth.uid() and status='OPEN' order by opened_at desc limit 1 for update;
  if cash_shift is null then select id into cash_shift from public.register_shifts where id=payment.shift_id and status='OPEN' for update; end if;
  if cash_shift is null then raise exception 'Open a register shift to record returned cash.' using errcode='22023'; end if;
  end if;
  select coalesce(sum(amount),0) into refunded_total from public.refunds where payment_id=payment.id and status='SUCCEEDED';
  if p_amount<=0 or refunded_total+p_amount>payment.amount then raise exception 'Refund amount is invalid.' using errcode='22023'; end if;
  insert into public.refunds(business_id,payment_id,order_id,amount,reason,status,requested_by,completed_at,cash_shift_id) values(payment.business_id,payment.id,payment.order_id,p_amount,left(btrim(p_reason),500),'SUCCEEDED',auth.uid(),now(),cash_shift) returning * into result;
  refunded_total:=refunded_total+p_amount;
  update public.payment_transactions set status=case when refunded_total=amount then 'REFUNDED' else 'PARTIALLY_REFUNDED' end,refunded_at=now() where id=payment.id;
  update public.orders set payment_status=case when refunded_total=payment.amount then 'REFUNDED'::public.payment_status else 'PARTIALLY_REFUNDED'::public.payment_status end where id=payment.order_id;
  insert into public.notifications(business_id,notification_type,title,message,entity_type,entity_id,dedupe_key) values(payment.business_id,'REFUND','Refund recorded','Refund recorded for payment '||payment.id,'refunds',result.id::text,'refund-'||result.id);
  return result;
end; $$;


-- View-only order staff still need the harmless printer/defaults data used by Orders.
create policy order_view_settings on public.business_operating_settings for select to authenticated using(public.has_permission(business_id,'orders.read'));
create policy receipt_view_defaults on public.print_settings for select to authenticated using(public.has_permission(business_id,'receipts.print'));

-- Narrow POS shift opening: no access to other staff registers or reconciliation.
create function public.open_pos_shift(p_branch_id uuid,p_opening_cash integer)
returns public.register_shifts language plpgsql security definer set search_path=public as $$
declare b uuid; result public.register_shifts;
begin
 select business_id into b from public.branches where id=p_branch_id and is_active;
 if b is null or not public.has_permission(b,'pos.use') then raise exception 'Counter access denied.' using errcode='42501'; end if;
 if p_opening_cash is null or p_opening_cash<0 then raise exception 'Enter a valid opening cash amount.' using errcode='22023'; end if;
 perform 1 from public.businesses where id=b for update;
 select * into result from public.register_shifts where branch_id=p_branch_id and opened_by=auth.uid() and status='OPEN';
 if found then return result; end if;
 insert into public.register_shifts(business_id,branch_id,opened_by,opening_cash,notes) values(b,p_branch_id,auth.uid(),p_opening_cash,'Opened from POS') returning * into result;
 return result;
end; $$;
revoke all on function public.open_pos_shift(uuid,integer) from public,anon;
grant execute on function public.open_pos_shift(uuid,integer) to authenticated;
create policy pos_own_shift_read on public.register_shifts for select to authenticated using(opened_by=auth.uid() and public.has_permission(business_id,'pos.use'));

-- Last-owner guards and exact permissions remain the only staff mutation path.
revoke all on function public.guard_site_settings_fields() from public,anon,authenticated;

-- Split the existing inventory editing capabilities without broad role overrides.
insert into public.admin_permissions(code,description,permission_group) values
('ingredients.manage','Ingredients','Inventory'),
('recipes.manage','Recipes & costing','Inventory'),
('purchases.manage','Purchases','Inventory'),
('suppliers.manage','Suppliers','Inventory'),
('wastage.manage','Wastage','Inventory'),
('social.manage','Social links','Website')
on conflict(code) do update set description=excluded.description,permission_group=excluded.permission_group;
insert into public.admin_role_permissions(role,permission_code)
select role,code from public.admin_role_permissions cross join unnest(array['ingredients.manage','recipes.manage','purchases.manage','suppliers.manage','wastage.manage']) code where permission_code='inventory.manage' on conflict do nothing;
insert into public.admin_role_permissions(role,permission_code)
select role,'social.manage' from public.admin_role_permissions where permission_code='content.manage' on conflict do nothing;
do $$ declare item record; src text; begin
 for item in select * from (values
 ('record_wastage','inventory.manage','wastage.manage'),('receive_purchase','inventory.manage','purchases.manage'),
 ('create_received_purchase','inventory.manage','purchases.manage'),('recipe_costs','inventory.read','recipes.manage')
 ) f(fn,old_code,new_code) loop
  select pg_get_functiondef(p.oid) into src from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=item.fn;
  if src is null then raise exception 'Required operational command missing: %',item.fn; end if;
  execute replace(src,quote_literal(item.old_code),quote_literal(item.new_code));
 end loop;
end $$;
drop policy suppliers_manage on public.suppliers;
create policy suppliers_manage on public.suppliers for all to authenticated using(public.has_permission(business_id,'suppliers.manage')) with check(public.has_permission(business_id,'suppliers.manage'));
create policy supplier_picker_read on public.suppliers for select to authenticated using(public.has_permission(business_id,'ingredients.manage') or public.has_permission(business_id,'purchases.manage') or public.has_permission(business_id,'inventory.read'));
drop policy ingredients_manage on public.ingredients;
create policy ingredients_manage on public.ingredients for all to authenticated using(public.has_permission(business_id,'ingredients.manage')) with check(public.has_permission(business_id,'ingredients.manage'));
create policy ingredient_picker_read on public.ingredients for select to authenticated using(public.has_permission(business_id,'recipes.manage') or public.has_permission(business_id,'purchases.manage') or public.has_permission(business_id,'wastage.manage'));
drop policy recipes_manage on public.recipes;
drop policy recipes_read on public.recipes;
create policy recipes_manage on public.recipes for all to authenticated using(public.has_permission(business_id,'recipes.manage')) with check(public.has_permission(business_id,'recipes.manage'));
drop policy purchases_manage on public.purchases;
create policy purchases_manage on public.purchases for all to authenticated using(public.has_permission(business_id,'purchases.manage')) with check(public.has_permission(business_id,'purchases.manage'));
drop policy purchase_items_manage on public.purchase_items;
create policy purchase_items_manage on public.purchase_items for all to authenticated using(public.has_permission(business_id,'purchases.manage')) with check(public.has_permission(business_id,'purchases.manage'));
create policy wastage_module_read on public.wastage for select to authenticated using(public.has_permission(business_id,'wastage.manage'));
drop policy scoped_cms_write on public.social_links;
create policy social_scoped_write on public.social_links for all to authenticated using(public.has_permission(business_id,'social.manage')) with check(public.has_permission(business_id,'social.manage'));
-- Reorder is an operation of the matching social module too.
do $$ declare src text; begin
 select pg_get_functiondef('public.content_order(uuid,text,uuid)'::regprocedure) into src;
 execute replace(src,'''socialLinks'',''social_links'',''content.manage''','''socialLinks'',''social_links'',''social.manage''');
end $$;

create function public.customer_order_history(p_business_id uuid,p_phone text) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.has_permission(p_business_id,'customers.read') then raise exception 'Customer access denied.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(o) order by created_at desc) from (
  select id,order_number,total,status,created_at from public.orders where business_id=p_business_id and customer_phone=p_phone order by created_at desc limit 50
 ) o),'[]');
end; $$;
revoke all on function public.customer_order_history(uuid,text) from public,anon;
grant execute on function public.customer_order_history(uuid,text) to authenticated;
commit;
