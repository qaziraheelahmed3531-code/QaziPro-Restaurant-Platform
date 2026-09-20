-- Presentation settings shared by Admin and the public storefront.
-- Empty category descriptions/banners remain genuinely optional; the boolean
-- only controls the weight of a description when one is present.
alter table public.categories
  add column if not exists description_bold boolean not null default false;

alter table public.business_branding
  add column if not exists font_family text not null default 'Geist',
  add column if not exists font_stylesheet_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'business_branding_font_family_check') then
    alter table public.business_branding
      add constraint business_branding_font_family_check
      check (char_length(trim(font_family)) between 1 and 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'business_branding_font_stylesheet_url_check') then
    alter table public.business_branding
      add constraint business_branding_font_stylesheet_url_check
      check (
        font_stylesheet_url is null or
        font_stylesheet_url = '' or
        font_stylesheet_url ~ '^https://(fonts\.googleapis\.com|fonts\.bunny\.net)/'
      );
  end if;
end $$;
