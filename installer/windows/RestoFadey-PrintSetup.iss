; Inno Setup 6 — compilar en Windows con ISCC.exe
; Descarga: https://jrsoftware.org/isinfo.php
; Comando: ISCC.exe installer\windows\RestoFadey-PrintSetup.iss
; Antes: ejecutar build-portable-print-bundle.ps1 para generar out\RestoFadeyPrint\

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

[Files]
Source: "{#BundleDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Iniciar servicio de impresión"; Filename: "{app}\Iniciar-servicio.bat"
Name: "{group}\Instalación — LEAME"; Filename: "{app}\LEAME.txt"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\Install-Autostart.ps1"""; Description: "Registrar servicio al iniciar sesión (recomendado)"; Flags: postinstall waituntilterminated
