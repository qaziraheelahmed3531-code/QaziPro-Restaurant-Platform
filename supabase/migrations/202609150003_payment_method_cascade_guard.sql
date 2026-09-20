begin;
-- Preserve the last payment method during ordinary edits, but allow the parent
-- restaurant's own ON DELETE CASCADE to complete. Serialize concurrent edits.
create or replace function public.protect_last_active_pos_payment_method()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.businesses where id=old.business_id for update;
  if not found and tg_op='DELETE' then return old; end if;
  if old.is_active and (tg_op='DELETE' or not coalesce(new.is_active,false) or new.business_id<>old.business_id)
    and not exists(select 1 from public.pos_payment_methods where business_id=old.business_id and is_active and id<>old.id) then
    raise exception 'Keep at least one active POS payment method.' using errcode='23514';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
commit;
