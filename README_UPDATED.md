# 🚀 Message-Admin: WhatsApp Automation Server

> **¿Tu Queue de Redis no funciona?** → Lee [QUICK_FIX.md](./QUICK_FIX.md) ahora mismo

Un servidor NestJS para automatizar WhatsApp Web usando Puppeteer con soporte para múltiples sesiones, cola de mensajes en Redis, y reintentos automáticos.

## ✨ Características

- ✅ **Múltiples sesiones** de WhatsApp simultáneamente
- ✅ **Cola de mensajes** en Redis con reintentos automáticos
- ✅ **Persistencia de sesiones** en Chrome profiles
- ✅ **Configuración dinámica** para desarrollo y producción
- ✅ **Logging detallado** para debugging
- ✅ **Health checks** automáticos de Redis y app
- ✅ **API REST** para crear sesiones, enviar mensajes, ver estado

## 🚀 Inicio Rápido

### Opción 1: Desarrollo Local

```bash
# 1. Instalar Redis
redis-server &  # O: docker run -d -p 6379:6379 redis:7-alpine

# 2. Instalar dependencias
npm install

# 3. Ejecutar en modo watch
npm run start:dev

# 4. En otra terminal, probar
curl http://localhost:3000/whatsapp/sessions
```

### Opción 2: Producción en Docker

```bash
# 1. Iniciar todo
docker-compose up -d

# 2. Ver logs
docker logs whatsapp_app -f

# 3. Probar
curl http://localhost:3000/whatsapp/sessions
```

## 📚 Documentación

| Documento | Para Quién | Contenido |
|-----------|-----------|----------|
| **[QUICK_FIX.md](./QUICK_FIX.md)** | Todos | ⚡ Respuestas directas a problemas comunes |
| **[DEBUG_REDIS_QUEUE.md](./DEBUG_REDIS_QUEUE.md)** | Debugging | 🔍 Cómo diagnosticar problemas de Queue |
| **[SETUP_DEV_VS_PROD.md](./SETUP_DEV_VS_PROD.md)** | DevOps | 🔄 Configurar desarrollo vs producción |
| **[CAMBIOS_REALIZADOS.md](./CAMBIOS_REALIZADOS.md)** | Histórico | 📋 Qué cambió en esta versión |
| **[.github/copilot-instructions.md](./.github/copilot-instructions.md)** | Developers | 📖 Guía completa de arquitectura |

## 🔧 Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                   NestJS App                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │         WhatsappController                   │  │
│  │  POST /sessions        - crear sesión        │  │
│  │  GET /sessions         - listar sesiones     │  │
│  │  POST /.../send-msg    - encolar mensaje     │  │
│  │  GET /queues/:name     - ver estado cola     │  │
│  └──────────────────────────────────────────────┘  │
│                      ↓                              │
│  ┌──────────────────────────────────────────────┐  │
│  │      SessionManager (In-Memory)              │  │
│  │  Map<sessionName, Session>                   │  │
│  │  └─ Session = {name, page, isAuth}           │  │
│  └──────────────────────────────────────────────┘  │
│                      ↓                              │
│  ┌──────────────────────────────────────────────┐  │
│  │      BrowserService (Puppeteer)              │  │
│  │  launchBrowser() → Browser                   │  │
│  │  createPage() → Page                         │  │
│  │  Profiles stored in ./profiles/              │  │
│  └──────────────────────────────────────────────┘  │
│                      ↓                              │
│  ┌──────────────────────────────────────────────┐  │
│  │      ScraperService (DOM Automation)         │  │
│  │  sendAssistanceReport() → builds message     │  │
│  │  sendMessage() → queues to Redis             │  │
│  └──────────────────────────────────────────────┘  │
│                      ↓                              │
│  ┌──────────────────────────────────────────────┐  │
│  │     QueueService (Redis)                     │  │
│  │  addToQueue() → RPUSH                        │  │
│  │  processAllQueues() → every 1000ms           │  │
│  │  sendMessageViaPuppeteer() → page.type()     │  │
│  └──────────────────────────────────────────────┘  │
│                      ↓                              │
└─────────────────────────────────────────────────────┘
                      ↓
        ┌─────────────────────────────┐
        │    Redis (localhost:6379)   │
        │  queue:default              │
        │  queue:soporte              │
        │  errors:default:*           │
        │  history:default:*          │
        └─────────────────────────────┘
                      ↓
        ┌─────────────────────────────┐
        │   Puppeteer (Chrome)        │
        │   Profiles in ./profiles/   │
        │   Navega a web.whatsapp.com │
        └─────────────────────────────┘
                      ↓
        ┌─────────────────────────────┐
        │    WhatsApp Web             │
        │    (via Automation)         │
        └─────────────────────────────┘
```

## 📋 API Endpoints

### Sessions

```bash
# Crear sesión (inicia auth)
POST /whatsapp/sessions
{
  "name": "default"
}

# Listar sesiones
GET /whatsapp/sessions

# Ver QR de sesión
GET /whatsapp/sessions/:name/qr

# Ver estado de sesión
GET /whatsapp/sessions/:name/status

# Cerrar sesión
DELETE /whatsapp/sessions/:name
```

### Messages

```bash
# Enviar reporte de asistencia (encolado en Redis)
POST /whatsapp/sessions/:name/send-assistance-report
{
  "student": "Juan Pérez",
  "time_assistance": "14:30:00",
  "phoneNumber": "51961001234",
  "type_assistance": "entrance",
  "classroom": false,
  "isCommunicated": false,
  "communicated": ""
}

# Respuesta:
{
  "success": true,
  "message": "Mensaje agregado a la cola de Redis",
  "queueId": "default-1699704..."
}
```

### Queue Management

```bash
# Ver estado de todas las colas
GET /whatsapp/queues

# Ver estado de cola específica
GET /whatsapp/queues/:name

# Respuesta:
{
  "sessionName": "default",
  "total": 5,
  "pending": 2,
  "processing": 1,
  "items": [
    {
      "id": "default-...",
      "phoneNumber": "961001234",
      "status": "completed",
      "retryCount": 0,
      "timestamp": "2024-11-11T..."
    }
  ]
}

# Ver errores de cola
GET /whatsapp/queues/:name/errors

# Limpiar cola
DELETE /whatsapp/queues/:name
```

## ⚙️ Variables de Configuración

```properties
# Redis
REDIS_HOST=localhost              # localhost para dev, redis para Docker
REDIS_PORT=6379
REDIS_PASSWORD=                   # Dejar vacío si sin password
REDIS_DB=0

# Queue
QUEUE_RETRY_ATTEMPTS=3            # Reintentos antes de fallar
QUEUE_RETRY_DELAY=5000            # Delay en ms entre reintentos
QUEUE_PROCESSING_INTERVAL=1000    # Procesar colas cada X ms

# Server
PORT=3000
NODE_ENV=development              # O production

# Puppeteer Performance
PUPPETEER_WAIT_FOR_UI_TIMEOUT=5000    # Timeout para esperar elementos
PUPPETEER_TYPING_DELAY=50             # Ms entre cada carácter al escribir
PUPPETEER_AFTER_CLICK_DELAY=150       # Ms después de hacer clic
```

## 🔍 Diagnosticar Problemas

### Rápido
```bash
bash diagnose-queue.sh
```

### Detallado
1. Lee [QUICK_FIX.md](./QUICK_FIX.md) para tu problema específico
2. Lee [DEBUG_REDIS_QUEUE.md](./DEBUG_REDIS_QUEUE.md) para debugging profundo
3. Revisa los logs: `npm run start:dev 2>&1 | grep -E "\[QUEUE\]|\[PUPPETEER\]"`

## 🧪 Tests

```bash
npm test              # Unit tests
npm run test:watch   # Watch mode
npm run test:cov     # Coverage
npm run test:e2e     # E2E tests
```

## 📦 Scripts Disponibles

```bash
npm run build        # Build para producción
npm run start        # Ejecutar build compilado
npm run start:dev    # Watch mode (desarrollo)
npm run start:debug  # Debug mode
npm run lint         # ESLint + fix
npm run format       # Prettier
npm test             # Jest tests
npm run test:e2e     # E2E tests
```

## 🐳 Docker

```bash
# Desarrollo con Docker
docker-compose up -d
docker logs whatsapp_app -f

# Parar
docker-compose down

# Parar y limpiar volúmenes
docker-compose down -v
```

### Dockerfile Multi-Stage
- **Stage 1:** Builder con npm install (todas las dependencias)
- **Stage 2:** Runtime limpio con solo dependencias de producción
- Sistema `chromium` instalado
- Puppeteer configurado para usar `chromium-browser` del sistema

## 📊 Monitoreo

```bash
# Ver eventos de Queue
npm run start:dev 2>&1 | grep "\[QUEUE\]"

# Ver eventos de Puppeteer
npm run start:dev 2>&1 | grep "\[PUPPETEER\]"

# Monitorear Redis en tiempo real
redis-cli MONITOR

# Ver colas en Redis
redis-cli KEYS 'queue:*'
redis-cli LRANGE queue:default 0 -1
```

## 🆘 Troubleshooting

### "Redis connection refused"
```bash
# Asegúrate que Redis está corriendo
redis-cli ping
# O inicia Redis
redis-server
```

### "Session not authenticated"
```bash
# Primero crea la sesión y escanea el QR
POST /whatsapp/sessions/default
GET /whatsapp/sessions/default/qr  # Escanea el QR
# Espera 30 segundos
GET /whatsapp/sessions             # isAuthenticated debe ser true
```

### "Message not sending"
```bash
# Ver cola
curl http://localhost:3000/whatsapp/queues/default

# Ver errores
curl http://localhost:3000/whatsapp/queues/default/errors

# Ver captura de error
ls -la error-*.png
```

## 📖 Arquitectura Detallada

Ver [.github/copilot-instructions.md](./.github/copilot-instructions.md) para una guía completa de:
- Session lifecycle
- Queue processing flow
- Service responsibilities
- Common patterns & anti-patterns
- Extended troubleshooting

## 🤝 Contribuyendo

1. Lee la documentación (especialmente [CAMBIOS_REALIZADOS.md](./CAMBIOS_REALIZADOS.md))
2. Crea una rama feature: `git checkout -b feature/my-feature`
3. Haz commit de cambios: `git commit -am 'Add feature'`
4. Push a rama: `git push origin feature/my-feature`
5. Abre un Pull Request

## 📄 License

UNLICENSED - Propiedad de SGE-COLECHECK

## 🙏 Soporte

¿Problemas?
1. **Rápido:** Lee [QUICK_FIX.md](./QUICK_FIX.md)
2. **Profundo:** Ejecuta `bash diagnose-queue.sh`
3. **Detallado:** Lee [DEBUG_REDIS_QUEUE.md](./DEBUG_REDIS_QUEUE.md)
4. **Arquitectura:** Lee [.github/copilot-instructions.md](./.github/copilot-instructions.md)

---

**Última actualización:** 11/11/2024 - v1.1.0
- ✅ Múltiples archivos de documentación
- ✅ Script de diagnóstico automático
- ✅ Logging mejorado en QueueService
- ✅ Soporte para .env.development y .env.production
- ✅ Health checks en Docker
