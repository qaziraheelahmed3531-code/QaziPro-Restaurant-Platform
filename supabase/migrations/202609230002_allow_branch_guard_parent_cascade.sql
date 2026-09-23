-- Branch/business ownership checks protect ordinary writes. During an
-- intentional business deletion, PostgreSQL removes the parent before its FK
-- cascades. Permit only that parent-gone DELETE path so tenant teardown remains
-- possible without weakening insert/update or live-tenant delete checks.
create or replace function public.enforce_branch_owned_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_business uuid := nullif(row_data->>'business_id', '')::uuid;
  target_branch uuid := nullif(row_data->>'branch_id', '')::uuid;
  branch_business uuid;
begin
  if tg_op = 'DELETE'
     and target_business is not null
     and not exists (
       select 1
       from public.businesses
       where id = target_business
     ) then
    return old;
  end if;

  if target_business is not null and target_branch is not null then
    select business_id into branch_business
    from public.branches
    where id = target_branch;

    if branch_business is null or branch_business <> target_business then
      raise exception 'Branch does not belong to this business.' using errcode = '23514';
    end if;
  end if;

  if auth.uid() is not null
     and target_business is not null
     and target_branch is not null
     and not public.staff_can_access_branch(target_business, target_branch) then
    raise exception 'Branch access denied.' using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.enforce_branch_owned_write() from public, anon;
