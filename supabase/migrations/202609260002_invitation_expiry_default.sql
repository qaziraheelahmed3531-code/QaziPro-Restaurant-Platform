begin;

alter table public.staff_invitations
  alter column expires_at set default (now()+interval '7 days');

comment on column public.staff_invitations.expires_at is
  'QaziPro invitation lifecycle expiry. Provider token expiry remains independently enforced by Supabase Auth.';

commit;
