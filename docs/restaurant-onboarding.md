# Restaurant onboarding runbook

Normal onboarding is performed in Super Admin; do not manually create tenant rows in Supabase.

1. Qualify the lead and record verified contact information.
2. Create/approve the service package, prices, branch/add-on/app charges, taxes, discounts and notes.
3. Start **Onboarding -> New restaurant** with a unique public slug, owner contact and one or more branches.
4. Select entitlements. Keep online ordering, delivery, apps and provider-dependent services disabled until their prerequisites are verified.
5. Add branding, requested domains and purchased mobile identifiers. Never store signing/private keys in platform records.
6. Provision once. The request key makes retry idempotent; the restaurant remains inactive.
7. Prepare versioned legal-approved agreement text and commercial snapshot. Issue the expiring hashed-token link.
8. Client signs; QaziPro reviews and approves. The client cannot edit server-approved commercial values.
9. Configure branch addresses/coordinates, hours, tax, delivery zones/fees, menu, modifiers, promotions, staff and printers.
10. Invite the owner; never request their password. Verify Owner, limited branch staff, Kitchen/Waiter/Rider roles actually used.
11. Configure Customer/Admin domains, SSL and Auth callbacks. Unknown domains must still fail closed.
12. Run staging sync: Admin change -> Website, `/api/v1`, Web/Desktop POS and KDS.
13. Run a controlled COD order through confirmation/preparation/readiness/tracking. Verify reports, audit and branch isolation.
14. Advance only through legal lifecycle transitions: Lead -> Agreement Pending/Onboarding -> Configuration -> Staging -> Client Review -> Ready -> Active.

Provision Restaurant A and B during platform acceptance and deliberately test separation. Activation is blocked by unverified domains, missing required credentials, unapproved agreement, failed critical test or unresolved tenant/security defect. Suspension/cancellation preserves historical data; it never performs automatic destructive deletion.
