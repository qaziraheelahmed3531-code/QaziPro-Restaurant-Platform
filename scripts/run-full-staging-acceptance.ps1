<#
.SYNOPSIS
Runs the disposable public-staging acceptance suites against the linked QaziPro
staging project. Credentials remain process-local and fixtures are removed in a
finally block. This script refuses any project other than the reviewed staging
reference.
#>
param(
  [switch]$SkipExternalLocation = $true
)

$ErrorActionPreference = 'Stop'
$expectedRef = 'jzisqjvroxodvmqxzsob'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$linkedRef = (Get-Content -LiteralPath (Join-Path $repoRoot 'supabase/.temp/project-ref') -Raw).Trim()
if ($linkedRef -ne $expectedRef) { throw 'Refusing to run against an unexpected Supabase project.' }

$previousErrorPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$raw = (& npx --yes --offline supabase projects api-keys --project-ref $expectedRef --reveal --output-format json 2>$null | Out-String)
$ErrorActionPreference = $previousErrorPreference
if ($LASTEXITCODE -ne 0) { throw 'Staging key lookup failed.' }

try { $keys = ($raw | ConvertFrom-Json -ErrorAction Stop).keys } catch { throw 'Staging key response was invalid.' }
$serviceKey = ($keys | Where-Object { $_.name -eq 'service_role' } | Select-Object -First 1).api_key
$publicKey = ($keys | Where-Object { $_.name -eq 'anon' } | Select-Object -First 1).api_key
if (-not $serviceKey -or -not $publicKey) { throw 'Required staging keys are unavailable.' }

$env:STAGING_ENVIRONMENT = 'staging'
$env:STAGING_SUPABASE_URL = "https://$expectedRef.supabase.co"
$env:STAGING_SUPABASE_PUBLISHABLE_KEY = $publicKey
$env:STAGING_SUPABASE_SERVICE_ROLE_KEY = $serviceKey
$env:STAGING_QA_PASSWORD = "Qa!$([guid]::NewGuid().ToString('N'))a9"
$env:PUBLIC_STAGING = 'true'
$env:STAGING_SKIP_EXTERNAL_LOCATION = if ($SkipExternalLocation) { 'true' } else { 'false' }
$env:STAGING_CUSTOMER_URL = 'https://qazipro-restaurant-a-staging.vercel.app'
$env:STAGING_CUSTOMER_B_URL = 'https://qazipro-restaurant-b-staging.vercel.app'
$env:STAGING_UNKNOWN_URL = 'https://qazipro-unknown-staging.vercel.app'
$env:STAGING_UNVERIFIED_URL = 'https://qazipro-unverified-staging.vercel.app'
$env:STAGING_ADMIN_URL = 'https://qazipro-restaurant-admin-staging.vercel.app'
$env:MOBILE_API_BASE_URL = $env:STAGING_CUSTOMER_URL

Push-Location -LiteralPath $repoRoot
try {
  node scripts/staging-fixtures.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Fixture provisioning failed.' }
  node scripts/staging-acceptance.mjs
  if ($LASTEXITCODE -ne 0) { throw 'HTTP/RLS acceptance failed.' }
  node scripts/staging-pos-acceptance.mjs
  if ($LASTEXITCODE -ne 0) { throw 'POS acceptance failed.' }
  node scripts/mobile-api-acceptance.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Mobile API acceptance failed.' }
} finally {
  node scripts/cleanup-staging-fixtures.mjs
  if ($LASTEXITCODE -ne 0) { Write-Warning 'Automatic fixture cleanup failed; run npm run staging:cleanup with staging credentials.' }
  Pop-Location
  'STAGING_SUPABASE_SERVICE_ROLE_KEY','STAGING_SUPABASE_PUBLISHABLE_KEY','STAGING_SUPABASE_URL','STAGING_QA_PASSWORD' | ForEach-Object {
    Remove-Item "Env:$_" -ErrorAction SilentlyContinue
  }
  $serviceKey = $null
  $publicKey = $null
  $raw = $null
}
