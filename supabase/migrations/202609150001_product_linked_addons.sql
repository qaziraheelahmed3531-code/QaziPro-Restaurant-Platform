begin;

alter table public.modifier_options
  add column if not exists linked_product_id uuid references public.products(id) on delete restrict,
  add column if not exists image_url text;
create index if not exists modifier_options_linked_product_idx on public.modifier_options(linked_product_id) where linked_product_id is not null;
alter table public.order_item_modifiers add column if not exists linked_product_id uuid references public.products(id) on delete restrict;

-- One source for the linked item's identity, price and current photograph.
create or replace function public.resolve_linked_modifier_product()
returns trigger language plpgsql security definer set search_path=public as $$
declare product_row public.products%rowtype; group_business uuid;
begin
  if new.linked_product_id is null then new.image_url:=null; return new; end if;
  select * into product_row from public.products where id=new.linked_product_id;
  select business_id into group_business from public.modifier_groups where id=new.modifier_group_id;
  if product_row.id is null or product_row.business_id is distinct from group_business then
    raise exception 'Choose a product from this restaurant.';
  end if;
  new.name:=product_row.name;
  new.price_adjustment:=coalesce(product_row.sale_price,product_row.base_price);
  if not product_row.is_active or not product_row.is_available then new.is_active:=false; end if;
  select url into new.image_url from public.product_images where product_id=product_row.id order by is_primary desc,sort_order,id limit 1;
  return new;
end $$;
create trigger resolve_linked_modifier_product before insert or update on public.modifier_options for each row execute function public.resolve_linked_modifier_product();

create or replace function public.refresh_linked_modifier_product()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name='products' then
    update public.modifier_options set updated_at=now() where linked_product_id=new.id;
  else
    if tg_op<>'INSERT' then update public.modifier_options set updated_at=now() where linked_product_id=old.product_id; end if;
    if tg_op<>'DELETE' then update public.modifier_options set updated_at=now() where linked_product_id=new.product_id; end if;
  end if;
  return null;
end $$;
create trigger refresh_linked_modifier_product after update of name,base_price,sale_price,is_active,is_available on public.products for each row execute function public.refresh_linked_modifier_product();
create trigger refresh_linked_modifier_image after insert or update or delete on public.product_images for each row execute function public.refresh_linked_modifier_product();

create or replace function public.snapshot_linked_modifier_product()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  select linked_product_id into new.linked_product_id from public.modifier_options where id=new.modifier_option_id;
  return new;
end $$;
create trigger snapshot_linked_modifier_product before insert on public.order_item_modifiers for each row execute function public.snapshot_linked_modifier_product();

-- Saving the group and choices is atomic: an invalid row cannot partially save.
create or replace function public.save_modifier_group(p_business_id uuid,p_group jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare group_id uuid; option_row jsonb; option_id uuid; kept uuid[]:='{}'; selection public.selection_type; minimum integer; maximum integer; active_count integer;
begin
  if not public.has_permission(p_business_id,'modifiers.manage') then raise exception 'Access denied'; end if;
  if length(btrim(coalesce(p_group->>'name',''))) = 0 then raise exception 'Enter a group name.'; end if;
  if jsonb_typeof(p_group->'modifier_options') is distinct from 'array' or jsonb_array_length(p_group->'modifier_options')=0 then raise exception 'Add at least one option.'; end if;
  selection:=(p_group->>'selection_type')::public.selection_type;
  minimum:=greatest(0,coalesce((p_group->>'min_selections')::integer,0),case when coalesce((p_group->>'is_required')::boolean,false) then 1 else 0 end);
  maximum:=case when selection='SINGLE' then 1 else coalesce((p_group->>'max_selections')::integer,jsonb_array_length(p_group->'modifier_options')) end;
  if minimum>maximum or maximum<1 then raise exception 'Check the minimum and maximum selections.'; end if;
  group_id:=nullif(p_group->>'id','')::uuid;
  if group_id is not null then
    perform 1 from public.modifier_groups where id=group_id and business_id=p_business_id for update;
    if not found then raise exception 'Option group was not found.'; end if;
    update public.modifier_groups set name=btrim(p_group->>'name'),customer_instruction=nullif(btrim(p_group->>'customer_instruction'),''),selection_type=selection,is_required=coalesce((p_group->>'is_required')::boolean,false),min_selections=minimum,max_selections=maximum,is_active=true where id=group_id;
  else
    insert into public.modifier_groups(business_id,name,customer_instruction,selection_type,is_required,min_selections,max_selections,sort_order)
    values(p_business_id,btrim(p_group->>'name'),nullif(btrim(p_group->>'customer_instruction'),''),selection,coalesce((p_group->>'is_required')::boolean,false),minimum,maximum,coalesce((p_group->>'sort_order')::integer,0)) returning id into group_id;
  end if;
  for option_row in select value from jsonb_array_elements(p_group->'modifier_options') loop
    if length(btrim(coalesce(option_row->>'name','')))=0 then raise exception 'Complete each option name.'; end if;
    option_id:=nullif(option_row->>'id','')::uuid;
    if option_id=any(kept) then raise exception 'The same option cannot be added twice.'; end if;
    if option_id is not null then
      perform 1 from public.modifier_options where id=option_id and modifier_group_id=group_id;
      if not found then raise exception 'This option does not belong to the group.'; end if;
      update public.modifier_options set name=btrim(option_row->>'name'),price_adjustment=(option_row->>'price_adjustment')::integer,linked_product_id=nullif(option_row->>'linked_product_id','')::uuid,is_active=coalesce((option_row->>'is_active')::boolean,true),is_default=coalesce((option_row->>'is_default')::boolean,false),sort_order=cardinality(kept) where id=option_id;
    else
      insert into public.modifier_options(modifier_group_id,name,price_adjustment,linked_product_id,is_active,is_default,sort_order)
      values(group_id,btrim(option_row->>'name'),(option_row->>'price_adjustment')::integer,nullif(option_row->>'linked_product_id','')::uuid,coalesce((option_row->>'is_active')::boolean,true),coalesce((option_row->>'is_default')::boolean,false),cardinality(kept)) returning id into option_id;
    end if;
    kept:=array_append(kept,option_id);
  end loop;
  update public.modifier_options set is_active=false,is_default=false where modifier_group_id=group_id and not(id=any(kept));
  select count(*) into active_count from public.modifier_options where modifier_group_id=group_id and is_active;
  if active_count<greatest(minimum,1) then raise exception 'Keep enough available options for the required selections.'; end if;
  return group_id;
end $$;

create or replace function public.remove_modifier_group(p_business_id uuid,p_group_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission(p_business_id,'modifiers.manage') then raise exception 'Access denied'; end if;
  perform 1 from public.modifier_groups where id=p_group_id and business_id=p_business_id for update;
  if not found then raise exception 'Option group was not found.'; end if;
  delete from public.product_modifier_groups where modifier_group_id=p_group_id;
  update public.modifier_groups set is_active=false where id=p_group_id;
  update public.modifier_options set is_active=false,is_default=false where modifier_group_id=p_group_id;
end $$;
revoke all on function public.save_modifier_group(uuid,jsonb),public.remove_modifier_group(uuid,uuid) from public,anon;
grant execute on function public.save_modifier_group(uuid,jsonb),public.remove_modifier_group(uuid,uuid) to authenticated;

-- Linked beverages/sides use their product recipes; plain choices retain option recipes.
create or replace function public.consume_order_inventory()
returns trigger language plpgsql security definer set search_path=public as $$
declare claimed uuid; recipe_line record;
begin
  if new.status<>'DELIVERED' or old.status='DELIVERED' then return new; end if;
  insert into public.inventory_consumptions(order_id,business_id) values(new.id,new.business_id) on conflict do nothing returning order_id into claimed;
  if claimed is null then return new; end if;
  for recipe_line in
    select recipe.ingredient_id,ingredient.branch_id,sum(recipe.quantity*item.quantity) quantity
    from public.order_items item join public.recipes recipe on recipe.product_id=item.product_id join public.ingredients ingredient on ingredient.id=recipe.ingredient_id
    where item.order_id=new.id and ingredient.branch_id=new.branch_id group by recipe.ingredient_id,ingredient.branch_id
    union all
    select recipe.ingredient_id,ingredient.branch_id,sum(recipe.quantity*item.quantity) quantity
    from public.order_items item join public.order_item_modifiers chosen on chosen.order_item_id=item.id join public.recipes recipe on (chosen.linked_product_id is null and recipe.modifier_option_id=chosen.modifier_option_id) or (chosen.linked_product_id is not null and recipe.product_id=chosen.linked_product_id) join public.ingredients ingredient on ingredient.id=recipe.ingredient_id
    where item.order_id=new.id and ingredient.branch_id=new.branch_id group by recipe.ingredient_id,ingredient.branch_id
  loop
    update public.ingredients set current_stock=current_stock-recipe_line.quantity where id=recipe_line.ingredient_id;
    insert into public.stock_movements(business_id,branch_id,ingredient_id,movement_type,quantity_delta,reference_type,reference_id,note) values(new.business_id,recipe_line.branch_id,recipe_line.ingredient_id,'SALE_CONSUMPTION',-recipe_line.quantity,'ORDER',new.id::text,'Automatic recipe consumption');
  end loop;
  return new;
end $$;
commit;
