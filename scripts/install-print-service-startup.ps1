#Requires -RunAsAdministrator
<#
  Registra una tarea programada para iniciar el microservicio de impresión al iniciar sesión en Windows.
  Uso (PowerShell como administrador), desde la raíz del repo:
    .\scripts\install-print-service-startup.ps1
  Opcional: -RepoRoot "C:\ruta\al\RESTAURANT.DEMO"
#>
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$serverJs = Join-Path $RepoRoot 'print-microservice\server.js'
if (-not (Test-Path $serverJs)) {
  Write-Error "No se encontró print-microservice\server.js en: $RepoRoot"
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$node = if ($nodeCmd) { $nodeCmd.Source } else { $null }
if (-not $node) {
  Write-Error 'Node.js no está en el PATH. Instale Node LTS y vuelva a ejecutar este script.'
}

$taskName = 'RestoFadeyPrintService'
$argList = "`"$serverJs`""

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute $node -Argument $argList -WorkingDirectory (Split-Path $serverJs)
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel LeastPrivilege
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Microservicio local ESC/POS (puerto 3049) para Resto-FADEY.' | Out-Null
Write-Host "Tarea '$taskName' creada. Se ejecutará al iniciar sesión con Node: $node"
Write-Host "Prueba manual: schtasks /Run /TN `"$taskName`""
