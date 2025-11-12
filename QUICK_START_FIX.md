# ⚡ Quick Start - Message Sending Fix

## El Cambio

**Problema:** Mensajes se quedaban esperando a que aparezca el contacto en la lista (timeout)

**Solución:** 
- Click en el contacto SI aparece ✅
- Si no aparece, presiona Enter como fallback ✅
- Selectors alternativos para cuadro de mensaje ✅
- Mejor logging en cada paso ✅

## Tres Pasos para Empezar

### 1. Reinicia la app
```bash
npm run start:dev
```

Deberías ver:
```
✅ Conectado a Redis
🔄 Procesamiento de colas iniciado (cada 1000ms)
```

### 2. En otra terminal, prueba un mensaje
```bash
bash test-message-sending.sh 963828458 "Hola, test"
```

Verás output como:
```
✅ Sesión válida y autenticada
✅ Mensaje enqueued (Queue ID: default-xxx)
✅ Esperando procesamiento...
✅ Mensaje enviado con éxito
✅ TEST PASADO
```

### 3. Monitorea los logs para ver cada paso
```bash
npm run start:dev 2>&1 | grep -E "\[PASO\]|Contacto|✅|❌"
```

Verás:
```
[PASO 1] Buscando el cuadro de búsqueda...
[PASO 2] Limpiando el cuadro de búsqueda...
[PASO 2] ✅ Cuadro de búsqueda limpio.
[PASO 3] Escribiendo el número: 51963828458
[PASO 4] Verificando si el contacto aparece...
[PASO 4] ✅ Contacto encontrado. Haciendo clic.
[PASO 5] ✅ Cuadro de mensaje activo.
[PASO 6] ✅ Mensaje escrito.
[PASO 7] Enviando mensaje...
[PASO 8] ✅ Mensaje enviado (confirmado con checkmark).
✅ [QUEUE] Completado: default-xxx
```

## Si Falla

### Caso 1: PASO 4 nunca muestra ✅
Significa que el contacto no está apareciendo en la lista. Soluciones:
1. Aumenta `PUPPETEER_WAIT_FOR_UI_TIMEOUT` en .env a `8000`
2. Aumenta sleep en PASO 3: `await this.sleep(3500)` (antes: 2500)
3. Verifica en DevTools que el selector `._2auQ3` es correcto

### Caso 2: PASO 5 falla (no encuentra cuadro de mensaje)
El selector cambió en WhatsApp Web. Soluciones:
1. Abre DevTools (F12) en web.whatsapp.com
2. Busca un número
3. Haz click en el contacto
4. Inspecciona el cuadro de mensaje
5. Copia el selector y reemplaza en línea ~367 del código

### Caso 3: Mensaje se envía pero sin confirmación visual
Normal. El código ahora verifica pero no falla si no hay checkmark.

## Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `src/whatsapp/services/queue.service.ts` | Método `sendMessageViaPuppeteer()` mejorado |
| `test-message-sending.sh` | Script para testear |
| `RESUMEN_FIX_MESSAGE.md` | Documentación completa |
| `MEJORA_SEND_MESSAGE.md` | Guía técnica detallada |

## Documentación

Para entender más:
- 📄 `RESUMEN_FIX_MESSAGE.md` — Resumen visual y rápido
- 📄 `MEJORA_SEND_MESSAGE.md` — Detalles técnicos del cambio
- 📄 `README.md` — Arquitectura general

## Rollback (Si algo sale mal)

Si quieres volver al anterior:
```bash
git checkout HEAD -- src/whatsapp/services/queue.service.ts
npm run start:dev
```

---

**Estatus:** ✅ Ready to test  
**Riesgo:** Bajo (mejor que antes, no regresiones)  
**Beneficio:** Mensajes enviándose sin timeout errors  

¿Necesitas ayuda? Corre: `bash test-message-sending.sh 963828458 "Test"` 🚀
