begin;

alter table public.register_shifts add column if not exists offline_revision integer not null default 0;
-- Keep the existing one-open-online-counter rule; offline devices have their own
-- independent registers, even when a manager enrolls more than one workstation.
drop index if exists public.register_one_open_user_branch_idx;
create unique index register_one_open_user_branch_idx on public.register_shifts(branch_id,opened_by)
  where status='OPEN' and offline_device_id is null;
create unique index if not exists register_one_open_offline_device_idx on public.register_shifts(business_id,offline_device_id)
  where status='OPEN' and offline_device_id is not null;

create or replace function public.sync_offline_pos_shift(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  device uuid:=(p_payload->>'deviceId')::uuid;
  branch uuid:=(p_payload->>'branchId')::uuid;
  local_id text:=p_payload->>'id';
  revision integer:=(p_payload->>'revision')::integer;
  desired text:=p_payload->>'status';
  opening integer:=(p_payload->>'openingCash')::integer;
  counted integer:=(p_payload->>'countedCash')::integer;
  opened timestamptz:=(p_payload->>'openedAt')::timestamptz;
  closed timestamptz:=(p_payload->>'closedAt')::timestamptz;
  business uuid; current_shift public.register_shifts;
  movement jsonb; existing_movement public.cash_movements; movement_id uuid;
  sales bigint; returned bigint; cash_in bigint; cash_out bigint; expected bigint;
begin
  select b.business_id into business from public.branches b join public.businesses owner on owner.id=b.business_id
    where b.id=branch and b.is_active and owner.is_active;
  if auth.uid() is null or business is null or not public.staff_can_access_branch(business,branch)
    or not public.has_permission(business,'desktop_pos.use') or not public.has_permission(business,'pos.use')
    or not coalesce((public.resolve_runtime_entitlement(business,branch,'pos.desktop')->>'enabled')::boolean,false) then
    raise exception 'Desktop register access denied.' using errcode='42501';
  end if;
  perform 1 from public.pos_offline_devices d where d.id=device and d.business_id=business and d.branch_id=branch and d.is_active for update;
  if not found then raise exception 'Desktop device access denied.' using errcode='42501';end if;
  if local_id is null or length(local_id)>80 or revision is null or revision<1 or desired is null or desired not in ('OPEN','CLOSED')
    or opening is null or opening<0 or opened is null or opened>now()+interval '5 minutes'
    or (desired='OPEN' and (closed is not null or counted is not null))
    or (desired='CLOSED' and (closed is null or closed<opened or closed>now()+interval '5 minutes' or counted is null or counted<0)) then
    raise exception 'Invalid saved shift.' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(p_payload->'cashMovements','[]'))<>'array' then raise exception 'Invalid cash movements.' using errcode='22023';end if;
  if (desired='CLOSED' or jsonb_array_length(coalesce(p_payload->'cashMovements','[]'))>0)
    and not public.has_permission(business,'register.manage') then
    raise exception 'Manager register permission is required.' using errcode='42501';
  end if;
  select * into current_shift from public.register_shifts s where s.business_id=business and s.offline_device_id=device and s.offline_shift_id=local_id for update;
  if found then
    if current_shift.branch_id<>branch or (current_shift.opened_by<>auth.uid() and not public.has_permission(business,'register.manage')) then
      raise exception 'Shift belongs to another operator.' using errcode='42501';end if;
    if revision<=current_shift.offline_revision then
      return jsonb_build_object('id',current_shift.id,'revision',current_shift.offline_revision,'status',current_shift.status);
    end if;
    if current_shift.opening_cash<>opening or current_shift.opened_at<>opened then
      raise exception 'Opening cash and time cannot be rewritten.' using errcode='22023';end if;
    if current_shift.offline_revision>0 and current_shift.status='CLOSED' then
      raise exception 'A reconciled closed shift cannot be rewritten.' using errcode='22023';end if;
  else
    insert into public.register_shifts(business_id,branch_id,opened_by,opening_cash,opened_at,status,offline_device_id,offline_shift_id,notes)
      values(business,branch,auth.uid(),opening,opened,desired,device,local_id,'Desktop register') returning * into current_shift;
  end if;
  for movement in select value from jsonb_array_elements(coalesce(p_payload->'cashMovements','[]')) loop
    movement_id:=(movement->>'id')::uuid;
    if movement_id is null or (movement->>'type') is null or (movement->>'type') not in ('CASH_IN','CASH_OUT')
      or coalesce((movement->>'amount')::integer,0)<=0 or nullif(btrim(movement->>'reason'),'') is null or length(movement->>'reason')>300
      or (movement->>'createdAt') is null or (movement->>'createdAt')::timestamptz<opened
      or (movement->>'createdAt')::timestamptz>coalesce(closed,now()+interval '5 minutes') then
      raise exception 'Invalid cash movement.' using errcode='22023';end if;
    select * into existing_movement from public.cash_movements where id=movement_id;
    if found then
      if existing_movement.shift_id<>current_shift.id or existing_movement.business_id<>business
        or existing_movement.amount<>(movement->>'amount')::integer or existing_movement.movement_type<>movement->>'type'
        or existing_movement.reason<>btrim(movement->>'reason') then
        raise exception 'Cash operation identity conflict.' using errcode='22023';end if;
    else
      insert into public.cash_movements(id,business_id,shift_id,movement_type,amount,reason,created_by,created_at)
        values(movement_id,business,current_shift.id,movement->>'type',(movement->>'amount')::integer,btrim(movement->>'reason'),auth.uid(),(movement->>'createdAt')::timestamptz);
    end if;
  end loop;
  select coalesce(sum(amount),0) into sales from public.payment_transactions where shift_id=current_shift.id and payment_method='CASH' and status in ('PAID','PARTIALLY_REFUNDED','REFUNDED');
  select coalesce(sum(r.amount),0) into returned from public.refunds r join public.payment_transactions p on p.id=r.payment_id
    where coalesce(r.cash_shift_id,p.shift_id)=current_shift.id and p.payment_method='CASH' and r.status='SUCCEEDED';
  select coalesce(sum(amount) filter(where movement_type='CASH_IN'),0),coalesce(sum(amount) filter(where movement_type='CASH_OUT'),0)
    into cash_in,cash_out from public.cash_movements where shift_id=current_shift.id;
  expected:=opening+sales-returned+cash_in-cash_out;
  update public.register_shifts set status=desired,closed_at=closed,closed_by=case when desired='CLOSED' then auth.uid() else null end,
    counted_cash=counted,expected_cash=expected,difference=case when desired='CLOSED' then counted-expected else null end,
    offline_revision=revision,updated_at=now() where id=current_shift.id;
  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
    values(business,auth.uid(),'DESKTOP_SHIFT_SYNC','register_shifts',current_shift.id::text,jsonb_build_object('revision',revision,'status',desired,'deviceId',device));
  return jsonb_build_object('id',current_shift.id,'revision',revision,'status',desired);
end; $$;
revoke all on function public.sync_offline_pos_shift(jsonb) from public,anon;
grant execute on function public.sync_offline_pos_shift(jsonb) to authenticated;
commit;
