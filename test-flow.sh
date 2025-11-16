#!/bin/bash

# 🚀 Script para test completo: Create Session → Auth → Send Message → Check Status
# Uso: bash test-flow.sh [colegioId] [phoneNumber] [studentName]
# Ejemplo: bash test-flow.sh 001 963828458 "Juan Pérez"

set -e

COLEGIO_ID="${1:-001}"
PHONE_NUMBER="${2:-963828458}"
STUDENT_NAME="${3:-Test Student}"
API_URL="http://localhost:3000/whatsapp"

echo "🚀 =========================================="
echo "  WhatsApp Multi-Colegio Test Flow"
echo "=========================================="
echo "Colegio ID: $COLEGIO_ID"
echo "Phone: $PHONE_NUMBER"
echo "Student: $STUDENT_NAME"
echo ""

# 1️⃣ CREATE SESSION
echo "1️⃣ Creando sesión para '$COLEGIO_ID'..."
SESSION_RESPONSE=$(curl -s -X POST "$API_URL/colegios/$COLEGIO_ID/sessions" \
  -H "Content-Type: application/json")

echo "Respuesta:"
echo "$SESSION_RESPONSE" | jq '.'

QR_CODE=$(echo "$SESSION_RESPONSE" | jq -r '.qrCode // empty')
IS_AUTH=$(echo "$SESSION_RESPONSE" | jq -r '.isAuthenticated // false')

if [ "$IS_AUTH" = "true" ]; then
  echo "✅ Sesión ya está autenticada"
else
  if [ -z "$QR_CODE" ] || [ "$QR_CODE" = "null" ]; then
    echo "❌ No se obtuvo QR. Respuesta completa:"
    echo "$SESSION_RESPONSE" | jq '.'
    exit 1
  fi
  
  echo ""
  echo "📱 QR obtenido. Escanea en WhatsApp Web con tu teléfono..."
  echo "⏳ Esperando autenticación (máx 120 segundos)..."
  sleep 5
  
  # 2️⃣ WAIT FOR AUTH (max 120s)
  for i in {1..24}; do
    echo "   Verificando... ($((i * 5))s)"
    STATUS=$(curl -s "$API_URL/sessions" | jq ".sessions[] | select(.name == \"$COLEGIO_ID\") | .isAuthenticated" 2>/dev/null || echo "null")
    
    if [ "$STATUS" = "true" ]; then
      echo "✅ ¡Autenticado!"
      break
    fi
    
    if [ $i -eq 24 ]; then
      echo "⏱️ Timeout esperando autenticación"
      exit 1
    fi
    sleep 5
  done
fi

echo ""

# 3️⃣ SEND MESSAGE
echo "3️⃣ Enviando mensaje..."
SEND_RESPONSE=$(curl -s -X POST "$API_URL/sessions/$COLEGIO_ID/send-assistance-report" \
  -H "Content-Type: application/json" \
  -d "{
    \"student\": \"$STUDENT_NAME\",
    \"time_assistance\": \"$(date +%H:%M:%S)\",
    \"type_assistance\": \"entrance\",
    \"phoneNumber\": \"$PHONE_NUMBER\",
    \"classroom\": false,
    \"isCommunicated\": true,
    \"communicated\": \"script test\"
  }")

echo "Respuesta:"
echo "$SEND_RESPONSE" | jq '.'

QUEUE_ID=$(echo "$SEND_RESPONSE" | jq -r '.queueId // empty')
if [ -z "$QUEUE_ID" ]; then
  echo "❌ Error enviando mensaje"
  exit 1
fi

echo ""
echo "4️⃣ Verificando estado de la cola..."
sleep 3

QUEUE_STATUS=$(curl -s "$API_URL/queues/$COLEGIO_ID")
echo "Estado de colas:"
echo "$QUEUE_STATUS" | jq '.'

COMPLETED=$(echo "$QUEUE_STATUS" | jq '.completed // 0')
PENDING=$(echo "$QUEUE_STATUS" | jq '.pending // 0')
FAILED=$(echo "$QUEUE_STATUS" | jq '.failed // 0')

echo ""
echo "📊 Resumen:"
echo "   ✅ Completados: $COMPLETED"
echo "   ⏳ Pendientes: $PENDING"
echo "   ❌ Fallidos: $FAILED"

if [ "$FAILED" -gt 0 ]; then
  echo ""
  echo "⚠️ Hay mensajes fallidos, verificando errores..."
  curl -s "$API_URL/queues/$COLEGIO_ID/errors" | jq '.errors'
fi

echo ""
echo "✨ Test completado"
