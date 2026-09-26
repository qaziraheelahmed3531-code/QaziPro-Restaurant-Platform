-- One platform identity source; restaurant branding remains unchanged.
begin;
create table public.platform_branding (
  singleton boolean primary key default true check (singleton),
  logo_path text,
  icon_path text,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint platform_logo_safe_path check (logo_path is null or logo_path ~ '^platform/[0-9a-f-]{36}\.png$'),
  constraint platform_icon_safe_path check (icon_path is null or icon_path ~ '^platform/[0-9a-f-]{36}\.png$')
);
insert into public.platform_branding(singleton) values (true);
alter table public.platform_branding enable row level security;
-- Public identity only. No staff identity, credentials or tenant configuration.
create policy platform_branding_read on public.platform_branding for select to anon,authenticated using (true);
grant select on public.platform_branding to anon,authenticated;
revoke insert,update,delete on public.platform_branding from anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('platform-branding','platform-branding',true,2097152,array['image/png'])
on conflict(id) do nothing;
-- Only server-normalized PNGs are uploaded using the privileged server client.
create policy platform_brand_assets_read on storage.objects for select to anon,authenticated using (bucket_id='platform-branding');

create function public.platform_save_branding(p_logo_path text,p_icon_path text,p_expected_version integer)
returns integer language plpgsql security definer set search_path=public,auth as $$
declare previous public.platform_branding; next_version integer;
begin
  if not public.has_platform_permission('team.manage') or not exists (
    select 1 from public.platform_staff_roles a join public.platform_roles r on r.id=a.role_id
    where a.staff_user_id=auth.uid() and r.key='PLATFORM_OWNER'
  ) then raise exception 'Platform owner required' using errcode='42501'; end if;
  select * into previous from public.platform_branding where singleton for update;
  if previous.version<>p_expected_version then raise exception 'Branding changed; reload before saving' using errcode='40001'; end if;
  if (p_logo_path is not null and not exists(select 1 from storage.objects where bucket_id='platform-branding' and name=p_logo_path))
    or (p_icon_path is not null and not exists(select 1 from storage.objects where bucket_id='platform-branding' and name=p_icon_path))
    then raise exception 'Asset not found' using errcode='22023'; end if;
  if previous.logo_path is not distinct from p_logo_path and previous.icon_path is not distinct from p_icon_path then return previous.version; end if;
  update public.platform_branding set logo_path=p_logo_path,icon_path=p_icon_path,version=previous.version+1,updated_at=now() where singleton returning version into next_version;
  insert into public.platform_audit_logs(actor_user_id,action,target_type,target_id,reason,before_data,after_data)
    values(auth.uid(),'PLATFORM_BRANDING_UPDATED','platform_branding','platform','Platform owner updated QaziPro identity',to_jsonb(previous),jsonb_build_object('logo_path',p_logo_path,'icon_path',p_icon_path,'version',next_version));
  return next_version;
end $$;
revoke all on function public.platform_save_branding(text,text,integer) from public,anon;
grant execute on function public.platform_save_branding(text,text,integer) to authenticated;
commit;
