# Bufalo Sucata Gestor - modo desenvolvimento
# Mata instancias antigas ao iniciar e ao fechar (Ctrl+C / fechar janela).
# Sempre pede login no menu de usuarios apos um start limpo do Electron.
#
#   powershell -ExecutionPolicy Bypass -File .\iniciar-dev.ps1
#   powershell -ExecutionPolicy Bypass -File .\iniciar-dev.ps1 -All
#   powershell -ExecutionPolicy Bypass -File .\iniciar-dev.ps1 -KeepSession

param(
  [switch]$All,
  [switch]$SkipInstall,
  [switch]$KeepSession
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando '$Name' nao encontrado. Instale Node 20+ e pnpm (npm i -g pnpm)."
  }
}

function Stop-BufaloDevProcesses {
  Write-Host '==> Encerrando processos DEV anteriores...' -ForegroundColor DarkYellow

  # Porta do Vite (5173)
  try {
    $pids = @(
      Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    )
    foreach ($procId in $pids) {
      if ($procId -and $procId -gt 0) {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      }
    }
  } catch { }

  $markers = @(
    'Bufalo Sucadas',
    'Bufalo Sucatas',
    'ferrogestor',
    'apps\desktop',
    'apps/desktop',
    'vite-plugin-electron',
    'dist-electron'
  )

  try {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object {
        $_.Name -match '^(node|electron|pnpm)(\.exe)?$' -and
        -not [string]::IsNullOrWhiteSpace($_.CommandLine)
      } |
      ForEach-Object {
        $cmd = $_.CommandLine
        $hit = $false
        foreach ($m in $markers) {
          if ($cmd -like ("*{0}*" -f $m)) { $hit = $true; break }
        }
        if ($hit) {
          Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
      }
  } catch { }

  Start-Sleep -Milliseconds 500
}

Assert-Command 'node'
Assert-Command 'pnpm'

$nodeMajor = [int]((node -v) -replace '^v(\d+).*', '$1')
if ($nodeMajor -lt 20) {
  throw "Node $nodeMajor detectado. Use Node 20 ou superior."
}

$desktopModules = Join-Path $root 'apps\desktop\node_modules'
$rootModules = Join-Path $root 'node_modules'
if (-not $SkipInstall -and (-not (Test-Path $rootModules) -or -not (Test-Path $desktopModules))) {
  Write-Host '==> Instalando dependencias (pnpm install)...' -ForegroundColor Cyan
  pnpm install
}

Stop-BufaloDevProcesses

# Vite embute VITE_* no renderer — forca menu de login no cold start
if ($KeepSession) {
  $env:VITE_BUFALO_KEEP_SESSION = '1'
} else {
  $env:VITE_BUFALO_KEEP_SESSION = '0'
}

Write-Host ''
Write-Host '  Bufalo Sucata Gestor - DEV' -ForegroundColor Yellow
Write-Host "  Pasta: $root" -ForegroundColor DarkGray
if ($KeepSession) {
  Write-Host '  Login: mantendo sessao (-KeepSession)' -ForegroundColor DarkGray
} else {
  Write-Host '  Login: menu de usuarios a cada start limpo' -ForegroundColor DarkGray
}
Write-Host '  Ctrl+C ou fechar esta janela mata Vite/Electron.' -ForegroundColor DarkGray
Write-Host ''

try {
  if ($All) {
    Write-Host '  Modo: desktop + servidor' -ForegroundColor Cyan
    Write-Host ''
    pnpm dev
  } else {
Write-Host '  Modo: desktop (Vite + Electron + API local automática)' -ForegroundColor Cyan
Write-Host '  A API sobe sozinha em dev (localhost:3000). Use -All para pnpm dev paralelo.' -ForegroundColor DarkGray
    Write-Host ''
    pnpm --filter @ferrogestor/desktop dev
  }
}
finally {
  Write-Host ''
  Stop-BufaloDevProcesses
  Write-Host '==> DEV encerrado.' -ForegroundColor Cyan
}
