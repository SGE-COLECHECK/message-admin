#!/bin/bash

# --- Script para iniciar los navegadores para las cuentas de WhatsApp ---

echo "🚀 Iniciando navegadores para las cuentas de WhatsApp..."
echo ""

# Cuenta 1: IE Guillermo
echo "-> Lanzando perfil 'ieguillermo' en el puerto 9222..."
microsoft-edge \
  --remote-debugging-port=9222 \
  --user-data-dir="/root/message-admin/profiles/ieguillermo" &

# Pequeña pausa para evitar conflictos al iniciar
sleep 2

# Cuenta 2: IE Independencia
echo "-> Lanzando perfil 'ieindependencia' en el puerto 9223..."
microsoft-edge \
  --remote-debugging-port=9223 \
  --user-data-dir="/root/message-admin/profiles/ieindependencia" &

echo ""
echo "✅ ¡Navegadores lanzados en segundo plano! Ahora puedes iniciar la aplicación NestJS."
echo "   Recuerda navegar a web.whatsapp.com en cada ventana si no se abre automáticamente."