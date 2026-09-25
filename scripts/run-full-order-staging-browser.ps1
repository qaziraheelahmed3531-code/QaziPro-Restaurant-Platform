<# Runs the current-source, same-order browser gate against disposable staging tenants. #>
param(
  [int]$AdminPort = 3101,
  [string]$AdminUrl = ''
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
$keys = ($raw | ConvertFrom-Json -ErrorAction Stop).keys
$serviceKey = ($keys | Where-Object { $_.type -eq 'secret' } | Select-Object -First 1).api_key
$publicKey = ($keys | Where-Object { $_.type -eq 'publishable' } | Select-Object -First 1).api_key
if (-not $serviceKey -or -not $publicKey) { throw 'Required staging keys are unavailable.' }

$env:STAGING_ENVIRONMENT = 'staging'
$env:STAGING_SUPABASE_URL = "https://$expectedRef.supabase.co"
$env:STAGING_SUPABASE_PUBLISHABLE_KEY = $publicKey
$env:STAGING_SUPABASE_SERVICE_ROLE_KEY = $serviceKey
$env:STAGING_QA_PASSWORD = "Qa!$([guid]::NewGuid().ToString('N'))a9"
$env:STAGING_CUSTOMER_URL = 'https://qazipro-restaurant-a-staging.vercel.app'
$env:STAGING_ADMIN_URL = if ($AdminUrl) { $AdminUrl.TrimEnd('/') } else { "http://localhost:$AdminPort" }
if (([uri]$env:STAGING_ADMIN_URL).Host -notin @('localhost','127.0.0.1') -and ([uri]$env:STAGING_ADMIN_URL).Host -notmatch 'staging') {
  throw 'Admin browser acceptance may only target localhost or an explicitly named staging host.'
}

Push-Location -LiteralPath $repoRoot
try {
  node scripts/staging-fixtures.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Fixture provisioning failed.' }
  node scripts/full-order-staging-browser-acceptance.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Full-order browser acceptance failed.' }
} finally {
  node scripts/cleanup-staging-fixtures.mjs
  if ($LASTEXITCODE -ne 0) { Write-Warning 'Automatic fixture cleanup failed.' }
  Pop-Location
  'STAGING_SUPABASE_SERVICE_ROLE_KEY','STAGING_SUPABASE_PUBLISHABLE_KEY','STAGING_SUPABASE_URL','STAGING_QA_PASSWORD' | ForEach-Object {
    Remove-Item "Env:$_" -ErrorAction SilentlyContinue
  }
  $serviceKey = $null
  $publicKey = $null
  $raw = $null
}
