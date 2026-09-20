begin;

alter table public.branches add column if not exists google_place_id text;
alter table public.branches add column if not exists country_name text;
alter table public.branches add column if not exists postal_code text;
create index if not exists branches_google_place_id_idx on public.branches(google_place_id) where google_place_id is not null;

-- Keep the legacy delivery-rule origin as a compatibility mirror while the
-- branch row remains the only authoritative source used by the storefront.
update public.delivery_rules r
set origin_latitude = b.latitude,
    origin_longitude = b.longitude,
    origin_address = coalesce(b.formatted_address, b.address, r.origin_address)
from public.branches b
where b.id = r.branch_id
  and b.latitude is not null
  and b.longitude is not null;

create or replace function public.sync_delivery_rule_origin()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.delivery_rules
  set origin_latitude = new.latitude,
      origin_longitude = new.longitude,
      origin_address = coalesce(new.formatted_address, new.address, origin_address)
  where branch_id = new.id;
  return new;
end;
$$;

drop trigger if exists branches_sync_delivery_origin on public.branches;
create trigger branches_sync_delivery_origin after update of latitude, longitude on public.branches
for each row when (new.latitude is distinct from old.latitude or new.longitude is distinct from old.longitude)
execute function public.sync_delivery_rule_origin();

notify pgrst, 'reload schema';
commit;
