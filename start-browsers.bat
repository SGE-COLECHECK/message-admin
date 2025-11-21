@echo off
REM --- Script para iniciar los navegadores para las cuentas de WhatsApp en Windows ---

echo.
echo =================================================================
echo  Lanzando navegadores para las cuentas de WhatsApp...
echo =================================================================
echo.

REM --- CONFIGURACION ---
REM Asegurate de que esta ruta a Edge sea la correcta en tu sistema.
set "EDGE_CMD=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

REM --- Cuenta 1: IE Guillermo ---
echo -> Lanzando perfil 'ieguillermo' en el puerto 9222...
start "" "%EDGE_CMD%" --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\message-admin\profiles\ieguillermo"

REM --- Cuenta 2: IE Independencia ---
echo -> Lanzando perfil 'ieindependencia' en el puerto 9223...
start "" "%EDGE_CMD%" --remote-debugging-port=9223 --user-data-dir="%USERPROFILE%\message-admin\profiles\ieindependencia"

echo.
echo ✅ ¡Navegadores lanzados! Ahora puedes iniciar la aplicacion NestJS.