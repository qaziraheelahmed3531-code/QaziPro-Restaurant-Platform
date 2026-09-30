begin;
-- Preserve immutable legacy snapshots (zero-tax policy) and snapshot tax for
-- all newly enrolled catalogs. Reconcile from that proof, never today's price.
do $migration$
declare definition text; before_text text; after_text text; pair text[];
begin
  definition:=pg_get_functiondef('public.register_desktop_pos_catalog(uuid,uuid,text,text)'::regprocedure);
  before_text:='  insert into public.pos_catalog_snapshots(business_id, branch_id, device_id, prices, rules, created_by)';
  if position(before_text in definition)=0 then raise exception 'Unexpected catalog implementation; review migration.'; end if;
  after_text:=$patch$  if auth.uid() is null or not public.has_permission(target_business,'desktop_pos.use') then
    raise exception 'Desktop POS access denied.' using errcode='42501';
  end if;
  snapshot_rules:=snapshot_rules || jsonb_build_object('taxRateBps',coalesce((select tax_rate_bps from public.business_operating_settings where business_id=target_business),0));
  insert into public.pos_catalog_snapshots(business_id, branch_id, device_id, prices, rules, created_by)$patch$;
  execute replace(definition,before_text,after_text);

  definition:=pg_get_functiondef('public.sync_offline_pos_order_internal(jsonb)'::regprocedure);
  foreach pair slice 1 in array array[
    array['is_replacement := jsonb_typeof(p_payload->''replacement'') = ''object'';','is_replacement := coalesce(jsonb_typeof(p_payload->''replacement'') = ''object'',false);'],
    array['  subtotal integer;','  subtotal integer; tax_amount integer; grand_total integer;'],
    array['  subtotal := public.apply_offline_pos_items(target_order.id,target_business,snapshot_id,p_payload->''items'');',
      $patch$  subtotal := public.apply_offline_pos_items(target_order.id,target_business,snapshot_id,p_payload->'items');
  tax_amount:=round(subtotal::numeric * coalesce((snapshot.rules->>'taxRateBps')::integer,0)/10000)::integer;
  grand_total:=subtotal+tax_amount;
  if snapshot.rules ? 'taxRateBps' and (
    (p_payload->>'total')::integer is distinct from grand_total or
    (p_payload->>'tax')::integer is distinct from tax_amount
  ) then raise exception 'Saved total conflicts with the downloaded catalog. Manager review required.' using errcode='22023'; end if;$patch$],
    array['cash_received < subtotal','cash_received < grand_total'],
    array['tax=0,total=subtotal','tax=tax_amount,total=grand_total'],
    array['offline_order,subtotal,''PAID'',sold_at','offline_order,grand_total,''PAID'',sold_at'],
    array['new_total=subtotal,cash_adjustment=subtotal-old_total','new_total=grand_total,cash_adjustment=grand_total-old_total'],
    array['''newTotal'',subtotal,''deviceId''','''newTotal'',grand_total,''deviceId''']
  ] loop
    if position(pair[1] in definition)=0 then raise exception 'Unexpected offline implementation at %; review migration.',pair[1]; end if;
    definition:=replace(definition,pair[1],pair[2]);
  end loop;
  execute definition;

  definition:=pg_get_functiondef('public.sync_offline_pos_order(jsonb)'::regprocedure);
  before_text:='  result:=public.sync_offline_pos_order_internal(p_payload);';
  if position(before_text in definition)=0 then raise exception 'Unexpected sync boundary; review migration.'; end if;
  after_text:=$patch$  if auth.uid() is null or not public.has_permission(target_business,'desktop_pos.use') or
    not coalesce((public.resolve_runtime_entitlement(target_business,target_branch,'pos.desktop')->>'enabled')::boolean,false) then
    raise exception 'Desktop POS access is unavailable. Saved sales require administrator reconciliation.' using errcode='42501';
  end if;
  if not tender.is_active then raise exception 'Payment method is inactive. Manager review required.' using errcode='22023'; end if;
  if jsonb_typeof(p_payload->'replacement')='object' and not public.has_permission(target_business,'payments.refund') then
    raise exception 'Replacement requires manager payment permission.' using errcode='42501';
  end if;
  result:=public.sync_offline_pos_order_internal(p_payload);$patch$;
  execute replace(definition,before_text,after_text);
end $migration$;
-- Snapshot/device reads are operational data, not restaurant-wide public data.
drop policy if exists pos_catalog_snapshots_read on public.pos_catalog_snapshots;
create policy pos_catalog_snapshots_read on public.pos_catalog_snapshots for select to authenticated
using (public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'desktop_pos.use'));
drop policy if exists pos_offline_devices_read on public.pos_offline_devices;
create policy pos_offline_devices_read on public.pos_offline_devices for select to authenticated
using (public.staff_can_access_branch(business_id,branch_id) and (public.has_permission(business_id,'desktop_pos.use') or public.has_permission(business_id,'settings.manage')));
commit;
