# Requires an authenticated Supabase CLI. Does not write credentials to the repo.
param(
  [ValidateSet('staff-save', 'admin', 'super-admin', 'super-admin-browser', 'website-cms-browser', 'website-public', 'website-client-portal', 'ensure-package', 'serve-admin', 'serve-super-admin', 'serve-website')][string]$Suite = 'admin',
  [ValidateRange(0, 65535)][int]$Port = 0,
  [string]$TargetUrl = '',
  [switch]$WithFixtures,
  [switch]$OptimizedBuild
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
      -not ([string]$entries['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']).StartsWith('sb_publishable_')) {
    throw 'Dedicated Admin Vercel environment is not the linked staging Supabase project.'
  }
}

$previousErrorPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$raw = (& npx --yes --offline supabase projects api-keys --project-ref $expectedRef --reveal --output-format json 2>$null | Out-String)
$ErrorActionPreference = $previousErrorPreference
if ($LASTEXITCODE -ne 0) { throw 'Staging service key lookup failed.' }
try { $keys = ($raw | ConvertFrom-Json -ErrorAction Stop).keys } catch { throw 'Staging service key response was invalid.' }
$serviceKey = ($keys | Where-Object { $_.type -eq 'secret' } | Select-Object -First 1).api_key
if (-not $serviceKey) { throw 'Staging service key unavailable.' }
$stagingUrl = "https://$expectedRef.supabase.co"
$publicKey = ($keys | Where-Object { $_.type -eq 'publishable' } | Select-Object -First 1).api_key
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
$env:STAGING_QA_PASSWORD = "Qa!$([guid]::NewGuid().ToString('N'))a9"
$target = if ($TargetUrl) { $TargetUrl.TrimEnd('/') } else { '' }
$targetHost = if ($target) { ([uri]$target).Host } else { '' }
$knownStagingDeployment = $targetHost -in @('qazi-pro-restaurant-platform-super.vercel.app','qazi-pro-restaurant-platform-admin.vercel.app') -or $targetHost -match '^qazi-pro-restaurant-platform-(super-admin|admin)-[a-z0-9]+\.vercel\.app$'
if ($target -and $targetHost -notin @('localhost','127.0.0.1') -and $targetHost -notmatch 'staging' -and -not $knownStagingDeployment) {
  throw 'Acceptance may only target localhost or an explicitly named staging host.'
}
$env:STAGING_ADMIN_URL = if ($Suite -in @('admin', 'staff-save') -and $target) { $target } else { 'http://localhost:3101' }
$env:STAGING_SUPER_ADMIN_URL = if (($Suite -like 'super-admin*' -or $Suite -eq 'website-cms-browser') -and $target) { $target } else { 'http://localhost:3102' }
$env:STAGING_WEBSITE_URL = if (($Suite -eq 'website-client-portal' -or $Suite -eq 'serve-website') -and $target) { $target } else { 'http://localhost:3103' }

try {
  if ($WithFixtures -and $Suite -notlike 'serve-*') {
    node (Join-Path $PSScriptRoot 'staging-fixtures.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Fixture provisioning failed.' }
  }
  if ($Suite -eq 'serve-admin' -or $Suite -eq 'serve-super-admin' -or $Suite -eq 'serve-website') {
    if ($Suite -eq 'serve-admin') {
      $env:DEMO_LEADS_ENABLED = '1'
      $env:NEXT_DIST_DIR = '.next-stage-portal'
      $appDirectory = Join-Path $PSScriptRoot '../apps/admin'
      $servePort = if ($Port) { "$Port" } else { '3101' }
    } elseif ($Suite -eq 'serve-super-admin') {
      $env:QAZIPRO_PLATFORM_OWNER_EMAILS = 'qaziraheelahmed3531@gmail.com'
      $servePort = if ($Port) { "$Port" } else { '3102' }
      $env:PLATFORM_ALLOWED_ORIGINS = "localhost:$servePort"
      $env:PLATFORM_PUBLIC_URL = "http://localhost:$servePort"
      $env:RESTAURANT_ADMIN_URL = 'http://localhost:3101'
      $env:NEXT_DIST_DIR = '.next-stage-platform'
      $geoConfigPath = Join-Path $PSScriptRoot '../apps/admin/.env.local'
      if (Test-Path -LiteralPath $geoConfigPath) {
        foreach ($geoName in @('GEOAPIFY_API_KEY','NEXT_PUBLIC_GEOAPIFY_MAPS_KEY')) {
          $geoLine = Get-Content -LiteralPath $geoConfigPath | Where-Object { $_ -match "^$geoName=" } | Select-Object -First 1
          if ($geoLine) { Set-Item -Path "Env:$geoName" -Value ($geoLine.Substring($geoName.Length + 1).Trim('"')) }
        }
      }
      $appDirectory = Join-Path $PSScriptRoot '../apps/super-admin'
    } else {
      $servePort = if ($Port) { "$Port" } else { '3103' }
      $env:PLATFORM_ALLOWED_ORIGINS = "localhost:$servePort"
      $env:NEXT_PUBLIC_SITE_URL = "http://localhost:$servePort"
      $appDirectory = Join-Path $PSScriptRoot '../qazipro-website'
    }
    Push-Location -LiteralPath $appDirectory
    try {
      if ($OptimizedBuild) {
        $env:NEXT_DIST_DIR = '.next-acceptance'
        & npx --yes --offline next build
        if ($LASTEXITCODE -ne 0) { throw 'Optimized staging build failed.' }
        & npx --yes --offline next start -p $servePort
      } else { & npx --yes --offline next dev -p $servePort }
    } finally { Pop-Location }
    exit $LASTEXITCODE
  }
  $acceptanceScript = if ($Suite -eq 'super-admin') { 'super-admin-staging-acceptance.mjs' } elseif ($Suite -eq 'super-admin-browser') { 'super-admin-browser-staging-acceptance.mjs' } elseif ($Suite -eq 'website-cms-browser') { 'website-cms-browser-staging-acceptance.mjs' } elseif ($Suite -eq 'website-public') { 'website-onboarding-live-acceptance.mjs' } elseif ($Suite -eq 'website-client-portal') { 'website-client-portal-staging-acceptance.mjs' } elseif ($Suite -eq 'ensure-package') { 'ensure-super-admin-staging-package.mjs' } else { 'admin-client-portal-staging-acceptance.mjs' }
  if ($Suite -eq 'staff-save') { $acceptanceScript = 'staff-save-staging-acceptance.mjs' }
  node (Join-Path $PSScriptRoot $acceptanceScript)
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  if ($WithFixtures -and $Suite -notlike 'serve-*') {
    node (Join-Path $PSScriptRoot 'cleanup-staging-fixtures.mjs')
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Automatic staging fixture cleanup failed.' }
  }
  Remove-Item Env:STAGING_SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:STAGING_QA_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  $serviceKey = $null
  $raw = $null
}
