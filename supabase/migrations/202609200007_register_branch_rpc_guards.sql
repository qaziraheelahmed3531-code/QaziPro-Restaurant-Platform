begin;

-- These register commands are SECURITY DEFINER. Keep their checks equivalent
-- to branch RLS so a business-level permission cannot be used with an
-- unassigned branch or a guessed shift id.
create or replace function public.open_register_shift(p_branch_id uuid,p_opening_cash integer,p_notes text default null)
returns public.register_shifts language plpgsql security definer set search_path=public as $$
declare result public.register_shifts; target_business uuid;
begin
  select business_id into target_business from public.branches where id=p_branch_id and is_active;
  if target_business is null or not public.staff_can_access_branch(target_business,p_branch_id)
    or not public.has_permission(target_business,'register.manage') then
    raise exception 'Register access denied.' using errcode='42501';
  end if;
  if p_opening_cash is null or p_opening_cash<0 then raise exception 'Opening cash cannot be negative.' using errcode='22023'; end if;
  insert into public.register_shifts(business_id,branch_id,opened_by,opening_cash,notes)
  values(target_business,p_branch_id,auth.uid(),p_opening_cash,nullif(left(btrim(p_notes),500),'')) returning * into result;
  return result;
end;
$$;

create or replace function public.open_pos_shift(p_branch_id uuid,p_opening_cash integer)
returns public.register_shifts language plpgsql security definer set search_path=public as $$
declare target_business uuid; result public.register_shifts;
begin
  select business_id into target_business from public.branches where id=p_branch_id and is_active;
  if target_business is null or not public.staff_can_access_branch(target_business,p_branch_id)
    or not public.has_permission(target_business,'pos.use') then
    raise exception 'Counter access denied.' using errcode='42501';
  end if;
  if p_opening_cash is null or p_opening_cash<0 then raise exception 'Enter a valid opening cash amount.' using errcode='22023'; end if;
  perform 1 from public.businesses where id=target_business for update;
  select * into result from public.register_shifts
  where branch_id=p_branch_id and opened_by=auth.uid() and status='OPEN';
  if found then return result; end if;
  insert into public.register_shifts(business_id,branch_id,opened_by,opening_cash,notes)
  values(target_business,p_branch_id,auth.uid(),p_opening_cash,'Opened from POS') returning * into result;
  return result;
end;
$$;

create or replace function public.record_cash_movement(p_shift_id uuid,p_type text,p_amount integer,p_reason text)
returns public.cash_movements language plpgsql security definer set search_path=public as $$
declare result public.cash_movements; shift_record public.register_shifts;
begin
  select * into shift_record from public.register_shifts where id=p_shift_id and status='OPEN' for update;
  if not found or not public.staff_can_access_branch(shift_record.business_id,shift_record.branch_id)
    or not public.has_permission(shift_record.business_id,'register.manage') then
    raise exception 'Open register shift not found.' using errcode='42501';
  end if;
  insert into public.cash_movements(business_id,shift_id,movement_type,amount,reason,created_by)
  values(shift_record.business_id,p_shift_id,p_type,p_amount,left(btrim(p_reason),300),auth.uid()) returning * into result;
  return result;
end;
$$;

create or replace function public.close_register_shift(p_shift_id uuid,p_counted_cash integer,p_notes text default null)
returns public.register_shifts language plpgsql security definer set search_path=public as $$
declare result public.register_shifts; cash_sales integer; cash_in integer; cash_out integer; cash_refunds integer; expected integer;
begin
  select * into result from public.register_shifts where id=p_shift_id and status='OPEN' for update;
  if not found or not public.staff_can_access_branch(result.business_id,result.branch_id)
    or not public.has_permission(result.business_id,'register.manage') then
    raise exception 'Open register shift not found.' using errcode='42501';
  end if;
  select coalesce(sum(amount),0) into cash_sales from public.payment_transactions where shift_id=p_shift_id and payment_method='CASH' and status='PAID';
  select coalesce(sum(amount) filter(where movement_type='CASH_IN'),0),coalesce(sum(amount) filter(where movement_type='CASH_OUT'),0) into cash_in,cash_out from public.cash_movements where shift_id=p_shift_id;
  select coalesce(sum(refund.amount),0) into cash_refunds from public.refunds refund join public.payment_transactions payment on payment.id=refund.payment_id where payment.shift_id=p_shift_id and payment.payment_method='CASH' and refund.status='SUCCEEDED';
  expected:=result.opening_cash+cash_sales+cash_in-cash_out-cash_refunds;
  update public.register_shifts set status='CLOSED',closed_by=auth.uid(),closed_at=now(),expected_cash=expected,counted_cash=p_counted_cash,difference=p_counted_cash-expected,notes=coalesce(nullif(left(btrim(p_notes),500),''),notes) where id=p_shift_id returning * into result;
  return result;
end;
$$;

revoke all on function public.open_register_shift(uuid,integer,text),public.open_pos_shift(uuid,integer),public.record_cash_movement(uuid,text,integer,text),public.close_register_shift(uuid,integer,text) from public,anon;
grant execute on function public.open_register_shift(uuid,integer,text),public.open_pos_shift(uuid,integer),public.record_cash_movement(uuid,text,integer,text),public.close_register_shift(uuid,integer,text) to authenticated;

commit;
