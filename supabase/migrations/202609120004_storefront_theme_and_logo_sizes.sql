-- Storefront presentation remains business-scoped and is consumed by both
-- customer and admin shells. Existing rows receive conservative defaults.
alter table public.business_branding
  add column if not exists header_logo_size_px integer not null default 56,
  add column if not exists footer_logo_size_px integer not null default 88,
  add column if not exists website_background_color text not null default '#fbf7f2',
  add column if not exists header_background_color text not null default '#ffffff',
  add column if not exists footer_background_color text not null default '#211d1b',
  add column if not exists product_card_background_color text not null default '#ffffff',
  add column if not exists text_color text not null default '#211d1b',
  add column if not exists footer_text_color text not null default '#f7f2ee';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'business_branding_header_logo_size_check') then
    alter table public.business_branding add constraint business_branding_header_logo_size_check
      check (header_logo_size_px between 36 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'business_branding_footer_logo_size_check') then
    alter table public.business_branding add constraint business_branding_footer_logo_size_check
      check (footer_logo_size_px between 40 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'business_branding_theme_colors_check') then
    alter table public.business_branding add constraint business_branding_theme_colors_check check (
      website_background_color ~ '^#[0-9a-fA-F]{6}$' and
      header_background_color ~ '^#[0-9a-fA-F]{6}$' and
      footer_background_color ~ '^#[0-9a-fA-F]{6}$' and
      product_card_background_color ~ '^#[0-9a-fA-F]{6}$' and
      text_color ~ '^#[0-9a-fA-F]{6}$' and
      footer_text_color ~ '^#[0-9a-fA-F]{6}$'
    );
  end if;
end $$;
