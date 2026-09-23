# Roles and permissions

UI visibility improves usability; database RLS, permission functions and protected server actions are the authorization boundary.

## QaziPro platform staff

| Role | Intended scope |
| --- | --- |
| Platform Owner | All platform permissions, owner-only team overrides and bootstrap governance |
| Super Admin | Restaurant operations and platform configuration except owner-only controls |
| Operations Manager | Restaurant and branch operations |
| Onboarding Manager | Provisioning, agreements and activation readiness |
| Support Engineer | Support queues and approved diagnostic access; no password collection |
| Developer | Technical health and reviewed engineering operations |
| Deployment Manager | Release/domain/app evidence and deployment workflow |
| Billing / Finance | Packages, subscriptions and billing records |
| Sales | Leads, commercial follow-up and agreements |
| Auditor | Read-only oversight and audit access |

Google authentication alone never grants Super Admin access. The session must map to an active `platform_staff` row and effective permission set. A direct deny overrides a role grant. Restaurant staff never qualify for platform access.

## Restaurant staff

| Role | Intended scope |
| --- | --- |
| Owner | All restaurant branches, finance, staff, audit and setup |
| Manager | Assigned operations, menu, customers, inventory, reports and permitted settings/refunds |
| Cashier | Assigned-branch POS, orders, receipts and register |
| Kitchen | Assigned-branch KDS and legal preparation transitions |
| Waiter | Assigned branch/table ordering only when enabled |
| Rider | Assigned delivery jobs and permitted delivery transitions only when enabled |
| Inventory staff | Assigned-branch inventory operations |
| Reporting-only | Scoped report reads, no operational mutation |
| Staff | Explicit/custom limited permissions; not an implicit manager |

Restaurant access requires an active membership, named permission and branch assignment where applicable. Owner access is business-wide. The last active owner guard blocks ordinary removal/demotion; intentional parent tenant deletion is the only cascade exception.

## Customers and guests

Customers can access only their own profile, addresses, favourites, loyalty wallet and private order history. Guest tracking requires the random order token; only its hash is stored. Public catalog access provides no private customer or staff data.

## Verification

The staging suites verify limited staff, multi-branch staff, Restaurant A/B isolation, unauthorized Super Admin denial and server-side permission checks. Production roles must be rechecked with separate least-privilege accounts after deployment.
