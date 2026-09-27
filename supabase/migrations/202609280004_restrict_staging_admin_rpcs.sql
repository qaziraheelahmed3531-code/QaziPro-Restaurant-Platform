begin;
-- Supabase's role-specific default function grants include anon. The
-- SECURITY DEFINER checks already fail closed, but remove that entry too.
revoke all on function public.platform_delete_restaurant(uuid,text,text) from anon;
revoke all on function public.set_branch_waiter_call_enabled(uuid,boolean) from anon;
revoke all on function public.respond_to_table_waiter_request(uuid,text) from anon;
commit;
