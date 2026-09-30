$ErrorActionPreference = "Stop"
$desktopProject = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $desktopProject
try {
  $env:DESKTOP_RELEASE_BUILD = "true"
  $env:DESKTOP_STAGING_BUILD = "true"
  $env:CUSTOMER_APP_URL = "https://qazipro-restaurant-customer-staging.vercel.app"
  $env:ADMIN_APP_URL = "https://admin.staging.qazipro.com"
  # A staging export is never published to the updater. Do not auto-discover
  # an operator's signing certificate or reuse a production feed.
  $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
  $env:DESKTOP_UPDATE_URL = ""
  $env:DESKTOP_UPDATE_PUBLISHER = ""
  & "$PSScriptRoot/prepare-icon.ps1"
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Desktop staging build failed" }
  npx --no-install electron-builder --config.electronDist=../../node_modules/electron/dist --config.directories.output=release-staging --config.win.signExecutable=false --win nsis portable --publish never
  if ($LASTEXITCODE -ne 0) { throw "Desktop staging packaging failed" }
  node scripts/release-manifest.mjs
  if ($LASTEXITCODE -ne 0) { throw "Desktop staging manifest failed" }
} finally { Pop-Location }
