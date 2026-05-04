<#
  Genera el instalador .exe para el cliente final (un solo archivo, doble clic).
  Requisitos: Node en PATH, Inno Setup 6 (ISCC.exe).

  Desde la raíz del repo:
    powershell -NoProfile -ExecutionPolicy Bypass -File installer\windows\build-installer.ps1

  Salida: installer\windows\out\RestoFadey-Print-Setup.exe
  Copie ese archivo a: client\public\downloads\RestoFadey-Print-Setup.exe y despliegue el front.
#>
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
& (Join-Path $here 'build-portable-print-bundle.ps1') -RepoRoot (Resolve-Path (Join-Path $here '..\..')).Path

$iscc = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles}\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $iscc) {
  Write-Error "Instale Inno Setup 6 desde https://jrsoftware.org/isinfo.php (necesario para generar el .exe)."
}

Push-Location $here
try {
  & $iscc (Join-Path $here 'RestoFadey-PrintSetup.iss')
} finally {
  Pop-Location
}

$exe = Join-Path $here 'out\RestoFadey-Print-Setup.exe'
if (-not (Test-Path $exe)) {
  Write-Error "No se generó el instalador. Revise los mensajes de ISCC."
}
Write-Host ""
Write-Host "Instalador listo: $exe"
Write-Host "Copie a: client\public\downloads\RestoFadey-Print-Setup.exe"
Write-Host ""
