begin;

-- PostgreSQL validates PL/pgSQL identifiers at execution time. Qualify the
-- deployed predicates defensively, then make the remaining intended local
-- variables win over same-named record fields.
do $$
declare
  definition text;
  patched text;
  marker_position integer;
begin
  select pg_get_functiondef('public.sync_offline_pos_order(jsonb)'::regprocedure) into definition;
  patched := definition;
  patched := regexp_replace(patched,
    'select \* into device from public\.pos_offline_devices\s+where id = device_id and business_id = target_business and branch_id = branch_id for update;',
    'select * into device from public.pos_offline_devices offline_device where offline_device.id = device_id and offline_device.business_id = target_business and offline_device.branch_id = branch_id for update;', 'i');
  patched := regexp_replace(patched,
    'select \* into snapshot from public\.pos_catalog_snapshots\s+where id = snapshot_id and device_id = device_id and business_id = target_business and branch_id = branch_id;',
    'select * into snapshot from public.pos_catalog_snapshots catalog_snapshot where catalog_snapshot.id = snapshot_id and catalog_snapshot.device_id = device_id and catalog_snapshot.business_id = target_business and catalog_snapshot.branch_id = branch_id;', 'i');
  patched := regexp_replace(patched,
    'select \* into existing_order from public\.orders\s+where business_id = target_business and offline_device_id = device_id and offline_order_id = offline_order',
    'select * into existing_order from public.orders synced_order where synced_order.business_id = target_business and synced_order.offline_device_id = device_id and synced_order.offline_order_id = offline_order', 'i');
  patched := regexp_replace(patched,
    'select \* into shift_record from public\.register_shifts\s+where business_id = target_business and offline_device_id = device_id and offline_shift_id = offline_shift for update;',
    'select * into shift_record from public.register_shifts synced_shift where synced_shift.business_id = target_business and synced_shift.offline_device_id = device_id and synced_shift.offline_shift_id = offline_shift for update;', 'i');
  patched := regexp_replace(patched,
    'update public\.pos_offline_devices set last_sync_at=now\(\),updated_at=now\(\) where id=device_id;',
    'update public.pos_offline_devices offline_device set last_sync_at=now(),updated_at=now() where offline_device.id=device_id;', 'i');
  if position('#variable_conflict use_variable' in patched) = 0 then
    marker_position := position('$function$' in patched) + length('$function$') - 1;
    if marker_position < length('$function$') then raise exception 'Unable to locate PL/pgSQL function body.'; end if;
    patched := left(patched, marker_position) || E'\n#variable_conflict use_variable\n' || substring(patched from marker_position + 1);
  end if;
  execute patched;
end;
$$;

commit;
