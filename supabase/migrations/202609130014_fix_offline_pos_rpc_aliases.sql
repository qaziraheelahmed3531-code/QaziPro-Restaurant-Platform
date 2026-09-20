begin;

-- The first deployed version used PL/pgSQL variable names that matched a few
-- unqualified table columns. Patch only those statements in-place. Fresh
-- databases already receive the qualified definition from migration 013.
do $$
declare
  original_definition text;
  patched_definition text;
begin
  select pg_get_functiondef('public.sync_offline_pos_order(jsonb)'::regprocedure)
  into original_definition;
  patched_definition := original_definition;
  patched_definition := replace(patched_definition,
    'select * into device from public.pos_offline_devices
  where id = device_id and business_id = target_business and branch_id = branch_id for update;',
    'select * into device from public.pos_offline_devices offline_device
  where offline_device.id = device_id and offline_device.business_id = target_business and offline_device.branch_id = branch_id for update;');
  patched_definition := replace(patched_definition,
    'select * into snapshot from public.pos_catalog_snapshots
  where id = snapshot_id and device_id = device_id and business_id = target_business and branch_id = branch_id;',
    'select * into snapshot from public.pos_catalog_snapshots catalog_snapshot
  where catalog_snapshot.id = snapshot_id and catalog_snapshot.device_id = device_id
    and catalog_snapshot.business_id = target_business and catalog_snapshot.branch_id = branch_id;');
  patched_definition := replace(patched_definition,
    'select * into existing_order from public.orders
  where business_id = target_business and offline_device_id = device_id and offline_order_id = offline_order',
    'select * into existing_order from public.orders synced_order
  where synced_order.business_id = target_business and synced_order.offline_device_id = device_id and synced_order.offline_order_id = offline_order');
  patched_definition := replace(patched_definition,
    'select * into shift_record from public.register_shifts
  where business_id = target_business and offline_device_id = device_id and offline_shift_id = offline_shift for update;',
    'select * into shift_record from public.register_shifts synced_shift
  where synced_shift.business_id = target_business and synced_shift.offline_device_id = device_id and synced_shift.offline_shift_id = offline_shift for update;');
  patched_definition := replace(patched_definition,
    'update public.pos_offline_devices set last_sync_at=now(),updated_at=now() where id=device_id;',
    'update public.pos_offline_devices offline_device set last_sync_at=now(),updated_at=now() where offline_device.id=device_id;');
  if patched_definition is distinct from original_definition then
    execute patched_definition;
  end if;
end;
$$;

commit;
