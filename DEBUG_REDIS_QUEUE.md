# 🔧 Guía de Debugging: Redis Queue + Puppeteer

## Problema: Cola de Redis no funciona

### ✅ Paso 1: Verificar Conexión a Redis

```bash
# Opción A: Si Redis está corriendo localmente
redis-cli ping
# Deberías ver: PONG

# Opción B: Si Redis está en Docker
docker exec whatsapp_redis_queue redis-cli ping
```

### ✅ Paso 2: Ver Mensajes en Cola

```bash
# Ver todas las colas
redis-cli KEYS 'queue:*'

# Ver mensajes de una sesión específica
redis-cli LRANGE queue:default 0 -1

# Ver tamaño de cola
redis-cli LLEN queue:default
```

### ✅ Paso 3: Ver Errores en Cola

```bash
# Ver errores guardados
redis-cli KEYS 'errors:default:*'

# Ver un error específico
redis-cli GET 'errors:default:<error-id>'
```

---

## 🛠️ Diagnóstico: ¿Dónde está el problema?

### Caso 1: Mensaje NO aparece en Redis

**Síntomas:**
- POST a `/whatsapp/sessions/default/send-assistance-report` retorna éxito
- Pero `redis-cli LRANGE queue:default 0 -1` está vacío

**Causas posibles:**
1. **Redis no está conectado** → Revisar logs de la app: `❌ Error en Redis`
2. **REDIS_HOST es incorrecto** → En Docker debe ser `redis`, en local `localhost`
3. **ScraperService no está llamando a QueueService**

**Solución:**
```bash
# Ver logs de la app
docker logs whatsapp_app | grep -i redis
docker logs whatsapp_app | grep -i "📥"

# Si ves "QUEUE] Mensaje agregado", Redis está funcionando
# Si ves "❌ Error al agregar mensaje", el host es incorrecto
```

---

### Caso 2: Mensaje está en Redis pero NO se procesa

**Síntomas:**
- `redis-cli LRANGE queue:default 0 -1` muestra mensajes
- Pero los mensajes no se envían
- Estado sigue siendo "pending"

**Causas posibles:**
1. **QueueService no está iniciado** → Revisar logs: `🔄 Procesamiento de colas iniciado`
2. **Sesión no está autenticada** → Check: `❌ Sesión no está autenticada`
3. **Puppeteer no iniciado** → La página está null

**Solución:**
```bash
# Verificar si QueueService se inicializó
docker logs whatsapp_app | grep "🔄 Procesamiento"

# Verificar estado de sesión
curl http://localhost:3000/whatsapp/sessions
# Debe mostrar "isAuthenticated: true"

# Ver detalles de la cola
curl http://localhost:3000/whatsapp/queues/default
```

---

### Caso 3: Mensaje falla después de varios intentos

**Síntomas:**
- Mensaje se mueve a estado "processing"
- Luego aparece error y se reintenta
- Finalmente falla y se guarda en `errors:default:*`

**Causas posibles:**
1. **Número telefónico inválido** → Formato incorrecto
2. **Contacto no existe** → WhatsApp Web no encuentra el número
3. **Selector CSS cambió** → WhatsApp Web actualizó su interfaz

**Solución:**
```bash
# Ver el error específico
redis-cli GET 'errors:default:<error-id>'

# Revisar captura de pantalla
ls -la error-*.png
# Usar: open, cat, o visualizar en navegador

# Aumentar timeouts
# En .env.development:
PUPPETEER_WAIT_FOR_UI_TIMEOUT=10000  # Aumentar de 5000 a 10000
PUPPETEER_TYPING_DELAY=100            # Aumentar de 50 a 100
```

---

## 📋 Checklist de Configuración

### Desarrollo Local (`npm run start:dev`)

```bash
# 1. Verificar .env
cat .env
# REDIS_HOST=localhost  ✅
# REDIS_PORT=6379       ✅

# 2. Iniciar Redis (en otra terminal)
redis-server
# O con Docker:
docker run -d -p 6379:6379 redis:7-alpine

# 3. Iniciar app
npm run start:dev
# Debe mostrar: "✅ Conectado a Redis"
```

### Producción Docker (`docker-compose up -d`)

```bash
# 1. Verificar .env.production
cat .env.production
# REDIS_HOST=redis      ✅ (nombre del servicio)
# NODE_ENV=production   ✅

# 2. Iniciar
docker-compose up -d

# 3. Verificar logs
docker logs whatsapp_app | grep "✅ Conectado"
```

---

## 🚀 Solución Rápida: Reset Completo

Si nada funciona, borra todo y empieza limpio:

```bash
# Detener contenedores
docker-compose down

# Limpiar volúmenes (CUIDADO: pierde datos)
docker volume prune

# Reconstruir
docker-compose up -d --build

# Verificar
docker logs whatsapp_app | tail -20
```

---

## 📊 Endpoints de Debug

```bash
# Ver todas las colas
curl http://localhost:3000/whatsapp/queues

# Ver cola específica
curl http://localhost:3000/whatsapp/queues/default

# Ver errores
curl http://localhost:3000/whatsapp/queues/default/errors

# Ver sesión
curl http://localhost:3000/whatsapp/sessions
```

---

## 💡 Tips

1. **Aumenta timeouts si están fallando muchos mensajes:**
   - `PUPPETEER_WAIT_FOR_UI_TIMEOUT=10000`
   
2. **Usa `headless: false` en BrowserService para ver qué está pasando:**
   - Abre `browser.service.ts` y cambia `headless: false`

3. **Verifica Redis con:**
   - `redis-cli MONITOR` (muestra todos los comandos en tiempo real)

4. **El problema más común:** REDIS_HOST incorrecto en Docker
   - Debe ser `redis` (nombre del servicio), no `localhost`
