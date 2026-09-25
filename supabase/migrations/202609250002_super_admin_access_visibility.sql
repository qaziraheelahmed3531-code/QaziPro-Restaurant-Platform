begin;

-- Platform staff need read-only visibility into restaurant access records for
-- Restaurant 360. Existing restaurant-owner policies remain in force.
drop policy if exists platform_staff_invitations_read on public.staff_invitations;
create policy platform_staff_invitations_read
on public.staff_invitations
for select
to authenticated
using (public.has_platform_permission('restaurants.view'));

drop policy if exists platform_staff_memberships_read on public.staff_memberships;
create policy platform_staff_memberships_read
on public.staff_memberships
for select
to authenticated
using (public.has_platform_permission('restaurants.view'));

commit;
