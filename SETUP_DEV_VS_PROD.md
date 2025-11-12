# 🎯 Development vs Production Setup

## Estructura de Configuración

Tu proyecto ahora soporta **3 formas de ejecutar la app:**

```
├── npm run start:dev (local con Redis local)
├── docker-compose up -d (producción con Redis en Docker)
└── npm start (producción local - menos común)
```

---

## 🏃 Opción 1: Desarrollo Local con npm

### Paso 1: Instalar y Configurar

```bash
# Clonar y entrar al proyecto
cd /home/yr/dev/backend/message-admin

# Instalar dependencias
npm install

# Crear archivo .env.development (ya creado)
cat .env.development

# Debe mostrar:
# REDIS_HOST=localhost
# NODE_ENV=development
```

### Paso 2: Iniciar Redis en Otra Terminal

```bash
# Opción A: Si tienes Redis instalado localmente
redis-server

# Opción B: Si tienes Docker
docker run -d --name redis-dev -p 6379:6379 redis:7-alpine

# Verificar
redis-cli ping
# PONG ✅
```

### Paso 3: Iniciar la App

```bash
npm run start:dev

# Verás en los logs:
# [NestFactory] Starting Nest application...
# ✅ Conectado a Redis
# 🔄 Procesamiento de colas iniciado (cada 1000ms)
```

### Paso 4: Probar

```bash
# Terminal 1: Ver logs de Redis
redis-cli MONITOR

# Terminal 2: Hacer request
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

# Terminal 3: Ver cola
redis-cli LRANGE queue:default 0 -1
```

---

## 🐳 Opción 2: Producción en Docker (RECOMENDADO)

### Paso 1: Preparar Archivos

```bash
# El .env.production ya está creado
cat .env.production

# Debe mostrar:
# REDIS_HOST=redis      (servicio de Docker)
# NODE_ENV=production
```

### Paso 2: Iniciar Todo

```bash
# Desde la raíz del proyecto
docker-compose up -d

# Verás:
# Creating whatsapp_redis_queue
# Creating whatsapp_app
```

### Paso 3: Verificar Logs

```bash
# Ver que Redis está healthy
docker logs whatsapp_redis_queue | tail -5

# Ver que la app se conectó
docker logs whatsapp_app | grep "✅ Conectado"

# Ver que la cola se inició
docker logs whatsapp_app | grep "🔄 Procesamiento"
```

### Paso 4: Probar

```bash
# Hacer request (igual que en dev)
curl -X POST http://localhost:3000/whatsapp/sessions/default/send-assistance-report \
  -H "Content-Type: application/json" \
  -d '{...}'

# Ver cola desde dentro del contenedor
docker exec whatsapp_redis_queue redis-cli LRANGE queue:default 0 -1
```

### Paso 5: Parar Todo

```bash
docker-compose down

# Si quieres borrar volúmenes también (pierde datos de Redis):
docker-compose down -v
```

---

## 🔄 Cambiar Configuración Entre Dev y Producción

### Desarrollo: Usar `.env.development`

```bash
npm run start:dev
# NestJS carga .env.development automáticamente
```

### Producción: Usar `.env.production` + Docker

```bash
docker-compose up -d
# Docker carga env_file: .env.production
```

### Manual: Especificar archivo .env

```bash
# Si quieres forzar un archivo específico:
NODE_ENV=development npm run start:dev
NODE_ENV=production npm start
```

---

## 📝 Variables Clave por Ambiente

| Variable | Desarrollo | Producción | Propósito |
|---|---|---|---|
| `REDIS_HOST` | `localhost` | `redis` | Host del Redis |
| `NODE_ENV` | `development` | `production` | Modo de ejecución |
| `PUPPETEER_WAIT_FOR_UI_TIMEOUT` | `5000` | `5000` | Timeout para selectors |
| `PUPPETEER_TYPING_DELAY` | `50` | `50` | Velocidad de tipeo |
| `QUEUE_PROCESSING_INTERVAL` | `1000` | `1000` | Frecuencia de procesamiento |

---

## 🎛️ Configuración Dinámica: Feature Flags

Puedes habilitar/deshabilitar la cola sin tocar código:

### Opción A: Usar Solo Redis (Recomendado)

```bash
# .env
USE_QUEUE=true
```

**Comportamiento:**
```
POST /send-assistance-report
└─> ScraperService.sendAssistanceReport()
    └─> QueueService.addToQueue()
        └─> Redis RPUSH
            └─> Procesamiento asincrónico cada 1000ms
```

### Opción B: Procesar Directamente (Sin Cola)

```bash
# .env
USE_QUEUE=false
```

**Comportamiento:**
```
POST /send-assistance-report
└─> ScraperService.sendAssistanceReport()
    └─> QueueService.addToQueue()
        └─> Enviado INMEDIATAMENTE (bloquea el request)
```

**Implementación (en ScraperService):**

```typescript
async sendMessage(
  phoneNumber: string, 
  message: string, 
  sessionName: string
): Promise<string> {
  const useQueue = this.configService.get<boolean>('USE_QUEUE', true);

  if (useQueue) {
    // Agregar a Redis
    return await this.queueService.addToQueue(sessionName, phoneNumber, message);
  } else {
    // Procesar inmediatamente
    const session = this.sessionManager.get(sessionName);
    await this.queueService.sendMessageViaPuppeteer(session.page, phoneNumber, message);
    return `immediate-${Date.now()}`;
  }
}
```

---

## 🆘 Troubleshooting Rápido

### Dev Local No Funciona

```bash
# 1. ¿Está Redis corriendo?
redis-cli ping
# PONG ✅

# 2. ¿.env tiene REDIS_HOST=localhost?
cat .env.development | grep REDIS_HOST

# 3. ¿Están los logs mostrando conexión?
npm run start:dev | grep "Conectado"
```

### Docker No Funciona

```bash
# 1. ¿Está redis disponible?
docker exec whatsapp_redis_queue redis-cli ping
# PONG ✅

# 2. ¿La app se conectó?
docker logs whatsapp_app | grep "Conectado"

# 3. ¿El host es correcto?
docker logs whatsapp_app | grep "REDIS_HOST"
# Debe decir "redis", no "localhost"
```

---

## 📊 Monitoreo

### En Desarrollo

```bash
# Terminal 1: App
npm run start:dev

# Terminal 2: Redis Monitor
redis-cli MONITOR

# Terminal 3: Tests
curl http://localhost:3000/whatsapp/queues
```

### En Producción

```bash
# Ver logs de app
docker logs -f whatsapp_app

# Ver logs de Redis
docker logs -f whatsapp_redis_queue

# Ver estado de contenedores
docker ps

# Acceder a Redis dentro de Docker
docker exec -it whatsapp_redis_queue redis-cli
> KEYS queue:*
> LRANGE queue:default 0 -1
```

---

## 🚀 Resumen

| Escenario | Comando | REDIS_HOST | Archivo |
|---|---|---|---|
| Desarrollo Local | `npm run start:dev` | `localhost` | `.env.development` |
| Desarrollo con Docker | `docker-compose up -d` | `redis` | `.env.production` |
| Producción | `docker-compose up -d --build` | `redis` | `.env.production` |

**Lo más importante:** En Docker, REDIS_HOST debe ser `redis` (nombre del servicio), no `localhost`.
