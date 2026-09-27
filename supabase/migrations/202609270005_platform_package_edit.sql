begin;
-- Commercial template changes do not rewrite subscribed restaurants' agreed fees
-- or runtime entitlements. Existing access changes use the entitlement workflow.
create or replace function public.platform_update_service_package(
  p_package_id uuid, p_expected_updated_at timestamptz, p_payload jsonb
) returns void language plpgsql security definer set search_path=public,auth as $$
declare before_row public.service_packages%rowtype; after_row public.service_packages%rowtype;
begin
  if not public.has_platform_permission('subscriptions.manage') then
    raise exception 'PLATFORM_PERMISSION_DENIED' using errcode='42501';
  end if;
  if p_expected_updated_at is null then raise exception 'VERSION_REQUIRED' using errcode='22023'; end if;
  select * into before_row from public.service_packages where id=p_package_id for update;
  if not found then raise exception 'PACKAGE_NOT_FOUND' using errcode='P0002'; end if;
  if before_row.updated_at<>p_expected_updated_at then raise exception 'PACKAGE_CHANGED' using errcode='PT409'; end if;
  if coalesce(length(btrim(p_payload->>'name')),0) not between 2 and 100
    or coalesce(p_payload->>'currency','') !~ '^[A-Z]{3}$'
    or coalesce(p_payload->>'billingFrequency','') not in ('MONTHLY','QUARTERLY','ANNUAL','CUSTOM')
    or coalesce(length(btrim(p_payload->>'reason')),0) not between 3 and 500
    or length(coalesce(p_payload->>'description',''))>2000
    or not (p_payload ?& array['baseFee','setupFee','includedBranches','additionalBranchFee','terminalFee'])
    or (p_payload->>'includedBranches')::integer < 1 then
    raise exception 'INVALID_PACKAGE' using errcode='22023';
  end if;
  update public.service_packages set
    name=btrim(p_payload->>'name'),description=coalesce(p_payload->>'description',''),
    currency=p_payload->>'currency',billing_frequency=p_payload->>'billingFrequency',
    base_fee=(p_payload->>'baseFee')::integer,setup_fee=(p_payload->>'setupFee')::integer,
    included_branches=(p_payload->>'includedBranches')::integer,
    additional_branch_fee=(p_payload->>'additionalBranchFee')::integer,terminal_fee=(p_payload->>'terminalFee')::integer,
    updated_at=clock_timestamp()
  where id=p_package_id returning * into after_row;
  insert into public.platform_audit_logs(actor_user_id,action,target_type,target_id,reason,before_data,after_data)
  values(auth.uid(),'SERVICE_PACKAGE_UPDATED','service_packages',p_package_id::text,
    btrim(p_payload->>'reason'),to_jsonb(before_row),to_jsonb(after_row));
end;
$$;
revoke all on function public.platform_update_service_package(uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.platform_update_service_package(uuid,timestamptz,jsonb) to authenticated;
commit;
