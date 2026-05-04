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

# "EQUIPO\usuario" o "DOMINIO\usuario". Solo $env:USERNAME falla en PCs con dominio o cuentas Microsoft.
$taskUserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$server`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $taskUserId -LogonType Interactive -RunLevel LeastPrivilege
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Resto-FADEY: microservicio de impresion ESC/POS (puerto 3049).' | Out-Null

function Test-PrintHealth {
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3049/health' -UseBasicParsing -TimeoutSec 5
    return $r.StatusCode -eq 200
  } catch {
    return $false
  }
}

try {
  Start-ScheduledTask -TaskName $taskName
} catch {
  Write-Host "Aviso: no se pudo iniciar el servicio ahora; se iniciara al iniciar sesion."
}

Start-Sleep -Seconds 4
if (-not (Test-PrintHealth)) {
  try {
    Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  } catch {
    # ignorar
  }
  Start-Sleep -Seconds 3
}

if (-not (Test-PrintHealth)) {
  $logDir = Join-Path $env:LOCALAPPDATA 'RestoFadey'
  if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }
  $logFile = Join-Path $logDir 'print-service-install.txt'
  $msg = @(
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    "El servicio no respondio en http://127.0.0.1:3049/health tras instalar."
    "En Programador de tareas busque la tarea: $taskName"
    "Carpeta del programa: $root"
    "Instale iniciando sesion con el usuario que usara Chrome/Edge para la app (no otro perfil de Windows)."
  ) -join "`r`n"
  Set-Content -Path $logFile -Value $msg -Encoding UTF8
  Write-Host "Aviso: si no imprime, revise: $logFile"
}

Write-Host "Listo. El servicio queda registrado al iniciar sesion en Windows."
