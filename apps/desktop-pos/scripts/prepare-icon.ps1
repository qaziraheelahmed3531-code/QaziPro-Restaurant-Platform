$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $projectDir "build\icon.png"
$sourcePath = Join-Path $projectDir "public\qazipro-logo.png"
if (-not (Test-Path -LiteralPath $sourcePath)) { throw "QaziPRO source logo is missing: $sourcePath" }
New-Item -ItemType Directory -Path (Split-Path $iconPath) -Force | Out-Null
Copy-Item -LiteralPath $sourcePath -Destination $iconPath -Force
Write-Output "Prepared the fixed QaziPRO Windows installer icon: $iconPath"
