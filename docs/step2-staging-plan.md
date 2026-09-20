# Step 2 staging setup

Production ko direct test target na banayein. Staging ka apna Supabase project, deployments aur secrets hon.

## Environment separation

| Environment | Supabase | Customer/Admin domains | Data |
| --- | --- | --- | --- |
| Local | Supabase CLI | `localhost:3000` / `localhost:3001` | Disposable fixtures |
| Staging | Dedicated staging project | Dedicated preview/staging domains | Synthetic QA data only |
| Production | Existing production project | Live restaurant domains | Real data |

## One-time account actions

1. Supabase dashboard mein **New project** select karke `QaziPro Restaurant Staging` banayein. Production project/database ko reuse na karein.
2. Staging project ka **Project URL** aur **Publishable key** customer/admin staging deployments mein set karein.
3. **Service role key** sirf server-side customer/admin environments mein set karein. Kisi `NEXT_PUBLIC_` variable, browser bundle, Desktop POS ya repository mein na dalein.
4. Auth > URL Configuration mein staging customer/admin URLs add karein. Email templates aur SMTP ko staging sender/domain par configure karein.
5. Storage buckets/policies migrations se create hon; sample assets staging paths mein upload karein, production objects copy na karein.
6. Staging customer domain ke liye `business_domains` row aur har branch ka unique `slug` configure karein. Custom DNS tab tak live na karein jab tak tenant resolution test pass na ho.

## Safe deployment sequence

```text
supabase login
supabase link --project-ref <STAGING_PROJECT_REF>
supabase db push --dry-run
supabase db push
```

Us ke baad staging-only seed/fixtures load karein, CI database suite run karein, phir customer → checkout → POS/Kitchen → invoice flow manually verify karein. Production migration ke liye separate approval, database backup/PITR confirmation aur maintenance window zaroori hai.

## Required staging variables

- Shared public: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Customer server-only: `SUPABASE_SERVICE_ROLE_KEY`, `REVALIDATION_SECRET`, provider/SMTP secrets
- Admin server-only: `SUPABASE_SERVICE_ROLE_KEY`, `REVALIDATION_SECRET`, `CUSTOMER_APP_URL`, `ADMIN_APP_URL`
- Tenant routing: `QAZIPRO_PLATFORM_DOMAIN`; localhost-only slug fallback production mein blank rakhein
- Development-only demo: `ENABLE_DEMO_STOREFRONT=false` outside local development

CI workflow clean local Supabase par migrations, database lint, RLS/adversarial tests aur tamam application builds chalata hai. Staging aur production secrets CI logs mein print nahi hone chahiye.
