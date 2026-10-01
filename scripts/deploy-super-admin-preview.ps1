param([switch]$DryRun)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$projectFile = Join-Path $repoRoot 'apps/super-admin/.vercel/project.json'
if (-not (Test-Path -LiteralPath $projectFile)) {
  throw 'Super Admin Vercel project link is missing.'
}

$project = Get-Content -LiteralPath $projectFile -Raw | ConvertFrom-Json
if ($project.projectName -ne 'qazi-pro-restaurant-platform-super-admin' -or -not $project.projectId) {
  throw 'Refusing to deploy an unexpected Vercel project.'
}

$arguments = @('vercel', 'deploy', '.', '--project', [string]$project.projectId, '--yes')
if ($DryRun) { $arguments += '--dry' }

Push-Location -LiteralPath $repoRoot
try {
  & npx @arguments
  if ($LASTEXITCODE -ne 0) { throw "Super Admin preview deployment failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
}
