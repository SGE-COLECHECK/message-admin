#!/bin/bash
# ============================================================================
# Script Dinámico para Iniciar Navegadores de WhatsApp (Linux/macOS)
# ============================================================================
# Este script delega la ejecución al script de Node.js para mayor robustez
# y consistencia con la versión de Windows.
# ============================================================================

# Obtener directorio del script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ejecutar script de Node.js
node "$SCRIPT_DIR/start-browsers.js"