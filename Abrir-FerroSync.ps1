$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8765/' -TimeoutSec 2 -UseBasicParsing } catch { $response = $null }
if (-not $response) {
  Start-Process -FilePath $nodePath -ArgumentList ('"' + (Join-Path $taskRoot 'server.cjs') + '"') -WorkingDirectory $taskRoot -WindowStyle Hidden
  Start-Sleep -Seconds 2
}
$profilePath = Join-Path $taskRoot 'perfil-demo'
Start-Process -FilePath $edgePath -ArgumentList @('--user-data-dir="' + $profilePath + '"', '--app=http://127.0.0.1:8765/', '--no-first-run')
