begin;

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
  -- there is no HTTP storefront hostname. The mobile API applies the Android
  -- or iOS entitlement immediately after this identity-only resolution.
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
    limit 1;
  end if;
end;
$$;

grant execute on function public.resolve_storefront_business(text,text,text) to anon,authenticated,service_role;
notify pgrst, 'reload schema';
commit;
