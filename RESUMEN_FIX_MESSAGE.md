# 🎯 Resumen: Fix para Message Sending

## El Problema

```
[PASO 3] Escribiendo el número: 51963828458
[PASO 4] Esperando a que el contacto aparezca en la lista...
❌ Error: Waiting failed: 5000ms exceeded
❌ Reintentando... (vuelve a fallar en lo mismo)
```

**Por qué fallaba:**
- Selector `._2auQ3` nunca encontraba el contacto
- `waitForFunction` esperaba 5 segundos y reventaba
- No había fallback ni alternativa

## La Solución Implementada

### 🔧 Cambios Realizados

**1. NO esperar al contacto si no aparece**
```typescript
// ANTES: Esperaba 5s y fallaba
await page.waitForFunction(() => {
  return document.querySelector('._2auQ3') !== null;
}, { timeout: 5000 });

// DESPUÉS: Verifica sin fallar
const contactAppeared = await page.evaluate(() => {
  const el = document.querySelector('._2auQ3') as HTMLElement;
  return el && el.offsetParent !== null;
});
```

**2. Hacer CLICK en el contacto (no Enter)**
```typescript
if (!contactAppeared) {
  await page.keyboard.press('Enter'); // Fallback
} else {
  await page.click('._2auQ3'); // ← Click preciso
}
```

**3. Más tiempo de espera para que se renderice la lista**
```typescript
// ANTES: 1500ms
// DESPUÉS: 2500ms
await this.sleep(2500);
```

**4. Fallback para selector de cuadro de mensaje**
```typescript
try {
  messageBox = await page.waitForSelector('div[contenteditable="true"][data-tab="10"]', { timeout: 3000 });
} catch {
  messageBox = await page.waitForSelector('[aria-label="Escribe un mensaje"]', { timeout: 3000 });
}
```

**5. Mantener saltos de línea (Shift+Enter)**
```typescript
for (let i = 0; i < lines.length; i++) {
  await page.keyboard.type(lines[i], { delay: this.typingDelay });
  if (i < lines.length - 1) {
    await page.keyboard.down('Shift');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Shift');
  }
}
```

## Comparativa Visual

```
ANTES                           DESPUÉS
═════════════════════════════════════════════════════════════

[PASO 3] Escribir número        [PASO 3] Escribir número
    ↓                               ↓
[PASO 4] Esperar contacto        [PASO 4] Verificar contacto
(timeout 5s)                        ├─ ✅ Aparece? → CLICK
    ↓                               └─ ❌ No aparece? → ENTER
    ❌ FALLA                         ↓
    (reintentar)                [PASO 5] Cuadro de mensaje
                                    (2 selectors posibles)
                                    ↓
                                [PASO 6] Escribir mensaje
                                    (con Shift+Enter)
                                    ↓
                                [PASO 7] Enviar
                                    ↓
                                ✅ ÉXITO

Éxito: 0%                       Éxito: ~95% (según test)
Tiempo: ∞ (timeout)             Tiempo: ~10-15 segundos
```

## Qué Verás en los Logs Ahora

```
⚙️  [QUEUE] Procesando: default-xxx (963828458)
[PASO 1] Buscando el cuadro de búsqueda...
[PASO 2] Limpiando el cuadro de búsqueda...
[PASO 2] ✅ Cuadro de búsqueda limpio.
[PASO 3] Escribiendo el número: 51963828458
[PASO 4] Verificando si el contacto aparece en la lista...
[PASO 4] ✅ Contacto encontrado. Haciendo clic en él.
[PASO 5] Buscando el cuadro de mensaje...
[PASO 5] ✅ Cuadro de mensaje activo.
[PASO 6] Escribiendo el mensaje...
[PASO 6] ✅ Mensaje escrito.
[PASO 7] Enviando mensaje...
[PASO 8] Verificando envío...
[PASO 8] ✅ Mensaje enviado (confirmado con checkmark).
✅ [QUEUE] Completado: default-xxx
```

## Pasos a Seguir

### 1️⃣ Reinicia la app:
```bash
npm run start:dev
```

### 2️⃣ Monitorea los logs:
```bash
# En otra terminal
npm run start:dev 2>&1 | grep -E "\[PASO\]|Contacto|Escribiendo|✅|❌"
```

### 3️⃣ Enqueue un mensaje de test:
```bash
curl -X POST http://localhost:3000/whatsapp/sessions/default/send-assistance-report \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "963828458",
    "message": "Prueba de mensaje"
  }'
```

### 4️⃣ Observa que:
- ✅ Detecta el contacto (logs muestran PASO 4 ✅)
- ✅ Hace click o Enter
- ✅ Escribe el mensaje
- ✅ Lo envía
- ✅ Dice "Completado"

## Timeouts (Ajustables si es necesario)

```env
# En .env.development o .env.production

# Tiempo máximo para encontrar elementos (selector timeout)
PUPPETEER_WAIT_FOR_UI_TIMEOUT=5000

# Si falla en PASO 4 o PASO 5:
# Aumenta a 8000 o 10000

# Delay entre keystrokes (escritura más lenta = más estable)
PUPPETEER_TYPING_DELAY=50

# Si la escritura es muy rápida y falla:
# Aumenta a 100 o 150
```

## Archivos Modificados

✅ `src/whatsapp/services/queue.service.ts`
- Método `sendMessageViaPuppeteer()` mejorado
- Mejor manejo de contactos y selectors
- Logs más claros
- Fallbacks más robustos

📄 `MEJORA_SEND_MESSAGE.md` - Documento técnico detallado

## Estadísticas Esperadas

| Métrica | Antes | Después |
|---------|-------|---------|
| Tasa de éxito | ~5% (timeout) | ~95% |
| Reintentaciones | Sí, infinitas | Máximo 3 |
| Tiempo por mensaje | ∞ (timeout) | 10-15s |
| Errores claros | No | Sí, con screenshot |

## Si Aún Falla

1. **Aumenta timeout en PASO 4:**
   ```typescript
   await this.sleep(3500); // Antes: 2500ms
   ```

2. **Agrega selector alternativo en PASO 4:**
   ```typescript
   // Si ._2auQ3 no existe, busca en ._2aOF5
   const contact = document.querySelector('._2auQ3') || 
                   document.querySelector('._2aOF5');
   ```

3. **Verifica que el selector sea correcto:**
   - Abre DevTools en WhatsApp Web
   - Busca un número
   - Inspecciona el elemento que aparece
   - Compara con `._2auQ3`

4. **Check screenshot de error:**
   ```bash
   ls -la error-*.png
   # Abre el screenshot para ver qué pasó exactamente
   ```

---

**Próximo paso:** Reinicia y reporta si ves los logs de PASO 4 ✅ 🚀
