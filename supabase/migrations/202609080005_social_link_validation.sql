-- Inactive platforms may be saved without inventing a destination.
alter table public.social_links drop constraint if exists social_links_url_check;
alter table public.social_links add constraint social_links_url_check
  check ((not is_active and btrim(url) = '') or url ~ '^https?://[^/[:space:]]+[.][^/[:space:]]+');
