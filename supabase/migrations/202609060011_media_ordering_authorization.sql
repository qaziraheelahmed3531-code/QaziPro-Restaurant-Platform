begin;
-- Replace permissive role-based CMS mutation policies; public active content reads remain intact.
do $$ declare p record; begin
 for p in select schemaname,tablename,policyname from pg_policies where schemaname='public' and cmd in ('ALL','INSERT','UPDATE','DELETE') and tablename=any(array['business_branding','site_settings','branches','categories','products','modifier_groups','deals','hero_banners','promotional_banners','promotions','social_links','integration_settings','print_settings','business_hours','delivery_areas','delivery_rules','product_images','product_variants','modifier_options','product_modifier_groups','deal_items']) loop
 execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
 end loop;
end $$;
create policy scoped_cms_write on public.business_branding for all to authenticated using((public.has_permission(business_id,'branding.manage'))) with check((public.has_permission(business_id,'branding.manage')));
create policy scoped_cms_write on public.site_settings for all to authenticated using((public.has_permission(business_id,'content.manage') or public.has_permission(business_id,'reviews.manage'))) with check((public.has_permission(business_id,'content.manage') or public.has_permission(business_id,'reviews.manage')));
create policy scoped_cms_write on public.branches for all to authenticated using((public.has_permission(business_id,'branches.manage'))) with check((public.has_permission(business_id,'branches.manage')));
create policy scoped_cms_write on public.categories for all to authenticated using((public.has_permission(business_id,'categories.manage'))) with check((public.has_permission(business_id,'categories.manage')));
create policy scoped_cms_write on public.products for all to authenticated using((public.has_permission(business_id,'products.manage'))) with check((public.has_permission(business_id,'products.manage')));
create policy scoped_cms_write on public.modifier_groups for all to authenticated using((public.has_permission(business_id,'modifiers.manage'))) with check((public.has_permission(business_id,'modifiers.manage')));
create policy scoped_cms_write on public.deals for all to authenticated using((public.has_permission(business_id,'deals.manage'))) with check((public.has_permission(business_id,'deals.manage')));
create policy scoped_cms_write on public.hero_banners for all to authenticated using((public.has_permission(business_id,'banners.manage'))) with check((public.has_permission(business_id,'banners.manage')));
create policy scoped_cms_write on public.promotional_banners for all to authenticated using((public.has_permission(business_id,'banners.manage'))) with check((public.has_permission(business_id,'banners.manage')));
create policy scoped_cms_write on public.promotions for all to authenticated using((public.has_permission(business_id,'promotions.manage'))) with check((public.has_permission(business_id,'promotions.manage')));
create policy scoped_cms_write on public.social_links for all to authenticated using((public.has_permission(business_id,'content.manage') or public.has_permission(business_id,'reviews.manage'))) with check((public.has_permission(business_id,'content.manage') or public.has_permission(business_id,'reviews.manage')));
create policy scoped_cms_write on public.integration_settings for all to authenticated using((public.has_permission(business_id,'settings.manage'))) with check((public.has_permission(business_id,'settings.manage')));
create policy scoped_cms_write on public.print_settings for all to authenticated using((public.has_permission(business_id,'printing.manage'))) with check((public.has_permission(business_id,'printing.manage')));
create policy scoped_cms_write on public.business_hours for all to authenticated using(exists(select 1 from public.branches parent where parent.id=branch_id and (public.has_permission(parent.business_id,'hours.manage')))) with check(exists(select 1 from public.branches parent where parent.id=branch_id and (public.has_permission(parent.business_id,'hours.manage'))));
create policy scoped_cms_write on public.delivery_areas for all to authenticated using(exists(select 1 from public.branches parent where parent.id=branch_id and (public.has_permission(parent.business_id,'delivery.manage')))) with check(exists(select 1 from public.branches parent where parent.id=branch_id and (public.has_permission(parent.business_id,'delivery.manage'))));
create policy scoped_cms_write on public.delivery_rules for all to authenticated using(exists(select 1 from public.branches parent where parent.id=branch_id and (public.has_permission(parent.business_id,'delivery.manage')))) with check(exists(select 1 from public.branches parent where parent.id=branch_id and (public.has_permission(parent.business_id,'delivery.manage'))));
create policy scoped_cms_write on public.product_images for all to authenticated using(exists(select 1 from public.products parent where parent.id=product_id and (public.has_permission(parent.business_id,'products.manage')))) with check(exists(select 1 from public.products parent where parent.id=product_id and (public.has_permission(parent.business_id,'products.manage'))));
create policy scoped_cms_write on public.product_variants for all to authenticated using(exists(select 1 from public.products parent where parent.id=product_id and (public.has_permission(parent.business_id,'products.manage')))) with check(exists(select 1 from public.products parent where parent.id=product_id and (public.has_permission(parent.business_id,'products.manage'))));
create policy scoped_cms_write on public.modifier_options for all to authenticated using(exists(select 1 from public.modifier_groups parent where parent.id=modifier_group_id and (public.has_permission(parent.business_id,'modifiers.manage')))) with check(exists(select 1 from public.modifier_groups parent where parent.id=modifier_group_id and (public.has_permission(parent.business_id,'modifiers.manage'))));
create policy scoped_cms_write on public.product_modifier_groups for all to authenticated using(exists(select 1 from public.products parent where parent.id=product_id and (public.has_permission(parent.business_id,'modifiers.manage')))) with check(exists(select 1 from public.products parent where parent.id=product_id and (public.has_permission(parent.business_id,'modifiers.manage'))));
create policy scoped_cms_write on public.deal_items for all to authenticated using(exists(select 1 from public.deals parent where parent.id=deal_id and (public.has_permission(parent.business_id,'deals.manage')))) with check(exists(select 1 from public.deals parent where parent.id=deal_id and (public.has_permission(parent.business_id,'deals.manage'))));

-- The two editors share site_settings, so column authorization must be enforced too.
create function public.guard_site_settings_fields() returns trigger language plpgsql set search_path=public as $$
begin
 if current_user<>'authenticated' then return new; end if;
 if not public.has_permission(new.business_id,'content.manage') and
 (tg_op='INSERT' or (to_jsonb(new)-array['reviews_enabled','reviews_title','reviews_business_name','reviews_widget_id','updated_at']) is distinct from (to_jsonb(old)-array['reviews_enabled','reviews_title','reviews_business_name','reviews_widget_id','updated_at'])) then
 raise exception 'Website content access required.' using errcode='42501'; end if;
 if not public.has_permission(new.business_id,'reviews.manage') and
 (tg_op='INSERT' or (to_jsonb(new)->'reviews_title' is distinct from to_jsonb(old)->'reviews_title') or (to_jsonb(new)->'reviews_business_name' is distinct from to_jsonb(old)->'reviews_business_name') or (to_jsonb(new)->'reviews_widget_id' is distinct from to_jsonb(old)->'reviews_widget_id')) then
 raise exception 'Review presentation access required.' using errcode='42501'; end if;
 return new;
end; $$;
create trigger guard_site_settings before insert or update on public.site_settings for each row execute function public.guard_site_settings_fields();
drop policy businesses_staff_update on public.businesses;
create policy businesses_scoped_update on public.businesses for update to authenticated using(public.has_permission(id,'business.manage')) with check(public.has_permission(id,'business.manage'));
drop policy audit_staff_read on public.audit_logs;
create policy audit_permission_read on public.audit_logs for select to authenticated using(public.has_permission(business_id,'audit.read'));
drop policy own_orders_read on public.orders;
create policy own_orders_read on public.orders for select using(customer_id=auth.uid() or public.has_permission(business_id,'orders.read') or public.has_permission(business_id,'orders.manage') or public.has_permission(business_id,'receipts.print') or public.has_permission(business_id,'reports.read'));
-- Parent orders RLS also keeps kitchen and customer ownership scopes.
drop policy own_order_items_read on public.order_items;
create policy own_order_items_read on public.order_items for select using(exists(select 1 from public.orders o where o.id=order_id));
drop policy own_order_modifiers_read on public.order_item_modifiers;
create policy own_order_modifiers_read on public.order_item_modifiers for select using(exists(select 1 from public.order_items i where i.id=order_item_id));
drop policy own_order_history_read on public.order_status_history;
create policy own_order_history_read on public.order_status_history for select using(exists(select 1 from public.orders o where o.id=order_id));
grant execute on function public.has_permission(uuid,text) to anon;

drop policy restaurant_media_staff_insert on storage.objects;
drop policy restaurant_media_staff_update on storage.objects;
drop policy restaurant_media_staff_delete on storage.objects;
create function public.can_manage_media(p_bucket text,p_name text) returns boolean language plpgsql stable security definer set search_path=public as $$
declare b uuid;
begin
 begin b:=split_part(p_name,'/',1)::uuid; exception when invalid_text_representation then return false; end;
 return case p_bucket
 when 'business-logos' then public.has_permission(b,'branding.manage') or public.has_permission(b,'printing.manage')
 when 'hero-banners' then public.has_permission(b,'banners.manage')
 when 'category-images' then public.has_permission(b,'categories.manage') or public.has_permission(b,'menu.manage')
 when 'product-images' then public.has_permission(b,'products.manage') or public.has_permission(b,'deals.manage') or public.has_permission(b,'menu.manage')
 else false end;
end; $$;
revoke all on function public.can_manage_media(text,text) from public,anon;
grant execute on function public.can_manage_media(text,text) to authenticated;
create policy media_scoped_insert on storage.objects for insert to authenticated with check(public.can_manage_media(bucket_id,name));
create policy media_scoped_update on storage.objects for update to authenticated using(public.can_manage_media(bucket_id,name)) with check(public.can_manage_media(bucket_id,name));
create policy media_scoped_delete on storage.objects for delete to authenticated using(public.can_manage_media(bucket_id,name));
update storage.buckets set file_size_limit=10485760,allowed_mime_types=array['image/png','image/jpeg','image/webp'] where id in ('business-logos','hero-banners','category-images','product-images');

-- Whole collection snapshots prevent stale/partial order overwrites.
create function public.content_order(p_business_id uuid,p_collection text,p_parent uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare tbl text; perm text; predicate text; label text:='name'; result jsonb;
begin
 select t,p into tbl,perm from (values
 ('categories','categories','categories.manage'),('products','products','products.manage'),
 ('banners','hero_banners','banners.manage'),('promotionalBanners','promotional_banners','banners.manage'),
 ('deals','deals','deals.manage'),('modifierGroups','modifier_groups','modifiers.manage'),
 ('modifierOptions','modifier_options','modifiers.manage'),('socialLinks','social_links','content.manage'),
 ('productImages','product_images','products.manage'),('productModifierGroups','product_modifier_groups','modifiers.manage')
 ) c(k,t,p) where k=p_collection;
 if tbl is null or not (public.has_permission(p_business_id,perm)) then raise exception 'Ordering access denied.' using errcode='42501'; end if;
 predicate:=format('business_id=%L',p_business_id);
 if p_collection='products' then predicate:=predicate||format(' and category_id=%L',p_parent); end if;
 if p_collection='modifierOptions' then predicate:=format('modifier_group_id=%L and exists(select 1 from public.modifier_groups g where g.id=modifier_group_id and g.business_id=%L)',p_parent,p_business_id); end if;
 if p_collection='productImages' then predicate:=format('product_id=%L and exists(select 1 from public.products p where p.id=product_id and p.business_id=%L)',p_parent,p_business_id); label:='alt_text'; end if;
 if p_collection='productModifierGroups' then
  execute 'select coalesce(jsonb_agg(jsonb_build_object(''id'',a.id,''label'',g.name,''sort_order'',a.sort_order) order by a.sort_order,a.id),''[]'') from public.product_modifier_groups a join public.products p on p.id=a.product_id join public.modifier_groups g on g.id=a.modifier_group_id where p.business_id=$1 and p.id=$2' into result using p_business_id,p_parent;
  return result;
 end if;
 if p_collection='banners' then label:='internal_name'; end if;
 if p_collection='promotionalBanners' then label:='title'; end if;
 if p_collection='socialLinks' then label:='platform'; end if;
 execute format('select coalesce(jsonb_agg(jsonb_build_object(''id'',id,''label'',coalesce(%I,''Untitled''),''sort_order'',sort_order) order by sort_order,id),''[]'') from public.%I where %s',label,tbl,predicate) into result;
 return result;
end; $$;

create function public.reorder_content(p_business_id uuid,p_collection text,p_parent uuid,p_ids uuid[],p_expected jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare current_order jsonb; tbl text;
begin
 perform 1 from public.businesses where id=p_business_id for update;
 current_order:=public.content_order(p_business_id,p_collection,p_parent);
 if current_order is distinct from p_expected then raise exception 'Content changed. Reload the order and try again.' using errcode='40001'; end if;
 if cardinality(p_ids)<>jsonb_array_length(current_order) or cardinality(p_ids)<>(select count(distinct v) from unnest(p_ids) v) or
 exists(select 1 from unnest(p_ids) v where not exists(select 1 from jsonb_array_elements(current_order) e where e->>'id'=v::text)) then
 raise exception 'Supply every item in the collection exactly once.' using errcode='22023'; end if;
 tbl:=case p_collection when 'banners' then 'hero_banners' when 'promotionalBanners' then 'promotional_banners' when 'modifierGroups' then 'modifier_groups' when 'modifierOptions' then 'modifier_options' when 'socialLinks' then 'social_links' when 'productImages' then 'product_images' when 'productModifierGroups' then 'product_modifier_groups' else p_collection end;
 execute format('update public.%I t set sort_order=v.position from unnest($1) with ordinality v(id,position) where t.id=v.id',tbl) using p_ids;
 insert into public.audit_logs(business_id,actor_id,action,entity_type,metadata) values(p_business_id,auth.uid(),'CONTENT_REORDERED',tbl,jsonb_build_object('count',cardinality(p_ids)));
end; $$;
revoke all on function public.content_order(uuid,text,uuid),public.reorder_content(uuid,text,uuid,uuid[],jsonb) from public,anon;
grant execute on function public.content_order(uuid,text,uuid),public.reorder_content(uuid,text,uuid,uuid[],jsonb) to authenticated;
commit;
