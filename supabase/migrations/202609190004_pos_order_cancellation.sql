begin;

create or replace function public.cancel_pos_order(
  p_order_id uuid,
  p_reason text default 'Cancelled at POS'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.orders;
  payment public.payment_transactions;
  refunded_total integer;
  clean_reason text := left(coalesce(nullif(btrim(p_reason), ''), 'Cancelled at POS'), 500);
begin
  select * into target
  from public.orders
  where id = p_order_id
  for update;

  if not found
    or target.channel <> 'POS'
    or not public.staff_can_access_branch(target.business_id, target.branch_id)
    or not public.has_permission(target.business_id, 'pos.use') then
    raise exception 'POS order access denied.' using errcode = '42501';
  end if;

  if target.status = 'CANCELLED' then
    return jsonb_build_object('id', target.id, 'status', target.status, 'idempotent', true);
  end if;
  if target.status = 'DELIVERED' then
    raise exception 'A delivered order must use the refund workflow.' using errcode = '22023';
  end if;
  if target.status not in ('CONFIRMED', 'PREPARING', 'READY') then
    raise exception 'This POS order cannot be cancelled.' using errcode = '22023';
  end if;

  for payment in
    select * from public.payment_transactions
    where order_id = target.id and status in ('PAID', 'PARTIALLY_REFUNDED')
    for update
  loop
    select coalesce(sum(amount), 0) into refunded_total
    from public.refunds
    where payment_id = payment.id and status = 'SUCCEEDED';

    if refunded_total < payment.amount then
      insert into public.refunds(
        business_id, payment_id, order_id, amount, reason, status,
        requested_by, completed_at, cash_shift_id
      ) values (
        target.business_id, payment.id, target.id, payment.amount - refunded_total,
        clean_reason, 'SUCCEEDED', auth.uid(), now(),
        case when payment.payment_method = 'CASH' then payment.shift_id else null end
      );
    end if;

    update public.payment_transactions
    set status = 'REFUNDED', refunded_at = coalesce(refunded_at, now()), updated_at = now()
    where id = payment.id;
  end loop;

  update public.orders
  set status = 'CANCELLED',
      payment_status = case
        when exists(select 1 from public.payment_transactions where order_id = target.id)
          then 'REFUNDED'::public.payment_status
        else 'CANCELLED'::public.payment_status
      end,
      cancelled_by = 'ADMIN',
      cancel_reason = clean_reason,
      cancelled_at = coalesce(cancelled_at, now()),
      updated_at = now()
  where id = target.id;

  update public.register_shifts shift
  set expected_cash = shift.opening_cash
      + coalesce((
          select sum(transaction.amount)
          from public.payment_transactions transaction
          where transaction.shift_id = shift.id
            and transaction.payment_method = 'CASH'
            and transaction.status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
        ), 0)
      - coalesce((
          select sum(refund.amount)
          from public.refunds refund
          join public.payment_transactions transaction on transaction.id = refund.payment_id
          where coalesce(refund.cash_shift_id, transaction.shift_id) = shift.id
            and transaction.payment_method = 'CASH'
            and refund.status = 'SUCCEEDED'
        ), 0),
      updated_at = now()
  where shift.id in (
    select transaction.shift_id
    from public.payment_transactions transaction
    where transaction.order_id = target.id and transaction.shift_id is not null
  );

  insert into public.audit_logs(business_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    target.business_id, auth.uid(), 'POS_ORDER_CANCELLED', 'orders', target.id::text,
    jsonb_build_object('reason', clean_reason, 'previousStatus', target.status)
  );

  return jsonb_build_object('id', target.id, 'status', 'CANCELLED', 'idempotent', false);
end;
$$;

revoke all on function public.cancel_pos_order(uuid, text) from public, anon;
grant execute on function public.cancel_pos_order(uuid, text) to authenticated;

commit;
