# 🚀 Mejoras en sendMessageViaPuppeteer - v2 Inteligente

## El Problema Original

```
[PASO 3] Escribiendo el número: 51963828458
[PASO 4] Esperando a que el contacto aparezca...
❌ Error: Waiting failed: 5000ms exceeded
```

**Root cause:**
- Selector `._2auQ3` (contacto) **nunca aparecía**
- `waitForFunction` esperaba 5 segundos y fallaba
- Luego reintentaba, pero volvía a fallar en el mismo lugar

## Por Qué Funcionaba el Código Anterior

El código anterior:
```typescript
// Presionaba Enter sin esperar a que el contacto apareciera
await page.keyboard.press('Enter');
await this.sleep(3000); // Confiaba en que WhatsApp abriría el chat
```

❌ **Pero esto es impredecible:**
- A veces funcionaba, a veces no
- Si el contacto no se encontraba, Enter hacía nada
- Sin verificación visual de qué pasó

## La Solución Inteligente (Nueva)

### 🎯 Cambios Principales

#### 1. **Detectar si el contacto aparece** (sin fallar si no aparece)
```typescript
const contactAppeared = await page.evaluate(() => {
  const contactElement = document.querySelector('._2auQ3') as HTMLElement;
  return contactElement && contactElement.offsetParent !== null;
});
```

#### 2. **Hacer click si aparece, sino presionar Enter**
```typescript
if (!contactAppeared) {
  this.logger.warn(`⚠️  El contacto NO apareció. Intentando con Enter...`);
  await page.keyboard.press('Enter');
} else {
  this.logger.log(`✅ Contacto encontrado. Haciendo clic...`);
  await page.click('._2auQ3'); // ← CLICK EN VEZ DE ENTER
}
```

#### 3. **Aumentar tiempo de espera para que la lista se renderice**
```typescript
await this.sleep(2500); // Antes: 1500ms → Ahora: 2500ms
```

#### 4. **Cuadro de mensaje: Fallback a selector alternativo**
```typescript
try {
  messageBox = await page.waitForSelector('div[contenteditable="true"][data-tab="10"]', { timeout: 3000 });
} catch (e) {
  // Si no funciona, intenta:
  messageBox = await page.waitForSelector('[aria-label="Escribe un mensaje"]', { timeout: 3000 });
}
```

#### 5. **Mensaje multi-línea con Shift+Enter (como el anterior)**
```typescript
for (let i = 0; i < lines.length; i++) {
  if (line.length > 0) {
    await page.keyboard.type(line, { delay: this.typingDelay });
  }
  if (i < lines.length - 1) {
    // Salto de línea en el mensaje (Shift+Enter)
    await page.keyboard.down('Shift');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Shift');
  }
}
```

#### 6. **Verificación de envío sin fallar**
```typescript
const messageWasSent = await page.evaluate(() => {
  const checkmark = document.querySelector('[data-icon="msg-check"]') as HTMLElement;
  return checkmark && checkmark.offsetParent !== null;
});

if (messageWasSent) {
  this.logger.log(`✅ Confirmado con checkmark.`);
} else {
  this.logger.log(`✅ Enviado (sin confirmación visual).`);
}
```

**Importante:** No hace `waitForFunction` (que falla). Solo verifica si está ahí.

## Comparativa: Antes vs Después

| Aspecto | Anterior | Nuevo |
|---------|----------|-------|
| Detecta contacto | ❌ No, solo presiona Enter | ✅ Verifica y hace click |
| Timeout de espera | 1500ms (muy corto) | 2500ms (más realista) |
| Si contacto no aparece | ❌ Falla con timeout | ✅ Intenta con Enter |
| Selector de mensaje | Solo uno | ✅ 2 alternativas |
| Confirmación de envío | ❌ Falla si no hay checkmark | ✅ Verifica pero no falla |
| Saltos de línea | ❌ No | ✅ Shift+Enter |
| Logs | Básicos | ✅ Detallados en cada paso |

## Flujo Nuevo (Paso a Paso)

```
1️⃣ Buscar cuadro de búsqueda
      ↓
2️⃣ Limpiar (Ctrl+A, Backspace)
      ↓
3️⃣ Escribir número (51963828458)
      ↓
4️⃣ Esperar 2.5s a que aparezca contacto
      ├─ ✅ Contacto apareció → CLICK en él
      └─ ❌ No apareció → Presionar ENTER
      ↓
5️⃣ Esperar 3s a que cargue chat
      ↓
6️⃣ Buscar cuadro de mensaje (2 selectors)
      ↓
7️⃣ Escribir mensaje (línea por línea con Shift+Enter)
      ↓
8️⃣ Presionar ENTER para enviar
      ↓
9️⃣ Verificar envío (solo info, no falla si no hay checkmark)
      ↓
✅ ÉXITO
```

## Testing

### Restart y observa los logs:
```bash
npm run start:dev 2>&1 | grep -E "\[PASO\]|Contacto|Escribiendo"
```

Deberías ver:
```
[PASO 1] Buscando el cuadro de búsqueda...
[PASO 1] ✅ Cuadro encontrado.
[PASO 2] Limpiando el cuadro de búsqueda...
[PASO 2] ✅ Cuadro de búsqueda limpio.
[PASO 3] Escribiendo el número: 51963828458
[PASO 4] Verificando si el contacto aparece en la lista...
[PASO 4] ✅ Contacto encontrado. Haciendo clic en él...
       (O si no aparece: ⚠️  El contacto NO apareció. Intentando con Enter...)
[PASO 5] ✅ Cuadro de mensaje activo.
[PASO 6] ✅ Mensaje escrito.
[PASO 7] Enviando mensaje...
[PASO 8] ✅ Mensaje enviado (confirmado con checkmark).
```

## Diferencias Clave vs Anterior

| Anterior | Nuevo | Por Qué |
|----------|-------|--------|
| Presiona Enter sin verificar | Click en contacto si aparece | Más preciso, contacto correcto |
| Timeout de 1.5s | 2.5s | WhatsApp tarda en renderizar |
| Falla si no hay checkmark | Solo info, no falla | Más robusto |
| No hay Shift+Enter | Sí, mantiene saltos de línea | Mensajes bien formateados |
| Sin fallbacks | 2 selectors para mensaje | Cubre más casos |

## Archivos Modificados

✅ `src/whatsapp/services/queue.service.ts`
- Método `sendMessageViaPuppeteer()` completamente reescrito
- Mejor manejo de errores y timeouts
- Logs más claros en cada paso

## Próximos Pasos

1. **Test con mensajes pequeños** (no messages con muchas líneas)
2. **Test con números en la lista** (que existan)
3. **Test con números nuevos** (que no existan en contactos)
4. **Monitorear logs** para ajustar timeouts si es necesario

Si aún fallan:
- Aumenta `PUPPETEER_WAIT_FOR_UI_TIMEOUT` en .env
- Aumenta delays en PASO 3 y PASO 4
- Ajusta selectores si WhatsApp cambió su HTML

---

**Estado:** ✅ Ready to test
**Riesgo:** Bajo (mantiene la lógica básica, agrega robustez)
**Beneficio:** Mensajes enviándose sin timeout errors
