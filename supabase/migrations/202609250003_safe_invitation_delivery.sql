begin;

alter table public.staff_invitations
  drop constraint if exists staff_invitations_delivery_status_check;

alter table public.staff_invitations
  add constraint staff_invitations_delivery_status_check
  check (delivery_status in ('NOT_SENT','SENDING','SENT','FAILED','SUPPRESSED'));

comment on column public.staff_invitations.delivery_status is
  'Delivery lifecycle. SUPPRESSED is reserved for explicitly synthetic QA recipients; SENDING is an atomic duplicate-send lock.';

commit;
