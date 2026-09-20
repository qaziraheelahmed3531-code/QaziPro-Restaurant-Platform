begin;

-- `current_time` is a PostgreSQL keyword returning time-with-time-zone. Using
-- it as a PL/pgSQL variable made the expiry comparison invalid on the real
-- staging database even though the migration itself could be created.
create or replace function public.consume_api_rate_limit(p_key_hash text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare
  current_count integer;
  request_time timestamptz:=clock_timestamp();
begin
  if p_key_hash !~ '^[0-9a-f]{64}$' or p_limit not between 1 and 10000 or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit parameters.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key_hash,0));
  delete from public.api_rate_limit_buckets where key_hash=p_key_hash and expires_at<=request_time;
  insert into public.api_rate_limit_buckets(key_hash,window_started_at,hit_count,expires_at)
  values(p_key_hash,request_time,1,request_time+make_interval(secs=>p_window_seconds))
  on conflict(key_hash) do update set hit_count=public.api_rate_limit_buckets.hit_count+1
  returning hit_count into current_count;
  return current_count<=p_limit;
end;
$$;

revoke all on function public.consume_api_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_api_rate_limit(text,integer,integer) to service_role;

commit;
