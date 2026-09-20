begin;

-- Stock counts and posted purchase totals are changed only through audited RPCs.
create or replace function public.protect_inventory_ledger()
returns trigger language plpgsql set search_path=public as $$
begin
  if current_user='authenticated' and tg_op='UPDATE' then
    if tg_table_name='ingredients' and new.current_stock is distinct from old.current_stock then
      raise exception 'Use the audited stock adjustment action to change stock.' using errcode='42501';
    elsif tg_table_name='purchases' and (new.status is distinct from old.status or new.total is distinct from old.total or new.received_at is distinct from old.received_at) then
      raise exception 'Use purchase receiving to change posted totals.' using errcode='42501';
    end if;
  end if;
  return new;
end; $$;
create trigger ingredients_protect_ledger before update on public.ingredients for each row execute function public.protect_inventory_ledger();
create trigger purchases_protect_ledger before update on public.purchases for each row execute function public.protect_inventory_ledger();

create or replace function public.record_opening_stock()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.current_stock<>0 then
    insert into public.stock_movements(business_id,branch_id,ingredient_id,movement_type,quantity_delta,unit_cost,reference_type,reference_id,note,created_by)
    values(new.business_id,new.branch_id,new.id,'ADJUSTMENT',new.current_stock,new.cost_per_unit,'OPENING',new.id::text,'Opening inventory',auth.uid());
  end if;
  return new;
end; $$;
create trigger ingredients_opening_stock after insert on public.ingredients for each row execute function public.record_opening_stock();

-- Read-only cash breakdown for open and closed shifts.
create or replace function public.register_summary(p_shift_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare shift public.register_shifts; sales integer; refunds integer; cash_in integer; cash_out integer;
begin
  select * into shift from public.register_shifts where id=p_shift_id;
  if not found or not(public.has_permission(shift.business_id,'register.manage') or public.has_permission(shift.business_id,'reports.read')) then raise exception 'Register access denied.' using errcode='42501'; end if;
  select coalesce(sum(amount),0) into sales from public.payment_transactions where shift_id=p_shift_id and payment_method='CASH' and status in ('PAID','PARTIALLY_REFUNDED','REFUNDED');
  select coalesce(sum(r.amount),0) into refunds from public.refunds r join public.payment_transactions p on p.id=r.payment_id where p.shift_id=p_shift_id and p.payment_method='CASH' and r.status='SUCCEEDED';
  select coalesce(sum(amount) filter(where movement_type='CASH_IN'),0),coalesce(sum(amount) filter(where movement_type='CASH_OUT'),0) into cash_in,cash_out from public.cash_movements where shift_id=p_shift_id;
  return jsonb_build_object('opening',shift.opening_cash,'sales',sales,'refunds',refunds,'cashIn',cash_in,'cashOut',cash_out,'expected',shift.opening_cash+sales-refunds+cash_in-cash_out,'counted',shift.counted_cash,'difference',shift.difference,'status',shift.status);
end; $$;
revoke all on function public.register_summary(uuid) from public,anon;
grant execute on function public.register_summary(uuid) to authenticated;

commit;
