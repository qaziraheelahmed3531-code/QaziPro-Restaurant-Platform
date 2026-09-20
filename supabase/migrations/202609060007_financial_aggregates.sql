begin;
create or replace function public.payment_summary(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare captured bigint; returned bigint;
begin
  if not public.has_permission(p_business_id,'payments.read') then raise exception 'Payment access denied.' using errcode='42501'; end if;
  select coalesce(sum(amount),0) into captured from public.payment_transactions where business_id=p_business_id and status in ('PAID','PARTIALLY_REFUNDED','REFUNDED');
  select coalesce(sum(amount),0) into returned from public.refunds where business_id=p_business_id and status='SUCCEEDED';
  return jsonb_build_object('captured',captured,'refunded',returned,'net',captured-returned);
end; $$;
revoke all on function public.payment_summary(uuid) from public,anon;
grant execute on function public.payment_summary(uuid) to authenticated;

create or replace function public.recipe_costs(p_business_id uuid,p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_permission(p_business_id,'inventory.read') then raise exception 'Inventory access denied.' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(row_to_json(costs)),'[]') from (
    select coalesce(p.name,m.name) label,case when r.product_id is null then 'Modifier' else 'Product' end kind,
      sum(r.quantity*i.cost_per_unit) cost,coalesce(p.sale_price,p.base_price,m.price_adjustment) price
    from public.recipes r join public.ingredients i on i.id=r.ingredient_id left join public.products p on p.id=r.product_id left join public.modifier_options m on m.id=r.modifier_option_id
    where r.business_id=p_business_id and (p_branch_id is null or i.branch_id=p_branch_id)
    group by i.branch_id,r.product_id,r.modifier_option_id,p.name,m.name,p.sale_price,p.base_price,m.price_adjustment
    order by 1
  ) costs);
end; $$;
revoke all on function public.recipe_costs(uuid,uuid) from public,anon;
grant execute on function public.recipe_costs(uuid,uuid) to authenticated;
commit;
