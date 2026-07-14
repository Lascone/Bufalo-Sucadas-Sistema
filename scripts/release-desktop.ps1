# Publish Windows installer to GitHub Releases WITHOUT Actions.
# From monorepo root:
#   powershell -File .\scripts\release-desktop.ps1
#   powershell -File .\scripts\release-desktop.ps1 -Version 0.1.2
#
# Requires: pnpm, Node 20+, gh auth login (or $env:GH_TOKEN).

param(
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $env:GH_TOKEN) {
  $env:GH_TOKEN = (gh auth token)
  if (-not $env:GH_TOKEN) {
    throw "Set GH_TOKEN or run 'gh auth login' first."
  }
}

$pkgPath = Join-Path $root "apps\desktop\package.json"
$pkgRaw = Get-Content $pkgPath -Raw -Encoding UTF8
$pkg = $pkgRaw | ConvertFrom-Json

if ($Version) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  $pkgRaw = $pkgRaw -replace '"version":\s*"[^"]+"', ("`"version`": `"$Version`"")
  [System.IO.File]::WriteAllText($pkgPath, $pkgRaw, $utf8NoBom)
  $shared = Join-Path $root "packages\shared\src\constants.ts"
  $sharedRaw = Get-Content $shared -Raw -Encoding UTF8
  $sharedRaw = $sharedRaw -replace "APP_VERSION = '[^']+'", "APP_VERSION = '$Version'"
  [System.IO.File]::WriteAllText($shared, $sharedRaw, $utf8NoBom)
  Write-Host "Version set to $Version"
  $pkg = $pkgRaw | ConvertFrom-Json
}

$ver = $pkg.version
Write-Host "==> Shared build"
pnpm --filter @ferrogestor/shared build
if ($LASTEXITCODE -ne 0) { throw "shared build failed" }

Write-Host "==> Desktop build $ver"
Set-Location (Join-Path $root "apps\desktop")
pnpm build
if ($LASTEXITCODE -ne 0) { throw "desktop build failed" }

if (-not (Test-Path "dist\index.html")) {
  throw "dist/index.html missing - incomplete build"
}

Write-Host "==> electron-builder --publish always"
pnpm exec electron-builder --win nsis --publish always
if ($LASTEXITCODE -ne 0) { throw "electron-builder publish failed" }

Write-Host ""
Write-Host "OK. Release v$ver published (Setup.exe + latest.yml)."
Write-Host "At Sucatas: open the INSTALLED app -> Settings -> Check for updates."
Write-Host "Dev mode (pnpm dev) does NOT update via this path."
