#!/bin/bash

# =====================================================
# 🔧 DEBUG RÁPIDO: Cola no procesa mensajes
# =====================================================

echo "🔧 Debug: Cola no procesa mensajes"
echo ""

# Paso 1: Ver si Redis tiene la cola
echo "Paso 1: Verificar que el mensaje está en Redis..."
redis-cli LLEN queue:default
# Si ves > 0, el mensaje está ahí ✅
# Si ves 0, no se agregó el mensaje ❌

echo ""
echo "Paso 2: Ver contenido de la cola..."
redis-cli LRANGE queue:default 0 -1

echo ""
echo "Paso 3: Verificar que la app está ejecutando"
curl -s http://localhost:3000/whatsapp/sessions | jq .

echo ""
echo "Paso 4: Ver todos los endpoints de debug"
echo "GET  http://localhost:3000/whatsapp/queues"
echo "GET  http://localhost:3000/whatsapp/queues/default"
echo "GET  http://localhost:3000/whatsapp/queues/default/errors"
echo "POST http://localhost:3000/debug/process-queue (¡NUEVA!)"
echo "GET  http://localhost:3000/debug/queue-status-detailed (¡NUEVA!)"

echo ""
echo "Paso 5: Forzar el procesamiento manualmente"
curl -X POST http://localhost:3000/debug/process-queue | jq .

echo ""
echo "Paso 6: Ver qué pasó"
redis-cli LLEN queue:default
# Si cambió de número, se procesó ✅
# Si sigue igual, hay un error en el procesamiento ❌

echo ""
echo "Si el mensaje seguía en Redis después de Paso 5:"
echo "→ El loop no estaba corriendo (ya está arreglado)"
echo ""
echo "Si desapareció después de Paso 5:"
echo "→ ¡El loop estaba parado pero funciona manualmente!"
echo "→ Reinicia la app: npm run start:dev"
echo ""
