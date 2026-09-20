begin;
alter table public.site_settings add column if not exists app_store_url text;
alter table public.site_settings add column if not exists play_store_url text;

-- Legacy fields are a mirror, even when another admin/client edits fee rules.
create or replace function public.derive_delivery_rule_origin()
returns trigger language plpgsql set search_path=public as $$
begin
  select b.latitude,b.longitude,coalesce(b.formatted_address,b.address)
    into new.origin_latitude,new.origin_longitude,new.origin_address
    from public.branches b where b.id=new.branch_id;
  return new;
end;
$$;
create trigger delivery_rules_derive_origin before insert or update on public.delivery_rules
for each row execute function public.derive_delivery_rule_origin();

alter table public.branches add constraint branches_valid_origin check (
  (latitude is null and longitude is null) or
  (latitude is not null and longitude is not null and latitude between -90 and 90
   and longitude between -180 and 180 and not (latitude=0 and longitude=0))
) not valid;
notify pgrst, 'reload schema';
commit;
