begin;

-- Production tenant resolution. Domains are stored without scheme, port or path.
create table public.business_domains (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  hostname text not null,
  domain_type text not null default 'CUSTOM' check (domain_type in ('CUSTOM','SUBDOMAIN')),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hostname = lower(hostname) and hostname ~ '^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$'),
  unique (hostname)
);
create unique index business_domains_one_primary_idx on public.business_domains(business_id) where is_primary and is_active;
create index business_domains_business_idx on public.business_domains(business_id,is_active);
create trigger business_domains_updated_at before update on public.business_domains for each row execute function public.set_updated_at();

create or replace function public.resolve_storefront_business(p_hostname text,p_platform_domain text default null,p_fallback_slug text default null)
returns table(resolved_business_id uuid,resolved_business_slug text,resolution text)
language plpgsql stable security definer set search_path=public as $$
declare normalized_host text:=lower(regexp_replace(split_part(coalesce(p_hostname,''),',',1),':\d+$',''));
declare normalized_platform text:=lower(regexp_replace(coalesce(p_platform_domain,''),':\d+$',''));
declare candidate_slug text;
declare resolved_id uuid;
declare resolved_slug text;
begin
  normalized_host:=trim(both '.' from btrim(normalized_host));
  normalized_platform:=trim(both '.' from btrim(normalized_platform));
  if normalized_host<>'' then
    select business.id,business.slug into resolved_id,resolved_slug
    from public.business_domains domain join public.businesses business on business.id=domain.business_id
    where domain.hostname=normalized_host and domain.is_active and domain.verified_at is not null and business.is_active
    limit 1;
    if found then return query select resolved_id,resolved_slug,'DOMAIN'::text; return; end if;
  end if;
  if normalized_platform<>'' and normalized_host like '%.'||normalized_platform and normalized_host<>normalized_platform then
    candidate_slug:=left(normalized_host,length(normalized_host)-length(normalized_platform)-1);
    if candidate_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
      select business.id,business.slug into resolved_id,resolved_slug from public.businesses business where business.slug=candidate_slug and business.is_active;
      if found then return query select resolved_id,resolved_slug,'SUBDOMAIN'::text; return; end if;
    end if;
  end if;
  candidate_slug:=lower(btrim(coalesce(p_fallback_slug,'')));
  if candidate_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    select business.id,business.slug into resolved_id,resolved_slug from public.businesses business where business.slug=candidate_slug and business.is_active;
    if found then return query select resolved_id,resolved_slug,'SLUG'::text; return; end if;
  end if;
end;
$$;

alter table public.branches add column if not exists slug text;
update public.branches
set slug = trim(both '-' from regexp_replace(lower(coalesce(nullif(code,''),name)), '[^a-z0-9]+', '-', 'g'))
where slug is null;
update public.branches set slug='branch-'||substr(id::text,1,8) where slug is null or slug='';
alter table public.branches alter column slug set not null;
alter table public.branches add constraint branches_business_slug_unique unique (business_id,slug);
create or replace function public.ensure_branch_slug()
returns trigger language plpgsql set search_path=public as $$
begin
  if nullif(btrim(new.slug),'') is null then
    new.slug:=trim(both '-' from regexp_replace(lower(coalesce(nullif(new.code,''),new.name)), '[^a-z0-9]+', '-', 'g'));
  end if;
  if new.slug is null or new.slug='' then new.slug:='branch-'||substr(new.id::text,1,8); end if;
  return new;
end;
$$;
create trigger branches_ensure_slug before insert on public.branches for each row execute function public.ensure_branch_slug();

-- One business membership owns the role/permissions; branch grants are many-to-many.
create table public.staff_membership_branches (
  membership_id uuid not null references public.staff_memberships(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (membership_id,branch_id),
  foreign key (business_id,branch_id) references public.branches(business_id,id) on delete cascade
);
create index staff_membership_branches_business_branch_idx on public.staff_membership_branches(business_id,branch_id,membership_id);
insert into public.staff_membership_branches(membership_id,business_id,branch_id)
select id,business_id,branch_id from public.staff_memberships where role<>'OWNER' and branch_id is not null
on conflict do nothing;

alter table public.staff_invitations add column if not exists branch_ids uuid[] not null default '{}';
update public.staff_invitations set branch_ids=array[branch_id] where cardinality(branch_ids)=0 and branch_id is not null;

create or replace function public.staff_can_access_branch(target_business uuid,target_branch uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.staff_memberships membership
    where membership.business_id=target_business
      and membership.user_id=auth.uid()
      and membership.is_active
      and (
        membership.role='OWNER'
        or exists(
          select 1 from public.staff_membership_branches assignment
          where assignment.membership_id=membership.id
            and assignment.business_id=target_business
            and assignment.branch_id=target_branch
        )
      )
  );
$$;

create or replace function public.staff_allowed_branch_ids(target_business uuid)
returns setof uuid language sql stable security definer set search_path=public as $$
  select branch.id
  from public.branches branch
  where branch.business_id=target_business and branch.is_active
    and public.staff_can_access_branch(target_business,branch.id);
$$;

create or replace function public.save_staff_by_email_v2(
  p_business_id uuid,p_branch_ids uuid[],p_email text,p_role public.staff_role,p_active boolean,p_permissions text[]
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user uuid; v_id uuid; v_old public.staff_memberships; v_email text:=lower(btrim(p_email));
  v_owner boolean; v_code text; v_inv public.staff_invitations; v_branch_ids uuid[];
begin
  perform 1 from public.businesses where id=p_business_id for update;
  if not public.has_permission(p_business_id,'staff.manage') then raise exception 'Staff access denied.' using errcode='42501'; end if;
  select exists(select 1 from public.staff_memberships where business_id=p_business_id and user_id=auth.uid() and role='OWNER' and is_active) into v_owner;
  select coalesce(array_agg(distinct selected.branch_id order by selected.branch_id),'{}'::uuid[])
  into v_branch_ids
  from unnest(coalesce(p_branch_ids,'{}'::uuid[])) as selected(branch_id);
  if p_role<>'OWNER' and cardinality(v_branch_ids)=0 then raise exception 'Select at least one active branch.' using errcode='22023'; end if;
  if exists(
    select 1
    from unnest(v_branch_ids) as selected(branch_id)
    where not exists(
      select 1 from public.branches b
      where b.id=selected.branch_id and b.business_id=p_business_id and b.is_active
    )
  ) then
    raise exception 'One or more selected branches are unavailable.' using errcode='22023';
  end if;
  if not v_owner and exists(
    select 1 from unnest(v_branch_ids) as selected(branch_id)
    where not public.staff_can_access_branch(p_business_id,selected.branch_id)
  ) then raise exception 'You can assign only your allowed branches.' using errcode='42501'; end if;
  if v_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' or length(v_email)>254 then raise exception 'Enter a valid employee email.' using errcode='22023'; end if;
  if p_role='OWNER' and not v_owner then raise exception 'Only an owner can assign owner access.' using errcode='42501'; end if;
  foreach v_code in array coalesce(p_permissions,'{}') loop
    if not exists(select 1 from public.admin_permissions where code=v_code) or not public.has_permission(p_business_id,v_code) then raise exception 'You cannot grant that permission.' using errcode='42501'; end if;
  end loop;
  select id into v_user from auth.users where lower(email)=v_email and email_confirmed_at is not null limit 1;
  if v_user is not null then
    select * into v_old from public.staff_memberships where business_id=p_business_id and user_id=v_user;
    if v_old.role='OWNER' and not v_owner then raise exception 'Only owners can change owner access.' using errcode='42501'; end if;
    insert into public.staff_memberships(business_id,user_id,branch_id,role,is_active,permissions_customized)
    values(p_business_id,v_user,case when p_role='OWNER' then null else v_branch_ids[1] end,p_role,p_active,true)
    on conflict(business_id,user_id) do update set branch_id=excluded.branch_id,role=excluded.role,is_active=excluded.is_active,permissions_customized=true,updated_at=now()
    returning id into v_id;
    delete from public.staff_membership_branches where membership_id=v_id;
    if p_role<>'OWNER' then
      insert into public.staff_membership_branches(membership_id,business_id,branch_id)
      select v_id,p_business_id,selected.branch_id
      from unnest(v_branch_ids) as selected(branch_id);
    end if;
    delete from public.staff_membership_permissions where membership_id=v_id;
    insert into public.staff_membership_permissions select v_id,unnest(coalesce(p_permissions,'{}')) on conflict do nothing;
    update public.staff_invitations set status='ACTIVATED',branch_id=coalesce(v_branch_ids[1],branch_id),branch_ids=v_branch_ids,activated_user_id=v_user,updated_at=now() where business_id=p_business_id and email=v_email;
    insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
    values(p_business_id,auth.uid(),case when v_old.id is null then 'STAFF_ACTIVATED' when not p_active then 'STAFF_DEACTIVATED' else 'PERMISSION_CHANGED' end,'staff_memberships',v_id::text,jsonb_build_object('email',v_email,'role',p_role,'branch_ids',v_branch_ids));
    return jsonb_build_object('status','ACTIVE','id',v_id,'email',v_email,'branch_ids',v_branch_ids);
  end if;
  select * into v_inv from public.staff_invitations where business_id=p_business_id and email=v_email;
  if v_inv.role='OWNER' and not v_owner then raise exception 'Only owners can change owner invitations.' using errcode='42501'; end if;
  insert into public.staff_invitations(business_id,branch_id,branch_ids,email,role,is_active,permissions,invited_by)
  values(p_business_id,coalesce(v_branch_ids[1],(select id from public.branches where business_id=p_business_id and is_active order by sort_order,id limit 1)),v_branch_ids,v_email,p_role,p_active,coalesce(p_permissions,'{}'),auth.uid())
  on conflict(business_id,email) do update set branch_id=excluded.branch_id,branch_ids=excluded.branch_ids,role=excluded.role,is_active=excluded.is_active,permissions=excluded.permissions,status='PENDING',delivery_status='NOT_SENT',updated_at=now()
  returning id into v_id;
  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
  values(p_business_id,auth.uid(),'STAFF_INVITED','staff_invitations',v_id::text,jsonb_build_object('email',v_email,'role',p_role,'branch_ids',v_branch_ids));
  return jsonb_build_object('status','PENDING','id',v_id,'email',v_email,'branch_ids',v_branch_ids);
end;
$$;

create or replace function public.save_staff_by_email(p_business_id uuid,p_branch_id uuid,p_email text,p_role public.staff_role,p_active boolean,p_permissions text[])
returns jsonb language sql security definer set search_path=public as $$
  select public.save_staff_by_email_v2(p_business_id,array[p_branch_id],p_email,p_role,p_active,p_permissions);
$$;

create or replace function public.claim_staff_invitations() returns void language plpgsql security definer set search_path=public as $$
declare v_email text; invitation public.staff_invitations; v_id uuid; v_branch_ids uuid[];
begin
  select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_email is null then return; end if;
  for invitation in select * from public.staff_invitations where email=v_email and status='PENDING' and is_active order by business_id loop
    perform 1 from public.businesses where id=invitation.business_id for update;
    select * into invitation from public.staff_invitations where id=invitation.id and status='PENDING' and is_active for update;
    if not found then continue; end if;
    select coalesce(array_agg(selected.branch_id),'{}'::uuid[]) into v_branch_ids
    from unnest(invitation.branch_ids) as selected(branch_id)
    where exists(
      select 1 from public.branches b
      where b.id=selected.branch_id and b.business_id=invitation.business_id and b.is_active
    );
    if invitation.role<>'OWNER' and cardinality(v_branch_ids)=0 then continue; end if;
    insert into public.staff_memberships(business_id,user_id,branch_id,role,is_active,permissions_customized)
    values(invitation.business_id,auth.uid(),case when invitation.role='OWNER' then null else v_branch_ids[1] end,invitation.role,true,true)
    on conflict(business_id,user_id) do update set branch_id=excluded.branch_id,role=excluded.role,is_active=true,permissions_customized=true,updated_at=now()
    returning id into v_id;
    delete from public.staff_membership_branches where membership_id=v_id;
    if invitation.role<>'OWNER' then
      insert into public.staff_membership_branches(membership_id,business_id,branch_id,created_at)
      select v_id,invitation.business_id,selected.branch_id,now()
      from unnest(v_branch_ids) as selected(branch_id);
    end if;
    delete from public.staff_membership_permissions where membership_id=v_id;
    insert into public.staff_membership_permissions select v_id,unnest(invitation.permissions) on conflict do nothing;
    insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
    values(invitation.business_id,auth.uid(),'STAFF_ACTIVATED','staff_memberships',v_id::text,jsonb_build_object('branch_ids',v_branch_ids));
    update public.staff_invitations set status='ACTIVATED',activated_user_id=auth.uid(),updated_at=now() where id=invitation.id;
  end loop;
end;
$$;

create or replace function public.staff_directory(p_business_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_permission(p_business_id,'staff.manage') then raise exception 'Staff access denied.' using errcode='42501'; end if;
  return jsonb_build_object(
    'members',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'email',u.email,'name',u.raw_user_meta_data->>'full_name','role',m.role,'is_active',m.is_active,'created_at',m.created_at,'last_sign_in_at',u.last_sign_in_at,
      'branch_id',m.branch_id,
      'branch_ids',case when m.role='OWNER' then coalesce((select jsonb_agg(b.id order by b.sort_order,b.id) from public.branches b where b.business_id=m.business_id and b.is_active),'[]') else coalesce((select jsonb_agg(a.branch_id order by b.sort_order,b.id) from public.staff_membership_branches a join public.branches b on b.id=a.branch_id where a.membership_id=m.id),'[]') end,
      'branch_name',case when m.role='OWNER' then 'All branches' else coalesce((select string_agg(concat_ws(' — ',coalesce(b.restaurant_name,b.name),b.city),', ' order by b.sort_order,b.id) from public.staff_membership_branches a join public.branches b on b.id=a.branch_id where a.membership_id=m.id),'Not assigned') end,
      'permissions',case when m.role='OWNER' then (select jsonb_agg(code) from public.admin_permissions) when m.permissions_customized then coalesce((select jsonb_agg(permission_code) from public.staff_membership_permissions where membership_id=m.id),'[]') else coalesce((select jsonb_agg(permission_code) from public.admin_role_permissions where role=m.role),'[]') end
    ) order by u.email) from public.staff_memberships m join auth.users u on u.id=m.user_id
      where m.business_id=p_business_id and (
        exists(select 1 from public.staff_memberships caller where caller.business_id=p_business_id and caller.user_id=auth.uid() and caller.role='OWNER' and caller.is_active)
        or exists(select 1 from public.staff_membership_branches target_access where target_access.membership_id=m.id and public.staff_can_access_branch(p_business_id,target_access.branch_id))
      )),'[]'),
    'invitations',coalesce((select jsonb_agg((to_jsonb(i)-'invited_by'-'activated_user_id')||jsonb_build_object('branch_name',case when i.role='OWNER' then 'All branches' else coalesce((select string_agg(concat_ws(' — ',coalesce(b.restaurant_name,b.name),b.city),', ' order by b.sort_order,b.id) from unnest(i.branch_ids) branch_id join public.branches b on b.id=branch_id),'Not assigned') end)) from public.staff_invitations i where i.business_id=p_business_id and i.status='PENDING'),'[]')
  );
end;
$$;

-- Global menu remains authoritative; only branch differences are persisted.
alter table public.products add constraint products_business_id_id_unique unique (business_id,id);
create table public.branch_product_overrides (
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null,
  product_id uuid not null,
  is_available boolean,
  price_override integer check (price_override is null or price_override>=0),
  pos_visible boolean,
  online_visible boolean,
  stock_available boolean,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (branch_id,product_id),
  foreign key (business_id,branch_id) references public.branches(business_id,id) on delete cascade,
  foreign key (business_id,product_id) references public.products(business_id,id) on delete cascade
);
create index branch_product_overrides_catalog_idx on public.branch_product_overrides(business_id,branch_id,sort_order,product_id);
create trigger branch_product_overrides_updated_at before update on public.branch_product_overrides for each row execute function public.set_updated_at();

-- Shared database-backed limiter works across serverless instances.
create table public.api_rate_limit_buckets (
  key_hash text primary key check (length(key_hash)=64),
  window_started_at timestamptz not null,
  hit_count integer not null check (hit_count>0),
  expires_at timestamptz not null
);
create index api_rate_limit_expiry_idx on public.api_rate_limit_buckets(expires_at);
create or replace function public.consume_api_rate_limit(p_key_hash text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare current_count integer; current_time timestamptz:=clock_timestamp();
begin
  if p_key_hash !~ '^[0-9a-f]{64}$' or p_limit not between 1 and 10000 or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit parameters.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key_hash,0));
  delete from public.api_rate_limit_buckets where key_hash=p_key_hash and expires_at<=current_time;
  insert into public.api_rate_limit_buckets(key_hash,window_started_at,hit_count,expires_at)
  values(p_key_hash,current_time,1,current_time+make_interval(secs=>p_window_seconds))
  on conflict(key_hash) do update set hit_count=public.api_rate_limit_buckets.hit_count+1
  returning hit_count into current_count;
  return current_count<=p_limit;
end;
$$;

alter table public.business_domains enable row level security;
alter table public.staff_membership_branches enable row level security;
alter table public.branch_product_overrides enable row level security;
alter table public.api_rate_limit_buckets enable row level security;

drop policy if exists staff_invitation_read on public.staff_invitations;
create policy staff_invitation_read on public.staff_invitations for select to authenticated using(
  public.has_permission(business_id,'staff.manage') and (
    exists(select 1 from public.staff_memberships caller where caller.business_id=staff_invitations.business_id and caller.user_id=auth.uid() and caller.role='OWNER' and caller.is_active)
    or exists(select 1 from unnest(staff_invitations.branch_ids) invitation_branch(branch_id) where public.staff_can_access_branch(staff_invitations.business_id,invitation_branch.branch_id))
  )
);

create policy business_domains_public_read on public.business_domains for select using(is_active and verified_at is not null or public.has_permission(business_id,'business.manage'));
create policy business_domains_manage on public.business_domains for all to authenticated using(public.has_permission(business_id,'business.manage')) with check(public.has_permission(business_id,'business.manage'));
create policy staff_membership_branches_read on public.staff_membership_branches for select to authenticated using(exists(
  select 1 from public.staff_memberships membership
  where membership.id=staff_membership_branches.membership_id and (
    membership.user_id=auth.uid() or (
      public.has_permission(membership.business_id,'staff.manage')
      and public.staff_can_access_branch(staff_membership_branches.business_id,staff_membership_branches.branch_id)
    )
  )
));
create policy staff_membership_branches_manage on public.staff_membership_branches for all to authenticated
using(public.has_permission(staff_membership_branches.business_id,'staff.manage') and public.staff_can_access_branch(staff_membership_branches.business_id,staff_membership_branches.branch_id))
with check(public.has_permission(staff_membership_branches.business_id,'staff.manage') and public.staff_can_access_branch(staff_membership_branches.business_id,staff_membership_branches.branch_id));
create policy branch_product_overrides_public_read on public.branch_product_overrides for select using(exists(
  select 1 from public.branches branch
  join public.businesses business on business.id=branch.business_id
  where branch.id=branch_product_overrides.branch_id
    and branch.business_id=branch_product_overrides.business_id
    and branch.is_active and business.is_active
));
create policy branch_product_overrides_manage on public.branch_product_overrides for all to authenticated using(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'products.manage')) with check(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'products.manage'));

-- Branch settings and assignments are writable only inside the caller's
-- explicit branch scope. Owners remain business-wide through the helper.
drop policy if exists scoped_cms_write on public.branches;
create policy scoped_cms_write on public.branches for all to authenticated
using(public.has_permission(branches.business_id,'branches.manage') and public.staff_can_access_branch(branches.business_id,branches.id))
with check(public.has_permission(branches.business_id,'branches.manage') and (
  public.staff_can_access_branch(branches.business_id,branches.id) or exists(
    select 1 from public.staff_memberships membership
    where membership.business_id=branches.business_id and membership.user_id=auth.uid() and membership.role='OWNER' and membership.is_active
  )
));
drop policy if exists scoped_cms_write on public.business_hours;
create policy scoped_cms_write on public.business_hours for all to authenticated
using(exists(select 1 from public.branches branch where branch.id=business_hours.branch_id and public.staff_can_access_branch(branch.business_id,branch.id) and public.has_permission(branch.business_id,'hours.manage')))
with check(exists(select 1 from public.branches branch where branch.id=business_hours.branch_id and public.staff_can_access_branch(branch.business_id,branch.id) and public.has_permission(branch.business_id,'hours.manage')));
drop policy if exists scoped_cms_write on public.delivery_areas;
create policy scoped_cms_write on public.delivery_areas for all to authenticated
using(exists(select 1 from public.branches branch where branch.id=delivery_areas.branch_id and public.staff_can_access_branch(branch.business_id,branch.id) and public.has_permission(branch.business_id,'delivery.manage')))
with check(exists(select 1 from public.branches branch where branch.id=delivery_areas.branch_id and public.staff_can_access_branch(branch.business_id,branch.id) and public.has_permission(branch.business_id,'delivery.manage')));
drop policy if exists scoped_cms_write on public.delivery_rules;
create policy scoped_cms_write on public.delivery_rules for all to authenticated
using(exists(select 1 from public.branches branch where branch.id=delivery_rules.branch_id and public.staff_can_access_branch(branch.business_id,branch.id) and public.has_permission(branch.business_id,'delivery.manage')))
with check(exists(select 1 from public.branches branch where branch.id=delivery_rules.branch_id and public.staff_can_access_branch(branch.business_id,branch.id) and public.has_permission(branch.business_id,'delivery.manage')));

-- Harden branch-owned operational rows. Public storefront reads remain limited to active location/catalog data.
drop policy if exists own_orders_read on public.orders;
create policy own_orders_read on public.orders for select using(customer_id=auth.uid() or (public.staff_can_access_branch(business_id,branch_id) and (public.has_permission(business_id,'orders.read') or public.has_permission(business_id,'orders.manage') or public.has_permission(business_id,'receipts.print') or public.has_permission(business_id,'reports.read'))));
drop policy if exists orders_staff_update on public.orders;
create policy orders_staff_update on public.orders for update to authenticated using(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'orders.manage')) with check(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'orders.manage'));
drop policy if exists own_order_items_read on public.order_items;
create policy own_order_items_read on public.order_items for select using(exists(
  select 1 from public.orders order_record where order_record.id=order_id and (
    order_record.customer_id=auth.uid() or (
      public.staff_can_access_branch(order_record.business_id,order_record.branch_id)
      and (public.has_permission(order_record.business_id,'orders.read') or public.has_permission(order_record.business_id,'orders.manage') or public.has_permission(order_record.business_id,'receipts.print') or public.has_permission(order_record.business_id,'reports.read'))
    )
  )
));
drop policy if exists own_order_modifiers_read on public.order_item_modifiers;
create policy own_order_modifiers_read on public.order_item_modifiers for select using(exists(
  select 1 from public.order_items item join public.orders order_record on order_record.id=item.order_id
  where item.id=order_item_id and (
    order_record.customer_id=auth.uid() or (
      public.staff_can_access_branch(order_record.business_id,order_record.branch_id)
      and (public.has_permission(order_record.business_id,'orders.read') or public.has_permission(order_record.business_id,'orders.manage') or public.has_permission(order_record.business_id,'receipts.print') or public.has_permission(order_record.business_id,'reports.read'))
    )
  )
));
drop policy if exists own_order_history_read on public.order_status_history;
create policy own_order_history_read on public.order_status_history for select using(exists(
  select 1 from public.orders order_record where order_record.id=order_id and (
    order_record.customer_id=auth.uid() or (
      public.staff_can_access_branch(order_record.business_id,order_record.branch_id)
      and (public.has_permission(order_record.business_id,'orders.read') or public.has_permission(order_record.business_id,'orders.manage') or public.has_permission(order_record.business_id,'receipts.print') or public.has_permission(order_record.business_id,'reports.read'))
    )
  )
));
drop policy if exists kitchen_orders_read on public.orders;
create policy kitchen_orders_read on public.orders for select to authenticated using(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'kds.use') and status in ('CONFIRMED','PREPARING','READY'));
drop policy if exists kitchen_orders_update on public.orders;
create policy kitchen_orders_update on public.orders for update to authenticated using(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'kds.use') and status in ('CONFIRMED','PREPARING')) with check(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'kds.use') and status in ('PREPARING','READY'));

drop policy if exists register_read on public.register_shifts;
create policy register_read on public.register_shifts for select to authenticated using(public.staff_can_access_branch(business_id,branch_id) and (public.has_permission(business_id,'register.manage') or public.has_permission(business_id,'reports.read')));
drop policy if exists pos_own_shift_read on public.register_shifts;
create policy pos_own_shift_read on public.register_shifts for select to authenticated using(opened_by=auth.uid() and public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'pos.use'));
drop policy if exists cash_read on public.cash_movements;
create policy cash_read on public.cash_movements for select to authenticated using(exists(
  select 1 from public.register_shifts shift_record where shift_record.id=shift_id
    and public.staff_can_access_branch(shift_record.business_id,shift_record.branch_id)
    and (public.has_permission(shift_record.business_id,'register.manage') or public.has_permission(shift_record.business_id,'reports.read'))
));
drop policy if exists held_orders_manage on public.pos_held_orders;
create policy held_orders_manage on public.pos_held_orders for all to authenticated using(held_by=auth.uid() and public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'pos.use')) with check(held_by=auth.uid() and public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'pos.use'));
drop policy if exists payments_read on public.payment_transactions;
create policy payments_read on public.payment_transactions for select to authenticated using(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'payments.read'));
drop policy if exists payment_events_read on public.payment_events;
create policy payment_events_read on public.payment_events for select to authenticated using(exists(
  select 1 from public.payment_transactions payment where payment.id=payment_id
    and public.staff_can_access_branch(payment.business_id,payment.branch_id)
    and public.has_permission(payment.business_id,'payments.read')
));
drop policy if exists refunds_read on public.refunds;
create policy refunds_read on public.refunds for select to authenticated using(exists(
  select 1 from public.payment_transactions payment where payment.id=payment_id
    and public.staff_can_access_branch(payment.business_id,payment.branch_id)
    and public.has_permission(payment.business_id,'payments.read')
));
drop policy if exists ingredients_read on public.ingredients;
create policy ingredients_read on public.ingredients for select to authenticated using(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'inventory.read'));
drop policy if exists ingredient_picker_read on public.ingredients;
create policy ingredient_picker_read on public.ingredients for select to authenticated using(public.staff_can_access_branch(business_id,branch_id) and (public.has_permission(business_id,'recipes.manage') or public.has_permission(business_id,'purchases.manage') or public.has_permission(business_id,'wastage.manage')));
drop policy if exists ingredients_manage on public.ingredients;
create policy ingredients_manage on public.ingredients for all to authenticated using(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'ingredients.manage')) with check(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'ingredients.manage'));
drop policy if exists recipes_read on public.recipes;
create policy recipes_read on public.recipes for select to authenticated using(exists(
  select 1 from public.ingredients ingredient where ingredient.id=ingredient_id
    and public.staff_can_access_branch(ingredient.business_id,ingredient.branch_id)
    and public.has_permission(ingredient.business_id,'inventory.read')
));
drop policy if exists recipes_manage on public.recipes;
create policy recipes_manage on public.recipes for all to authenticated using(exists(
  select 1 from public.ingredients ingredient where ingredient.id=ingredient_id
    and public.staff_can_access_branch(ingredient.business_id,ingredient.branch_id)
    and public.has_permission(ingredient.business_id,'recipes.manage')
)) with check(exists(
  select 1 from public.ingredients ingredient where ingredient.id=ingredient_id
    and public.staff_can_access_branch(ingredient.business_id,ingredient.branch_id)
    and public.has_permission(ingredient.business_id,'recipes.manage')
));
drop policy if exists purchases_manage on public.purchases;
create policy purchases_manage on public.purchases for all to authenticated using(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'purchases.manage')) with check(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'purchases.manage'));
drop policy if exists purchase_items_manage on public.purchase_items;
create policy purchase_items_manage on public.purchase_items for all to authenticated using(exists(
  select 1 from public.purchases purchase where purchase.id=purchase_id
    and public.staff_can_access_branch(purchase.business_id,purchase.branch_id)
    and public.has_permission(purchase.business_id,'purchases.manage')
)) with check(exists(
  select 1 from public.purchases purchase where purchase.id=purchase_id
    and public.staff_can_access_branch(purchase.business_id,purchase.branch_id)
    and public.has_permission(purchase.business_id,'purchases.manage')
));
drop policy if exists stock_read on public.stock_movements;
create policy stock_read on public.stock_movements for select to authenticated using(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'inventory.read'));
drop policy if exists wastage_read on public.wastage;
create policy wastage_read on public.wastage for select to authenticated using(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'inventory.read'));
drop policy if exists wastage_module_read on public.wastage;
create policy wastage_module_read on public.wastage for select to authenticated using(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'wastage.manage'));
drop policy if exists consumptions_read on public.inventory_consumptions;
create policy consumptions_read on public.inventory_consumptions for select to authenticated using(exists(
  select 1 from public.orders order_record where order_record.id=order_id
    and public.staff_can_access_branch(order_record.business_id,order_record.branch_id)
    and public.has_permission(order_record.business_id,'inventory.read')
));
drop policy if exists invoices_read on public.invoices;
create policy invoices_read on public.invoices for select to authenticated using(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'invoices.read'));
drop policy if exists invoice_lines_read on public.invoice_lines;
create policy invoice_lines_read on public.invoice_lines for select to authenticated using(exists(
  select 1 from public.invoices invoice where invoice.id=invoice_id
    and public.staff_can_access_branch(invoice.business_id,invoice.branch_id)
    and public.has_permission(invoice.business_id,'invoices.read')
));
drop policy if exists pos_replacements_staff_read on public.pos_order_replacements;
create policy pos_replacements_staff_read on public.pos_order_replacements for select to authenticated using(
  public.staff_can_access_branch(business_id,branch_id)
  and (public.has_permission(business_id,'pos.use') or public.has_permission(business_id,'orders.read') or public.has_permission(business_id,'reports.read'))
);
drop policy if exists rider_location_staff_read on public.rider_live_locations;
create policy rider_location_staff_read on public.rider_live_locations for select to authenticated using(
  (rider_id=auth.uid() and public.staff_can_access_branch(business_id,branch_id))
  or (public.staff_can_access_branch(business_id,branch_id) and (public.has_permission(business_id,'orders.manage') or public.has_permission(business_id,'delivery.manage')))
);
drop policy if exists order_notifications_staff_read on public.order_notifications;
create policy order_notifications_staff_read on public.order_notifications for select to authenticated using(exists(
  select 1 from public.orders order_record where order_record.id=order_id
    and public.staff_can_access_branch(order_record.business_id,order_record.branch_id)
    and public.has_permission(order_record.business_id,'orders.read')
));
drop policy if exists order_notifications_staff_manage on public.order_notifications;
create policy order_notifications_staff_manage on public.order_notifications for all to authenticated using(exists(
  select 1 from public.orders order_record where order_record.id=order_id
    and public.staff_can_access_branch(order_record.business_id,order_record.branch_id)
    and public.has_permission(order_record.business_id,'orders.manage')
)) with check(exists(
  select 1 from public.orders order_record where order_record.id=order_id
    and public.staff_can_access_branch(order_record.business_id,order_record.branch_id)
    and public.has_permission(order_record.business_id,'orders.manage')
));
drop policy if exists pos_offline_devices_read on public.pos_offline_devices;
create policy pos_offline_devices_read on public.pos_offline_devices for select to authenticated using(public.staff_can_access_branch(business_id,branch_id) and (public.has_permission(business_id,'pos.use') or public.has_permission(business_id,'settings.manage')));
drop policy if exists pos_catalog_snapshots_read on public.pos_catalog_snapshots;
create policy pos_catalog_snapshots_read on public.pos_catalog_snapshots for select to authenticated using(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'pos.use'));

grant select on public.business_domains,public.branch_product_overrides to anon,authenticated;
grant select,insert,update,delete on public.business_domains,public.staff_membership_branches,public.branch_product_overrides to authenticated;
grant execute on function public.resolve_storefront_business(text,text,text) to anon,authenticated,service_role;
revoke all on public.api_rate_limit_buckets from public,anon,authenticated;
revoke all on function public.consume_api_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_api_rate_limit(text,integer,integer) to service_role;
revoke all on function public.save_staff_by_email_v2(uuid,uuid[],text,public.staff_role,boolean,text[]) from public,anon;
grant execute on function public.save_staff_by_email_v2(uuid,uuid[],text,public.staff_role,boolean,text[]) to authenticated;
grant execute on function public.staff_allowed_branch_ids(uuid) to authenticated;

commit;
