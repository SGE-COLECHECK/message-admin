#!/bin/bash

# --- Script para iniciar los navegadores para las cuentas de WhatsApp ---

# --- CONFIGURACIÓN ---
EDGE_CMD="/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"

echo "🚀 Iniciando navegadores para las cuentas de WhatsApp..."
echo ""

# Cuenta 1: IE Guillermo
echo "-> Lanzando perfil 'ieguillermo' en el puerto 9222..."
"$EDGE_CMD" \
  --remote-debugging-port=9222 \
  --remote-debugging-address=0.0.0.0 \
  --user-data-dir="$HOME/message-admin/profiles/ieguillermo" &

sleep 2

# Cuenta 2: IE Independencia
echo "-> Lanzando perfil 'ieindependencia' en el puerto 9223..."
"$EDGE_CMD" \
  --remote-debugging-port=9223 \
  --remote-debugging-address=0.0.0.0 \
  --user-data-dir="$HOME/message-admin/profiles/ieindependencia" &

echo ""
echo "✅ ¡Navegadores lanzados en segundo plano!"
