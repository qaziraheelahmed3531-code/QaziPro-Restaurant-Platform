# Incident response and recovery

## Triage

1. Assign severity and incident owner; record environment, component, first seen time, request/deployment IDs and safe symptoms.
2. Protect customers first: disable the affected capability, stop a rollout or route traffic to the previous healthy deployment. Do not disable RLS or leak customer payloads into tickets/logs.
3. Preserve evidence: deployment SHA, provider logs, database metrics, failed request IDs and audit entries. Redact tokens, cookies, contact details and secrets.
4. Determine scope by tenant, branch, channel and release. `UNKNOWN` provider state remains unknown until probed.

## Recovery by component

| Component | Primary recovery | Data consideration |
| --- | --- | --- |
| Customer/Admin/Super Admin/public site | Promote previous verified Vercel deployment | No database rollback for a frontend-only incident |
| Backend/push worker | Roll back previous image/release and pause retry consumer if harmful | Preserve idempotency/outbox records |
| Supabase migration | Stop writers; use reviewed inverse migration or restore backup to controlled recovery project | Never improvise destructive SQL; reconcile writes made after backup |
| Domain/SSL | Restore previous DNS/provider binding | Respect DNS TTL; keep old project available |
| Desktop POS | Withdraw bad installer and restore prior signed release | Offline queues must be preserved and synced idempotently |
| Android/iOS | Halt phased/internal rollout and publish approved rollback/fix | Server API remains backward-compatible with released clients |

## Tenant/security incidents

For suspected cross-tenant access, immediately disable the affected route/RPC or deployment, preserve logs, rotate exposed credentials, identify every accessed tenant/record, verify RLS/policies with adversarial tests and obtain legal/business guidance before notifications. Never “fix” isolation by broadening access.

## Closure

Recovery requires healthy metrics, critical smoke tests, confirmed tenant isolation and stakeholder approval. Record root cause, impact, timeline, remediation, regression test and owner. Convert recurring/provider gaps into monitored checks; do not mark resolved solely because the UI loads.
