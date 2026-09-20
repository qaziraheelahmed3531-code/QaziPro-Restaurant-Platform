begin;
create table public.invoice_settings (
 business_id uuid primary key references public.businesses(id),
 logo_url text, business_name text not null default 'Italian Pizza', address text, phone text, email text, tax_number text,
 show_logo boolean not null default true, show_address boolean not null default true, show_phone boolean not null default true,
 show_tax boolean not null default true, show_customer_address boolean not null default true, show_payment_status boolean not null default true,
 show_terms boolean not null default true, thank_you text not null default 'Thank you for choosing Italian Pizza!',
 terms text, footer_text text, invoice_prefix text not null default 'IP-INV' check(invoice_prefix ~ '^[A-Z0-9-]{1,20}$'),
 currency text not null default 'PKR' check(currency='PKR'), updated_at timestamptz not null default now()
);
insert into public.invoice_settings(business_id,business_name,address,phone,email,logo_url)
select b.id,b.name,b.address,b.phone,b.email,br.logo_url from public.businesses b left join public.business_branding br on br.business_id=b.id;
create table public.invoice_sequences (
 business_id uuid not null references public.businesses(id), invoice_year integer not null, next_value integer not null,
 primary key(business_id,invoice_year)
);
create table public.invoices (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 branch_id uuid not null references public.branches(id), order_id uuid references public.orders(id),
 client_reference text, order_number text, invoice_number text not null, invoice_date date not null default current_date, due_date date,
 customer_name text not null, customer_phone text, customer_email text, billing_address text,
 status text not null default 'DRAFT' check(status in ('DRAFT','FINALIZED','VOID')),
 subtotal integer not null default 0 check(subtotal>=0), discount integer not null default 0 check(discount>=0),
 tax integer not null default 0 check(tax>=0), charges integer not null default 0 check(charges>=0),
 total integer not null default 0 check(total>=0),
 notes text, terms text, template_snapshot jsonb not null default '{}', void_reason text, reissued_from uuid references public.invoices(id),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), finalized_at timestamptz, voided_at timestamptz,
 unique(business_id,invoice_number), unique(business_id,client_reference), check(due_date is null or due_date>=invoice_date)
);
create unique index one_active_invoice_per_order on public.invoices(order_id) where status<>'VOID' and order_id is not null;
create index invoice_search_business_date on public.invoices(business_id,invoice_date desc);
create table public.invoice_lines (
 id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.invoices(id) on delete restrict,
 description text not null check(length(btrim(description)) between 1 and 1000),
 quantity numeric(12,3) not null check(quantity>0 and quantity<=100000), unit_price integer not null check(unit_price>=0),
 discount integer not null default 0 check(discount>=0), tax integer not null default 0 check(tax>=0),
 line_total integer not null check(line_total>=0), sort_order integer not null
);
-- Reuse the existing ledger. A transaction belongs to exactly one order OR a standalone invoice.
alter table public.payment_transactions alter column order_id drop not null;
alter table public.payment_transactions add column invoice_id uuid references public.invoices(id) on delete restrict;
alter table public.payment_transactions add constraint payment_one_document check(num_nonnulls(order_id,invoice_id)=1);
alter table public.refunds alter column order_id drop not null;
create index payment_invoice_index on public.payment_transactions(invoice_id);
create function public.invoice_paid(p_id uuid) returns integer language sql stable security definer set search_path=public as $$
 select greatest(0,coalesce(sum(p.amount-coalesce((select sum(r.amount) from public.refunds r where r.payment_id=p.id and r.status='SUCCEEDED'),0)),0))::integer
 from public.payment_transactions p join public.invoices i on i.id=p_id
 where ((i.order_id is not null and p.order_id=i.order_id) or (i.order_id is null and p.invoice_id=i.id))
 and p.status in ('PAID','PARTIALLY_REFUNDED','REFUNDED');
$$;
-- Internal financial helper is never directly callable by clients.
revoke all on function public.invoice_paid(uuid) from public,anon,authenticated;

create function public.invoice_document(p_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare inv public.invoices; paid integer;
begin
 select * into inv from public.invoices where id=p_id;
 if not found or not public.has_permission(inv.business_id,'invoices.read') then raise exception 'Invoice access denied.' using errcode='42501'; end if;
 paid:=public.invoice_paid(inv.id);
 return to_jsonb(inv)||jsonb_build_object('paid',paid,'balance',greatest(0,inv.total-paid),
 'payment_status',case when paid>=inv.total and inv.status<>'DRAFT' then 'PAID' when paid>0 then 'PARTIALLY_PAID' else 'UNPAID' end,
 'lines',coalesce((select jsonb_agg(to_jsonb(l) order by sort_order) from public.invoice_lines l where invoice_id=inv.id),'[]'),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'method',p.payment_method,'status',p.status,'created_at',p.created_at) order by p.created_at) from public.payment_transactions p where (inv.order_id is not null and p.order_id=inv.order_id) or (inv.order_id is null and p.invoice_id=inv.id)),'[]'));
end; $$;

create function public.invoice_list(p_business_id uuid,p_search text default '',p_status text default '',p_from date default null,p_to date default null,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.has_permission(p_business_id,'invoices.read') then raise exception 'Invoice access denied.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(row_data order by row_data->>'created_at' desc) from (
 select to_jsonb(i)||jsonb_build_object('paid',public.invoice_paid(i.id),'balance',greatest(0,i.total-public.invoice_paid(i.id)),
 'payment_status',case when public.invoice_paid(i.id)>=i.total and i.status<>'DRAFT' then 'PAID' when public.invoice_paid(i.id)>0 then 'PARTIALLY_PAID' else 'UNPAID' end) row_data
 from public.invoices i where i.business_id=p_business_id
 and (coalesce(p_status,'')='' or i.status=p_status or (p_status='PAID' and i.status<>'DRAFT' and public.invoice_paid(i.id)>=i.total) or (p_status='PARTIALLY_PAID' and public.invoice_paid(i.id)>0 and public.invoice_paid(i.id)<i.total) or (p_status='UNPAID' and public.invoice_paid(i.id)=0))
 and (coalesce(p_search,'')='' or concat_ws(' ',invoice_number,order_number,customer_name,customer_phone) ilike '%'||left(p_search,100)||'%')
 and (p_from is null or invoice_date>=p_from) and (p_to is null or invoice_date<=p_to)
 order by i.created_at desc limit 51 offset greatest(0,least(p_offset,100000))
 ) s),'[]');
end; $$;

create function public.guard_finalized_invoice() returns trigger language plpgsql set search_path=public as $$
begin
 if old.status in ('FINALIZED','VOID') and
 (to_jsonb(new)-array['status','void_reason','voided_at','updated_at']) is distinct from (to_jsonb(old)-array['status','void_reason','voided_at','updated_at']) then
 raise exception 'Finalized invoices cannot be rewritten. Void and reissue instead.' using errcode='22023'; end if;
 if old.status='VOID' or (old.status='FINALIZED' and new.status not in ('FINALIZED','VOID')) then raise exception 'Invalid invoice transition.' using errcode='22023'; end if;
 return new;
end; $$;
create trigger invoice_immutable before update on public.invoices for each row execute function public.guard_finalized_invoice();
create function public.guard_invoice_lines() returns trigger language plpgsql set search_path=public as $$
begin
 if exists(select 1 from public.invoices where id=case when tg_op='DELETE' then old.invoice_id else new.invoice_id end and status<>'DRAFT') then
 raise exception 'Finalized invoice lines cannot be changed.' using errcode='22023'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end; $$;
create trigger invoice_lines_immutable before insert or update or delete on public.invoice_lines for each row execute function public.guard_invoice_lines();

create function public.save_invoice(p_business_id uuid,p_draft jsonb,p_id uuid default null,p_order_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare inv public.invoices; source_order public.orders; line jsonb; v_id uuid; seq integer; yr integer;
 settings public.invoice_settings; base integer; line_discount integer; line_tax integer; quantity numeric; unit integer; pos integer:=0;
 v_subtotal integer:=0; v_discount integer:=0; v_tax integer:=0; v_charges integer:=0; v_date date;
begin
 perform 1 from public.businesses where id=p_business_id for update;
 if not public.has_permission(p_business_id,case when p_id is null then 'invoices.create' else 'invoices.edit' end) then raise exception 'Invoice access denied.' using errcode='42501'; end if;
 if p_id is null and p_order_id is null and nullif(p_draft->>'client_reference','') is not null then
  select id into v_id from public.invoices where business_id=p_business_id and client_reference=p_draft->>'client_reference';
  if v_id is not null then return v_id; end if;
 end if;
 if p_id is not null then
  select * into inv from public.invoices where id=p_id and business_id=p_business_id for update;
  if not found or inv.status<>'DRAFT' or inv.order_id is not null then raise exception 'Only manual drafts can be edited.' using errcode='22023'; end if;
 end if;
 select * into settings from public.invoice_settings where business_id=p_business_id;
 if not found then raise exception 'Configure invoice settings first.' using errcode='22023'; end if;
 if p_order_id is not null then
  select * into source_order from public.orders where id=p_order_id and business_id=p_business_id;
  if not found then raise exception 'Order not found.' using errcode='22023'; end if;
  select id into v_id from public.invoices where order_id=p_order_id and status<>'VOID';
  if v_id is not null then return v_id; end if;
  p_draft:=jsonb_build_object('branch_id',source_order.branch_id,'customer_name',source_order.customer_name,'customer_phone',source_order.customer_phone,'customer_email',source_order.customer_email,'billing_address',source_order.delivery_address,
  'invoice_date',(source_order.created_at at time zone 'Asia/Karachi')::date,'charges',source_order.delivery_fee,'discount',source_order.discount,'tax',source_order.tax,
  'lines',(select jsonb_agg(jsonb_build_object('description',i.product_name||coalesce((select ' · '||string_agg(m.group_name||': '||m.option_name,', ' order by m.created_at) from public.order_item_modifiers m where m.order_item_id=i.id),''),
  'quantity',i.quantity,'unit_price',i.unit_price,'discount',0,'tax',0)) from public.order_items i where i.order_id=p_order_id));
 end if;
 if not exists(select 1 from public.branches where id=(p_draft->>'branch_id')::uuid and business_id=p_business_id) then raise exception 'Select a branch belonging to this business.' using errcode='22023'; end if;
 if length(btrim(coalesce(p_draft->>'customer_name',''))) not between 1 and 200 then raise exception 'Customer name is required.' using errcode='22023'; end if;
 if jsonb_typeof(p_draft->'lines')<>'array' or coalesce(jsonb_array_length(p_draft->'lines'),0) not between 1 and 100 then raise exception 'Add between 1 and 100 invoice items.' using errcode='22023'; end if;
 v_date:=coalesce(nullif(p_draft->>'invoice_date','')::date,(now() at time zone 'Asia/Karachi')::date); yr:=extract(year from now() at time zone 'Asia/Karachi');
 if p_id is null then
  insert into public.invoice_sequences values(p_business_id,yr,2) on conflict(business_id,invoice_year) do update set next_value=public.invoice_sequences.next_value+1 returning next_value-1 into seq;
  insert into public.invoices(business_id,branch_id,order_id,order_number,invoice_number,customer_name,created_by,reissued_from,client_reference)
  values(p_business_id,(p_draft->>'branch_id')::uuid,p_order_id,source_order.order_number,settings.invoice_prefix||'-'||yr||'-'||lpad(seq::text,greatest(6,length(seq::text)),'0'),p_draft->>'customer_name',auth.uid(),null,nullif(p_draft->>'client_reference',''))
  returning * into inv;
 end if;
 delete from public.invoice_lines where invoice_id=inv.id;
 for line in select * from jsonb_array_elements(p_draft->'lines') loop
  quantity:=(line->>'quantity')::numeric; unit:=(line->>'unit_price')::integer;
  line_discount:=coalesce((line->>'discount')::integer,0); line_tax:=coalesce((line->>'tax')::integer,0); base:=round(quantity*unit);
  if quantity is null or quantity<>round(quantity,3) or quantity<=0 or unit is null or unit<0 or line_discount<0 or line_discount>base or line_tax<0 then raise exception 'Check item quantity, unit price, discount and tax.' using errcode='22023'; end if;
  pos:=pos+1;
  insert into public.invoice_lines(invoice_id,description,quantity,unit_price,discount,tax,line_total,sort_order)
  values(inv.id,left(btrim(line->>'description'),1000),quantity,unit,line_discount,line_tax,base-line_discount+line_tax,pos);
  v_subtotal:=v_subtotal+base; v_discount:=v_discount+line_discount; v_tax:=v_tax+line_tax;
 end loop;
 v_discount:=v_discount+coalesce((p_draft->>'discount')::integer,0); v_tax:=v_tax+coalesce((p_draft->>'tax')::integer,0);
 v_charges:=coalesce((p_draft->>'charges')::integer,0);
 if v_discount>v_subtotal or coalesce((p_draft->>'discount')::integer,0)<0 or coalesce((p_draft->>'tax')::integer,0)<0 then raise exception 'Discount cannot exceed subtotal; tax cannot be negative.' using errcode='22023'; end if;
 if p_order_id is not null and v_subtotal-v_discount+v_tax+v_charges<>source_order.total then raise exception 'Order total mismatch; invoice creation stopped.' using errcode='22023'; end if;
 update public.invoices set invoice_date=v_date,due_date=nullif(p_draft->>'due_date','')::date,
 branch_id=(p_draft->>'branch_id')::uuid,customer_name=left(btrim(p_draft->>'customer_name'),200),customer_phone=left(p_draft->>'customer_phone',50),
 customer_email=left(p_draft->>'customer_email',254),billing_address=left(p_draft->>'billing_address',2000),notes=left(p_draft->>'notes',4000),
 terms=coalesce(left(p_draft->>'terms',4000),settings.terms),subtotal=v_subtotal,discount=v_discount,tax=v_tax,charges=v_charges,total=v_subtotal-v_discount+v_tax+v_charges,
 template_snapshot=to_jsonb(settings),updated_at=now(),status=case when p_order_id is not null then 'FINALIZED' else 'DRAFT' end,
 finalized_at=case when p_order_id is not null then now() end where id=inv.id;
 insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id) values(p_business_id,auth.uid(),case when p_order_id is not null then 'INVOICE_FINALIZED' else 'INVOICE_SAVED' end,'invoices',inv.id::text);
 return inv.id;
end; $$;

create function public.transition_invoice(p_id uuid,p_action text,p_reason text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare inv public.invoices; v_id uuid; v_draft jsonb;
begin
 select * into inv from public.invoices where id=p_id;
 if not found or not public.has_permission(inv.business_id,'invoices.edit') then raise exception 'Invoice editing access denied.' using errcode='42501'; end if;
 perform 1 from public.businesses where id=inv.business_id for update;
 select * into inv from public.invoices where id=p_id for update;
 if p_action='FINALIZE' and inv.status='DRAFT' then
  if not exists(select 1 from public.invoice_lines where invoice_id=p_id) then raise exception 'Add invoice items first.' using errcode='22023'; end if;
  update public.invoices set status='FINALIZED',finalized_at=now(),updated_at=now() where id=p_id;
 elsif p_action='VOID' and inv.status in ('DRAFT','FINALIZED') then
  if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Enter a reason for voiding.' using errcode='22023'; end if;
  if public.invoice_paid(p_id)>0 then raise exception 'Refund the payment before voiding this invoice.' using errcode='22023'; end if;
  update public.invoices set status='VOID',void_reason=left(p_reason,1000),voided_at=now(),updated_at=now() where id=p_id;
 elsif p_action='REISSUE' and inv.status='VOID' then
  if not public.has_permission(inv.business_id,'invoices.create') then raise exception 'Invoice creation access denied.' using errcode='42501'; end if;
  if inv.order_id is not null then v_id:=public.save_invoice(inv.business_id,'{}',null,inv.order_id);
  else
   v_draft:=to_jsonb(inv)||jsonb_build_object('discount',inv.discount-(select sum(discount) from public.invoice_lines where invoice_id=p_id),'tax',inv.tax-(select sum(tax) from public.invoice_lines where invoice_id=p_id),'lines',(select jsonb_agg(to_jsonb(l) order by sort_order) from public.invoice_lines l where invoice_id=p_id));
   v_id:=public.save_invoice(inv.business_id,v_draft);
   update public.invoices set reissued_from=p_id where id=v_id;
  end if;
 else raise exception 'This invoice action is not available.' using errcode='22023'; end if;
 insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata) values(inv.business_id,auth.uid(),'INVOICE_'||p_action,'invoices',p_id::text,jsonb_build_object('replacement_id',v_id));
 return coalesce(v_id,p_id);
end; $$;

create function public.record_invoice_payment(p_id uuid,p_amount integer,p_method text,p_reference text)
returns uuid language plpgsql security definer set search_path=public as $$
declare inv public.invoices; v_id uuid; v_shift uuid;
begin
 select * into inv from public.invoices where id=p_id for update;
 if not found or not public.has_permission(inv.business_id,'invoices.edit') then raise exception 'Invoice payment access denied.' using errcode='42501'; end if;
 if inv.status<>'FINALIZED' or inv.order_id is not null then raise exception 'Record order payments through Orders/POS. Only finalized manual invoices accept payments here.' using errcode='22023'; end if;
 if p_method not in ('CASH','BANK_TRANSFER','CARD') or length(btrim(coalesce(p_reference,'')))<8 then raise exception 'Select payment method and provide a unique payment reference.' using errcode='22023'; end if;
 select id into v_id from public.payment_transactions where business_id=inv.business_id and idempotency_key='invoice:'||p_reference;
 if v_id is not null then
  if not exists(select 1 from public.payment_transactions where id=v_id and invoice_id=p_id and amount=p_amount and payment_method=p_method) then raise exception 'Payment reference was already used for different details.' using errcode='22023'; end if;
  return v_id;
 end if;
 if p_amount<=0 or p_amount>inv.total-public.invoice_paid(p_id) then raise exception 'Payment must be positive and no more than the balance.' using errcode='22023'; end if;
 if p_method='CASH' then
  select id into v_shift from public.register_shifts where business_id=inv.business_id and branch_id=inv.branch_id and opened_by=auth.uid() and status='OPEN' for update;
  if v_shift is null then raise exception 'Open your branch register before taking cash.' using errcode='22023'; end if;
 end if;
 insert into public.payment_transactions(business_id,branch_id,invoice_id,shift_id,provider,payment_method,idempotency_key,amount,status,paid_at,metadata_safe)
 values(inv.business_id,inv.branch_id,inv.id,v_shift,'MANUAL_INVOICE',p_method,'invoice:'||p_reference,p_amount,'PAID',now(),jsonb_build_object('recorded_by',auth.uid(),'invoice_number',inv.invoice_number)) returning id into v_id;
 return v_id;
end; $$;

alter table public.invoice_settings enable row level security;
alter table public.invoice_sequences enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
create policy invoice_settings_read on public.invoice_settings for select to authenticated using(public.has_permission(business_id,'invoices.read') or public.has_permission(business_id,'receipts.print') or public.has_permission(business_id,'pos.use'));
create policy invoice_settings_manage on public.invoice_settings for all to authenticated using(public.has_permission(business_id,'printing.manage')) with check(public.has_permission(business_id,'printing.manage'));
create policy invoices_read on public.invoices for select to authenticated using(public.has_permission(business_id,'invoices.read'));
create policy invoice_lines_read on public.invoice_lines for select to authenticated using(exists(select 1 from public.invoices i where i.id=invoice_id));
grant select,insert,update on public.invoice_settings to authenticated;
grant select on public.invoices,public.invoice_lines to authenticated;
revoke all on function public.invoice_document(uuid),public.invoice_list(uuid,text,text,date,date,integer),public.save_invoice(uuid,jsonb,uuid,uuid),public.transition_invoice(uuid,text,text),public.record_invoice_payment(uuid,integer,text,text),public.guard_finalized_invoice(),public.guard_invoice_lines() from public,anon;
grant execute on function public.invoice_document(uuid),public.invoice_list(uuid,text,text,date,date,integer),public.save_invoice(uuid,jsonb,uuid,uuid),public.transition_invoice(uuid,text,text),public.record_invoice_payment(uuid,integer,text,text) to authenticated;
commit;
