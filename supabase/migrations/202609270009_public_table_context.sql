begin;

-- A QR identifies a table, never a customer or an existing private bill.
alter table public.restaurant_tables add column public_token text not null
  default encode(extensions.gen_random_bytes(24),'hex');
alter table public.restaurant_tables add constraint restaurant_table_public_token_format check(public_token ~ '^[a-f0-9]{48}$');
create unique index restaurant_tables_public_token_idx on public.restaurant_tables(public_token);
alter table public.restaurant_table_sessions alter column opened_by drop not null;
alter table public.restaurant_table_sessions add column source text not null default 'WAITER' check(source in ('WAITER','QR'));
alter table public.restaurant_table_sessions add constraint table_session_actor_required check(source='QR' or opened_by is not null);

create or replace function public.resolve_public_table(p_business_id uuid,p_token text)
returns table(branch_id uuid,table_name text) language sql stable security definer set search_path=public as $$
  select t.branch_id,t.name from public.restaurant_tables t
  join public.branches b on b.id=t.branch_id and b.business_id=t.business_id
  join public.businesses business on business.id=t.business_id
  where t.business_id=p_business_id and t.public_token=p_token and t.is_active
    and b.is_active and business.is_active
    and exists(select 1 from public.runtime_entitlement_internal(t.business_id,t.branch_id,'website.ordering') e where e.enabled)
    and exists(select 1 from public.runtime_entitlement_internal(t.business_id,t.branch_id,'waiter') e where e.enabled);
$$;
revoke all on function public.resolve_public_table(uuid,text) from public;
grant execute on function public.resolve_public_table(uuid,text) to anon,authenticated,service_role;

-- Ordinary table edits must not accidentally invalidate printed codes.
create or replace function public.preserve_table_public_token()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.public_token is distinct from old.public_token then
    raise exception 'Printed table codes are stable. Deactivate the table to disable its QR.' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger preserve_table_public_token before update on public.restaurant_tables
for each row execute function public.preserve_table_public_token();

commit;
