-- Inserted inside the existing disposable fixture transaction before revocation.
declare
 shift_payload jsonb; acknowledged jsonb; movement uuid:=gen_random_uuid(); opened_shift uuid;
begin
 shift_payload:=jsonb_build_object('id',request->>'offlineShiftId','deviceId',device,'branchId',branch,
   'revision',1,'status','OPEN','openingCash',0,'openedAt',request->>'shiftOpenedAt','closedAt',null,'countedCash',null,'cashMovements','[]'::jsonb);
 acknowledged:=public.sync_offline_pos_shift(shift_payload);opened_shift:=(acknowledged->>'id')::uuid;
 if acknowledged->>'status'<>'OPEN' then raise exception 'Previously uploaded shift not opened';end if;
 shift_payload:=shift_payload||jsonb_build_object('revision',2,'cashMovements',jsonb_build_array(jsonb_build_object('id',movement,'type','CASH_IN','amount',500,'reason','Opening top up','createdAt',now())));
 perform public.sync_offline_pos_shift(shift_payload);perform public.sync_offline_pos_shift(shift_payload);
 if (select count(*) from public.cash_movements where id=movement)<>1 then raise exception 'Cash movement duplicated';end if;
 perform set_config('request.jwt.claim.sub',cashier::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',cashier,'role','authenticated')::text,true);
 denied:=false;begin perform public.sync_offline_pos_shift(shift_payload||jsonb_build_object('revision',3,'status','CLOSED','closedAt',now(),'countedCash',1600));exception when sqlstate '42501' then denied:=true;end;
 if not denied then raise exception 'Cashier closed managed register';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 shift_payload:=shift_payload||jsonb_build_object('revision',3,'status','CLOSED','closedAt',now(),'countedCash',1590);
 perform public.sync_offline_pos_shift(shift_payload);perform public.sync_offline_pos_shift(shift_payload);
 if not exists(select 1 from public.register_shifts where id=opened_shift and expected_cash=1600 and counted_cash=1590 and difference=-10 and offline_revision=3 and status='CLOSED') then raise exception 'Closed count or cash reconciliation incorrect';end if;
 if (select count(*) from public.audit_logs where entity_id=opened_shift::text and action='DESKTOP_SHIFT_SYNC')<>3 then raise exception 'Shift replay duplicated audit';end if;
 denied:=false;begin perform public.sync_offline_pos_shift(shift_payload||jsonb_build_object('revision',4,'status','OPEN','closedAt',null,'countedCash',null));exception when sqlstate '22023' then denied:=true;end;
 if not denied then raise exception 'Closed shift reopened';end if;
 -- A shift with zero sales still has independent canonical accounting.
 shift_payload:=shift_payload||jsonb_build_object('id',gen_random_uuid(),'revision',1,'status','CLOSED','openingCash',250,'countedCash',250,'cashMovements','[]'::jsonb);
 acknowledged:=public.sync_offline_pos_shift(shift_payload);
 if not exists(select 1 from public.register_shifts where id=(acknowledged->>'id')::uuid and expected_cash=250 and difference=0) then raise exception 'Empty shift missing';end if;
 denied:=false;begin perform public.sync_offline_pos_shift(shift_payload||jsonb_build_object('id',gen_random_uuid(),'branchId',other_branch));exception when sqlstate '42501' then denied:=true;end;
 if not denied then raise exception 'Foreign branch shift accepted';end if;
end;
