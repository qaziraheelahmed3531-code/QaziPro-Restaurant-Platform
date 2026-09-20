begin;

-- Explicit array typing keeps SQL lint clean; also validate historical option snapshots.
create or replace function public.save_modifier_group(p_business_id uuid,p_group jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare group_id uuid; option_row jsonb; option_id uuid; kept uuid[]:=array[]::uuid[]; selection public.selection_type; minimum integer; maximum integer; active_count integer;
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


create or replace function public.snapshot_linked_modifier_product()
returns trigger language plpgsql security definer set search_path=public as $$
declare option_group uuid; option_business uuid; order_business uuid;
begin
  if new.modifier_option_id is null then new.linked_product_id:=null; return new; end if;
  select option.modifier_group_id,groups.business_id,option.linked_product_id
    into option_group,option_business,new.linked_product_id
    from public.modifier_options option join public.modifier_groups groups on groups.id=option.modifier_group_id
    where option.id=new.modifier_option_id;
  select orders.business_id into order_business from public.order_items item join public.orders orders on orders.id=item.order_id where item.id=new.order_item_id;
  if option_group is null or option_group is distinct from new.modifier_group_id or option_business is distinct from order_business then
    raise exception 'This add-on does not belong to the order restaurant.';
  end if;
  return new;
end $$;

commit;

