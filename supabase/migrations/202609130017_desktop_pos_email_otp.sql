begin;

create table if not exists public.desktop_pos_login_otps (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null check (email = lower(btrim(email))),
  code_hash text not null,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists desktop_pos_login_otps_lookup_idx
  on public.desktop_pos_login_otps (email, created_at desc)
  where consumed_at is null;

alter table public.desktop_pos_login_otps enable row level security;
revoke all on public.desktop_pos_login_otps from public, anon, authenticated;

commit;
