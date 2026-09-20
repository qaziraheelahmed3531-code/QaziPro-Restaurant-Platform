begin;

create or replace function public.pos_order_replacement_eligibility(p_order_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'windowMinutes', public.pos_replacement_window_minutes(candidate.business_id),
    'expiresAt', candidate.created_at + make_interval(mins => public.pos_replacement_window_minutes(candidate.business_id)),
    'withinWindow', now() <= candidate.created_at + make_interval(mins => public.pos_replacement_window_minutes(candidate.business_id)),
    'minutesRemaining', greatest(0, ceil(extract(epoch from (
      candidate.created_at + make_interval(mins => public.pos_replacement_window_minutes(candidate.business_id)) - now()
    )) / 60.0)),
    'eligible', candidate.channel = 'POS'
      and candidate.status = 'CONFIRMED'
      and now() <= candidate.created_at + make_interval(mins => public.pos_replacement_window_minutes(candidate.business_id))
      and not exists (
        select 1 from public.pos_order_replacements replacement
        where replacement.order_id = candidate.id
      )
  )
  from public.orders candidate
  where candidate.id = p_order_id
    and public.has_permission(candidate.business_id, 'pos.use');
$$;

revoke all on function public.pos_order_replacement_eligibility(uuid) from public, anon;
grant execute on function public.pos_order_replacement_eligibility(uuid) to authenticated;

commit;
