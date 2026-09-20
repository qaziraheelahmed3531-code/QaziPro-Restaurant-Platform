begin;

-- Limit kitchen accounts to the KDS route and preparation-only transitions.
delete from public.admin_role_permissions where role='KITCHEN' and permission_code in ('orders.manage','inventory.read','notifications.read');
create policy kitchen_orders_read on public.orders for select to authenticated using(public.has_permission(business_id,'kds.use') and status in ('CONFIRMED','PREPARING','READY'));
create policy kitchen_orders_update on public.orders for update to authenticated using(public.has_permission(business_id,'kds.use') and status in ('CONFIRMED','PREPARING')) with check(public.has_permission(business_id,'kds.use') and status in ('PREPARING','READY'));
create policy kitchen_items_read on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and public.has_permission(o.business_id,'kds.use')));
create policy kitchen_modifiers_read on public.order_item_modifiers for select to authenticated using(exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id where i.id=order_item_id and public.has_permission(o.business_id,'kds.use')));
create policy operational_settings_read on public.business_operating_settings for select to authenticated using(public.has_permission(business_id,'kds.use') or public.has_permission(business_id,'orders.manage'));
create policy operational_print_read on public.print_settings for select to authenticated using(public.has_permission(business_id,'kds.use') or public.has_permission(business_id,'pos.use') or public.has_permission(business_id,'orders.manage'));

create or replace function public.enforce_order_transition()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.status = new.status then return new; end if;
  if current_user='authenticated' and not public.has_permission(new.business_id,'orders.manage') then
    if not public.has_permission(new.business_id,'kds.use') or not (
      (old.status='CONFIRMED' and new.status='PREPARING') or (old.status='PREPARING' and new.status='READY')
    ) then raise exception 'Kitchen access is limited to preparation transitions.' using errcode='42501'; end if;
  end if;
  if (new.service_mode='PICKUP' and new.status='OUT_FOR_DELIVERY') or
     (new.service_mode='DELIVERY' and old.status='READY' and new.status='DELIVERED') then
    raise exception 'Status does not match the fulfillment workflow.' using errcode='22023';
  end if;
  if not (
    (old.status='RECEIVED' and new.status in ('CONFIRMED','CANCELLED')) or
    (old.status='CONFIRMED' and new.status in ('PREPARING','CANCELLED')) or
    (old.status='PREPARING' and new.status in ('READY','CANCELLED')) or
    (old.status='READY' and new.status in ('OUT_FOR_DELIVERY','DELIVERED','CANCELLED')) or
    (old.status='OUT_FOR_DELIVERY' and new.status in ('DELIVERED','CANCELLED'))
  ) then raise exception 'Invalid order status transition: % to %',old.status,new.status using errcode='22023'; end if;
  if new.status='CONFIRMED' then new.confirmed_at=coalesce(new.confirmed_at,now()); end if;
  if new.status='PREPARING' then new.preparing_at=coalesce(new.preparing_at,now()); end if;
  if new.status='READY' then new.ready_at=coalesce(new.ready_at,now()); end if;
  if new.status='DELIVERED' then new.delivered_at=coalesce(new.delivered_at,now()); end if;
  if new.status='CANCELLED' then new.cancelled_at=coalesce(new.cancelled_at,now()); end if;
  return new;
end; $$;

create or replace function public.close_register_shift(p_shift_id uuid,p_counted_cash integer,p_notes text default null)
returns public.register_shifts language plpgsql security definer set search_path=public as $$
declare result public.register_shifts; cash_sales integer; cash_in integer; cash_out integer; cash_refunds integer; expected integer;
begin
  select * into result from public.register_shifts where id=p_shift_id and status='OPEN' for update;
  if not found or not public.has_permission(result.business_id,'register.manage') then raise exception 'Open register shift not found.' using errcode='42501'; end if;
  select coalesce(sum(amount),0) into cash_sales from public.payment_transactions where shift_id=p_shift_id and payment_method='CASH' and status in ('PAID','PARTIALLY_REFUNDED','REFUNDED');
  select coalesce(sum(amount) filter(where movement_type='CASH_IN'),0),coalesce(sum(amount) filter(where movement_type='CASH_OUT'),0) into cash_in,cash_out from public.cash_movements where shift_id=p_shift_id;
  select coalesce(sum(refund.amount),0) into cash_refunds from public.refunds refund join public.payment_transactions payment on payment.id=refund.payment_id where payment.shift_id=p_shift_id and payment.payment_method='CASH' and refund.status='SUCCEEDED';
  expected:=result.opening_cash+cash_sales+cash_in-cash_out-cash_refunds;
  update public.register_shifts set status='CLOSED',closed_by=auth.uid(),closed_at=now(),expected_cash=expected,counted_cash=p_counted_cash,difference=p_counted_cash-expected,notes=coalesce(nullif(left(btrim(p_notes),500),''),notes) where id=p_shift_id returning * into result;
  return result;
end; $$;

create or replace function public.restaurant_report(p_business_id uuid,p_start timestamptz,p_end timestamptz,p_branch_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; bucket text; report_timezone text;
begin
  if not public.has_permission(p_business_id,'reports.read') and not public.has_permission(p_business_id,'dashboard.view') then raise exception 'Reporting access denied.' using errcode='42501'; end if;
  if p_end<=p_start or p_end-p_start>interval '370 days' then raise exception 'Invalid report range.' using errcode='22023'; end if;
  select timezone into report_timezone from public.businesses where id=p_business_id;
  bucket:=case when p_end-p_start<=interval '2 days' then 'hour' when p_end-p_start<=interval '62 days' then 'day' else 'month' end;
  with scoped_orders as (
    select * from public.orders where business_id=p_business_id and created_at>=p_start and created_at<p_end and status<>'CANCELLED' and (p_branch_id is null or branch_id=p_branch_id)
  ), refund_total as (
    select coalesce(sum(r.amount),0)::integer value from public.refunds r join scoped_orders o on o.id=r.order_id where r.status='SUCCEEDED'
  ) select jsonb_build_object(
    'summary',jsonb_build_object(
      'grossSales',coalesce(sum(o.subtotal),0),'discounts',coalesce(sum(o.discount),0),'deliveryFees',coalesce(sum(o.delivery_fee),0),'tax',coalesce(sum(o.tax),0),
      'refunds',(select value from refund_total),'netSales',coalesce(sum(o.total),0)-(select value from refund_total),'orderCount',count(o.id),
      'averageOrder',case when count(o.id)=0 then 0 else round(avg(o.total)) end
    ),
    'trend',(select coalesce(jsonb_agg(row_to_json(t) order by t.bucket), '[]') from (select date_trunc(bucket,created_at,report_timezone) bucket,sum(total)::integer value,count(*)::integer orders from scoped_orders group by 1) t),
    'channels',(select coalesce(jsonb_agg(row_to_json(c) order by c.value desc),'[]') from (select case when channel='WEBSITE' then channel||'_'||service_mode::text else channel end label,sum(total)::integer value,count(*)::integer orders from scoped_orders group by 1) c),
    'payments',(select coalesce(jsonb_agg(row_to_json(p) order by p.value desc),'[]') from (select payment_method label,sum(amount)::integer value,count(*)::integer transactions from public.payment_transactions where business_id=p_business_id and created_at>=p_start and created_at<p_end and status in ('PAID','PARTIALLY_REFUNDED','REFUNDED') and (p_branch_id is null or branch_id=p_branch_id) group by payment_method) p),
    'topProducts',(select coalesce(jsonb_agg(row_to_json(product_row) order by product_row.net_sales desc),'[]') from (select item.product_name label,sum(item.quantity)::integer quantity,sum(item.line_total)::integer gross_sales,sum(item.line_total)::integer net_sales from public.order_items item join scoped_orders o on o.id=item.order_id group by item.product_name order by 4 desc limit 10) product_row),
    'topCategories',(select coalesce(jsonb_agg(row_to_json(category_row) order by category_row.value desc),'[]') from (select coalesce(category.name,'Deals') label,sum(item.line_total)::integer value from public.order_items item join scoped_orders o on o.id=item.order_id left join public.products product on product.id=item.product_id left join public.categories category on category.id=product.category_id group by category.name) category_row),
    'peakHours',(select coalesce(jsonb_agg(row_to_json(hour_row) order by hour_row."hour"),'[]') from (select extract(hour from created_at at time zone coalesce((select timezone from public.businesses where id=p_business_id),'Asia/Karachi'))::integer as "hour",sum(total)::integer value,count(*)::integer orders from scoped_orders group by 1) hour_row),
    'statuses',(select coalesce(jsonb_agg(row_to_json(status_row)),'[]') from (select status label,count(*)::integer count from public.orders where business_id=p_business_id and created_at>=p_start and created_at<p_end and (p_branch_id is null or branch_id=p_branch_id) group by status) status_row),
    'customers',jsonb_build_object(
      'new',(select count(distinct x.customer_id) from scoped_orders x where x.customer_id is not null and not exists(select 1 from public.orders old where old.business_id=p_business_id and old.customer_id=x.customer_id and old.created_at<p_start and old.status<>'CANCELLED')),
      'returning',(select count(distinct x.customer_id) from scoped_orders x where x.customer_id is not null and exists(select 1 from public.orders old where old.business_id=p_business_id and old.customer_id=x.customer_id and old.created_at<p_start and old.status<>'CANCELLED'))),
    'inventory',(select jsonb_build_object('stockValue',coalesce(sum(current_stock*cost_per_unit),0),'lowStock',count(*) filter(where current_stock<=minimum_stock),'activeIngredients',count(*)) from public.ingredients where business_id=p_business_id and is_active and (p_branch_id is null or branch_id=p_branch_id)),
    'shifts',(select jsonb_build_object('count',count(*),'difference',coalesce(sum(difference),0)) from public.register_shifts where business_id=p_business_id and opened_at>=p_start and opened_at<p_end and (p_branch_id is null or branch_id=p_branch_id))
  ) into result from scoped_orders o;
  return result;
end; $$;

-- Validate tenant/branch references before inventory mutations.
create or replace function public.validate_inventory_scope()
returns trigger language plpgsql set search_path=public as $$
declare parent_business uuid; parent_branch uuid; ingredient_business uuid; ingredient_branch uuid;
begin
  if tg_table_name='purchase_items' then
    select business_id,branch_id into parent_business,parent_branch from public.purchases where id=new.purchase_id;
    select business_id,branch_id into ingredient_business,ingredient_branch from public.ingredients where id=new.ingredient_id;
    if new.business_id is distinct from parent_business or ingredient_business is distinct from parent_business or ingredient_branch is distinct from parent_branch then raise exception 'Purchase ingredient must belong to its business and branch.' using errcode='22023'; end if;
    if exists(select 1 from public.purchases where id=new.purchase_id and status not in ('DRAFT','ORDERED')) then raise exception 'Received purchase lines cannot be changed.' using errcode='22023'; end if;
  elsif tg_table_name='recipes' then
    select business_id into ingredient_business from public.ingredients where id=new.ingredient_id;
    if new.product_id is not null then select business_id into parent_business from public.products where id=new.product_id;
    else select g.business_id into parent_business from public.modifier_options m join public.modifier_groups g on g.id=m.modifier_group_id where m.id=new.modifier_option_id; end if;
    if new.business_id is distinct from parent_business or ingredient_business is distinct from parent_business then raise exception 'Recipe references must belong to the same business.' using errcode='22023'; end if;
  elsif tg_table_name='ingredients' or tg_table_name='purchases' then
    select business_id into parent_business from public.branches where id=new.branch_id;
    if new.business_id is distinct from parent_business then raise exception 'Branch belongs to another business.' using errcode='22023'; end if;
    if new.supplier_id is not null and not exists(select 1 from public.suppliers where id=new.supplier_id and business_id=new.business_id) then raise exception 'Supplier belongs to another business.' using errcode='22023'; end if;
  end if;
  return new;
end; $$;
create trigger purchase_items_validate_scope before insert or update on public.purchase_items for each row execute function public.validate_inventory_scope();
create trigger recipes_validate_scope before insert or update on public.recipes for each row execute function public.validate_inventory_scope();
create trigger ingredients_validate_scope before insert or update on public.ingredients for each row execute function public.validate_inventory_scope();
create trigger purchases_validate_scope before insert or update on public.purchases for each row execute function public.validate_inventory_scope();

-- Purchase header, lines and receiving form one transaction.
create or replace function public.create_received_purchase(p_payload jsonb)
returns public.purchases language plpgsql security definer set search_path=public as $$
declare target_business uuid; result public.purchases; item jsonb;
begin
  select business_id into target_business from public.branches where id=(p_payload->>'branchId')::uuid and is_active;
  if target_business is null or not public.has_permission(target_business,'inventory.manage') then raise exception 'Inventory access denied.' using errcode='42501'; end if;
  if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items') not between 1 and 100 then raise exception 'Purchase requires 1 to 100 items.' using errcode='22023'; end if;
  insert into public.purchases(business_id,branch_id,supplier_id,invoice_number)
  values(target_business,(p_payload->>'branchId')::uuid,nullif(p_payload->>'supplierId','')::uuid,nullif(left(p_payload->>'invoiceNumber',120),'')) returning * into result;
  for item in select value from jsonb_array_elements(p_payload->'items') loop
    insert into public.purchase_items(business_id,purchase_id,ingredient_id,quantity,unit_cost)
    values(target_business,result.id,(item->>'ingredientId')::uuid,(item->>'quantity')::numeric,(item->>'unitCost')::integer);
  end loop;
  return public.receive_purchase(result.id);
end; $$;
revoke all on function public.create_received_purchase(jsonb) from public,anon;
grant execute on function public.create_received_purchase(jsonb) to authenticated;

commit;
