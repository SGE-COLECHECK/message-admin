@echo off
REM ============================================================================
REM Script Dinámico para Iniciar Navegadores de WhatsApp (Windows)
REM ============================================================================
REM Este script delega la ejecución al script de Node.js para mayor robustez.
REM ============================================================================

echo.
echo Iniciando script de Node.js...
node "%~dp0start-browsers.js"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Hubo un error al ejecutar el script.
    pause
) else (
    echo.
    echo ✅ Script finalizado correctamente.
    timeout /t 5
)