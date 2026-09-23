# Requires an authenticated Supabase CLI. Does not write credentials to the repo.
param(
  [ValidateSet('admin', 'super-admin', 'super-admin-browser', 'serve-admin', 'serve-super-admin')][string]$Suite = 'admin',
  [ValidateRange(0, 65535)][int]$Port = 0
)
$ErrorActionPreference = 'Stop'
$expectedRef = 'jzisqjvroxodvmqxzsob'
$linkedRef = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../supabase/.temp/project-ref') -Raw).Trim()
if ($linkedRef -ne $expectedRef) { throw 'Refusing to run against an unexpected Supabase project.' }

$envFile = Join-Path $env:TEMP 'qazipro-admin-staging-env-20260921/admin.env'
$entries = @{}
if (Test-Path -LiteralPath $envFile) {
  Get-Content -LiteralPath $envFile | ForEach-Object {
    if ($_ -match '^([A-Z_]+)=(.*)$') { $entries[$matches[1]] = $matches[2].Trim('"') }
  }
  if (([uri]$entries['NEXT_PUBLIC_SUPABASE_URL']).Host -ne "$expectedRef.supabase.co" -or
      $entries['APP_ENVIRONMENT'] -ne 'staging' -or
      -not $entries['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']) {
    throw 'Dedicated Admin Vercel environment is not the linked staging Supabase project.'
  }
}

$previousErrorPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$raw = (& npx --yes --offline supabase projects api-keys --project-ref $expectedRef --reveal --output-format json 2>$null | Out-String)
$ErrorActionPreference = $previousErrorPreference
if ($LASTEXITCODE -ne 0) { throw 'Staging service key lookup failed.' }
try { $keys = ($raw | ConvertFrom-Json -ErrorAction Stop).keys } catch { throw 'Staging service key response was invalid.' }
$serviceKey = ($keys | Where-Object { $_.name -eq 'service_role' } | Select-Object -First 1).api_key
if (-not $serviceKey) { throw 'Staging service key unavailable.' }
$stagingUrl = "https://$expectedRef.supabase.co"
$publicKey = if ($entries.ContainsKey('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')) {
  $entries['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']
} else {
  ($keys | Where-Object { $_.name -eq 'anon' } | Select-Object -First 1).api_key
}
if (-not $publicKey) { throw 'Staging public key unavailable.' }

$env:STAGING_SUPABASE_PROJECT_REF = $expectedRef
$env:STAGING_SUPABASE_URL = $stagingUrl
$env:STAGING_SUPABASE_PUBLISHABLE_KEY = $publicKey
$env:STAGING_SUPABASE_SERVICE_ROLE_KEY = $serviceKey
$env:SUPABASE_URL = $stagingUrl
$env:SUPABASE_ANON_KEY = $publicKey
$env:SUPABASE_SERVICE_ROLE_KEY = $serviceKey
$env:NEXT_PUBLIC_SUPABASE_URL = $stagingUrl
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = $publicKey
$env:APP_ENVIRONMENT = 'staging'
$env:NEXT_PUBLIC_APP_ENVIRONMENT = 'staging'
$env:STAGING_ENVIRONMENT = 'staging'
$env:ALLOW_STAGING_ACCEPTANCE = '1'
$env:STAGING_ADMIN_URL = 'http://localhost:3101'
$env:STAGING_SUPER_ADMIN_URL = 'http://localhost:3102'

try {
  if ($Suite -eq 'serve-admin' -or $Suite -eq 'serve-super-admin') {
    if ($Suite -eq 'serve-admin') {
      $env:DEMO_LEADS_ENABLED = '1'
      $env:NEXT_DIST_DIR = '.next-stage-portal'
      $appDirectory = Join-Path $PSScriptRoot '../apps/admin'
      $servePort = if ($Port) { "$Port" } else { '3101' }
    } else {
      $env:QAZIPRO_PLATFORM_OWNER_EMAILS = 'qaziraheelahmed3531@gmail.com'
      $servePort = if ($Port) { "$Port" } else { '3102' }
      $env:PLATFORM_ALLOWED_ORIGINS = "localhost:$servePort"
      $env:PLATFORM_PUBLIC_URL = "http://localhost:$servePort"
      $env:RESTAURANT_ADMIN_URL = 'http://localhost:3101'
      $env:NEXT_DIST_DIR = '.next-stage-platform'
      $appDirectory = Join-Path $PSScriptRoot '../apps/super-admin'
    }
    Push-Location -LiteralPath $appDirectory
    try { & npx --yes --offline next dev -p $servePort } finally { Pop-Location }
    exit $LASTEXITCODE
  }
  $acceptanceScript = if ($Suite -eq 'super-admin') { 'super-admin-staging-acceptance.mjs' } elseif ($Suite -eq 'super-admin-browser') { 'super-admin-browser-staging-acceptance.mjs' } else { 'admin-client-portal-staging-acceptance.mjs' }
  node (Join-Path $PSScriptRoot $acceptanceScript)
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Remove-Item Env:STAGING_SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  $serviceKey = $null
  $raw = $null
}
