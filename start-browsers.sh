#!/bin/bash

# ============================================================================
# Script Dinámico para Iniciar Navegadores de WhatsApp
# ============================================================================
# Este script lee la configuración desde browsers.config.json y lanza
# automáticamente todos los navegadores habilitados.
#
# Características:
# - Soporte para N navegadores (dinámico)
# - Auto-detección de navegador disponible
# - Modo headless/headed configurable
# - Cross-platform (Linux/macOS)
# ============================================================================

set -e  # Salir si hay errores

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directorio del script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/browsers.config.json"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  🚀 Iniciador Dinámico de Navegadores WhatsApp           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================================================
# Verificar que existe jq para parsear JSON
# ============================================================================
if ! command -v jq &> /dev/null; then
    echo -e "${RED}❌ Error: 'jq' no está instalado.${NC}"
    echo -e "${YELLOW}   Instálalo con: sudo apt install jq (Ubuntu/Debian)${NC}"
    echo -e "${YELLOW}                  brew install jq (macOS)${NC}"
    exit 1
fi

# ============================================================================
# Verificar que existe el archivo de configuración
# ============================================================================
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}❌ Error: No se encontró el archivo de configuración${NC}"
    echo -e "${YELLOW}   Esperado en: $CONFIG_FILE${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Archivo de configuración encontrado: ${BLUE}browsers.config.json${NC}"

# ============================================================================
# Leer configuración
# ============================================================================
HEADLESS=$(jq -r '.headless' "$CONFIG_FILE")
BROWSER_CMD=$(jq -r '.browserExecutable.linux' "$CONFIG_FILE")

echo -e "${GREEN}✓${NC} Modo headless: ${YELLOW}$HEADLESS${NC}"

# ============================================================================
# Detectar navegador disponible
# ============================================================================
BROWSER_FOUND=""

# Intentar con el navegador configurado
if command -v "$BROWSER_CMD" &> /dev/null; then
    BROWSER_FOUND="$BROWSER_CMD"
else
    echo -e "${RED}❌ Error: '$BROWSER_CMD' no encontrado.${NC}"
    echo -e "${YELLOW}   Este script está configurado para usar exclusivamente Microsoft Edge.${NC}"
    echo -e "${YELLOW}   Por favor instálalo o verifica la ruta en browsers.config.json${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Navegador detectado: ${BLUE}$BROWSER_FOUND${NC}"
echo ""

# ============================================================================
# Leer cuentas habilitadas
# ============================================================================
ENABLED_ACCOUNTS=$(jq -c '.accounts[] | select(.enabled == true)' "$CONFIG_FILE")
ACCOUNT_COUNT=$(echo "$ENABLED_ACCOUNTS" | wc -l)

if [ "$ACCOUNT_COUNT" -eq 0 ]; then
    echo -e "${RED}❌ Error: No hay cuentas habilitadas en la configuración${NC}"
    echo -e "${YELLOW}   Edita browsers.config.json y establece 'enabled: true' en al menos una cuenta${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Cuentas habilitadas encontradas: ${YELLOW}$ACCOUNT_COUNT${NC}"
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# ============================================================================
# Lanzar navegadores
# ============================================================================
LAUNCHED=0

while IFS= read -r account; do
    ACCOUNT_ID=$(echo "$account" | jq -r '.id')
    DESCRIPTION=$(echo "$account" | jq -r '.description')
    PORT=$(echo "$account" | jq -r '.debuggingPort')
    
    echo -e "${BLUE}→${NC} Lanzando: ${GREEN}$DESCRIPTION${NC} (${YELLOW}$ACCOUNT_ID${NC})"
    echo -e "  Puerto: ${YELLOW}$PORT${NC}"
    
    # Construir argumentos del navegador
    BROWSER_ARGS=(
        "--remote-debugging-port=$PORT"
        "--remote-debugging-address=0.0.0.0"
        "--user-data-dir=$HOME/message-admin/profiles/$ACCOUNT_ID"
    )
    
    # Agregar modo headless si está habilitado
    if [ "$HEADLESS" = "true" ]; then
        BROWSER_ARGS+=("--headless=new")
        BROWSER_ARGS+=("--disable-gpu")
        echo -e "  Modo: ${YELLOW}headless${NC}"
    else
        echo -e "  Modo: ${YELLOW}headed (con interfaz)${NC}"
    fi
    
    # Lanzar navegador en segundo plano
    "$BROWSER_FOUND" "${BROWSER_ARGS[@]}" &> /dev/null &
    
    LAUNCHED=$((LAUNCHED + 1))
    echo -e "  ${GREEN}✓${NC} Lanzado (PID: $!)"
    echo ""
    
    # Pequeña pausa para evitar conflictos
    sleep 1
    
done <<< "$ENABLED_ACCOUNTS"

# ============================================================================
# Resumen final
# ============================================================================
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}✅ ¡Navegadores lanzados exitosamente!${NC}"
echo -e "   Total de instancias: ${YELLOW}$LAUNCHED${NC}"
echo ""
echo -e "${BLUE}📋 Próximos pasos:${NC}"
echo -e "   1. Espera unos segundos a que los navegadores inicien"
if [ "$HEADLESS" = "false" ]; then
    echo -e "   2. Navega a ${YELLOW}web.whatsapp.com${NC} en cada ventana"
    echo -e "   3. Escanea el código QR con tu teléfono"
fi
echo -e "   4. Inicia la aplicación NestJS: ${YELLOW}npm run start:dev${NC}"
echo ""
echo -e "${BLUE}💡 Tip:${NC} Para agregar más cuentas, edita ${YELLOW}browsers.config.json${NC}"
echo ""