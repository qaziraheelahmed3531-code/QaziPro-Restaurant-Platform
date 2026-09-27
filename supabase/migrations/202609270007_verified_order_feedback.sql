begin;

-- First-party, private feedback. Existing Google/EmbedSocial widgets are unchanged.
create table public.customer_order_feedback (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 2000),
  status text not null default 'NEW' check (status in ('NEW','REVIEWED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_order_feedback_branch_idx on public.customer_order_feedback(business_id,branch_id,created_at desc);
create trigger customer_order_feedback_updated_at before update on public.customer_order_feedback
for each row execute function public.set_updated_at();
alter table public.customer_order_feedback enable row level security;
revoke all on public.customer_order_feedback from public,anon,authenticated;
grant select on public.customer_order_feedback to authenticated;
grant update(status) on public.customer_order_feedback to authenticated;
grant all on public.customer_order_feedback to service_role;
create policy feedback_staff_read on public.customer_order_feedback for select to authenticated
using (public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'reviews.manage'));
create policy feedback_staff_review on public.customer_order_feedback for update to authenticated
using (public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'reviews.manage'))
with check (public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'reviews.manage'));

-- Only the server can call this after the existing owner/guest-token order
-- authorization. Eligibility and one-review-per-order also hold in the DB.
create function public.submit_verified_order_feedback(p_business_id uuid,p_order_id uuid,p_rating integer,p_comment text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target public.orders; feedback public.customer_order_feedback;
begin
  select * into target from public.orders where id=p_order_id and business_id=p_business_id for share;
  if not found or target.status<>'DELIVERED' then
    raise exception 'Feedback is available after a completed order.' using errcode='22023';
  end if;
  if p_rating is null or p_rating not between 1 and 5 or char_length(coalesce(p_comment,''))>2000 then
    raise exception 'Choose a rating and a comment of at most 2000 characters.' using errcode='22023';
  end if;
  insert into public.customer_order_feedback(business_id,branch_id,order_id,customer_id,rating,comment)
  values(target.business_id,target.branch_id,target.id,target.customer_id,p_rating,btrim(coalesce(p_comment,'')))
  on conflict(order_id) do nothing;
  select * into feedback from public.customer_order_feedback where order_id=target.id;
  return jsonb_build_object('rating',feedback.rating,'comment',feedback.comment,'createdAt',feedback.created_at);
end;
$$;
revoke all on function public.submit_verified_order_feedback(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.submit_verified_order_feedback(uuid,uuid,integer,text) to service_role;
notify pgrst,'reload schema';
commit;
