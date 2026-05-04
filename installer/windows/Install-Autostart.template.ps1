#Requires -RunAsAdministrator
# Instalado junto al microservicio portable. Registra inicio al iniciar sesión.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = Join-Path $root 'node.exe'
$server = Join-Path $root 'server.js'
if (-not (Test-Path $server)) {
  Write-Error "No se encontro server.js en $root"
}
if (-not (Test-Path $node)) {
  Write-Error "No se encontro node.exe en $root. Reinstale el paquete de impresion."
}

$taskName = 'RestoFadeyPrintService'
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$server`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel LeastPrivilege
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Resto-FADEY: microservicio de impresion ESC/POS (puerto 3049).' | Out-Null
Write-Host "Listo. El servicio se iniciara al iniciar sesion. Prueba: schtasks /Run /TN `"$taskName`""
