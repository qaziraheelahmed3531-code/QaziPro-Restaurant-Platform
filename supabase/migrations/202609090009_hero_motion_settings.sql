-- Business-scoped storefront carousel behavior. Existing branding RLS continues
-- to govern writes; public storefront reads are already restricted to active businesses.
alter table public.business_branding
  add column if not exists hero_autoplay boolean not null default true,
  add column if not exists hero_interval_ms integer not null default 5500,
  add column if not exists hero_transition_ms integer not null default 650;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'business_branding_hero_interval_check') then
    alter table public.business_branding add constraint business_branding_hero_interval_check
      check (hero_interval_ms between 3000 and 15000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'business_branding_hero_transition_check') then
    alter table public.business_branding add constraint business_branding_hero_transition_check
      check (hero_transition_ms in (350, 500, 650));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'business_branding_hero_timing_check') then
    alter table public.business_branding add constraint business_branding_hero_timing_check
      check (hero_transition_ms * 3 < hero_interval_ms);
  end if;
end $$;
