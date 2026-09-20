-- Test-only Supabase shims. Run exclusively against an isolated local database.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}',email_confirmed_at timestamptz,last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated;
