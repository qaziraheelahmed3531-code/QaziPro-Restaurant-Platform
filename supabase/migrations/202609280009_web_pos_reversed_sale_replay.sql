begin;
-- A retry must not represent a subsequently voided/refunded sale as paid.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.create_pos_order(jsonb)'::regprocedure) into definition;
  if position('return previous.response_payload||jsonb_build_object' in definition)=0 then
    raise exception 'Expected canonical POS replay guard is missing';
  end if;
  definition:=replace(definition,
    'return previous.response_payload||jsonb_build_object(''idempotent'',true);',
    'if not exists(select 1 from public.orders where id=previous.order_id and business_id=target_business and branch_id=target_branch and payment_status=''PAID'' and status<>''CANCELLED'') then raise exception ''This sale was reversed. Review it in Receipts; do not collect payment again.'' using errcode=''22023''; end if;
    return previous.response_payload||jsonb_build_object(''idempotent'',true);');
  definition:=replace(definition,
    'return jsonb_build_object(''id'',existing.id,''orderNumber'',existing.order_number',
    'if existing.payment_status<>''PAID'' or existing.status=''CANCELLED'' then raise exception ''This sale was reversed. Review it in Receipts; do not collect payment again.'' using errcode=''22023''; end if;
    return jsonb_build_object(''id'',existing.id,''orderNumber'',existing.order_number');
  execute definition;
end;
$migration$;
commit;
