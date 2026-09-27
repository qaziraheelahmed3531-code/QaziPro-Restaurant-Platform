begin;
-- Cascading deletes can fire child audit triggers after the parent is gone.
-- Preserve ordinary change auditing, but never insert an impossible FK row.
create or replace function public.record_admin_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare business uuid; entity text; row_data jsonb;
begin
  row_data := coalesce(to_jsonb(new), to_jsonb(old));
  business := nullif(row_data->>'business_id','')::uuid;
  if business is null and tg_table_name='businesses' then business:=nullif(row_data->>'id','')::uuid; end if;
  if business is null and nullif(row_data->>'branch_id','') is not null then select b.business_id into business from public.branches b where b.id=(row_data->>'branch_id')::uuid; end if;
  if business is null and nullif(row_data->>'product_id','') is not null then select p.business_id into business from public.products p where p.id=(row_data->>'product_id')::uuid; end if;
  if business is null and nullif(row_data->>'modifier_group_id','') is not null then select g.business_id into business from public.modifier_groups g where g.id=(row_data->>'modifier_group_id')::uuid; end if;
  if business is null and nullif(row_data->>'deal_id','') is not null then select d.business_id into business from public.deals d where d.id=(row_data->>'deal_id')::uuid; end if;
  entity := coalesce(row_data->>'id',row_data->>'business_id',row_data->>'branch_id');
  if business is not null and auth.uid() is not null
    and exists (select 1 from public.businesses b where b.id=business) then
    insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
      values(business,auth.uid(),upper(tg_op),tg_table_name,entity,jsonb_build_object('source','database-trigger'));
  end if;
  return coalesce(new,old);
end;
$$;
commit;
