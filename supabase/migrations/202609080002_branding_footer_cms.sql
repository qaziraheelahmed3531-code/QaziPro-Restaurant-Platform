begin;

-- Public customer information and footer navigation are business-owned CMS data.
-- No administrator-controlled field exists for the immutable powered-by credit.
create table if not exists public.footer_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 80),
  group_name text not null default 'QUICK_LINKS' check (group_name in ('QUICK_LINKS','SUPPORT','ORDER')),
  href text not null check (href ~ '^(https?://|/)'),
  is_external boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists footer_links_business_label_idx on public.footer_links(business_id, group_name, label);
create index if not exists footer_links_business_order_idx on public.footer_links(business_id, group_name, sort_order, id);

create table if not exists public.content_pages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(trim(title)) between 1 and 120),
  body text not null default '',
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, slug)
);

create index if not exists content_pages_business_order_idx on public.content_pages(business_id, sort_order, slug);

alter table public.footer_links enable row level security;
alter table public.content_pages enable row level security;

drop policy if exists footer_links_public_read on public.footer_links;
create policy footer_links_public_read on public.footer_links for select to anon, authenticated using (is_active);
drop policy if exists footer_links_staff_write on public.footer_links;
create policy footer_links_staff_write on public.footer_links for all to authenticated
  using (public.has_permission(business_id, 'content.manage'))
  with check (public.has_permission(business_id, 'content.manage'));

drop policy if exists content_pages_public_read on public.content_pages;
create policy content_pages_public_read on public.content_pages for select to anon, authenticated using (is_published);
drop policy if exists content_pages_staff_write on public.content_pages;
create policy content_pages_staff_write on public.content_pages for all to authenticated
  using (public.has_permission(business_id, 'content.manage'))
  with check (public.has_permission(business_id, 'content.manage'));

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'footer_links_updated_at') then
    create trigger footer_links_updated_at before update on public.footer_links for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'content_pages_updated_at') then
    create trigger content_pages_updated_at before update on public.content_pages for each row execute function public.set_updated_at();
  end if;
end $$;

-- Seed editable defaults once. Staff can replace or remove these rows in Content & Social.
insert into public.footer_links (business_id, label, group_name, href, sort_order)
select b.id, v.label, v.group_name, v.href, v.sort_order
from public.businesses b
cross join (values
  ('Menu','QUICK_LINKS','/#menu',10), ('Deals','QUICK_LINKS','/#deals',20), ('Location','QUICK_LINKS','/#location',30),
  ('Orders','QUICK_LINKS','/orders',40), ('Contact Us','SUPPORT','/pages/contact',10), ('FAQs','SUPPORT','/pages/faqs',20),
  ('Delivery','ORDER','/#location',10), ('Pickup','ORDER','/#location',20)
) v(label, group_name, href, sort_order)
where b.is_active
on conflict (business_id, group_name, label) do nothing;

insert into public.content_pages (business_id, slug, title, body, is_published, sort_order)
select b.id, v.slug, v.title, v.body, true, v.sort_order
from public.businesses b
cross join (values
  ('contact','Contact Italian Pizza','For questions about an order, delivery or pickup, please contact the restaurant through the details provided at checkout.',10),
  ('faqs','Frequently Asked Questions','Choose delivery or pickup, select your location, then add your favourites to the cart. Delivery availability and fees are confirmed before you place an order.',20),
  ('privacy','Privacy','We use the information needed to prepare, deliver and support your order. Customer account data is only used for the account and business operations it belongs to.',30),
  ('terms','Terms of Ordering','Orders are confirmed subject to restaurant availability, opening hours and the details provided at checkout. Please review your order before placing it.',40)
) v(slug, title, body, sort_order)
where b.is_active
on conflict (business_id, slug) do nothing;

create or replace function public.content_order(p_business_id uuid,p_collection text,p_parent uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare tbl text; perm text; predicate text; label text:='name'; result jsonb;
begin
 select t,p into tbl,perm from (values
 ('areas','delivery_areas','delivery.manage'),('categories','categories','categories.manage'),('products','products','products.manage'),
 ('banners','hero_banners','banners.manage'),('promotionalBanners','promotional_banners','banners.manage'),
 ('deals','deals','deals.manage'),('modifierGroups','modifier_groups','modifiers.manage'),
 ('modifierOptions','modifier_options','modifiers.manage'),('socialLinks','social_links','social.manage'),
 ('footerLinks','footer_links','content.manage'),('contentPages','content_pages','content.manage'),
 ('productImages','product_images','products.manage'),('productModifierGroups','product_modifier_groups','modifiers.manage')
 ) c(k,t,p) where k=p_collection;
 if tbl is null or not public.has_permission(p_business_id,perm) then raise exception 'Ordering access denied.' using errcode='42501'; end if;
 predicate:=format('business_id=%L',p_business_id);
 if p_collection='areas' then predicate:=format('branch_id=%L and exists(select 1 from public.branches b where b.id=branch_id and b.business_id=%L)',p_parent,p_business_id); end if;
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
 if p_collection='footerLinks' then label:='label'; end if;
 if p_collection='contentPages' then label:='title'; end if;
 execute format('select coalesce(jsonb_agg(jsonb_build_object(''id'',id,''label'',coalesce(%I,''Untitled''),''sort_order'',sort_order) order by sort_order,id),''[]'') from public.%I where %s',label,tbl,predicate) into result;
 return result;
end; $$;

create or replace function public.reorder_content(p_business_id uuid,p_collection text,p_parent uuid,p_ids uuid[],p_expected jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare current_order jsonb; tbl text;
begin
 perform 1 from public.businesses where id=p_business_id for update;
 current_order:=public.content_order(p_business_id,p_collection,p_parent);
 if current_order is distinct from p_expected then raise exception 'Content changed. Reload and try again.' using errcode='40001'; end if;
 if cardinality(p_ids)<>jsonb_array_length(current_order) or cardinality(p_ids)<>(select count(distinct v) from unnest(p_ids) v) or
 exists(select 1 from unnest(p_ids) v where not exists(select 1 from jsonb_array_elements(current_order) e where e->>'id'=v::text)) then
  raise exception 'Supply every item in the collection exactly once.' using errcode='22023';
 end if;
 tbl:=case p_collection when 'areas' then 'delivery_areas' when 'banners' then 'hero_banners' when 'promotionalBanners' then 'promotional_banners' when 'modifierGroups' then 'modifier_groups' when 'modifierOptions' then 'modifier_options' when 'socialLinks' then 'social_links' when 'footerLinks' then 'footer_links' when 'contentPages' then 'content_pages' when 'productImages' then 'product_images' when 'productModifierGroups' then 'product_modifier_groups' else p_collection end;
 execute format('update public.%I t set sort_order=v.position from unnest($1) with ordinality v(id,position) where t.id=v.id',tbl) using p_ids;
 insert into public.audit_logs(business_id,actor_id,action,entity_type,metadata) values(p_business_id,auth.uid(),'CONTENT_REORDERED',tbl,jsonb_build_object('count',cardinality(p_ids)));
end; $$;

revoke all on function public.content_order(uuid,text,uuid),public.reorder_content(uuid,text,uuid,uuid[],jsonb) from public,anon;
grant execute on function public.content_order(uuid,text,uuid),public.reorder_content(uuid,text,uuid,uuid[],jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
