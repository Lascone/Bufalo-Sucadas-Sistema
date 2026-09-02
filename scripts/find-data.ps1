# Procura arquivos de dados do Bufalo Sucata Gestor no PC (Windows).
# Uso: powershell -File .\scripts\find-data.ps1

$ErrorActionPreference = 'SilentlyContinue'
$appData = $env:APPDATA
Write-Host '=== Bufalo Sucata Gestor — busca de dados ===' -ForegroundColor Cyan
Write-Host ''

$patterns = @('Bufalo', 'ferrogestor', 'Sucata', 'Gestor', 'bufalo')
$dirs = @()
foreach ($p in $patterns) {
  Get-ChildItem -Path $appData -Directory -Filter "*$p*" | ForEach-Object { $dirs += $_.FullName }
}
$dirs = $dirs | Select-Object -Unique

if ($dirs.Count -eq 0) {
  Write-Host "Nenhuma pasta encontrada em $appData" -ForegroundColor Yellow
  Write-Host 'Pastas esperadas (app instalado):'
  Write-Host "  $appData\Bufalo Sucata Gestor\"
  Write-Host "  $appData\@ferrogestor\desktop\  (modo dev)"
  exit 0
}

foreach ($dir in $dirs) {
  Write-Host "--- $dir ---" -ForegroundColor Green
  $checks = @(
    (Join-Path $dir 'data\app-data.json'),
    (Join-Path $dir 'data\ferrogestor-local.db'),
    (Join-Path $dir 'data\sync-queue.json'),
    (Join-Path $dir 'Local Storage\leveldb')
  )
  foreach ($c in $checks) {
    if (Test-Path $c) {
      if (Test-Path $c -PathType Container) {
        $size = (Get-ChildItem $c -Recurse -File | Measure-Object -Property Length -Sum).Sum
        $kb = [math]::Round($size / 1024)
        Write-Host "  [OK] $c  ($kb kilobytes)"
      } else {
        $fi = Get-Item $c
        $kb = [math]::Round($fi.Length / 1024)
        Write-Host "  [OK] $c  ($kb kilobytes, $($fi.LastWriteTime))"
      }
    }
  }
  $backupDir = Join-Path $dir 'backups'
  if (Test-Path $backupDir) {
    Get-ChildItem $backupDir -File | Sort-Object LastWriteTime -Descending | Select-Object -First 5 | ForEach-Object {
      $kb = [math]::Round($_.Length / 1024)
      Write-Host "  [backup] $($_.FullName)  ($kb kilobytes)"
    }
  }
  Write-Host ''
}

Write-Host 'Dica: abra Configuracoes -> Dados locais e recuperacao no app (v0.1.4+)' -ForegroundColor Cyan
