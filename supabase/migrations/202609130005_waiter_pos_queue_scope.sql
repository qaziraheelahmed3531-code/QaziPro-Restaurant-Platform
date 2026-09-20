begin;

-- Cashiers may read only unpaid/operational waiter orders from a restaurant
-- they are assigned to. Child order rows inherit this through their existing
-- parent-order RLS policies.
create policy waiter_pos_queue_read on public.orders for select to authenticated
using (
  waiter_id is not null
  and public.has_permission(business_id, 'pos.use')
  and public.staff_can_access_branch(business_id, branch_id)
);

-- Management reporting follows the same restaurant assignment boundary.
create or replace function public.waiter_performance(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_permission(p_business_id,'staff.manage') then
    raise exception 'Staff access denied.' using errcode='42501';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(row_data) order by row_data.waiter_name)
    from (
      select
        membership.user_id,
        coalesce(nullif(profile.full_name,''),auth_user.email) waiter_name,
        auth_user.email,
        membership.branch_id,
        concat_ws(' — ',coalesce(branch.restaurant_name,branch.name),branch.city) branch_name,
        count(order_record.id)::integer order_count,
        (count(order_record.id) filter(where order_record.status not in ('DELIVERED','CANCELLED')))::integer active_orders,
        (count(order_record.id) filter(where order_record.status='DELIVERED'))::integer completed_orders,
        coalesce(sum(order_record.total) filter(where order_record.status<>'CANCELLED'),0)::bigint total_sales,
        max(order_record.created_at) last_order_at
      from public.staff_memberships membership
      join auth.users auth_user on auth_user.id=membership.user_id
      left join public.profiles profile on profile.id=membership.user_id
      left join public.branches branch on branch.id=membership.branch_id
      left join public.orders order_record
        on order_record.waiter_id=membership.user_id
       and order_record.branch_id=membership.branch_id
      where membership.business_id=p_business_id
        and membership.role='WAITER'
        and membership.is_active
        and public.staff_can_access_branch(p_business_id,membership.branch_id)
      group by membership.user_id,profile.full_name,auth_user.email,
        membership.branch_id,branch.restaurant_name,branch.name,branch.city
    ) row_data
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.waiter_performance(uuid) from public,anon;
grant execute on function public.waiter_performance(uuid) to authenticated;

commit;
