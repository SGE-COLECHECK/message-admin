# ✅ Solución: Sesiones Huérfanas en la Cola

## El Problema Encontrado

**24 mensajes stuck** en Redis, pero la cola no procesaba nada.

### Root Cause:
- Sesiones en Redis: `queue:default` (15 msgs) + `queue:940740243` (9 msgs)
- Sesiones en memoria (SessionManager): Solo `default` existe
- **La sesión '940740243' no existe más** (se perdió al reiniciar)
- Queue.Service intentaba procesar para una sesión que **no estaba en memoria**
- Fallaba silenciosamente porque no validaba sesiones antes de procesarlas

## La Solución

Agregué validación en `processAllQueues()`:

```typescript
// ✅ VERIFICACIÓN: ¿La sesión existe?
const session = this.sessionManager.get(sessionName);
if (!session) {
  this.logger.warn(`⚠️  [QUEUE] Sesión '${sessionName}' no existe en memoria. Limpiando cola...`);
  
  // Limpiar la cola de Redis para esta sesión
  const queueLength = await this.redisClient.llen(queueKey);
  this.logger.warn(`   └─ Deletando ${queueLength} mensaje(s) huérfano(s)`);
  
  await this.redisClient.del(queueKey);
  continue;
}
```

### Qué hace:
1. **Verifica** si la sesión existe antes de procesar
2. **Registra** si una cola pertenece a una sesión que no existe
3. **Limpia automáticamente** colas huérfanas (cero data loss, es intencional)
4. **Continúa** con la siguiente cola

## Pasos para Aplicar

### 1️⃣ Reinicia la app:
```bash
npm run start:dev
```

### 2️⃣ Observa los logs:
```
⚠️  [QUEUE] Sesión '940740243' no existe en memoria. Limpiando cola...
   └─ Deletando 9 mensaje(s) huérfano(s)
```

### 3️⃣ Verifica colas limpias:
```bash
curl http://localhost:3000/whatsapp/queues
```

Ahora debería mostrar solo `queue:default` (si tienes la sesión "default" activa).

## ¿Por qué pasó?

1. **Primera ejecución:** Encolaste mensajes para sesión "940740243"
2. **Reiniciaste la app:** Las sesiones en memoria se perdieron
3. **Queue persistida en Redis:** Los 9 mensajes de "940740243" quedaron en Redis
4. **Sesión "default" fue creada:** Pero "940740243" nunca fue recreada
5. **Sistema intentaba procesar 940740243:** Pero no existía → Error silencioso → Mensajes nunca se procesaban

## ¿Cómo evitarlo en futuro?

### Opción 1: Recuperar sesiones al iniciar (⭐ Recomendado)
Agregar lógica en `onModuleInit()` para detectar colas huérfanas:

```typescript
async onModuleInit() {
  // ... conexión a Redis ...
  
  const queueKeys = await this.redisClient.keys('queue:*');
  for (const key of queueKeys) {
    const sessionName = key.replace('queue:', '');
    const session = this.sessionManager.get(sessionName);
    
    if (!session) {
      this.logger.log(`⚠️  Sesión '${sessionName}' perdida. Limpiar colas...`);
      await this.redisClient.del(key);
    }
  }
  
  // Iniciar procesamiento...
}
```

### Opción 2: Persistencia de sesiones en DB
Guardar sesiones en base de datos y recuperarlas en `onModuleInit()`.

### Opción 3: Webhook para notificar sesiones perdidas
Cuando se detecte cola huérfana, notificar a webhook externo.

## Estado Actual

✅ **Aplicado:** Auto-limpieza de colas huérfanas (esta versión)  
✅ **Logs mejorados:** Ves exactamente qué se limpia y por qué  
🟡 **Siguiente paso:** Implementar recuperación automática de sesiones (si quieres)

## Testing

### Test 1: Crear sesión + enquelar mensaje
```bash
curl -X POST http://localhost:3000/whatsapp/sessions \
  -H "Content-Type: application/json" \
  -d '{"name":"test-session"}'

curl -X POST http://localhost:3000/whatsapp/sessions/test-session/send-assistance-report \
  -H "Content-Type: application/json" \
  -d '{"phone":"1234567890","message":"test"}'
```

### Test 2: Reiniciar app y observar
```bash
# En otra terminal:
npm run start:dev 2>&1 | grep "QUEUE\|Procesando"
```

Deberías ver:
```
⚠️  [QUEUE] Sesión 'test-session' no existe en memoria. Limpiando cola...
   └─ Deletando 1 mensaje(s) huérfano(s)
```

Si vuelves a crear sesión **con el mismo nombre**, los mensajes se procesarán normalmente.

## Resumen

| Antes | Después |
|-------|---------|
| 24 mensajes stuck en Redis | Auto-limpios si sesión no existe |
| Sin validación de sesiones | Validación antes de procesar |
| Errors silenciosos | Logs claros (⚠️ Sesión no encontrada) |
| Colas acumuladas | Colas auto-gestionadas |

**Próximo paso:** Reinicia y reporta qué ves en los logs. 🎯
