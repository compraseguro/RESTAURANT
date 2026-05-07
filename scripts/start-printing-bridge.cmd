@echo off
title Resto Fadey - Servicio de impresion (Node)
cd /d "%~dp0\.."
echo [Resto Fadey] Iniciando servidor Node en 127.0.0.1 (puerto por defecto 3001^)...
echo Mantenga esta ventana abierta mientras use la caja / impresion USB.
node server\index.js
if errorlevel 1 (
  echo.
  echo Error al iniciar. Revise que Node.js este instalado y el puerto libre.
  pause
)
