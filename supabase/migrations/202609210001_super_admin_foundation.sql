begin;

create extension if not exists pgcrypto;

do $$ begin
  create type public.platform_staff_status as enum ('INVITED','ACTIVE','SUSPENDED','REVOKED');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.restaurant_lifecycle as enum ('LEAD','AGREEMENT_PENDING','ONBOARDING','CONFIGURATION','STAGING','CLIENT_REVIEW','READY','ACTIVE','SUSPENDED','OFFBOARDING','ARCHIVED');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.platform_health_state as enum ('HEALTHY','WARNING','CRITICAL','UNKNOWN');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.platform_work_status as enum ('OPEN','IN_PROGRESS','WAITING_CLIENT','WAITING_QAZIPRO','BLOCKED','RESOLVED','CLOSED');
exception when duplicate_object then null; end $$;

create table if not exists public.platform_permissions (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  label text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.platform_roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[A-Z][A-Z0-9_]*$'),
  name text not null,
  description text not null default '',
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_role_permissions (
  role_id uuid not null references public.platform_roles(id) on delete cascade,
  permission_key text not null references public.platform_permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

create table if not exists public.platform_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 120),
  email text not null,
  status public.platform_staff_status not null default 'ACTIVE',
  mfa_required boolean not null default false,
  last_login_at timestamptz,
  access_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists platform_staff_email_unique on public.platform_staff(lower(email));

create table if not exists public.platform_staff_roles (
  staff_user_id uuid not null references public.platform_staff(user_id) on delete cascade,
  role_id uuid not null references public.platform_roles(id) on delete cascade,
  assigned_by uuid references public.platform_staff(user_id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (staff_user_id, role_id)
);

create table if not exists public.platform_staff_permissions (
  staff_user_id uuid not null references public.platform_staff(user_id) on delete cascade,
  permission_key text not null references public.platform_permissions(key) on delete cascade,
  allowed boolean not null,
  assigned_by uuid references public.platform_staff(user_id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (staff_user_id, permission_key)
);

create table if not exists public.service_packages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name text not null,
  description text not null default '',
  currency text not null default 'PKR' check (currency ~ '^[A-Z]{3}$'),
  base_fee integer not null default 0 check (base_fee >= 0),
  setup_fee integer not null default 0 check (setup_fee >= 0),
  included_branches integer not null default 1 check (included_branches >= 0),
  additional_branch_fee integer not null default 0 check (additional_branch_fee >= 0),
  terminal_fee integer not null default 0 check (terminal_fee >= 0),
  billing_frequency text not null default 'MONTHLY' check (billing_frequency in ('MONTHLY','QUARTERLY','ANNUAL','CUSTOM')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.package_entitlements (
  package_id uuid not null references public.service_packages(id) on delete cascade,
  capability_key text not null check (capability_key ~ '^[a-z][a-z0-9_.-]+$'),
  enabled boolean not null default true,
  limit_value integer,
  primary key (package_id, capability_key)
);

create table if not exists public.restaurant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  package_id uuid references public.service_packages(id) on delete set null,
  status text not null default 'TRIAL' check (status in ('TRIAL','ACTIVE','PAST_DUE','GRACE_PERIOD','SUSPENDED','CANCELLED')),
  currency text not null default 'PKR' check (currency ~ '^[A-Z]{3}$'),
  base_fee integer not null default 0 check (base_fee >= 0),
  setup_fee integer not null default 0 check (setup_fee >= 0),
  branch_fee integer not null default 0 check (branch_fee >= 0),
  terminal_fee integer not null default 0 check (terminal_fee >= 0),
  android_fee integer not null default 0 check (android_fee >= 0),
  ios_fee integer not null default 0 check (ios_fee >= 0),
  discount integer not null default 0 check (discount >= 0),
  tax integer not null default 0 check (tax >= 0),
  billing_frequency text not null default 'MONTHLY',
  trial_ends_at timestamptz,
  current_period_start date,
  next_invoice_date date,
  grace_ends_at date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id)
);

create table if not exists public.service_entitlements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  capability_key text not null check (capability_key ~ '^[a-z][a-z0-9_.-]+$'),
  enabled boolean not null default true,
  source text not null default 'PACKAGE' check (source in ('PACKAGE','OVERRIDE','TRIAL','ADD_ON')),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  limit_value integer,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, capability_key, source)
);

create table if not exists public.restaurant_onboarding (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  business_id uuid references public.businesses(id) on delete restrict,
  lifecycle public.restaurant_lifecycle not null default 'LEAD',
  legal_name text,
  owner_name text not null,
  owner_email text not null,
  owner_phone text,
  primary_contact_name text,
  primary_contact_title text,
  expected_locations integer not null default 1 check (expected_locations between 1 and 10000),
  country_code text not null default 'PK' check (country_code ~ '^[A-Z]{2}$'),
  commercial_notes text not null default '',
  blockers jsonb not null default '[]'::jsonb check (jsonb_typeof(blockers) = 'array'),
  assigned_staff_user_id uuid references public.platform_staff(user_id) on delete set null,
  created_by uuid not null references public.platform_staff(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists restaurant_onboarding_lifecycle_idx on public.restaurant_onboarding(lifecycle, updated_at desc);
create index if not exists restaurant_onboarding_business_idx on public.restaurant_onboarding(business_id);

create table if not exists public.onboarding_documents (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.restaurant_onboarding(id) on delete cascade,
  document_type text not null default 'AGREEMENT',
  version text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','SENT','CLIENT_REVIEW','CORRECTION_REQUESTED','SIGNED','APPROVED','VOID')),
  document_data jsonb not null default '{}'::jsonb,
  legal_text text not null default '',
  share_token_hash text unique,
  share_expires_at timestamptz,
  signer_name text,
  signer_email text,
  signed_at timestamptz,
  approved_by uuid references public.platform_staff(user_id) on delete set null,
  approved_at timestamptz,
  created_by uuid not null references public.platform_staff(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_domain_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  hostname text not null unique,
  purpose text not null check (purpose in ('CUSTOMER','ADMIN','APP_LINKS','OTHER')),
  verification_status text not null default 'PENDING' check (verification_status in ('PENDING','VERIFIED','FAILED','UNKNOWN')),
  dns_status public.platform_health_state not null default 'UNKNOWN',
  ssl_status public.platform_health_state not null default 'UNKNOWN',
  auth_redirect_ready boolean not null default false,
  last_checked_at timestamptz,
  failure_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists platform_domain_business_idx on public.platform_domain_records(business_id, purpose);

create table if not exists public.mobile_app_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  platform text not null check (platform in ('ANDROID','IOS')),
  enabled boolean not null default false,
  app_name text,
  application_identifier text,
  restaurant_public_key text,
  version_name text,
  build_number integer,
  credential_status text not null default 'MISSING' check (credential_status in ('CONNECTED','MISSING','INVALID','NEEDS_REVIEW','DISABLED')),
  push_status public.platform_health_state not null default 'UNKNOWN',
  release_status text not null default 'NOT_PURCHASED' check (release_status in ('NOT_PURCHASED','CONFIGURATION','CREDENTIALS_REQUIRED','READY_TO_BUILD','BUILDING','INTERNAL_TESTING','CLIENT_REVIEW','READY_TO_PUBLISH','PUBLISHED','UPDATE_REQUIRED','FAILED')),
  store_url text,
  last_release_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, platform),
  unique (platform, application_identifier)
);

create table if not exists public.deployment_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete set null,
  component text not null check (component in ('CUSTOMER_WEBSITE','RESTAURANT_ADMIN','BACKEND_API','DESKTOP_POS','ANDROID','IOS','SUPER_ADMIN')),
  environment text not null check (environment in ('LOCAL','STAGING','PRODUCTION')),
  version text,
  commit_sha text,
  provider text,
  provider_reference text,
  status text not null check (status in ('QUEUED','BUILDING','READY','FAILED','CANCELLED','ROLLED_BACK')),
  initiated_by uuid references public.platform_staff(user_id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  error_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists deployment_records_status_idx on public.deployment_records(status, created_at desc);
create index if not exists deployment_records_business_idx on public.deployment_records(business_id, created_at desc);

create table if not exists public.platform_incidents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  severity text not null check (severity in ('INFO','WARNING','CRITICAL')),
  health_state public.platform_health_state not null default 'UNKNOWN',
  environment text not null default 'STAGING',
  component text not null,
  title text not null,
  summary text not null,
  technical_details text,
  request_id text,
  deployment_version text,
  status public.platform_work_status not null default 'OPEN',
  assigned_staff_user_id uuid references public.platform_staff(user_id) on delete set null,
  occurrences integer not null default 1 check (occurrences > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists platform_incidents_attention_idx on public.platform_incidents(status, severity, last_seen_at desc);
create index if not exists platform_incidents_business_idx on public.platform_incidents(business_id, last_seen_at desc);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint generated always as identity unique,
  business_id uuid not null references public.businesses(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete set null,
  incident_id uuid references public.platform_incidents(id) on delete set null,
  category text not null,
  severity text not null check (severity in ('LOW','NORMAL','HIGH','CRITICAL')),
  subject text not null,
  description text not null,
  status public.platform_work_status not null default 'OPEN',
  assigned_staff_user_id uuid references public.platform_staff(user_id) on delete set null,
  client_visible_notes text not null default '',
  internal_notes text not null default '',
  due_at timestamptz,
  resolved_at timestamptz,
  created_by uuid references public.platform_staff(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_queue_idx on public.support_tickets(status, severity, created_at desc);
create index if not exists support_tickets_business_idx on public.support_tickets(business_id, created_at desc);

create table if not exists public.platform_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete set null,
  onboarding_id uuid references public.restaurant_onboarding(id) on delete cascade,
  incident_id uuid references public.platform_incidents(id) on delete cascade,
  ticket_id uuid references public.support_tickets(id) on delete cascade,
  title text not null,
  team text not null check (team in ('SALES','ONBOARDING','SUPPORT','DEVELOPMENT','DEPLOYMENT','BILLING','OPERATIONS')),
  status public.platform_work_status not null default 'OPEN',
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  assigned_staff_user_id uuid references public.platform_staff(user_id) on delete set null,
  due_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references public.platform_staff(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists platform_tasks_owner_idx on public.platform_tasks(assigned_staff_user_id, status, due_at);

create table if not exists public.platform_integration_status (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  provider text not null,
  status text not null check (status in ('CONNECTED','MISSING','INVALID','NEEDS_REVIEW','DISABLED')),
  last_checked_at timestamptz,
  expires_at timestamptz,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique nulls not distinct (business_id, provider)
);

create table if not exists public.platform_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  business_id uuid references public.businesses(id) on delete set null,
  reason text,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists platform_audit_created_idx on public.platform_audit_logs(created_at desc);
create index if not exists platform_audit_business_idx on public.platform_audit_logs(business_id, created_at desc);
create index if not exists platform_audit_actor_idx on public.platform_audit_logs(actor_user_id, created_at desc);

insert into public.platform_permissions(key,label,description) values
 ('restaurants.view','View restaurants','View the platform restaurant directory and workspaces'),
 ('restaurants.create','Create restaurants','Provision new restaurant tenants'),
 ('restaurants.edit','Edit restaurants','Edit restaurant lifecycle and platform configuration'),
 ('restaurants.suspend','Suspend restaurants','Suspend or restore restaurant service'),
 ('branches.manage','Manage branches','Create and manage restaurant branches'),
 ('subscriptions.manage','Manage subscriptions','Change packages and subscription state'),
 ('billing.view','View billing','View subscription and billing records'),
 ('billing.edit','Edit billing','Edit prices, invoices and payment references'),
 ('deployments.manage','Manage deployments','Record and coordinate releases'),
 ('apps.manage','Manage apps','Configure Android and iOS app records'),
 ('domains.manage','Manage domains','Configure and verify restaurant domains'),
 ('support.access','Access support','Work with support tickets'),
 ('support.elevated','Elevated support','Start audited time-limited support sessions'),
 ('integrations.manage','Manage integrations','Change integration readiness without exposing secrets'),
 ('team.manage','Manage team','Manage QaziPro platform staff and permissions'),
 ('incidents.manage','Manage incidents','Triage and resolve platform incidents'),
 ('tasks.manage','Manage tasks','Assign and update cross-team operational tasks'),
 ('onboarding.manage','Manage onboarding','Manage agreements and onboarding workflows'),
 ('audit.view','View audit log','View immutable platform audit events')
on conflict (key) do update set label=excluded.label,description=excluded.description;

insert into public.platform_roles(key,name,description,is_system) values
 ('PLATFORM_OWNER','Platform Owner','Full platform control',true),
 ('SUPER_ADMIN','Super Admin','Restaurant operations and platform configuration',true),
 ('OPERATIONS_MANAGER','Operations Manager','Restaurant and branch operations',true),
 ('ONBOARDING_MANAGER','Onboarding Manager','Client onboarding and activation',true),
 ('SUPPORT_ENGINEER','Support Engineer','Support and incident response',true),
 ('DEVELOPER','Developer','Technical health and deployments',true),
 ('DEPLOYMENT_MANAGER','Deployment Manager','Website and app releases',true),
 ('BILLING_FINANCE','Billing / Finance','Subscriptions and billing',true),
 ('SALES','Sales','Lead and agreement management',true),
 ('AUDITOR','Auditor / Read Only','Read-only oversight',true)
on conflict (key) do update set name=excluded.name,description=excluded.description,is_system=true;

insert into public.platform_role_permissions(role_id,permission_key)
select role.id, permission.key from public.platform_roles role cross join public.platform_permissions permission
where role.key='PLATFORM_OWNER'
on conflict do nothing;
insert into public.platform_role_permissions(role_id,permission_key)
select role.id, permission.key from public.platform_roles role join public.platform_permissions permission on permission.key <> 'team.manage'
where role.key='SUPER_ADMIN'
on conflict do nothing;
insert into public.platform_role_permissions(role_id,permission_key)
select role.id, permission.key from public.platform_roles role join public.platform_permissions permission on permission.key in ('restaurants.view','restaurants.edit','branches.manage','incidents.manage','support.access','tasks.manage','audit.view')
where role.key='OPERATIONS_MANAGER'
on conflict do nothing;
insert into public.platform_role_permissions(role_id,permission_key)
select role.id, permission.key from public.platform_roles role join public.platform_permissions permission on permission.key in ('restaurants.view','restaurants.create','restaurants.edit','branches.manage','onboarding.manage','domains.manage','apps.manage','tasks.manage','audit.view')
where role.key='ONBOARDING_MANAGER'
on conflict do nothing;
insert into public.platform_role_permissions(role_id,permission_key)
select role.id, permission.key from public.platform_roles role join public.platform_permissions permission on permission.key in ('restaurants.view','support.access','incidents.manage','tasks.manage','audit.view')
where role.key='SUPPORT_ENGINEER'
on conflict do nothing;
insert into public.platform_role_permissions(role_id,permission_key)
select role.id, permission.key from public.platform_roles role join public.platform_permissions permission on permission.key in ('restaurants.view','deployments.manage','apps.manage','domains.manage','incidents.manage','integrations.manage','tasks.manage','audit.view')
where role.key in ('DEVELOPER','DEPLOYMENT_MANAGER')
on conflict do nothing;
insert into public.platform_role_permissions(role_id,permission_key)
select role.id, permission.key from public.platform_roles role join public.platform_permissions permission on permission.key in ('restaurants.view','subscriptions.manage','billing.view','billing.edit','audit.view')
where role.key='BILLING_FINANCE'
on conflict do nothing;
insert into public.platform_role_permissions(role_id,permission_key)
select role.id, permission.key from public.platform_roles role join public.platform_permissions permission on permission.key in ('restaurants.view','restaurants.create','onboarding.manage','tasks.manage')
where role.key='SALES'
on conflict do nothing;
insert into public.platform_role_permissions(role_id,permission_key)
select role.id, permission.key from public.platform_roles role join public.platform_permissions permission on permission.key in ('restaurants.view','billing.view','audit.view')
where role.key='AUDITOR'
on conflict do nothing;

create or replace function public.has_platform_permission(p_permission text)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists (
    select 1 from public.platform_staff staff
    where staff.user_id=auth.uid() and staff.status='ACTIVE'
      and coalesce(staff.access_revoked_at > now(), true)
      and (
        exists (
          select 1 from public.platform_staff_permissions direct
          where direct.staff_user_id=staff.user_id and direct.permission_key=p_permission and direct.allowed
        )
        or (
          not exists (
            select 1 from public.platform_staff_permissions denied
            where denied.staff_user_id=staff.user_id and denied.permission_key=p_permission and not denied.allowed
          )
          and exists (
            select 1 from public.platform_staff_roles assignment
            join public.platform_role_permissions role_permission on role_permission.role_id=assignment.role_id
            where assignment.staff_user_id=staff.user_id and role_permission.permission_key=p_permission
          )
        )
      )
  );
$$;

create or replace function public.platform_effective_permissions()
returns setof text language sql stable security definer set search_path=public,auth as $$
  select permission.key from public.platform_permissions permission
  where public.has_platform_permission(permission.key)
  order by permission.key;
$$;

create or replace function public.platform_provision_restaurant(p_request_key uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare
  actor uuid:=auth.uid(); existing uuid; business uuid; package uuid; branch jsonb; capability text;
  requested_slug text:=lower(btrim(p_payload->>'slug'));
  requested_name text:=btrim(p_payload->>'name');
  owner_name text:=btrim(p_payload->>'ownerName');
  owner_email text:=lower(btrim(p_payload->>'ownerEmail'));
begin
  if not public.has_platform_permission('restaurants.create') or not public.has_platform_permission('onboarding.manage') then raise exception 'PLATFORM_PERMISSION_DENIED' using errcode='42501'; end if;
  if p_request_key is null then raise exception 'REQUEST_KEY_REQUIRED' using errcode='22023'; end if;
  select business_id into existing from public.restaurant_onboarding where request_key=p_request_key;
  if existing is not null then return existing; end if;
  if requested_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(requested_name) not between 2 and 120 or char_length(owner_name) not between 2 and 120 or owner_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'INVALID_ONBOARDING_PAYLOAD' using errcode='22023'; end if;
  select id into package from public.service_packages where id::text=p_payload->>'packageId' and is_active;
  if package is null then raise exception 'ACTIVE_PACKAGE_REQUIRED' using errcode='22023'; end if;
  if nullif(p_payload->>'customerDomain','') is not null and lower(p_payload->>'customerDomain') !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$' then raise exception 'INVALID_CUSTOMER_DOMAIN' using errcode='22023'; end if;
  if nullif(p_payload->>'adminDomain','') is not null and lower(p_payload->>'adminDomain') !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$' then raise exception 'INVALID_ADMIN_DOMAIN' using errcode='22023'; end if;
  if nullif(p_payload->>'androidId','') is not null and p_payload->>'androidId' !~ '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*){1,}$' then raise exception 'INVALID_ANDROID_ID' using errcode='22023'; end if;
  if nullif(p_payload->>'iosId','') is not null and p_payload->>'iosId' !~ '^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*){1,}$' then raise exception 'INVALID_IOS_ID' using errcode='22023'; end if;
  insert into public.businesses(slug,name,short_description,phone,email,address,city,currency,timezone,is_active)
  values(requested_slug,requested_name,coalesce(p_payload->>'description',''),nullif(p_payload->>'phone',''),owner_email,nullif(p_payload->>'address',''),coalesce(nullif(p_payload->>'city',''),'Unconfigured'),coalesce(nullif(p_payload->>'currency',''),'PKR'),coalesce(nullif(p_payload->>'timezone',''),'Asia/Karachi'),false)
  returning id into business;
  insert into public.business_branding(business_id,display_name,logo_url,primary_color,secondary_color)
  values(business,requested_name,nullif(p_payload->>'logoUrl',''),coalesce(nullif(p_payload->>'primaryColor',''),'#a92114'),coalesce(nullif(p_payload->>'secondaryColor',''),'#e7a81a'));
  insert into public.site_settings(business_id,announcement_enabled,announcement_text) values(business,false,'');
  for branch in select value from jsonb_array_elements(coalesce(p_payload->'branches','[]'::jsonb)) loop
    insert into public.branches(business_id,code,name,restaurant_name,address,formatted_address,city,country_code,timezone,pickup_enabled,delivery_enabled,online_ordering_enabled,is_active,slug)
    values(business,upper(left(btrim(branch->>'code'),24)),btrim(branch->>'name'),requested_name,nullif(branch->>'address',''),nullif(branch->>'address',''),coalesce(nullif(branch->>'city',''),coalesce(nullif(p_payload->>'city',''),'Unconfigured')),coalesce(nullif(p_payload->>'countryCode',''),'PK'),coalesce(nullif(p_payload->>'timezone',''),'Asia/Karachi'),coalesce((branch->>'pickupEnabled')::boolean,true),coalesce((branch->>'deliveryEnabled')::boolean,true),false,true,lower(regexp_replace(btrim(branch->>'name'),'[^a-zA-Z0-9]+','-','g')));
  end loop;
  if not exists(select 1 from public.branches where business_id=business) then raise exception 'AT_LEAST_ONE_BRANCH_REQUIRED' using errcode='22023'; end if;
  insert into public.restaurant_onboarding(request_key,business_id,lifecycle,legal_name,owner_name,owner_email,owner_phone,primary_contact_name,primary_contact_title,expected_locations,country_code,commercial_notes,created_by)
  values(p_request_key,business,'CONFIGURATION',nullif(p_payload->>'legalName',''),owner_name,owner_email,nullif(p_payload->>'ownerPhone',''),nullif(p_payload->>'contactName',''),nullif(p_payload->>'contactTitle',''),jsonb_array_length(p_payload->'branches'),coalesce(nullif(p_payload->>'countryCode',''),'PK'),coalesce(p_payload->>'commercialNotes',''),actor);
  insert into public.staff_invitations(business_id,email,role,is_active,permissions,invited_by,branch_ids,delivery_status)
  select business,owner_email,'OWNER',true,'{}',actor,array_agg(id order by sort_order),'NOT_SENT' from public.branches where business_id=business
  on conflict(business_id,email) do update set role='OWNER',is_active=true,status='PENDING',branch_ids=excluded.branch_ids,updated_at=now();
  insert into public.restaurant_subscriptions(business_id,package_id,status,currency,base_fee,setup_fee,billing_frequency)
  select business,package,'TRIAL',coalesce(nullif(p_payload->>'currency',''),'PK'),coalesce((p_payload->>'baseFee')::integer,service_packages.base_fee),coalesce((p_payload->>'setupFee')::integer,service_packages.setup_fee),coalesce(nullif(p_payload->>'billingFrequency',''),service_packages.billing_frequency) from public.service_packages where id=package;
  insert into public.service_entitlements(business_id,capability_key,enabled,source,limit_value)
  select business,capability_key,enabled,'PACKAGE',limit_value from public.package_entitlements where package_id=package
  on conflict(business_id,capability_key,source) do update set enabled=excluded.enabled,limit_value=excluded.limit_value,updated_at=now();
  for capability in select jsonb_array_elements_text(coalesce(p_payload->'services','[]'::jsonb)) loop
    insert into public.service_entitlements(business_id,capability_key,enabled,source) values(business,capability,true,'OVERRIDE') on conflict(business_id,capability_key,source) do update set enabled=true,updated_at=now();
  end loop;
  insert into public.mobile_app_records(business_id,platform,enabled,app_name,application_identifier,restaurant_public_key,release_status)
  values
    (business,'ANDROID',coalesce((p_payload->>'androidEnabled')::boolean,false),nullif(p_payload->>'androidName',''),nullif(p_payload->>'androidId',''),requested_slug,case when coalesce((p_payload->>'androidEnabled')::boolean,false) then 'CONFIGURATION' else 'NOT_PURCHASED' end),
    (business,'IOS',coalesce((p_payload->>'iosEnabled')::boolean,false),nullif(p_payload->>'iosName',''),nullif(p_payload->>'iosId',''),requested_slug,case when coalesce((p_payload->>'iosEnabled')::boolean,false) then 'CONFIGURATION' else 'NOT_PURCHASED' end);
  if nullif(p_payload->>'customerDomain','') is not null then insert into public.platform_domain_records(business_id,hostname,purpose) values(business,lower(p_payload->>'customerDomain'),'CUSTOMER'); end if;
  if nullif(p_payload->>'adminDomain','') is not null then insert into public.platform_domain_records(business_id,hostname,purpose) values(business,lower(p_payload->>'adminDomain'),'ADMIN'); end if;
  insert into public.platform_audit_logs(actor_user_id,action,target_type,target_id,business_id,reason,after_data)
  values(actor,'RESTAURANT_PROVISIONED','business',business::text,business,coalesce(nullif(p_payload->>'reason',''),'New restaurant onboarding'),jsonb_build_object('slug',requested_slug,'services',coalesce(p_payload->'services','[]'::jsonb),'branchCount',jsonb_array_length(p_payload->'branches')));
  return business;
end;
$$;

create or replace function public.platform_create_service_package(p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare package_id uuid; package_code text:=upper(btrim(p_payload->>'code')); package_name text:=btrim(p_payload->>'name');
begin
  if not public.has_platform_permission('subscriptions.manage') then raise exception 'PLATFORM_PERMISSION_DENIED' using errcode='42501'; end if;
  if package_code !~ '^[A-Z][A-Z0-9_]*$' or char_length(package_name) not between 2 and 100 then raise exception 'INVALID_PACKAGE' using errcode='22023'; end if;
  insert into public.service_packages(code,name,description,currency,base_fee,setup_fee,included_branches,additional_branch_fee,terminal_fee,billing_frequency)
  values(package_code,package_name,coalesce(p_payload->>'description',''),coalesce(nullif(p_payload->>'currency',''),'PKR'),greatest(0,coalesce((p_payload->>'baseFee')::integer,0)),greatest(0,coalesce((p_payload->>'setupFee')::integer,0)),greatest(0,coalesce((p_payload->>'includedBranches')::integer,1)),greatest(0,coalesce((p_payload->>'additionalBranchFee')::integer,0)),greatest(0,coalesce((p_payload->>'terminalFee')::integer,0)),coalesce(nullif(p_payload->>'billingFrequency',''),'MONTHLY'))
  returning id into package_id;
  insert into public.package_entitlements(package_id,capability_key,enabled)
  select package_id,value,true from jsonb_array_elements_text(coalesce(p_payload->'capabilities','[]'::jsonb));
  insert into public.platform_audit_logs(actor_user_id,action,target_type,target_id,reason,after_data)
  values(auth.uid(),'SERVICE_PACKAGE_CREATED','service_packages',package_id::text,coalesce(nullif(p_payload->>'reason',''),'Package configuration'),p_payload-'reason');
  return package_id;
end;
$$;

create or replace function public.platform_add_branch(p_business_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare branch_id uuid; branch_name text:=btrim(p_payload->>'name'); branch_code text:=upper(btrim(p_payload->>'code')); restaurant_name text;
begin
  if not public.has_platform_permission('branches.manage') then raise exception 'PLATFORM_PERMISSION_DENIED' using errcode='42501'; end if;
  if char_length(branch_name) not between 2 and 120 or char_length(branch_code) not between 1 and 24 then raise exception 'INVALID_BRANCH' using errcode='22023'; end if;
  select name into restaurant_name from public.businesses where id=p_business_id;
  if restaurant_name is null then raise exception 'RESTAURANT_NOT_FOUND' using errcode='P0002'; end if;
  insert into public.branches(business_id,code,name,restaurant_name,address,formatted_address,city,country_code,timezone,pickup_enabled,delivery_enabled,online_ordering_enabled,is_active,slug)
  values(p_business_id,branch_code,branch_name,restaurant_name,nullif(p_payload->>'address',''),nullif(p_payload->>'address',''),btrim(p_payload->>'city'),coalesce(nullif(p_payload->>'countryCode',''),'PK'),coalesce(nullif(p_payload->>'timezone',''),'Asia/Karachi'),coalesce((p_payload->>'pickupEnabled')::boolean,true),coalesce((p_payload->>'deliveryEnabled')::boolean,true),false,true,lower(regexp_replace(branch_name,'[^a-zA-Z0-9]+','-','g')))
  returning id into branch_id;
  insert into public.platform_audit_logs(actor_user_id,action,target_type,target_id,business_id,reason,after_data)
  values(auth.uid(),'BRANCH_CREATED','branches',branch_id::text,p_business_id,coalesce(nullif(p_payload->>'reason',''),'Platform branch creation'),jsonb_build_object('name',branch_name,'code',branch_code));
  return branch_id;
end;
$$;

create or replace function public.platform_transition_restaurant(p_business_id uuid,p_lifecycle public.restaurant_lifecycle,p_reason text)
returns void language plpgsql security definer set search_path=public,auth as $$
declare current_lifecycle public.restaurant_lifecycle;
begin
  if not public.has_platform_permission('restaurants.edit') then raise exception 'PLATFORM_PERMISSION_DENIED' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_reason,'')))<3 then raise exception 'REASON_REQUIRED' using errcode='22023'; end if;
  select lifecycle into current_lifecycle from public.restaurant_onboarding where business_id=p_business_id for update;
  if current_lifecycle is null then raise exception 'ONBOARDING_NOT_FOUND' using errcode='P0002'; end if;
  if not (
    (current_lifecycle='LEAD' and p_lifecycle in ('AGREEMENT_PENDING','ONBOARDING','ARCHIVED')) or
    (current_lifecycle='AGREEMENT_PENDING' and p_lifecycle in ('ONBOARDING','LEAD','ARCHIVED')) or
    (current_lifecycle='ONBOARDING' and p_lifecycle in ('CONFIGURATION','AGREEMENT_PENDING','OFFBOARDING')) or
    (current_lifecycle='CONFIGURATION' and p_lifecycle in ('STAGING','ONBOARDING','OFFBOARDING')) or
    (current_lifecycle='STAGING' and p_lifecycle in ('CLIENT_REVIEW','CONFIGURATION','OFFBOARDING')) or
    (current_lifecycle='CLIENT_REVIEW' and p_lifecycle in ('READY','STAGING','OFFBOARDING')) or
    (current_lifecycle='READY' and p_lifecycle in ('ACTIVE','CLIENT_REVIEW','OFFBOARDING')) or
    (current_lifecycle='ACTIVE' and p_lifecycle in ('SUSPENDED','OFFBOARDING')) or
    (current_lifecycle='SUSPENDED' and p_lifecycle in ('ACTIVE','OFFBOARDING')) or
    (current_lifecycle='OFFBOARDING' and p_lifecycle in ('ARCHIVED','ACTIVE'))
  ) then raise exception 'ILLEGAL_LIFECYCLE_TRANSITION' using errcode='22023'; end if;
  update public.restaurant_onboarding set lifecycle=p_lifecycle,updated_at=now() where business_id=p_business_id;
  if p_lifecycle='ACTIVE' then update public.businesses set is_active=true,updated_at=now() where id=p_business_id; end if;
  if p_lifecycle in ('SUSPENDED','ARCHIVED') then update public.businesses set is_active=false,updated_at=now() where id=p_business_id; end if;
  insert into public.platform_audit_logs(actor_user_id,action,target_type,target_id,business_id,reason,before_data,after_data)
  values(auth.uid(),'RESTAURANT_LIFECYCLE_CHANGED','business',p_business_id::text,p_business_id,p_reason,jsonb_build_object('lifecycle',current_lifecycle),jsonb_build_object('lifecycle',p_lifecycle));
end;
$$;

grant execute on function public.has_platform_permission(text) to authenticated;
grant execute on function public.platform_effective_permissions() to authenticated;
grant execute on function public.platform_provision_restaurant(uuid,jsonb) to authenticated;
grant execute on function public.platform_transition_restaurant(uuid,public.restaurant_lifecycle,text) to authenticated;
grant execute on function public.platform_create_service_package(jsonb) to authenticated;
grant execute on function public.platform_add_branch(uuid,jsonb) to authenticated;
revoke all on function public.platform_provision_restaurant(uuid,jsonb) from public,anon;
revoke all on function public.platform_transition_restaurant(uuid,public.restaurant_lifecycle,text) from public,anon;
revoke all on function public.platform_create_service_package(jsonb) from public,anon;
revoke all on function public.platform_add_branch(uuid,jsonb) from public,anon;

alter table public.platform_permissions enable row level security;
alter table public.platform_roles enable row level security;
alter table public.platform_role_permissions enable row level security;
alter table public.platform_staff enable row level security;
alter table public.platform_staff_roles enable row level security;
alter table public.platform_staff_permissions enable row level security;
alter table public.service_packages enable row level security;
alter table public.package_entitlements enable row level security;
alter table public.restaurant_subscriptions enable row level security;
alter table public.service_entitlements enable row level security;
alter table public.restaurant_onboarding enable row level security;
alter table public.onboarding_documents enable row level security;
alter table public.platform_domain_records enable row level security;
alter table public.mobile_app_records enable row level security;
alter table public.deployment_records enable row level security;
alter table public.platform_incidents enable row level security;
alter table public.support_tickets enable row level security;
alter table public.platform_tasks enable row level security;
alter table public.platform_integration_status enable row level security;
alter table public.platform_audit_logs enable row level security;

grant select on public.platform_permissions,public.platform_roles,public.platform_role_permissions,
  public.platform_staff,public.platform_staff_roles,public.platform_staff_permissions,
  public.service_packages,public.package_entitlements,public.restaurant_subscriptions,
  public.service_entitlements,public.restaurant_onboarding,public.onboarding_documents,
  public.platform_domain_records,public.mobile_app_records,public.deployment_records,
  public.platform_incidents,public.support_tickets,public.platform_tasks,
  public.platform_integration_status,public.platform_audit_logs to authenticated;

create policy platform_catalog_read on public.platform_permissions for select to authenticated using (exists(select 1 from public.platform_staff s where s.user_id=auth.uid() and s.status='ACTIVE'));
create policy platform_roles_read on public.platform_roles for select to authenticated using (exists(select 1 from public.platform_staff s where s.user_id=auth.uid() and s.status='ACTIVE'));
create policy platform_role_permissions_read on public.platform_role_permissions for select to authenticated using (exists(select 1 from public.platform_staff s where s.user_id=auth.uid() and s.status='ACTIVE'));
create policy platform_staff_self_read on public.platform_staff for select to authenticated using (user_id=auth.uid() or public.has_platform_permission('team.manage'));
create policy platform_staff_roles_read on public.platform_staff_roles for select to authenticated using (staff_user_id=auth.uid() or public.has_platform_permission('team.manage'));
create policy platform_staff_permissions_read on public.platform_staff_permissions for select to authenticated using (staff_user_id=auth.uid() or public.has_platform_permission('team.manage'));
create policy service_packages_read on public.service_packages for select to authenticated using (public.has_platform_permission('restaurants.view'));
create policy package_entitlements_read on public.package_entitlements for select to authenticated using (public.has_platform_permission('restaurants.view'));
create policy subscriptions_read on public.restaurant_subscriptions for select to authenticated using (public.has_platform_permission('billing.view') or public.has_platform_permission('restaurants.view'));
create policy entitlements_read on public.service_entitlements for select to authenticated using (public.has_platform_permission('restaurants.view'));
create policy onboarding_read on public.restaurant_onboarding for select to authenticated using (public.has_platform_permission('restaurants.view'));
create policy onboarding_documents_read on public.onboarding_documents for select to authenticated using (public.has_platform_permission('onboarding.manage'));
create policy platform_domains_read on public.platform_domain_records for select to authenticated using (public.has_platform_permission('restaurants.view'));
create policy mobile_apps_read on public.mobile_app_records for select to authenticated using (public.has_platform_permission('restaurants.view'));
create policy deployments_read on public.deployment_records for select to authenticated using (public.has_platform_permission('restaurants.view'));
create policy incidents_read on public.platform_incidents for select to authenticated using (public.has_platform_permission('restaurants.view'));
create policy support_read on public.support_tickets for select to authenticated using (public.has_platform_permission('support.access'));
create policy tasks_read on public.platform_tasks for select to authenticated using (public.has_platform_permission('restaurants.view'));
create policy integration_status_read on public.platform_integration_status for select to authenticated using (public.has_platform_permission('restaurants.view'));
create policy platform_audit_read on public.platform_audit_logs for select to authenticated using (public.has_platform_permission('audit.view'));
create policy platform_business_directory_read on public.businesses for select to authenticated using (public.has_platform_permission('restaurants.view'));
create policy platform_branch_directory_read on public.branches for select to authenticated using (public.has_platform_permission('restaurants.view'));
create policy platform_domain_source_read on public.business_domains for select to authenticated using (public.has_platform_permission('restaurants.view'));
create policy platform_pos_devices_read on public.pos_offline_devices for select to authenticated using (public.has_platform_permission('restaurants.view'));
create policy platform_orders_summary_read on public.orders for select to authenticated using (public.has_platform_permission('restaurants.view'));

commit;
