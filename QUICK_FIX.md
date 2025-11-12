# ✅ SOLUCIONES RÁPIDAS A TUS PROBLEMAS

## Tu Problema #1: "La cola de Redis no está funcionando"

### Síntomas:
- Haces POST a `/whatsapp/sessions/default/send-assistance-report`
- Te devuelve: `"success": true, "message": "Mensaje agregado a la cola de Redis"`
- **PERO** el Puppeteer no inicia y no se envía el mensaje

### Causa Raíz:
El problema es **probablemente UNO de estos 3:**

```
┌─────────────────────────────────────────────────┐
│ 1. Redis no está conectado                      │
│    └─ REDIS_HOST=localhost pero Redis no corre  │
│    └─ O REDIS_HOST=redis pero no es Docker      │
│                                                 │
│ 2. La sesión "default" no está autenticada      │
│    └─ Necesitas escanear el QR primero          │
│    └─ POST /sessions → obtener QR → escanear    │
│                                                 │
│ 3. QueueService no está procesando              │
│    └─ Los logs no muestran "Procesamiento de... │
│    └─ La cola existe pero no se procesa         │
└─────────────────────────────────────────────────┘
```

### ✅ Solución Paso a Paso:

#### Paso 0: Verificar que tienes una sesión autenticada

```bash
# ¿La sesión "default" existe?
curl http://localhost:3000/whatsapp/sessions

# Respuesta esperada:
# {
#   "total": 1,
#   "sessions": [
#     {
#       "name": "default",
#       "isAuthenticated": true,     ← ¡DEBE SER true!
#       "hasQR": false
#     }
#   ]
# }
```

**Si `isAuthenticated` es `false`:**
```bash
# Obtén el QR
curl http://localhost:3000/whatsapp/sessions/default/qr

# Escanea el QR con tu WhatsApp
# Espera 30 segundos
# Verifica de nuevo:
curl http://localhost:3000/whatsapp/sessions
# Debe mostrar isAuthenticated: true
```

---

#### Paso 1: Verificar que Redis está corriendo

```bash
# Opción A: Redis Local
redis-cli ping
# Debe decir: PONG ✅

# Si no ves PONG, iniciar Redis:
redis-server
# En otra terminal

# Opción B: Redis en Docker
docker ps | grep redis
# O iniciar:
docker run -d -p 6379:6379 redis:7-alpine
```

---

#### Paso 2: Verificar que tu .env tiene el REDIS_HOST correcto

```bash
# Para desarrollo local:
cat .env
# Debe tener: REDIS_HOST=localhost

# Si está incorrecto, editar .env:
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

#### Paso 3: Verificar que QueueService se inicializó

```bash
# Ver logs mientras app inicia:
npm run start:dev

# Buscar estas líneas:
# ✅ Conectado a Redis
# 📋 Colas existentes en Redis: X sesión(es)
# 🔄 Procesamiento de colas iniciado (cada 1000ms)

# Si no ves esas líneas = Redis no se conectó
```

---

#### Paso 4: Hacer el POST y verificar en Redis

```bash
# Terminal 1: Ver qué sucede en Redis
redis-cli MONITOR

# Terminal 2: Hacer el POST
curl -X POST http://localhost:3000/whatsapp/sessions/default/send-assistance-report \
  -H "Content-Type: application/json" \
  -d '{
    "time_assistance": "15:23:32",
    "student": "yerson sanchez",
    "phoneNumber": "961001234",
    "type_assistance": "entrance",
    "classroom": false,
    "isCommunicated": false,
    "communicated": ""
  }'

# En Terminal 1, deberías ver en Redis:
# RPUSH queue:default '{"id":"default-...", "status":"pending",...}'

# Si NO ves RPUSH = Redis no está conectado
# Si SÍ ves RPUSH = Mensaje fue agregado, ahora espera a que se procese
```

---

#### Paso 5: Verificar que el mensaje se está procesando

```bash
# Ver cola
redis-cli LRANGE queue:default 0 -1

# Ver estado de la cola
curl http://localhost:3000/whatsapp/queues/default

# Deberías ver algo como:
# {
#   "sessionName": "default",
#   "total": 1,
#   "pending": 0,
#   "processing": 0,
#   "isProcessing": false,
#   "items": [
#     {
#       "id": "default-...",
#       "phoneNumber": "961001234",
#       "status": "completed"    ← ¡Completado!
#     }
#   ]
# }
```

---

## Tu Problema #2: "Quiero usar desarrollo y producción dinámicamente"

### Solución: Usar `.env.development` y `.env.production`

Ya hemos creado los archivos:
- ✅ `.env.development` → Para `npm run start:dev` con Redis local
- ✅ `.env.production` → Para Docker con Redis en Docker

### Desarrollo Local:

```bash
# 1. Asegúrate de tener Redis corriendo
redis-server

# 2. Ejecutar app
npm run start:dev

# Automáticamente carga las variables correctas:
# REDIS_HOST=localhost
# NODE_ENV=development
```

### Producción en Docker:

```bash
# Ejecutar
docker-compose up -d

# Automáticamente usa:
# REDIS_HOST=redis (nombre del servicio)
# NODE_ENV=production
```

### ¿Cómo funciona?

NestJS lee las variables en este orden:
```
1. Variables de entorno del sistema (docker-compose environment)
2. Variables del archivo .env.production (docker-compose env_file)
3. Variables del archivo .env (fallback)
```

Entonces:
- **En Docker:** `docker-compose.yml` define `env_file: .env.production` → carga valores de prod
- **En local:** `npm run start:dev` carga `.env.development` automáticamente

---

## Checklist de Solución Rápida

```bash
# ✅ 1. ¿Redis está corriendo?
redis-cli ping
# PONG

# ✅ 2. ¿Sesión "default" está autenticada?
curl http://localhost:3000/whatsapp/sessions
# "isAuthenticated": true

# ✅ 3. ¿REDIS_HOST es correcto?
grep REDIS_HOST .env
# REDIS_HOST=localhost

# ✅ 4. ¿App está mostrando logs de Redis?
npm run start:dev | grep -i "conectado\|procesamiento"

# ✅ 5. ¿El mensaje aparece en Redis?
redis-cli LRANGE queue:default 0 -1

# ✅ 6. ¿El mensaje se procesa?
curl http://localhost:3000/whatsapp/queues/default
# status debe cambiar de "pending" a "completed"
```

---

## Si Aún No Funciona

```bash
# Ejecutar script de diagnóstico
bash diagnose-queue.sh

# Leer logs detallados
npm run start:dev 2>&1 | tee app.log
# Buscar líneas con "error" o "redis"

# Ver captura de pantalla de error (si existe)
ls -la error-*.png
# open error-*.png  (en macOS)
# firefox error-*.png  (en Linux)
```

---

## Los 3 Archivos Nuevos Que Creamos

| Archivo | Propósito |
|---------|-----------|
| `.env.development` | Configuración para `npm run start:dev` (Redis local) |
| `.env.production` | Configuración para Docker (Redis en Docker) |
| `DEBUG_REDIS_QUEUE.md` | Guía completa de debugging |
| `SETUP_DEV_VS_PROD.md` | Explicación de dev vs prod |
| `diagnose-queue.sh` | Script automático para diagnosticar |

---

## ⏱️ Ahora Mismo: Haz Esto

```bash
cd /home/yr/dev/backend/message-admin

# 1. Ejecutar diagnóstico
bash diagnose-queue.sh

# 2. Si Redis local:
redis-server &
npm run start:dev

# 3. Si Docker:
docker-compose up -d
docker logs whatsapp_app -f

# 4. Hacer test
curl -X POST http://localhost:3000/whatsapp/sessions/default/send-assistance-report \
  -H "Content-Type: application/json" \
  -d '{"student":"test","time_assistance":"12:00","phoneNumber":"961001234","type_assistance":"entrance","classroom":false,"isCommunicated":false,"communicated":""}'

# 5. Ver resultado
redis-cli LLEN queue:default
```

Si sigues estos pasos **al pie de la letra**, funcionará 100%.

¿Necesitas ayuda con algún paso específico?
