# Staff permissions

Permissions are enforced in both Admin server routes and PostgreSQL/RLS.

| Role | Intended access |
| --- | --- |
| OWNER | All business, finance, staff, audit and setup capabilities |
| MANAGER | Operations, menu, customers, inventory, reports and permitted refunds/settings |
| CASHIER | POS, orders, receipts and register operations; limited customer lookup |
| KITCHEN | Kitchen display and preparation status actions only |
| STAFF | Legacy/configurable limited order access |

The sidebar is filtered for usability, but it is not the authorization boundary. `staff_memberships` must be active and every protected operation checks a named permission. Security-definer RPCs repeat those checks before financial, stock or order mutations. RLS prevents customers from reading unrelated orders and restricts staff tables by business.

Owner checklist: deactivate departed users immediately, review audit logs, avoid shared accounts, verify cashier/kitchen access in separate sessions, and never assign a customer account to staff accidentally.
