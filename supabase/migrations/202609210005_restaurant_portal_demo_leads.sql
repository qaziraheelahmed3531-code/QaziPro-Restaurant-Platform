-- Public demo requests are accepted only by the server-side, rate-limited Admin route.
-- The table is intentionally invisible to browser Supabase roles.
create table if not exists public.platform_demo_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 100),
  business_name text not null check (char_length(business_name) between 2 and 120),
  email text not null check (char_length(email) between 5 and 254),
  phone text not null check (char_length(phone) between 7 and 35),
  branch_band text not null check (branch_band in ('ONE','TWO_TO_FIVE','SIX_PLUS')),
  source text not null default 'RESTAURANT_ADMIN' check (source in ('RESTAURANT_ADMIN','QAZIPRO_WEBSITE')),
  status text not null default 'NEW' check (status in ('NEW','CONTACTED','CONVERTED','CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_demo_requests_recent_idx on public.platform_demo_requests (created_at desc);
create trigger platform_demo_requests_updated_at before update on public.platform_demo_requests
  for each row execute function public.set_updated_at();
alter table public.platform_demo_requests enable row level security;
revoke all on public.platform_demo_requests from public, anon, authenticated;
grant select, insert, update on public.platform_demo_requests to service_role;

comment on table public.platform_demo_requests is 'QaziPro sales leads, service-role only. No tenant or restaurant operational data.';
