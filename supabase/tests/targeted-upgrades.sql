-- Isolated QA database only. All test writes roll back.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@example.test',now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cashier@example.test',now()),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','products@example.test',now()),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','invite@example.test',null);
insert into public.staff_memberships(business_id,user_id,role) values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','OWNER');
insert into public.invoice_settings(business_id,business_name) values('11111111-1111-4111-8111-111111111111','Italian Pizza') on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ declare b uuid:='11111111-1111-4111-8111-111111111111'; snapshot jsonb; ids uuid[]; draft jsonb; invoice_id uuid; inv jsonb; result uuid; denied boolean:=false;
begin
 perform public.save_staff_by_email(b,'CASHIER@example.test','CASHIER',true,array['pos.use','orders.read','receipts.print']);
 perform public.save_staff_by_email(b,'products@example.test','MANAGER',true,array['products.manage']);
 perform public.save_staff_by_email(b,'invite@example.test','KITCHEN',true,array['kds.use']);
 if (select status from public.staff_invitations where email='invite@example.test')<>'PENDING' then raise exception 'Pending invitation failed'; end if;
 begin perform public.save_staff_by_email(b,'owner@example.test','OWNER',false,array[]::text[]); exception when sqlstate '22023' then denied:=true; end;
 if not denied then raise exception 'Last owner was deactivated'; end if;
 snapshot:=public.content_order(b,'categories');
 select array_agg((e->>'id')::uuid order by n desc) into ids from jsonb_array_elements(snapshot) with ordinality v(e,n);
 perform public.reorder_content(b,'categories',null,ids,snapshot);
 if (public.content_order(b,'categories')->0->>'id')<>ids[1]::text then raise exception 'Reorder did not persist'; end if;
 denied:=false; begin perform public.reorder_content(b,'categories',null,ids,snapshot); exception when sqlstate '40001' then denied:=true; end;
 if not denied then raise exception 'Stale reorder accepted'; end if;
 perform public.content_order(b,'banners'); perform public.content_order(b,'promotionalBanners'); perform public.content_order(b,'modifierGroups'); perform public.content_order(b,'socialLinks');
 draft:=jsonb_build_object('branch_id','22222222-2222-4222-8222-222222222222','customer_name','Test Customer','invoice_date','2026-09-06','discount',50,'tax',20,'charges',100,'notes','QA invoice',
 'lines',jsonb_build_array(jsonb_build_object('description','Meal A','quantity',2,'unit_price',500,'discount',100,'tax',30),jsonb_build_object('description','Meal B','quantity',1,'unit_price',300,'discount',0,'tax',0)));
 invoice_id:=public.save_invoice(b,draft);
 inv:=public.invoice_document(invoice_id);
 if (inv->>'subtotal')::integer<>1300 or (inv->>'discount')::integer<>150 or (inv->>'tax')::integer<>50 or (inv->>'total')::integer<>1300 then raise exception 'Invoice mathematics failed: %',inv; end if;
 perform public.save_invoice(b,draft||'{"notes":"Edited before finalizing"}',invoice_id);
 perform public.transition_invoice(invoice_id,'FINALIZE');
 denied:=false; begin perform public.save_invoice(b,draft,invoice_id); exception when sqlstate '22023' then denied:=true; end;
 if not denied then raise exception 'Finalized invoice allowed editing'; end if;
 result:=public.record_invoice_payment(invoice_id,400,'BANK_TRANSFER','qa-payment-reference-1');
 if public.record_invoice_payment(invoice_id,400,'BANK_TRANSFER','qa-payment-reference-1')<>result then raise exception 'Payment retry not idempotent'; end if;
 inv:=public.invoice_document(invoice_id);
 if inv->>'payment_status'<>'PARTIALLY_PAID' or (inv->>'balance')::integer<>900 then raise exception 'Paid/balance mismatch'; end if;
 denied:=false; begin perform public.transition_invoice(invoice_id,'VOID','QA reason'); exception when sqlstate '22023' then denied:=true; end;
 if not denied then raise exception 'Paid invoice voided without refund'; end if;
 result:=public.save_invoice(b,draft||jsonb_build_object('client_reference','qa-reissue-save-retry'));
 if result=invoice_id then raise exception 'New invoice numbering failed'; end if;
 perform public.transition_invoice(result,'VOID','Test reissue');
 invoice_id:=public.transition_invoice(result,'REISSUE');
 if invoice_id=result then raise exception 'Reissue reused original invoice'; end if;
 if public.transition_invoice(result,'REISSUE')<>invoice_id then raise exception 'Reissue retry created a duplicate'; end if;
 inv:=public.invoice_document(invoice_id);
 if inv->>'status'<>'DRAFT' or inv->>'reissued_from'<>result::text then raise exception 'Replacement invoice linkage failed'; end if;
end $$;

select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $$ declare denied boolean:=false; b uuid:='11111111-1111-4111-8111-111111111111'; changed integer;
begin
 if not public.has_permission(b,'pos.use') or not public.has_permission(b,'orders.read') or not public.has_permission(b,'receipts.print') then raise exception 'Exact allowed access missing'; end if;
 if public.has_permission(b,'payments.read') or public.has_permission(b,'orders.manage') or public.has_permission(b,'dashboard.view') then raise exception 'Role preset leaked into exact grants'; end if;
 update public.products set name='Unauthorized' where business_id=b; get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Cashier changed product via RLS'; end if;
 if public.can_manage_media('product-images',b::text||'/products/test.png') then raise exception 'Cashier upload permitted'; end if;
 begin perform public.save_staff_by_email(b,'cashier@example.test','OWNER',true,array[]::text[]); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Cashier escalated role'; end if;
 if (select count(*) from public.payment_transactions where business_id=b)<>0 then raise exception 'Cashier read denied payments'; end if;
end $$;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
do $$ declare changed integer; b uuid:='11111111-1111-4111-8111-111111111111';
begin
 update public.products set name=name where business_id=b; get diagnostics changed=row_count;
 if changed=0 then raise exception 'Products-only staff cannot edit products'; end if;
 update public.categories set name='Unauthorized' where business_id=b; get diagnostics changed=row_count;
 if changed<>0 or public.has_permission(b,'payments.read') then raise exception 'Manager role bypassed exact permissions'; end if;
 if not public.can_manage_media('product-images',b::text||'/products/test.png') or public.can_manage_media('business-logos',b::text||'/logo.png') then raise exception 'Media permission boundaries failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
select public.claim_staff_invitations();
do $$ begin if exists(select 1 from public.staff_memberships where user_id=auth.uid()) then raise exception 'Unverified email activated'; end if; end $$;
reset role;
update auth.users set email_confirmed_at=now() where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
set local role authenticated;
select public.claim_staff_invitations();
select public.claim_staff_invitations();
do $$ begin if not public.has_permission('11111111-1111-4111-8111-111111111111','kds.use') or public.has_permission('11111111-1111-4111-8111-111111111111','orders.manage') then raise exception 'Invitation exact activation failed'; end if; end $$;
reset role;
select 'PASS: exact grants, email resolution, unverified/verified invitation activation, last-owner protection, CMS/Storage RLS, reorder persistence/stale rollback, invoice totals/edit/finalize/void/reissue, payment ledger/idempotency' as result;
rollback;
