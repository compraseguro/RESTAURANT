<#
  Genera una carpeta portable para usuarios finales (sin codigo fuente del restaurante):
  - node.exe (copiado del Node instalado en la maquina de empaquetado)
  - print-microservice (JS + node_modules de produccion)
  - scripts de inicio automatico

  Ejecutar en Windows, desde la raiz del repo (o cualquier cwd con -RepoRoot):
    powershell -NoProfile -ExecutionPolicy Bypass -File installer\windows\build-portable-print-bundle.ps1

  Salida: installer\windows\out\RestoFadeyPrint\
  Opcional: -Zip  para crear tambien installer\windows\out\RestoFadeyPrint-Win.zip
#>
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [switch]$Zip
)

$ErrorActionPreference = 'Stop'
$srcMicro = Join-Path $RepoRoot 'print-microservice'
if (-not (Test-Path (Join-Path $srcMicro 'server.js'))) {
  Write-Error "No se encontro print-microservice en: $RepoRoot"
}

$outRoot = Join-Path $PSScriptRoot 'out'
$bundle = Join-Path $outRoot 'RestoFadeyPrint'
if (Test-Path $bundle) {
  Remove-Item -LiteralPath $bundle -Recurse -Force
}
New-Item -ItemType Directory -Path $bundle -Force | Out-Null

$files = @('server.js', 'escpos.js', 'sendOutput.js', 'raw-windows-print.ps1', 'package.json', 'package-lock.json')
foreach ($f in $files) {
  $p = Join-Path $srcMicro $f
  if (Test-Path $p) {
    Copy-Item -LiteralPath $p -Destination (Join-Path $bundle $f) -Force
  }
}

Push-Location $bundle
try {
  npm ci --omit=dev --no-audit --no-fund
} finally {
  Pop-Location
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Error 'Node.js debe estar en el PATH para copiar node.exe al paquete.'
}
$nodeSource = $nodeCmd.Source
$nodeDir = Split-Path -Parent $nodeSource
$nodeExe = Join-Path $nodeDir 'node.exe'
if (-not (Test-Path $nodeExe)) {
  Write-Error "No se encontro node.exe junto a $($nodeCmd.Source)"
}
Copy-Item -LiteralPath $nodeExe -Destination (Join-Path $bundle 'node.exe') -Force

Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Install-Autostart.template.ps1') -Destination (Join-Path $bundle 'Install-Autostart.ps1') -Force

@'
@echo off
title Resto-FADEY impresion
cd /d "%~dp0"
start "Resto-FADEY print" /MIN node.exe server.js
'@ | Set-Content -Path (Join-Path $bundle 'Iniciar-servicio-oculto.bat') -Encoding ASCII

@'
@echo off
cd /d "%~dp0"
echo Iniciando servicio de impresion (deje esta ventana abierta o use Iniciar-servicio-oculto.bat)...
node.exe server.js
pause
'@ | Set-Content -Path (Join-Path $bundle 'Iniciar-servicio.bat') -Encoding ASCII

$userReadme = @'
=== Resto-FADEY — Servicio de impresión en este PC ===

Si instaló con «RestoFadey-Print-Setup.exe» (recomendado), no tiene que hacer nada de esta carpeta:
el programa ya queda en marcha y se abre solo al encender el equipo.

Si solo recibió esta carpeta (sin .exe): ejecute como administrador «Install-Autostart.ps1» una vez,
o pida a su proveedor el instalador .exe.

En la aplicación web: Menú → Impresora → configure cada máquina. La dirección del servicio suele ser:
http://127.0.0.1:3049
'@
Set-Content -Path (Join-Path $bundle 'LEAME.txt') -Value $userReadme -Encoding UTF8

Write-Host "Paquete listo: $bundle"
Write-Host "Distribuya la carpeta RestoFadeyPrint o comprima out\ como ZIP para su sitio web."

if ($Zip) {
  $zipPath = Join-Path $outRoot 'RestoFadeyPrint-Win.zip'
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Compress-Archive -Path $bundle -DestinationPath $zipPath -Force
  Write-Host "ZIP: $zipPath"
}
