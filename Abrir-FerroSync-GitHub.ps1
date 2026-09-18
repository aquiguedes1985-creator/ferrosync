$ErrorActionPreference = 'Stop'
$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path -LiteralPath $edgePath)) { throw 'No se encontró Microsoft Edge en esta computadora.' }
$profilePath = Join-Path $PSScriptRoot 'perfil-github-demo'
Start-Process -FilePath $edgePath -ArgumentList @('--user-data-dir="' + $profilePath + '"', '--app=https://aquiguedes1985-creator.github.io/ferrosync/', '--no-first-run')
