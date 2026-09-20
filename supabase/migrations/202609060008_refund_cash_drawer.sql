begin;
alter table public.refunds add column cash_shift_id uuid references public.register_shifts(id) on delete restrict;
create index refunds_cash_shift_idx on public.refunds(cash_shift_id) where cash_shift_id is not null;
create or replace function public.record_manual_refund(p_payment_id uuid,p_amount integer,p_reason text)
returns public.refunds language plpgsql security definer set search_path=public as $$
declare payment public.payment_transactions; result public.refunds; refunded_total integer; cash_shift uuid;
begin
  select * into payment from public.payment_transactions where id=p_payment_id for update;
  if not found or not public.has_permission(payment.business_id,'payments.refund') then raise exception 'Refund access denied.' using errcode='42501'; end if;
  if payment.provider<>'CASH' then raise exception 'This provider requires its configured refund adapter.' using errcode='0A000'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'A refund reason is required.' using errcode='22023'; end if;
  select id into cash_shift from public.register_shifts where branch_id=payment.branch_id and opened_by=auth.uid() and status='OPEN' order by opened_at desc limit 1 for update;
  if cash_shift is null then select id into cash_shift from public.register_shifts where id=payment.shift_id and status='OPEN' for update; end if;
  if cash_shift is null then raise exception 'Open a register shift to record returned cash.' using errcode='22023'; end if;
  select coalesce(sum(amount),0) into refunded_total from public.refunds where payment_id=payment.id and status='SUCCEEDED';
  if p_amount<=0 or refunded_total+p_amount>payment.amount then raise exception 'Refund amount is invalid.' using errcode='22023'; end if;
  insert into public.refunds(business_id,payment_id,order_id,amount,reason,status,requested_by,completed_at,cash_shift_id) values(payment.business_id,payment.id,payment.order_id,p_amount,left(btrim(p_reason),500),'SUCCEEDED',auth.uid(),now(),cash_shift) returning * into result;
  refunded_total:=refunded_total+p_amount;
  update public.payment_transactions set status=case when refunded_total=amount then 'REFUNDED' else 'PARTIALLY_REFUNDED' end,refunded_at=now() where id=payment.id;
  update public.orders set payment_status=case when refunded_total=payment.amount then 'REFUNDED'::public.payment_status else 'PARTIALLY_REFUNDED'::public.payment_status end where id=payment.order_id;
  insert into public.notifications(business_id,notification_type,title,message,entity_type,entity_id,dedupe_key) values(payment.business_id,'REFUND','Refund recorded','Refund recorded for payment '||payment.id,'refunds',result.id::text,'refund-'||result.id);
  return result;
end; $$;
create or replace function public.close_register_shift(p_shift_id uuid,p_counted_cash integer,p_notes text default null)
returns public.register_shifts language plpgsql security definer set search_path=public as $$
declare result public.register_shifts; cash_sales integer; cash_in integer; cash_out integer; cash_refunds integer; expected integer;
begin
  select * into result from public.register_shifts where id=p_shift_id and status='OPEN' for update;
  if not found or not public.has_permission(result.business_id,'register.manage') then raise exception 'Open register shift not found.' using errcode='42501'; end if;
  select coalesce(sum(amount),0) into cash_sales from public.payment_transactions where shift_id=p_shift_id and payment_method='CASH' and status in ('PAID','PARTIALLY_REFUNDED','REFUNDED');
  select coalesce(sum(amount) filter(where movement_type='CASH_IN'),0),coalesce(sum(amount) filter(where movement_type='CASH_OUT'),0) into cash_in,cash_out from public.cash_movements where shift_id=p_shift_id;
  select coalesce(sum(refund.amount),0) into cash_refunds from public.refunds refund join public.payment_transactions payment on payment.id=refund.payment_id where coalesce(refund.cash_shift_id,payment.shift_id)=p_shift_id and payment.payment_method='CASH' and refund.status='SUCCEEDED';
  expected:=result.opening_cash+cash_sales+cash_in-cash_out-cash_refunds;
  update public.register_shifts set status='CLOSED',closed_by=auth.uid(),closed_at=now(),expected_cash=expected,counted_cash=p_counted_cash,difference=p_counted_cash-expected,notes=coalesce(nullif(left(btrim(p_notes),500),''),notes) where id=p_shift_id returning * into result;
  return result;
end; $$;
create or replace function public.register_summary(p_shift_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare shift public.register_shifts; sales integer; refunds integer; cash_in integer; cash_out integer;
begin
  select * into shift from public.register_shifts where id=p_shift_id;
  if not found or not(public.has_permission(shift.business_id,'register.manage') or public.has_permission(shift.business_id,'reports.read')) then raise exception 'Register access denied.' using errcode='42501'; end if;
  select coalesce(sum(amount),0) into sales from public.payment_transactions where shift_id=p_shift_id and payment_method='CASH' and status in ('PAID','PARTIALLY_REFUNDED','REFUNDED');
  select coalesce(sum(r.amount),0) into refunds from public.refunds r join public.payment_transactions p on p.id=r.payment_id where coalesce(r.cash_shift_id,p.shift_id)=p_shift_id and p.payment_method='CASH' and r.status='SUCCEEDED';
  select coalesce(sum(amount) filter(where movement_type='CASH_IN'),0),coalesce(sum(amount) filter(where movement_type='CASH_OUT'),0) into cash_in,cash_out from public.cash_movements where shift_id=p_shift_id;
  return jsonb_build_object('opening',shift.opening_cash,'sales',sales,'refunds',refunds,'cashIn',cash_in,'cashOut',cash_out,'expected',shift.opening_cash+sales-refunds+cash_in-cash_out,'counted',shift.counted_cash,'difference',shift.difference,'status',shift.status);
end; $$;
commit;
