begin;

create or replace function public.normalize_storefront_hostname(p_value text)
returns text
language plpgsql
immutable
strict
set search_path=public
as $$
declare normalized text:=lower(btrim(split_part(p_value,',',1)));
begin
  normalized:=regexp_replace(normalized,'^[a-z][a-z0-9+.-]*://','');
  normalized:=split_part(split_part(split_part(normalized,'/',1),'?',1),'#',1);
  normalized:=regexp_replace(normalized,':\d+$','');
  return trim(both '.' from normalized);
end;
$$;

alter table public.platform_domain_records
  add column if not exists is_primary boolean not null default false,
  add column if not exists is_active boolean not null default true;

create unique index if not exists platform_domain_one_customer_primary_idx
  on public.platform_domain_records(business_id)
  where purpose='CUSTOMER' and is_primary and is_active;

create or replace function public.prepare_platform_domain_record()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare normalized text;
declare managed_staging boolean;
begin
  normalized:=public.normalize_storefront_hostname(new.hostname);
  if normalized is null or length(normalized) not between 4 and 253
    or normalized !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$' then
    raise exception 'INVALID_DOMAIN_HOSTNAME' using errcode='22023';
  end if;
  new.hostname:=normalized;
  managed_staging:=normalized ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.staging\.qazipro\.com$';
  if new.purpose='CUSTOMER' and new.is_active and not new.is_primary and not exists(
    select 1 from public.platform_domain_records record
    where record.business_id=new.business_id and record.purpose='CUSTOMER'
      and record.is_active and record.is_primary and record.id is distinct from new.id
  ) then
    new.is_primary:=true;
  end if;
  if managed_staging then
    new.verification_status:='VERIFIED';
    new.dns_status:='HEALTHY';
    new.ssl_status:='HEALTHY';
    new.last_checked_at:=coalesce(new.last_checked_at,now());
    new.failure_summary:=null;
  elsif tg_op='INSERT' then
    new.verification_status:='PENDING';
    new.dns_status:='UNKNOWN';
    new.ssl_status:='UNKNOWN';
    new.last_checked_at:=null;
    new.failure_summary:=null;
  elsif old.hostname is distinct from new.hostname then
    new.verification_status:='PENDING';
    new.dns_status:='UNKNOWN';
    new.ssl_status:='UNKNOWN';
    new.last_checked_at:=null;
    new.failure_summary:=null;
  end if;
  return new;
end;
$$;

drop trigger if exists platform_domain_prepare on public.platform_domain_records;
create trigger platform_domain_prepare
before insert or update on public.platform_domain_records
for each row execute function public.prepare_platform_domain_record();

create or replace function public.sync_customer_domain_mapping()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare usable boolean;
begin
  if tg_op='DELETE' then
    update public.business_domains
    set is_active=false,is_primary=false,verified_at=null,updated_at=now()
    where hostname=old.hostname and business_id=old.business_id;
    return old;
  end if;
  if tg_op='UPDATE' and old.purpose='CUSTOMER' and (new.purpose<>'CUSTOMER' or old.hostname<>new.hostname) then
    update public.business_domains
    set is_active=false,is_primary=false,verified_at=null,updated_at=now()
    where hostname=old.hostname and business_id=old.business_id;
  end if;
  if new.purpose<>'CUSTOMER' then return new; end if;
  usable:=new.is_active and new.verification_status='VERIFIED' and new.dns_status='HEALTHY' and new.ssl_status='HEALTHY';
  insert into public.business_domains(business_id,hostname,domain_type,is_primary,is_active,verified_at)
  values(
    new.business_id,
    new.hostname,
    case when new.hostname like '%.staging.qazipro.com' then 'SUBDOMAIN' else 'CUSTOM' end,
    usable and new.is_primary,
    usable,
    case when usable then coalesce(new.last_checked_at,now()) else null end
  )
  on conflict(hostname) do update set
    business_id=excluded.business_id,
    domain_type=excluded.domain_type,
    is_primary=excluded.is_primary,
    is_active=excluded.is_active,
    verified_at=excluded.verified_at,
    updated_at=now();
  return new;
end;
$$;

drop trigger if exists platform_domain_sync_customer_mapping on public.platform_domain_records;
create trigger platform_domain_sync_customer_mapping
after insert or update or delete on public.platform_domain_records
for each row execute function public.sync_customer_domain_mapping();

create or replace function public.resolve_storefront_business(
  p_hostname text,
  p_platform_domain text default null,
  p_fallback_slug text default null
)
returns table(resolved_business_id uuid,resolved_business_slug text,resolution text)
language plpgsql
stable
security definer
set search_path=public
as $$
declare normalized_host text:=public.normalize_storefront_hostname(coalesce(p_hostname,''));
declare candidate_slug text:=lower(btrim(coalesce(p_fallback_slug,'')));
begin
  if normalized_host<>'' then
    return query
    select business.id,business.slug,'DOMAIN'::text
    from public.business_domains domain
    join public.businesses business on business.id=domain.business_id
    where domain.hostname=normalized_host
      and domain.is_active
      and domain.verified_at is not null
      and business.is_active
      and (
        not exists(select 1 from public.restaurant_onboarding onboarding where onboarding.business_id=business.id)
        or exists(select 1 from public.restaurant_onboarding onboarding where onboarding.business_id=business.id and onboarding.lifecycle='ACTIVE')
      )
      and exists(
        select 1 from public.runtime_entitlement_internal(business.id,null,'website.ordering') entitlement
        where entitlement.enabled
      )
    limit 1;
    return;
  end if;

  -- Public mobile clients may use the canonical public restaurant key when
  -- there is no HTTP storefront hostname. Browser storefront requests always
  -- provide a hostname and therefore can never reach this compatibility path.
  if candidate_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    return query
    select business.id,business.slug,'PUBLIC_KEY'::text
    from public.businesses business
    where business.slug=candidate_slug
      and business.is_active
      and (
        not exists(select 1 from public.restaurant_onboarding onboarding where onboarding.business_id=business.id)
        or exists(select 1 from public.restaurant_onboarding onboarding where onboarding.business_id=business.id and onboarding.lifecycle='ACTIVE')
      )
      and exists(
        select 1 from public.runtime_entitlement_internal(business.id,null,'website.ordering') entitlement
        where entitlement.enabled
      )
    limit 1;
  end if;
end;
$$;

create or replace function public.platform_manage_domain(
  p_business_id uuid,
  p_action text,
  p_domain_id uuid default null,
  p_hostname text default null,
  p_purpose text default 'CUSTOMER',
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare actor uuid:=auth.uid();
declare action_name text:=upper(btrim(coalesce(p_action,'')));
declare normalized text:=public.normalize_storefront_hostname(coalesce(p_hostname,''));
declare target public.platform_domain_records%rowtype;
declare result_id uuid;
begin
  if not public.has_platform_permission('domains.manage') then
    raise exception 'PLATFORM_PERMISSION_DENIED' using errcode='42501';
  end if;
  if not exists(select 1 from public.businesses where id=p_business_id) then
    raise exception 'RESTAURANT_NOT_FOUND' using errcode='P0002';
  end if;

  if action_name='ADD' then
    if p_purpose not in ('CUSTOMER','ADMIN','APP_LINKS','OTHER') or normalized='' then
      raise exception 'INVALID_DOMAIN' using errcode='22023';
    end if;
    insert into public.platform_domain_records(business_id,hostname,purpose)
    values(p_business_id,normalized,p_purpose)
    returning id into result_id;
  else
    select * into target from public.platform_domain_records
    where id=p_domain_id and business_id=p_business_id for update;
    if target.id is null then raise exception 'DOMAIN_NOT_FOUND' using errcode='P0002'; end if;
    result_id:=target.id;
    if action_name='EDIT_PENDING' then
      if target.verification_status<>'PENDING' or normalized='' then
        raise exception 'ONLY_PENDING_DOMAIN_CAN_BE_EDITED' using errcode='22023';
      end if;
      update public.platform_domain_records set hostname=normalized,updated_at=now() where id=target.id;
    elsif action_name='SET_PRIMARY' then
      if target.purpose<>'CUSTOMER' or not target.is_active or target.verification_status<>'VERIFIED' then
        raise exception 'DOMAIN_NOT_ROUTABLE' using errcode='22023';
      end if;
      update public.platform_domain_records set is_primary=false,updated_at=now()
      where business_id=p_business_id and purpose='CUSTOMER' and id<>target.id and is_primary;
      update public.platform_domain_records set is_primary=true,updated_at=now() where id=target.id;
    elsif action_name='DEACTIVATE' then
      update public.platform_domain_records set is_active=false,is_primary=false,updated_at=now() where id=target.id;
    else
      raise exception 'INVALID_DOMAIN_ACTION' using errcode='22023';
    end if;
  end if;

  insert into public.platform_audit_logs(actor_user_id,action,target_type,target_id,business_id,reason,after_data)
  values(actor,'DOMAIN_'||action_name,'platform_domain_records',result_id::text,p_business_id,
    coalesce(nullif(btrim(p_reason),''),'Domain management action'),
    jsonb_build_object('action',action_name,'hostname',normalized,'purpose',p_purpose));
  return result_id;
end;
$$;

-- Bring already verified registry rows into the canonical runtime map. Pending
-- custom domains remain present but intentionally unroutable.
insert into public.business_domains(business_id,hostname,domain_type,is_primary,is_active,verified_at)
select record.business_id,record.hostname,
  case when record.hostname like '%.staging.qazipro.com' then 'SUBDOMAIN' else 'CUSTOM' end,
  record.is_primary,
  record.is_active and record.verification_status='VERIFIED' and record.dns_status='HEALTHY' and record.ssl_status='HEALTHY',
  case when record.is_active and record.verification_status='VERIFIED' and record.dns_status='HEALTHY' and record.ssl_status='HEALTHY' then coalesce(record.last_checked_at,now()) else null end
from public.platform_domain_records record
where record.purpose='CUSTOMER'
on conflict(hostname) do update set
  business_id=excluded.business_id,
  domain_type=excluded.domain_type,
  is_primary=excluded.is_primary,
  is_active=excluded.is_active,
  verified_at=excluded.verified_at,
  updated_at=now();

revoke all on function public.normalize_storefront_hostname(text) from public;
grant execute on function public.normalize_storefront_hostname(text) to anon,authenticated,service_role;
revoke all on function public.platform_manage_domain(uuid,text,uuid,text,text,text) from public,anon;
grant execute on function public.platform_manage_domain(uuid,text,uuid,text,text,text) to authenticated;
grant execute on function public.resolve_storefront_business(text,text,text) to anon,authenticated,service_role;

notify pgrst, 'reload schema';
commit;
