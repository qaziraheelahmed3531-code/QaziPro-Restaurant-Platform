begin;
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
    'topProducts',(select coalesce(jsonb_agg(row_to_json(product_row) order by product_row.net_sales desc),'[]') from (select item.product_name label,sum(item.quantity)::integer quantity,sum(item.line_total)::integer gross_sales,round(sum(case when o.subtotal>0 then item.line_total::numeric*(o.subtotal-o.discount)/o.subtotal else 0 end))::integer net_sales from public.order_items item join scoped_orders o on o.id=item.order_id group by item.product_name order by 4 desc limit 10) product_row),
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
commit;
