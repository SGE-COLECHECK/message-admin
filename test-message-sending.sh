#!/bin/bash

# 🧪 Script de test para verificar que el mensaje se envía correctamente

echo "🚀 Test de Message Sending"
echo "=========================="
echo ""

# Colores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Validar que los parámetros sean correctos
if [ -z "$1" ] || [ -z "$2" ]; then
  echo -e "${RED}❌ Uso: bash test-message-sending.sh <phone> <message>${NC}"
  echo ""
  echo "Ejemplo:"
  echo "  bash test-message-sending.sh 963828458 'Hola, esto es un test'"
  echo ""
  exit 1
fi

PHONE=$1
MESSAGE=$2
SESSION="${3:-default}"

echo -e "${BLUE}📱 Parámetros${NC}"
echo "  Sesión: $SESSION"
echo "  Número: $PHONE"
echo "  Mensaje: $MESSAGE"
echo ""

# 1️⃣ Verificar que la sesión existe y está autenticada
echo -e "${BLUE}1️⃣ Verificando sesión...${NC}"
SESSION_STATUS=$(curl -s http://localhost:3000/whatsapp/sessions | jq ".[] | select(.name == \"$SESSION\")")

if [ -z "$SESSION_STATUS" ]; then
  echo -e "${RED}❌ Sesión '$SESSION' no existe${NC}"
  echo ""
  echo "Sesiones disponibles:"
  curl -s http://localhost:3000/whatsapp/sessions | jq '.[] | {name, isAuthenticated}'
  exit 1
fi

IS_AUTH=$(echo $SESSION_STATUS | jq '.isAuthenticated')
if [ "$IS_AUTH" != "true" ]; then
  echo -e "${RED}❌ Sesión no está autenticada${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Sesión válida y autenticada${NC}"
echo ""

# 2️⃣ Enviar mensaje
echo -e "${BLUE}2️⃣ Enviando mensaje...${NC}"
RESPONSE=$(curl -s -X POST http://localhost:3000/whatsapp/sessions/$SESSION/send-assistance-report \
  -H "Content-Type: application/json" \
  -d "{
    \"phone\": \"$PHONE\",
    \"message\": \"$MESSAGE\"
  }")

echo $RESPONSE | jq . 2>/dev/null || echo $RESPONSE

QUEUE_ID=$(echo $RESPONSE | jq -r '.queueId // empty')

if [ -z "$QUEUE_ID" ]; then
  echo -e "${RED}❌ Error al enqueue del mensaje${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Mensaje enqueued${NC}"
echo "  Queue ID: $QUEUE_ID"
echo ""

# 3️⃣ Esperar y verificar que se procese
echo -e "${BLUE}3️⃣ Esperando procesamiento...${NC}"
echo "   (máximo 30 segundos)"

for i in {1..30}; do
  sleep 1
  
  # Verificar status de la cola
  QUEUE_STATUS=$(curl -s http://localhost:3000/whatsapp/queues/$SESSION | jq ".items[] | select(.id == \"$QUEUE_ID\") | .status" | tr -d '"')
  
  if [ "$QUEUE_STATUS" = "completed" ]; then
    echo -e "${GREEN}✅ Mensaje enviado con éxito${NC}"
    echo ""
    echo -e "${GREEN}✅ TEST PASADO${NC}"
    exit 0
  elif [ "$QUEUE_STATUS" = "failed" ]; then
    echo -e "${RED}❌ Mensaje falló${NC}"
    curl -s http://localhost:3000/whatsapp/queues/$SESSION/errors | jq ".items[] | select(.id == \"$QUEUE_ID\")"
    exit 1
  fi
  
  echo -n "."
done

echo ""
echo -e "${RED}❌ Timeout: El mensaje no se completó en 30 segundos${NC}"
echo ""
echo "Estado actual:"
curl -s http://localhost:3000/whatsapp/queues/$SESSION | jq ".items[] | select(.id == \"$QUEUE_ID\")"

exit 1
