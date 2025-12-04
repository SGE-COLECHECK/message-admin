@echo off
REM ============================================================================
REM Script Dinámico para Iniciar Navegadores de WhatsApp (Windows)
REM ============================================================================
REM Este script lee la configuración desde browsers.config.json y lanza
REM automáticamente todos los navegadores habilitados.
REM
REM Características:
REM - Soporte para N navegadores (dinámico)
REM - Auto-detección de navegador disponible
REM - Modo headless/headed configurable
REM ============================================================================

setlocal enabledelayedexpansion

REM Obtener directorio del script
set "SCRIPT_DIR=%~dp0"
set "CONFIG_FILE=%SCRIPT_DIR%browsers.config.json"

echo.
echo ================================================================
echo   🚀 Iniciador Dinámico de Navegadores WhatsApp
echo ================================================================
echo.

REM ============================================================================
REM Verificar que existe el archivo de configuración
REM ============================================================================
if not exist "%CONFIG_FILE%" (
    echo ❌ Error: No se encontró el archivo de configuración
    echo    Esperado en: %CONFIG_FILE%
    exit /b 1
)

echo ✓ Archivo de configuración encontrado: browsers.config.json

REM ============================================================================
REM Leer configuración usando PowerShell
REM ============================================================================
for /f "delims=" %%i in ('powershell -NoProfile -Command "(Get-Content '%CONFIG_FILE%' | ConvertFrom-Json).headless"') do set "HEADLESS=%%i"
for /f "delims=" %%i in ('powershell -NoProfile -Command "(Get-Content '%CONFIG_FILE%' | ConvertFrom-Json).browserExecutable.windows"') do set "BROWSER_PATH=%%i"

echo ✓ Modo headless: %HEADLESS%

REM ============================================================================
REM Detectar navegador disponible
REM ============================================================================
set "BROWSER_FOUND="

REM Intentar con el navegador configurado
if exist "%BROWSER_PATH%" (
    set "BROWSER_FOUND=%BROWSER_PATH%"
) else (
    echo ❌ Error: '%BROWSER_PATH%' no encontrado.
    echo    Este script está configurado para usar exclusivamente Microsoft Edge.
    echo    Por favor instálalo o verifica la ruta en browsers.config.json
    exit /b 1
)

echo ✓ Navegador detectado: %BROWSER_FOUND%
echo.

REM ============================================================================
REM Contar cuentas habilitadas
REM ============================================================================
for /f %%i in ('powershell -NoProfile -Command "((Get-Content '%CONFIG_FILE%' | ConvertFrom-Json).accounts | Where-Object {$_.enabled -eq $true}).Count"') do set "ACCOUNT_COUNT=%%i"

if "%ACCOUNT_COUNT%"=="0" (
    echo ❌ Error: No hay cuentas habilitadas en la configuración
    echo    Edita browsers.config.json y establece 'enabled: true' en al menos una cuenta
    exit /b 1
)

echo ✓ Cuentas habilitadas encontradas: %ACCOUNT_COUNT%
echo.
echo ================================================================
echo.

REM ============================================================================
REM Lanzar navegadores
REM ============================================================================
set "LAUNCHED=0"

REM Usar PowerShell para iterar sobre cuentas habilitadas
powershell -NoProfile -Command ^
    "$config = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; " ^
    "$enabledAccounts = $config.accounts | Where-Object {$_.enabled -eq $true}; " ^
    "$headless = $config.headless; " ^
    "$browser = '%BROWSER_FOUND%'; " ^
    "foreach ($account in $enabledAccounts) { " ^
        "$id = $account.id; " ^
        "$desc = $account.description; " ^
        "$port = $account.debuggingPort; " ^
        "Write-Host '→ Lanzando:' -NoNewline -ForegroundColor Blue; " ^
        "Write-Host \" $desc\" -NoNewline -ForegroundColor Green; " ^
        "Write-Host \" ($id)\" -ForegroundColor Yellow; " ^
        "Write-Host \"  Puerto: $port\" -ForegroundColor Yellow; " ^
        "$profilePath = \"$env:USERPROFILE\message-admin\profiles\$id\"; " ^
        "$args = @(\"--remote-debugging-port=$port\", \"--user-data-dir=$profilePath\"); " ^
        "if ($headless -eq $true) { " ^
            "$args += '--headless=new'; " ^
            "$args += '--disable-gpu'; " ^
            "Write-Host '  Modo: headless' -ForegroundColor Yellow; " ^
        "} else { " ^
            "Write-Host '  Modo: headed (con interfaz)' -ForegroundColor Yellow; " ^
        "}; " ^
        "$process = Start-Process -FilePath $browser -ArgumentList $args -PassThru -WindowStyle Hidden; " ^
        "Write-Host '  ✓ Lanzado (PID:' $process.Id ')' -ForegroundColor Green; " ^
        "Write-Host ''; " ^
        "Start-Sleep -Seconds 1; " ^
    "}"

REM ============================================================================
REM Resumen final
REM ============================================================================
echo.
echo ================================================================
echo.
echo ✅ ¡Navegadores lanzados exitosamente!
echo    Total de instancias: %ACCOUNT_COUNT%
echo.
echo 📋 Próximos pasos:
echo    1. Espera unos segundos a que los navegadores inicien

if "%HEADLESS%"=="false" (
    echo    2. Navega a web.whatsapp.com en cada ventana
    echo    3. Escanea el código QR con tu teléfono
)

echo    4. Inicia la aplicación NestJS: npm run start:dev
echo.
echo 💡 Tip: Para agregar más cuentas, edita browsers.config.json
echo.

endlocal