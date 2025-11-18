#!/bin/bash

# --- Script para iniciar los navegadores para las cuentas de WhatsApp ---

# --- CONFIGURACIÓN ---
# Si el comando 'microsoft-edge' no está en tu PATH, reemplázalo por la ruta completa.
# Puedes encontrar la ruta ejecutando: which microsoft-edge
EDGE_CMD="microsoft-edge"

echo "🚀 Iniciando navegadores para las cuentas de WhatsApp..."
echo ""

# Cuenta 1: IE Guillermo
echo "-> Lanzando perfil 'ieguillermo' en el puerto 9222..."
$EDGE_CMD \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/message-admin/profiles/ieguillermo" &

# Pequeña pausa para evitar conflictos al iniciar
sleep 2

# Cuenta 2: IE Independencia
echo "-> Lanzando perfil 'ieindependencia' en el puerto 9223..."
$EDGE_CMD \
  --remote-debugging-port=9223 \
  --user-data-dir="$HOME/message-admin/profiles/ieindependencia" &

echo ""
echo "✅ ¡Navegadores lanzados en segundo plano! Ahora puedes iniciar la aplicación NestJS."
echo "   Recuerda navegar a web.whatsapp.com en cada ventana si no se abre automáticamente."