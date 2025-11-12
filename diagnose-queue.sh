#!/bin/bash

# ============================================
# 🔍 SCRIPT DE DIAGNÓSTICO: Redis Queue
# ============================================
# Uso: bash diagnose-queue.sh

echo "🔍 Diagnóstico de Redis Queue..."
echo ""

# ============================================
# 1. VERIFICAR REDIS DISPONIBLE
# ============================================
echo "1️⃣ Verificando Redis..."

if command -v redis-cli &> /dev/null; then
    if redis-cli ping &> /dev/null; then
        echo "   ✅ Redis está corriendo localmente"
        REDIS_STATUS="local"
    else
        echo "   ⚠️  Redis CLI existe pero no responde"
        REDIS_STATUS="offline"
    fi
else
    echo "   ⚠️  redis-cli no encontrado"
    REDIS_STATUS="unknown"
fi

# ============================================
# 2. VERIFICAR DOCKER
# ============================================
echo ""
echo "2️⃣ Verificando Docker..."

if command -v docker &> /dev/null; then
    if docker ps &> /dev/null; then
        RUNNING=$(docker ps --filter "name=whatsapp_redis_queue" -q)
        if [ -z "$RUNNING" ]; then
            echo "   ⚠️  Docker está corriendo pero Redis no está activo"
            echo "      → Intenta: docker-compose up -d"
        else
            echo "   ✅ Redis está corriendo en Docker"
            REDIS_STATUS="docker"
        fi
    else
        echo "   ❌ Docker no está corriendo"
    fi
else
    echo "   ⚠️  Docker no instalado"
fi

# ============================================
# 3. VERIFICAR .env
# ============================================
echo ""
echo "3️⃣ Verificando configuración..."

if [ -f ".env" ]; then
    REDIS_HOST=$(grep "^REDIS_HOST=" .env | cut -d'=' -f2)
    REDIS_PORT=$(grep "^REDIS_PORT=" .env | cut -d'=' -f2)
    NODE_ENV=$(grep "^NODE_ENV=" .env | cut -d'=' -f2)
    
    echo "   .env:"
    echo "      REDIS_HOST=$REDIS_HOST"
    echo "      REDIS_PORT=$REDIS_PORT"
    echo "      NODE_ENV=$NODE_ENV"
else
    echo "   ⚠️  .env no encontrado"
fi

if [ -f ".env.development" ]; then
    echo "   ✅ .env.development existe"
else
    echo "   ⚠️  .env.development no existe"
fi

if [ -f ".env.production" ]; then
    echo "   ✅ .env.production existe"
else
    echo "   ⚠️  .env.production no existe"
fi

# ============================================
# 4. VERIFICAR COLAS EN REDIS
# ============================================
echo ""
echo "4️⃣ Verificando colas en Redis..."

if [ "$REDIS_STATUS" = "local" ]; then
    QUEUES=$(redis-cli KEYS 'queue:*')
    if [ -z "$QUEUES" ]; then
        echo "   📋 No hay colas pendientes"
    else
        echo "   📋 Colas encontradas:"
        while IFS= read -r queue; do
            LENGTH=$(redis-cli LLEN "$queue")
            echo "      - $queue: $LENGTH mensaje(s)"
            
            # Mostrar primer mensaje
            FIRST=$(redis-cli LINDEX "$queue" 0)
            if [ ! -z "$FIRST" ]; then
                PHONE=$(echo "$FIRST" | grep -o '"phoneNumber":"[^"]*"' | cut -d'"' -f4)
                STATUS=$(echo "$FIRST" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
                echo "        └─ Primer: $PHONE [$STATUS]"
            fi
        done <<< "$QUEUES"
    fi
elif [ "$REDIS_STATUS" = "docker" ]; then
    echo "   💾 Usando Docker Redis..."
    QUEUES=$(docker exec whatsapp_redis_queue redis-cli KEYS 'queue:*' 2>/dev/null)
    if [ -z "$QUEUES" ]; then
        echo "   📋 No hay colas pendientes"
    else
        echo "   📋 Colas encontradas:"
        while IFS= read -r queue; do
            LENGTH=$(docker exec whatsapp_redis_queue redis-cli LLEN "$queue" 2>/dev/null)
            echo "      - $queue: $LENGTH mensaje(s)"
        done <<< "$QUEUES"
    fi
else
    echo "   ❌ No se puede conectar a Redis"
fi

# ============================================
# 5. VERIFICAR APP NODE
# ============================================
echo ""
echo "5️⃣ Verificando Node.js..."

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo "   ✅ Node.js $NODE_VERSION"
else
    echo "   ❌ Node.js no instalado"
fi

if [ -f "package.json" ]; then
    echo "   ✅ package.json encontrado"
else
    echo "   ❌ package.json no encontrado"
fi

if [ -d "node_modules" ]; then
    echo "   ✅ node_modules existe"
else
    echo "   ⚠️  node_modules no existe → npm install"
fi

# ============================================
# 6. VERIFICAR CONECTIVIDAD APP
# ============================================
echo ""
echo "6️⃣ Verificando conectividad a app..."

if command -v curl &> /dev/null; then
    if curl -s http://localhost:3000/whatsapp/sessions > /dev/null 2>&1; then
        echo "   ✅ App responde en http://localhost:3000"
        
        # Ver sesiones
        SESSIONS=$(curl -s http://localhost:3000/whatsapp/sessions)
        echo "   📱 Sesiones: $SESSIONS" | head -c 100
    else
        echo "   ⚠️  App no responde en http://localhost:3000"
        echo "      → Intenta: npm run start:dev"
    fi
else
    echo "   ⚠️  curl no disponible"
fi

# ============================================
# 7. RESUMEN Y RECOMENDACIONES
# ============================================
echo ""
echo ""
echo "📊 RESUMEN Y RECOMENDACIONES:"
echo ""

if [ "$REDIS_STATUS" = "local" ]; then
    echo "✅ Está todo listo para DESARROLLO LOCAL:"
    echo ""
    echo "   1. npm install"
    echo "   2. npm run start:dev"
    echo "   3. En otra terminal: redis-cli MONITOR"
    echo "   4. En otra: curl POST /whatsapp/sessions/.../send-assistance-report"
elif [ "$REDIS_STATUS" = "docker" ]; then
    echo "✅ Está todo listo para PRODUCCIÓN EN DOCKER:"
    echo ""
    echo "   1. docker-compose up -d"
    echo "   2. docker logs whatsapp_app -f"
    echo "   3. curl POST http://localhost:3000/..."
elif [ "$REDIS_STATUS" = "offline" ]; then
    echo "⚠️  Para DESARROLLO LOCAL, necesitas iniciar Redis:"
    echo ""
    echo "   Opción A: redis-server"
    echo "   Opción B: docker run -d -p 6379:6379 redis:7-alpine"
    echo ""
    echo "   Luego: npm run start:dev"
else
    echo "❌ Problemas detectados. Verifica:"
    echo ""
    echo "   1. ¿Está Redis instalado o Docker corriendo?"
    echo "   2. ¿Node.js está instalado?"
    echo "   3. ¿npm install ha sido ejecutado?"
    echo ""
    echo "Para DESARROLLO LOCAL:"
    echo "   brew install redis  (macOS)"
    echo "   sudo apt install redis-server  (Linux)"
    echo "   docker run -d -p 6379:6379 redis:7-alpine  (Docker)"
fi

echo ""
