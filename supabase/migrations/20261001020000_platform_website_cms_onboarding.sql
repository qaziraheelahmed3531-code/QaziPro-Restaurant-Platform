-- Platform website CMS and signed public client onboarding.
-- Platform-scoped only: none of these entities carry a restaurant business_id.

insert into public.platform_permissions(key,label,description) values
  ('website.manage','Manage QaziPro website','Edit, preview and publish the QaziPro public website and client onboarding form')
on conflict (key) do update set label=excluded.label,description=excluded.description;

insert into public.platform_role_permissions(role_id,permission_key)
select id,'website.manage' from public.platform_roles where key in ('PLATFORM_OWNER','SUPER_ADMIN','ONBOARDING_MANAGER')
on conflict do nothing;

create table if not exists public.platform_site_documents (
  key text primary key check (key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  label text not null check (char_length(label) between 2 and 100),
  draft_data jsonb not null default '{}'::jsonb check (jsonb_typeof(draft_data)='object'),
  published_data jsonb check (published_data is null or jsonb_typeof(published_data)='object'),
  draft_revision integer not null default 1 check (draft_revision > 0),
  published_version integer not null default 0 check (published_version >= 0),
  published_at timestamptz,
  published_by uuid references public.platform_staff(user_id) on delete set null,
  updated_by uuid references public.platform_staff(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_site_team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  title text not null check (char_length(title) between 2 and 120),
  short_bio text not null default '' check (char_length(short_bio) <= 700),
  full_bio text not null default '' check (char_length(full_bio) <= 5000),
  image_path text,
  email text,
  linkedin_url text,
  social_url text,
  display_order integer not null default 0 check (display_order between 0 and 10000),
  featured boolean not null default false,
  active boolean not null default true,
  published_snapshot jsonb check (published_snapshot is null or jsonb_typeof(published_snapshot)='object'),
  published_version integer not null default 0 check (published_version >= 0),
  published_at timestamptz,
  created_by uuid not null references public.platform_staff(user_id) on delete restrict,
  updated_by uuid references public.platform_staff(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists platform_site_team_order_idx on public.platform_site_team_members(display_order,id);

create table if not exists public.platform_onboarding_forms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z][a-z0-9-]{1,63}$'),
  name text not null check (char_length(name) between 2 and 120),
  draft_definition jsonb not null check (jsonb_typeof(draft_definition)='object'),
  published_definition jsonb check (published_definition is null or jsonb_typeof(published_definition)='object'),
  draft_revision integer not null default 1 check (draft_revision > 0),
  published_version integer not null default 0 check (published_version >= 0),
  is_active boolean not null default true,
  signature_required boolean not null default true,
  published_at timestamptz,
  published_by uuid references public.platform_staff(user_id) on delete set null,
  created_by uuid references public.platform_staff(user_id) on delete set null,
  updated_by uuid references public.platform_staff(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_onboarding_submissions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^QP-[0-9]{8}-[A-Z0-9]{6}$'),
  request_key uuid not null unique,
  form_id uuid not null references public.platform_onboarding_forms(id) on delete restrict,
  form_version integer not null check (form_version > 0),
  client_data jsonb not null check (jsonb_typeof(client_data)='object'),
  selected_services jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_services)='array'),
  selected_package jsonb check (selected_package is null or jsonb_typeof(selected_package)='object'),
  pricing_snapshot jsonb not null check (jsonb_typeof(pricing_snapshot)='object'),
  terms_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(terms_snapshot)='array'),
  form_snapshot jsonb not null check (jsonb_typeof(form_snapshot)='object'),
  signature_data text not null check (char_length(signature_data) between 100 and 500000),
  signature_hash text not null check (signature_hash ~ '^[a-f0-9]{64}$'),
  consent_text text not null,
  consented_at timestamptz not null,
  status text not null default 'NEW' check (status in ('NEW','REVIEWING','NEEDS_INFO','APPROVED','REJECTED','CONVERTED')),
  assigned_staff_user_id uuid references public.platform_staff(user_id) on delete set null,
  internal_notes text not null default '' check (char_length(internal_notes) <= 10000),
  source_ip_hash text,
  user_agent text check (char_length(user_agent) <= 500),
  pdf_access_token_hash text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists platform_onboarding_submissions_status_idx on public.platform_onboarding_submissions(status,created_at desc);
create index if not exists platform_onboarding_submissions_assignee_idx on public.platform_onboarding_submissions(assigned_staff_user_id,created_at desc);

create table if not exists public.platform_onboarding_submission_documents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.platform_onboarding_submissions(id) on delete cascade,
  version integer not null check (version > 0),
  document_type text not null default 'ORIGINAL_SIGNED' check (document_type in ('ORIGINAL_SIGNED','INTERNAL_APPROVAL')),
  content bytea not null,
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid references public.platform_staff(user_id) on delete set null,
  created_at timestamptz not null default now(),
  unique(submission_id,version)
);

create table if not exists public.platform_onboarding_submission_activity (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.platform_onboarding_submissions(id) on delete cascade,
  actor_user_id uuid references public.platform_staff(user_id) on delete set null,
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists platform_onboarding_activity_submission_idx on public.platform_onboarding_submission_activity(submission_id,created_at desc);

drop trigger if exists platform_site_documents_updated_at on public.platform_site_documents;
create trigger platform_site_documents_updated_at before update on public.platform_site_documents for each row execute function public.set_updated_at();
drop trigger if exists platform_site_team_members_updated_at on public.platform_site_team_members;
create trigger platform_site_team_members_updated_at before update on public.platform_site_team_members for each row execute function public.set_updated_at();
drop trigger if exists platform_onboarding_forms_updated_at on public.platform_onboarding_forms;
create trigger platform_onboarding_forms_updated_at before update on public.platform_onboarding_forms for each row execute function public.set_updated_at();
drop trigger if exists platform_onboarding_submissions_updated_at on public.platform_onboarding_submissions;
create trigger platform_onboarding_submissions_updated_at before update on public.platform_onboarding_submissions for each row execute function public.set_updated_at();

alter table public.platform_site_documents enable row level security;
alter table public.platform_site_team_members enable row level security;
alter table public.platform_onboarding_forms enable row level security;
alter table public.platform_onboarding_submissions enable row level security;
alter table public.platform_onboarding_submission_documents enable row level security;
alter table public.platform_onboarding_submission_activity enable row level security;

revoke all on public.platform_site_documents,public.platform_site_team_members,public.platform_onboarding_forms,
  public.platform_onboarding_submissions,public.platform_onboarding_submission_documents,
  public.platform_onboarding_submission_activity from public,anon,authenticated;
grant select,insert,update,delete on public.platform_site_documents,public.platform_site_team_members,public.platform_onboarding_forms to authenticated;
grant select,update on public.platform_onboarding_submissions to authenticated;
grant select,insert on public.platform_onboarding_submission_documents,public.platform_onboarding_submission_activity to authenticated;
grant usage,select on sequence public.platform_onboarding_submission_activity_id_seq to authenticated;
grant all on public.platform_site_documents,public.platform_site_team_members,public.platform_onboarding_forms,
  public.platform_onboarding_submissions,public.platform_onboarding_submission_documents,
  public.platform_onboarding_submission_activity to service_role;

create policy platform_site_documents_manage on public.platform_site_documents for all to authenticated
  using (public.has_platform_permission('website.manage')) with check (public.has_platform_permission('website.manage'));
create policy platform_site_team_manage on public.platform_site_team_members for all to authenticated
  using (public.has_platform_permission('website.manage')) with check (public.has_platform_permission('website.manage'));
create policy platform_onboarding_forms_manage on public.platform_onboarding_forms for all to authenticated
  using (public.has_platform_permission('website.manage')) with check (public.has_platform_permission('website.manage'));
create policy platform_onboarding_submissions_manage on public.platform_onboarding_submissions for select to authenticated
  using (public.has_platform_permission('website.manage'));
create policy platform_onboarding_submissions_update on public.platform_onboarding_submissions for update to authenticated
  using (public.has_platform_permission('website.manage')) with check (public.has_platform_permission('website.manage'));
create policy platform_onboarding_documents_read on public.platform_onboarding_submission_documents for select to authenticated
  using (public.has_platform_permission('website.manage'));
create policy platform_onboarding_documents_insert on public.platform_onboarding_submission_documents for insert to authenticated
  with check (public.has_platform_permission('website.manage'));
create policy platform_onboarding_activity_read on public.platform_onboarding_submission_activity for select to authenticated
  using (public.has_platform_permission('website.manage'));
create policy platform_onboarding_activity_insert on public.platform_onboarding_submission_activity for insert to authenticated
  with check (public.has_platform_permission('website.manage'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('platform-site-team','platform-site-team',true,3145728,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists platform_site_team_assets_read on storage.objects;
create policy platform_site_team_assets_read on storage.objects for select to anon,authenticated
  using (bucket_id='platform-site-team');

insert into public.platform_site_documents(key,label,draft_data) values
  ('home','Home',jsonb_build_object('eyebrow','ONE CONNECTED RESTAURANT PLATFORM','title','Restaurant operations, connected.','description','Online ordering, POS, kitchen, delivery and staff operations working from one platform.','primaryCtaLabel','Book a demo','primaryCtaHref','/book-a-demo')),
  ('about','About',jsonb_build_object('eyebrow','ABOUT QAZIPRO','title','Technology shaped around restaurant operations.','story','QaziPro builds connected restaurant software with reliability, clarity and real operational work at the center.','mission','Give restaurant teams one dependable system instead of disconnected tools.')),
  ('footer','Footer',jsonb_build_object('description','Connected restaurant technology and custom software, built with care.','email','qazipro3531@gmail.com','phone','+92 316 2563551')),
  ('seo','SEO',jsonb_build_object('defaultTitle','QaziPro — Restaurant Technology & Custom Software','defaultDescription','Connected restaurant systems for ordering, POS, kitchen, delivery and staff operations.'))
on conflict (key) do nothing;

update public.platform_site_documents
set published_data=draft_data,published_version=1,published_at=now()
where published_data is null and published_version=0;

insert into public.platform_onboarding_forms(slug,name,draft_definition,signature_required) values
('client-onboarding','QaziPro Client Onboarding',jsonb_build_object(
  'title','QaziPro Client Onboarding',
  'intro','Tell us about the restaurant and select the services you want QaziPro to prepare.',
  'sections',jsonb_build_array(
    jsonb_build_object('id','client','title','Client Information','enabled',true),
    jsonb_build_object('id','services','title','Services','enabled',true),
    jsonb_build_object('id','agreement','title','Package Agreed','enabled',true),
    jsonb_build_object('id','terms','title','Terms','enabled',true),
    jsonb_build_object('id','signature','title','Signature','enabled',true)
  ),
  'fields',jsonb_build_array(
    jsonb_build_object('id','restaurantName','label','Brand / Restaurant Name','type','text','required',true,'system',true,'enabled',true,'order',1),
    jsonb_build_object('id','locations','label','Number of Locations','type','number','required',true,'system',false,'enabled',true,'order',2),
    jsonb_build_object('id','contactName','label','Contact Person','type','text','required',true,'system',true,'enabled',true,'order',3),
    jsonb_build_object('id','designation','label','Position / Designation','type','text','required',false,'system',false,'enabled',true,'order',4),
    jsonb_build_object('id','phone','label','Mobile Number','type','phone','required',true,'system',false,'enabled',true,'order',5),
    jsonb_build_object('id','email','label','Email Address','type','email','required',true,'system',true,'enabled',true,'order',6),
    jsonb_build_object('id','address','label','Restaurant Address','type','textarea','required',true,'system',false,'enabled',true,'order',7),
    jsonb_build_object('id','city','label','City','type','text','required',true,'system',false,'enabled',true,'order',8)
  ),
  'services',jsonb_build_array(
    jsonb_build_object('id','online-ordering','name','Online Ordering','description','Branded direct ordering experience.','active',true,'order',1),
    jsonb_build_object('id','pos','name','Web & Desktop POS','description','Connected counter and workstation operations.','active',true,'order',2),
    jsonb_build_object('id','kds','name','Kitchen Display System','description','Live production workflow connected to orders.','active',true,'order',3),
    jsonb_build_object('id','staff-apps','name','Waiter & Rider Apps','description','Role-based mobile operations.','active',true,'order',4)
  ),
  'packages',jsonb_build_array(
    jsonb_build_object('id','custom','name','Custom Quote','description','Configured after scope review.','currency','PKR','monthlyFee',null,'setupFee',null,'perLocationFee',null,'serviceIds',jsonb_build_array(),'active',true,'order',1)
  ),
  'terms',jsonb_build_array(
    jsonb_build_object('id','scope-review','text','Final scope, pricing and delivery dates are confirmed by QaziPro before activation.','active',true,'order',1),
    jsonb_build_object('id','taxes','text','Applicable taxes and third-party charges are confirmed in the approved commercial agreement.','active',true,'order',2)
  ),
  'consentText','I confirm the information above and agree that QaziPro may review it to prepare the requested services.'
),true)
on conflict (slug) do nothing;

update public.platform_onboarding_forms
set published_definition=draft_definition,published_version=1,published_at=now()
where slug='client-onboarding' and published_definition is null and published_version=0;

comment on table public.platform_site_documents is 'Platform-level QaziPro public website draft and published content; never restaurant tenant content.';
comment on table public.platform_onboarding_submissions is 'Immutable signed public onboarding snapshots. Public writes are server-only through the QaziPro website.';
