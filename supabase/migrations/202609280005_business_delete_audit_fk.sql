begin;
-- The legacy audit_logs table requires a live businesses FK. A hard delete
-- cannot write that row after the parent has gone. Platform Owner deletion
-- records its durable, detached event in platform_audit_logs instead.
drop trigger if exists businesses_audit on public.businesses;
create trigger businesses_audit after insert or update on public.businesses
  for each row execute function public.record_admin_change();
commit;
