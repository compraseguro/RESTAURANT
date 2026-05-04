; Inno Setup 6 — instalador para el cliente final (doble clic, sin comandos).
; Requiere Inno Setup 6: https://jrsoftware.org/isinfo.php
; Desde la raíz del repo (recomendado): powershell -File installer\windows\build-installer.ps1
; (genera la carpeta portable y ejecuta ISCC). O: bundle + ISCC manualmente.

#define MyAppName "Resto-FADEY — Servicio de impresión"
#define MyAppVersion "1.0.0"
#define BundleDir "out\RestoFadeyPrint"

[Setup]
AppId={{A7B3E9F1-4C2D-5E6F-8011-A2B3C4D5E6F0}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=Resto-FADEY
DefaultDirName={autopf}\RestoFadey\PrintService
DefaultGroupName=Resto-FADEY
DisableProgramGroupPage=yes
OutputDir=out
OutputBaseFilename=RestoFadey-Print-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64
InfoAfterFile=Para-usuario-final.txt

[Files]
Source: "{#BundleDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Resto-FADEY impresión (inicio manual)"; Filename: "{app}\Iniciar-servicio-oculto.bat"
Name: "{group}\Leer instrucciones"; Filename: "{app}\LEAME.txt"

[Run]
; Sin «postinstall»: se ejecuta siempre al final de copiar archivos, sin casilla que el cliente pueda desmarcar.
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\Install-Autostart.ps1"""; StatusMsg: "Configurando impresión automática…"; Flags: runhidden waituntilterminated
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ""try {{ Start-ScheduledTask -TaskName 'RestoFadeyPrintService' -ErrorAction SilentlyContinue }} catch {{ } }"""; StatusMsg: "Iniciando servicio de impresión…"; Flags: runhidden waituntilterminated
