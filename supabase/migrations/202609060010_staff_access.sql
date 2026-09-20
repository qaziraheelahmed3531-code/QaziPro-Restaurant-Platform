begin;
alter table public.staff_memberships add column permissions_customized boolean not null default false;
create table public.staff_membership_permissions (
 membership_id uuid not null references public.staff_memberships(id) on delete cascade,
 permission_code text not null references public.admin_permissions(code) on delete cascade,
 primary key(membership_id,permission_code)
);
alter table public.admin_permissions add column permission_group text not null default 'Other';
insert into public.admin_permissions(code,description,permission_group) values
('dashboard.view','View dashboard','Overview'),
('pos.use','POS / Counter','Operations'),
('orders.read','View orders','Operations'),
('orders.manage','Update order status','Operations'),
('receipts.print','Print receipts / tokens','Operations'),
('kds.use','Kitchen','Operations'),
('register.manage','Register / shifts','Operations'),
('products.manage','Products & gallery','Menu'),
('categories.manage','Categories','Menu'),
('modifiers.manage','Modifiers','Menu'),
('deals.manage','Deals','Menu'),
('menu.manage','Availability / all menu management','Menu'),
('inventory.read','View stock & movements','Inventory'),
('inventory.manage','Manage ingredients, recipes, purchases, suppliers & wastage','Inventory'),
('customers.read','Customers & operational notes','Customers'),
('promotions.manage','Coupons / promotions','Customers'),
('branding.manage','Branding / logos','Website'),
('banners.manage','Hero & promotional banners','Website'),
('content.manage','Website content & social links','Website'),
('reviews.manage','Review presentation','Website'),
('delivery.manage','Areas & delivery rules','Delivery'),
('branches.manage','Branches','Delivery'),
('hours.manage','Opening hours','Delivery'),
('payments.read','Payments & transactions','Finance'),
('payments.refund','Refunds','Finance'),
('reports.read','Sales & financial reports','Finance'),
('invoices.read','View invoices','Finance'),
('invoices.create','Create invoices','Finance'),
('invoices.edit','Edit, finalize & void invoices','Finance'),
('staff.manage','Staff & roles','Management'),
('audit.read','Audit logs','Management'),
('notifications.read','Notifications','Management'),
('business.manage','Business profile','Settings'),
('settings.manage','Operating settings, payment configuration & system health','Settings'),
('printing.manage','Invoice & printing settings','Settings')
on conflict(code) do update set description=excluded.description,permission_group=excluded.permission_group;
-- Preserve existing role defaults, and expand the previous broad presets into named modules.
insert into public.admin_role_permissions(role,permission_code)
select r.role,v.code from public.admin_role_permissions r cross join lateral (
 select unnest(case r.permission_code
 when 'menu.manage' then array['products.manage','categories.manage','modifiers.manage','deals.manage','banners.manage','promotions.manage']
 when 'business.manage' then array['branding.manage','content.manage','reviews.manage','delivery.manage','branches.manage','hours.manage']
 when 'orders.manage' then array['orders.read','receipts.print']
 when 'settings.manage' then array['printing.manage']
 else array[]::text[] end) code
) v on conflict do nothing;
insert into public.admin_role_permissions(role,permission_code)
select role,code from unnest(array['OWNER','MANAGER']::public.staff_role[]) role cross join unnest(array['invoices.read','invoices.create','invoices.edit']) code on conflict do nothing;

create or replace function public.has_permission(target_business uuid, requested_permission text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.staff_memberships m where m.business_id=target_business and m.user_id=auth.uid() and m.is_active and (
 m.role='OWNER' or
 (m.permissions_customized and exists(select 1 from public.staff_membership_permissions p where p.membership_id=m.id and p.permission_code=requested_permission)) or
 (not m.permissions_customized and exists(select 1 from public.admin_role_permissions p where p.role=m.role and p.permission_code=requested_permission))
 ));
$$;
create function public.effective_permissions(p_business_id uuid) returns setof text
language sql stable security definer set search_path=public as $$
 select code from public.admin_permissions where public.has_permission(p_business_id,code);
$$;
alter table public.staff_membership_permissions enable row level security;
grant select on public.staff_membership_permissions to authenticated;
create policy membership_permission_read on public.staff_membership_permissions for select to authenticated using(
 exists(select 1 from public.staff_memberships m where m.id=membership_id and (m.user_id=auth.uid() or public.has_permission(m.business_id,'staff.manage')))
);
-- Only the protected commands below can mutate access.
revoke insert,update,delete on public.staff_memberships from authenticated;
create table public.staff_invitations (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 email text not null check(email=lower(btrim(email))), role public.staff_role not null,
 is_active boolean not null default true, permissions text[] not null default '{}',
 status text not null default 'PENDING' check(status in ('PENDING','ACTIVATED')),
 delivery_status text not null default 'NOT_SENT' check(delivery_status in ('NOT_SENT','SENT','FAILED')),
 invited_by uuid not null references auth.users(id), activated_user_id uuid references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(business_id,email)
);
alter table public.staff_invitations enable row level security;
grant select on public.staff_invitations to authenticated;
create policy staff_invitation_read on public.staff_invitations for select to authenticated using(public.has_permission(business_id,'staff.manage'));

create function public.protect_last_owner() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.role='OWNER' and old.is_active and (tg_op='DELETE' or new.role<>'OWNER' or not new.is_active) then
  -- Serializes all owner modifications within the business, including concurrent demotions.
  perform 1 from public.businesses where id=old.business_id for update;
  if not exists(select 1 from public.staff_memberships where business_id=old.business_id and id<>old.id and role='OWNER' and is_active) then
   raise exception 'Keep at least one active owner.' using errcode='22023';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end; $$;
create trigger staff_last_owner before update or delete on public.staff_memberships for each row execute function public.protect_last_owner();

create function public.save_staff_by_email(p_business_id uuid,p_email text,p_role public.staff_role,p_active boolean,p_permissions text[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_id uuid; v_old public.staff_memberships; v_email text:=lower(btrim(p_email)); v_owner boolean; v_code text; v_inv public.staff_invitations;
begin
 perform 1 from public.businesses where id=p_business_id for update;
 if not public.has_permission(p_business_id,'staff.manage') then raise exception 'Staff access denied.' using errcode='42501'; end if;
 select exists(select 1 from public.staff_memberships where business_id=p_business_id and user_id=auth.uid() and role='OWNER' and is_active) into v_owner;
 if v_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' or length(v_email)>254 then raise exception 'Enter a valid employee email.' using errcode='22023'; end if;
 if p_role='OWNER' and not v_owner then raise exception 'Only an owner can assign owner access.' using errcode='42501'; end if;
 foreach v_code in array coalesce(p_permissions,'{}') loop
  if not exists(select 1 from public.admin_permissions where code=v_code) or not public.has_permission(p_business_id,v_code) then raise exception 'You cannot grant that permission.' using errcode='42501'; end if;
 end loop;
 select id into v_user from auth.users where lower(email)=v_email and email_confirmed_at is not null limit 1;
 if v_user is not null then
  select * into v_old from public.staff_memberships where business_id=p_business_id and user_id=v_user;
  if v_old.role='OWNER' and not v_owner then raise exception 'Only owners can change owner access.' using errcode='42501'; end if;
  insert into public.staff_memberships(business_id,user_id,role,is_active,permissions_customized) values(p_business_id,v_user,p_role,p_active,true)
  on conflict(business_id,user_id) do update set role=excluded.role,is_active=excluded.is_active,permissions_customized=true returning id into v_id;
  delete from public.staff_membership_permissions where membership_id=v_id;
  insert into public.staff_membership_permissions select v_id,unnest(coalesce(p_permissions,'{}')) on conflict do nothing;
  update public.staff_invitations set status='ACTIVATED',activated_user_id=v_user,updated_at=now() where business_id=p_business_id and email=v_email;
  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
  values(p_business_id,auth.uid(),case when v_old.id is null then 'STAFF_ACTIVATED' when not p_active then 'STAFF_DEACTIVATED' else 'PERMISSION_CHANGED' end,'staff_memberships',v_id::text,jsonb_build_object('email',v_email,'role',p_role));
  if v_old.id is not null and v_old.role<>p_role then insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id) values(p_business_id,auth.uid(),'ROLE_CHANGED','staff_memberships',v_id::text); end if;
  return jsonb_build_object('status','ACTIVE','id',v_id,'email',v_email);
 end if;
 select * into v_inv from public.staff_invitations where business_id=p_business_id and email=v_email;
 if v_inv.role='OWNER' and not v_owner then raise exception 'Only owners can change owner invitations.' using errcode='42501'; end if;
 insert into public.staff_invitations(business_id,email,role,is_active,permissions,invited_by)
 values(p_business_id,v_email,p_role,p_active,coalesce(p_permissions,'{}'),auth.uid())
 on conflict(business_id,email) do update set role=excluded.role,is_active=excluded.is_active,permissions=excluded.permissions,status='PENDING',updated_at=now()
 returning id into v_id;
 insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
 values(p_business_id,auth.uid(),'STAFF_INVITED','staff_invitations',v_id::text,jsonb_build_object('email',v_email,'role',p_role));
 return jsonb_build_object('status','PENDING','id',v_id,'email',v_email);
end; $$;

create function public.claim_staff_invitations() returns void language plpgsql security definer set search_path=public as $$
declare v_email text; invitation public.staff_invitations; v_id uuid;
begin
 select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if v_email is null then return; end if;
 -- Lock business first, matching staff commands, then invitation: consistent lock order.
 for invitation in select * from public.staff_invitations where email=v_email and status='PENDING' and is_active order by business_id loop
  perform 1 from public.businesses where id=invitation.business_id for update;
  select * into invitation from public.staff_invitations where id=invitation.id and status='PENDING' and is_active for update;
  if not found then continue; end if;
  insert into public.staff_memberships(business_id,user_id,role,is_active,permissions_customized)
  values(invitation.business_id,auth.uid(),invitation.role,true,true) on conflict(business_id,user_id) do nothing returning id into v_id;
  if v_id is not null then
   insert into public.staff_membership_permissions select v_id,unnest(invitation.permissions) on conflict do nothing;
   insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id) values(invitation.business_id,auth.uid(),'STAFF_ACTIVATED','staff_memberships',v_id::text);
  end if;
  update public.staff_invitations set status='ACTIVATED',activated_user_id=auth.uid(),updated_at=now() where id=invitation.id;
 end loop;
end; $$;

create function public.staff_directory(p_business_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.has_permission(p_business_id,'staff.manage') then raise exception 'Staff access denied.' using errcode='42501'; end if;
 return jsonb_build_object('members',coalesce((select jsonb_agg(jsonb_build_object(
 'id',m.id,'email',u.email,'name',u.raw_user_meta_data->>'full_name','role',m.role,'is_active',m.is_active,'created_at',m.created_at,'last_sign_in_at',u.last_sign_in_at,
 'permissions',case when m.role='OWNER' then (select jsonb_agg(code) from public.admin_permissions) when m.permissions_customized then coalesce((select jsonb_agg(permission_code) from public.staff_membership_permissions where membership_id=m.id),'[]') else coalesce((select jsonb_agg(permission_code) from public.admin_role_permissions where role=m.role),'[]') end
 ) order by u.email) from public.staff_memberships m join auth.users u on u.id=m.user_id where m.business_id=p_business_id),'[]'),
 'invitations',coalesce((select jsonb_agg(to_jsonb(i)-'invited_by'-'activated_user_id') from public.staff_invitations i where i.business_id=p_business_id and status='PENDING'),'[]'));
end; $$;

create function public.set_staff_invitation_delivery(p_id uuid,p_status text) returns void language plpgsql security definer set search_path=public as $$
begin
 -- Server service role only: clients cannot claim an email was sent.
 update public.staff_invitations set delivery_status=p_status,updated_at=now() where id=p_id and status='PENDING';
end; $$;
revoke all on function public.set_staff_invitation_delivery(uuid,text) from public,anon,authenticated;
grant execute on function public.set_staff_invitation_delivery(uuid,text) to service_role;

revoke all on function public.effective_permissions(uuid),public.save_staff_by_email(uuid,text,public.staff_role,boolean,text[]),public.claim_staff_invitations(),public.staff_directory(uuid),public.protect_last_owner() from public,anon;
grant execute on function public.effective_permissions(uuid),public.save_staff_by_email(uuid,text,public.staff_role,boolean,text[]),public.claim_staff_invitations(),public.staff_directory(uuid) to authenticated;
commit;
