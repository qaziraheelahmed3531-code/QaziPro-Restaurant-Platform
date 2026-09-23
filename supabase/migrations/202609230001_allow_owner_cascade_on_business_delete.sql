-- Keep the last-owner protection for ordinary membership changes while allowing
-- an intentional parent business deletion to cascade its membership rows.
-- PostgreSQL removes the parent row before firing the FK cascade, so absence of
-- that exact business distinguishes tenant teardown from a direct owner delete.
create or replace function public.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE'
     and not exists (
       select 1
       from public.businesses
       where id = old.business_id
     ) then
    return old;
  end if;

  if old.role = 'OWNER'
     and old.is_active
     and (tg_op = 'DELETE' or new.role <> 'OWNER' or not new.is_active) then
    -- Serialize owner changes within the business, including concurrent demotions.
    perform 1
    from public.businesses
    where id = old.business_id
    for update;

    if not exists (
      select 1
      from public.staff_memberships
      where business_id = old.business_id
        and id <> old.id
        and role = 'OWNER'
        and is_active
    ) then
      raise exception 'Keep at least one active owner.' using errcode = '22023';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_last_owner() from public, anon;
