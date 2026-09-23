-- Reuse the existing QaziPro lead system for public website inquiries.
-- Apply to staging only until website security and launch review are complete.
alter table public.platform_demo_requests
  add column if not exists lead_kind text not null default 'DEMO' check (lead_kind in ('CONTACT','DEMO','QUOTE','ONBOARDING')),
  add column if not exists services text[] not null default '{}',
  add column if not exists message text not null default '',
  add column if not exists preferred_contact_time text not null default '',
  add column if not exists preferred_contact_method text not null default 'WHATSAPP' check (preferred_contact_method in ('EMAIL','PHONE','WHATSAPP')),
  add column if not exists budget_range text not null default '',
  add column if not exists source_page text not null default '',
  add column if not exists utm_source text not null default '',
  add column if not exists utm_medium text not null default '',
  add column if not exists utm_campaign text not null default '';

create index if not exists platform_demo_requests_email_recent_idx
  on public.platform_demo_requests (email, lead_kind, created_at desc);
create index if not exists platform_demo_requests_status_recent_idx
  on public.platform_demo_requests (status, created_at desc);

alter table public.platform_demo_requests drop constraint if exists platform_demo_requests_status_check;
alter table public.platform_demo_requests add constraint platform_demo_requests_status_check
  check (status in ('NEW','CONTACTED','QUALIFIED','DEMO_SCHEDULED','PROPOSAL','WON','LOST','CONVERTED','CLOSED'));

grant select on public.platform_demo_requests to authenticated;
create policy platform_demo_requests_staff_read on public.platform_demo_requests
  for select to authenticated using (public.has_platform_permission('onboarding.manage'));
