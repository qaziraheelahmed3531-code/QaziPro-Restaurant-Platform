-- Secure client portal completion for signed QaziPro onboarding submissions.
-- Clients never receive direct table access: the website verifies a Supabase
-- Auth session, performs an exact portal_email ownership check, and returns a
-- deliberately small DTO. Platform staff continue to use website.manage RLS.

alter table public.platform_onboarding_submissions
  add column if not exists portal_email text,
  add column if not exists portal_enabled boolean not null default true,
  add column if not exists portal_last_accessed_at timestamptz;

update public.platform_onboarding_submissions
set portal_email=lower(trim(client_data->>'email'))
where portal_email is null and nullif(trim(client_data->>'email'),'') is not null;

alter table public.platform_onboarding_submissions
  drop constraint if exists platform_onboarding_submissions_portal_email_check;
alter table public.platform_onboarding_submissions
  add constraint platform_onboarding_submissions_portal_email_check
  check (portal_email is null or portal_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

create index if not exists platform_onboarding_submissions_portal_email_idx
  on public.platform_onboarding_submissions(lower(portal_email),created_at desc)
  where portal_enabled and portal_email is not null;

create or replace function public.set_platform_onboarding_portal_email()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  new.portal_email:=lower(trim(new.client_data->>'email'));
  return new;
end;
$$;

drop trigger if exists platform_onboarding_portal_email on public.platform_onboarding_submissions;
create trigger platform_onboarding_portal_email
before insert or update of client_data on public.platform_onboarding_submissions
for each row execute function public.set_platform_onboarding_portal_email();

alter table public.platform_onboarding_submission_activity
  add column if not exists is_client_visible boolean not null default false,
  add column if not exists public_label text;

update public.platform_onboarding_submission_activity
set is_client_visible=true,
    public_label=coalesce(public_label,'Application submitted')
where action='PUBLIC_SUBMITTED';

alter table public.platform_onboarding_submission_documents
  add column if not exists file_name text,
  add column if not exists content_type text,
  add column if not exists is_client_visible boolean not null default false,
  add column if not exists uploaded_by_client_user_id uuid references auth.users(id) on delete set null;

alter table public.platform_onboarding_submission_documents
  drop constraint if exists platform_onboarding_submission_documents_document_type_check;
alter table public.platform_onboarding_submission_documents
  add constraint platform_onboarding_submission_documents_document_type_check
  check (document_type in ('ORIGINAL_SIGNED','INTERNAL_APPROVAL','CLIENT_UPLOAD','PLATFORM_SHARED'));
alter table public.platform_onboarding_submission_documents
  drop constraint if exists platform_onboarding_submission_documents_file_name_check;
alter table public.platform_onboarding_submission_documents
  add constraint platform_onboarding_submission_documents_file_name_check
  check (file_name is null or char_length(file_name) between 1 and 180);
alter table public.platform_onboarding_submission_documents
  drop constraint if exists platform_onboarding_submission_documents_content_type_check;
alter table public.platform_onboarding_submission_documents
  add constraint platform_onboarding_submission_documents_content_type_check
  check (content_type is null or content_type in ('application/pdf','image/png','image/jpeg','image/webp'));

update public.platform_onboarding_submission_documents
set file_name=coalesce(file_name,'QaziPro signed onboarding agreement.pdf'),
    content_type=coalesce(content_type,'application/pdf'),
    is_client_visible=true
where document_type='ORIGINAL_SIGNED';

create or replace function public.append_platform_onboarding_document(
  p_submission_id uuid,
  p_document_type text,
  p_content bytea,
  p_content_sha256 text,
  p_file_name text,
  p_content_type text,
  p_client_user_id uuid default null,
  p_created_by uuid default null,
  p_is_client_visible boolean default true
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  next_version integer;
  document_id uuid;
begin
  if auth.role()<>'service_role' then
    raise exception 'PORTAL_DOCUMENT_SERVER_ONLY' using errcode='42501';
  end if;
  if p_document_type not in ('CLIENT_UPLOAD','PLATFORM_SHARED') or
     p_content_type not in ('application/pdf','image/png','image/jpeg','image/webp') or
     octet_length(p_content)>3145728 then
    raise exception 'INVALID_PORTAL_DOCUMENT' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_submission_id::text,0));
  select coalesce(max(version),0)+1 into next_version
  from public.platform_onboarding_submission_documents
  where submission_id=p_submission_id;
  insert into public.platform_onboarding_submission_documents(
    submission_id,version,document_type,content,content_sha256,file_name,
    content_type,is_client_visible,uploaded_by_client_user_id,created_by
  ) values (
    p_submission_id,next_version,p_document_type,p_content,p_content_sha256,
    left(p_file_name,180),p_content_type,p_is_client_visible,p_client_user_id,p_created_by
  ) returning id into document_id;
  return document_id;
end;
$$;
revoke all on function public.append_platform_onboarding_document(uuid,text,bytea,text,text,text,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.append_platform_onboarding_document(uuid,text,bytea,text,text,text,uuid,uuid,boolean) to service_role;

create table if not exists public.platform_onboarding_portal_messages (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.platform_onboarding_submissions(id) on delete cascade,
  sender_kind text not null check (sender_kind in ('CLIENT','PLATFORM','SYSTEM')),
  message_type text not null default 'MESSAGE' check (message_type in ('MESSAGE','REQUEST_INFO','CLIENT_RESPONSE')),
  body text not null check (char_length(trim(body)) between 1 and 4000),
  actor_user_id uuid references public.platform_staff(user_id) on delete set null,
  client_user_id uuid references auth.users(id) on delete set null,
  is_client_visible boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    (sender_kind='CLIENT' and client_user_id is not null and actor_user_id is null) or
    (sender_kind='PLATFORM' and actor_user_id is not null and client_user_id is null) or
    (sender_kind='SYSTEM' and actor_user_id is null and client_user_id is null)
  )
);
create index if not exists platform_onboarding_portal_messages_submission_idx
  on public.platform_onboarding_portal_messages(submission_id,created_at);

alter table public.platform_onboarding_portal_messages enable row level security;
revoke all on public.platform_onboarding_portal_messages from public,anon,authenticated;
grant select,insert on public.platform_onboarding_portal_messages to authenticated;
grant all on public.platform_onboarding_portal_messages to service_role;

drop policy if exists platform_onboarding_portal_messages_staff_read on public.platform_onboarding_portal_messages;
create policy platform_onboarding_portal_messages_staff_read
on public.platform_onboarding_portal_messages for select to authenticated
using (public.has_platform_permission('website.manage'));

drop policy if exists platform_onboarding_portal_messages_staff_insert on public.platform_onboarding_portal_messages;
create policy platform_onboarding_portal_messages_staff_insert
on public.platform_onboarding_portal_messages for insert to authenticated
with check (
  public.has_platform_permission('website.manage') and
  sender_kind='PLATFORM' and actor_user_id=(select auth.uid())
);

comment on column public.platform_onboarding_submissions.portal_email is
  'Normalized immutable-snapshot contact email used only for server-side client portal ownership checks.';
comment on table public.platform_onboarding_portal_messages is
  'Client-visible onboarding conversation. Client writes are accepted only through the authenticated website server boundary.';
