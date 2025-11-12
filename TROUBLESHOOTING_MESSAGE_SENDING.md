# 🔧 Troubleshooting: Si Algo No Funciona

## Síntoma 1: PASO 4 sigue fallando

```
[PASO 4] Verificando si el contacto aparece en la lista...
⚠️  El contacto NO apareció. Intentando con Enter...
[PASO 5] Buscando el cuadro de mensaje...
❌ Error: waiting for selector...
```

**Causa:** El selector `._2auQ3` cambió en WhatsApp, o WhatsApp tarda mucho

**Solución:**

1. **Aumenta timeout:**
   ```env
   # .env.development o .env.production
   PUPPETEER_WAIT_FOR_UI_TIMEOUT=10000  # De 5000 a 10000
   ```

2. **Aumenta sleep en PASO 3:**
   Abre `src/whatsapp/services/queue.service.ts`, línea ~303:
   ```typescript
   // Cambiar:
   await this.sleep(2500);
   // A:
   await this.sleep(4000);
   ```

3. **Verifica el selector con DevTools:**
   - Abre WhatsApp Web en Chrome
   - Abre DevTools (F12)
   - En Console:
     ```javascript
     // Busca un número
     // Luego inspecciona el elemento que aparece
     document.querySelector('._2auQ3')
     // Si devuelve null, el selector cambió
     ```
   - Si cambió, copia el selector correcto y reemplaza en línea ~313

---

## Síntoma 2: PASO 5 nunca aparece

```
[PASO 4] ✅ Contacto encontrado. Haciendo clic en él.
⏳ Esperando 3 segundos...
❌ Error: waiting for selector...
```

**Causa:** El selector del cuadro de mensaje cambió

**Solución:**

1. **Agregar más selectores alternativos:**
   Abre `src/whatsapp/services/queue.service.ts`, línea ~330:
   ```typescript
   try {
     messageBox = await page.waitForSelector('div[contenteditable="true"][data-tab="10"]', { timeout: 3000 });
   } catch (e) {
     try {
       messageBox = await page.waitForSelector('[aria-label="Escribe un mensaje"]', { timeout: 3000 });
     } catch (e2) {
       // AGREGA AQUÍ más selectors
       messageBox = await page.waitForSelector('div[contenteditable="true"][role="textbox"]', { timeout: 3000 });
     }
   }
   ```

2. **O aumenta timeout:**
   ```env
   PUPPETEER_WAIT_FOR_UI_TIMEOUT=8000
   ```

---

## Síntoma 3: El contacto aparece pero NO hace click

```
[PASO 4] ✅ Contacto encontrado. Haciendo clic en él.
[PASO 4] ⚠️  El contacto NO apareció. Intentando con Enter...
```

**Causa:** El `click()` no funciona, falla el fallback

**Solución:**

1. **Usar evaluate() para hacer click desde JS:**
   Abre `src/whatsapp/services/queue.service.ts`, línea ~315:
   ```typescript
   // Cambiar:
   await page.click('._2auQ3');
   
   // A:
   await page.evaluate(() => {
     const el = document.querySelector('._2auQ3') as HTMLElement;
     if (el) el.click();
   });
   ```

2. **Agregar más delays:**
   ```typescript
   await this.sleep(3000); // Antes: 2500
   ```

---

## Síntoma 4: Mensaje se escribe pero no se envía

```
[PASO 6] ✅ Mensaje escrito.
[PASO 7] Enviando mensaje...
⏳ Esperando...
❌ Error: Timeout
```

**Causa:** ENTER no funciona o toma mucho tiempo

**Solución:**

1. **Aumenta sleep después de escribir:**
   Abre `src/whatsapp/services/queue.service.ts`, línea ~360:
   ```typescript
   // Cambiar:
   await this.sleep(500);
   
   // A:
   await this.sleep(1500);
   ```

2. **Aumenta sleep después de presionar ENTER:**
   Línea ~367:
   ```typescript
   // Cambiar:
   await this.sleep(2000);
   
   // A:
   await this.sleep(3000);
   ```

---

## Síntoma 5: Script falla en línea X pero no muestra error

```
[PASO 5] Buscando el cuadro de mensaje...
(nada más pasa)
```

**Causa:** Error fue capturado pero el logger no registró bien

**Solución:**

1. **Agrega console.log de debug:**
   Abre `src/whatsapp/services/queue.service.ts`, busca la línea del error:
   ```typescript
   try {
     await something();
   } catch (error) {
     this.logger.error(`❌ Error: ${error.message}`);
     this.logger.error(`📍 Stack: ${error.stack}`); // ← Agrega esta
     throw error;
   }
   ```

2. **Mira los logs con más detalle:**
   ```bash
   npm run start:dev 2>&1 | grep -E "Error|Stack"
   ```

---

## Síntoma 6: Timeout en PASO 4 pero el contacto está ahí

```
[PASO 4] Verificando si el contacto aparece...
⚠️  El contacto NO apareció. Intentando con Enter...
[PASO 5] ✅ (funciona con Enter)
```

**Causa:** El selector existe pero `offsetParent` es null (elemento hidden)

**Solución:**

1. **Cambiar verificación de visibilidad:**
   Abre `src/whatsapp/services/queue.service.ts`, línea ~307:
   ```typescript
   // Cambiar:
   return contactElement && contactElement.offsetParent !== null;
   
   // A:
   return contactElement && (contactElement.offsetParent !== null || contactElement.display !== 'none');
   ```

2. **O simplemente verifica si existe:**
   ```typescript
   return contactElement !== null;
   ```

---

## Síntoma 7: Los números largos no se escriben bien

```
[PASO 3] Escribiendo el número: 51963828458
(escribe: 5196382 y se queda)
```

**Causa:** Typing delay es muy lento o hay lag

**Solución:**

1. **Aumenta la velocidad de escritura:**
   ```env
   PUPPETEER_TYPING_DELAY=20  # De 50 a 20
   ```

2. **O usa `paste` en lugar de `type`:**
   Abre `src/whatsapp/services/queue.service.ts`, línea ~299:
   ```typescript
   // Cambiar:
   await page.type('div[contenteditable="true"][data-tab="3"]', formattedPhone, { delay: this.typingDelay });
   
   // A:
   await page.evaluate((phone) => {
     const el = document.querySelector('div[contenteditable="true"][data-tab="3"]') as HTMLElement;
     if (el) {
       el.innerText = phone;
       el.dispatchEvent(new Event('input', { bubbles: true }));
     }
   }, formattedPhone);
   ```

---

## Síntoma 8: El mensaje tiene saltos de línea rotos

```
Escribo: "Línea 1\nLínea 2"
Llega: "Línea 1 Línea 2"
```

**Causa:** Shift+Enter no funciona bien

**Solución:**

1. **Aumenta delays en Shift+Enter:**
   Abre `src/whatsapp/services/queue.service.ts`, línea ~355:
   ```typescript
   await page.keyboard.down('Shift');
   await this.sleep(100); // Agrega delay
   await page.keyboard.press('Enter');
   await this.sleep(100); // Agrega delay
   await page.keyboard.up('Shift');
   await this.sleep(200); // Agrega delay
   ```

---

## Síntoma 9: Screenshot se guarda pero no se ve nada

```
❌ Error al enviar mensaje...
📸 Captura guardada en: error-51963828458-2025-11-11T17-29-07.299Z.png
(archivo existe pero está en blanco)
```

**Causa:** La página no cargó o hay problemas con Puppeteer

**Solución:**

1. **Aumenta timeout de screenshot:**
   Abre `src/whatsapp/services/queue.service.ts`, línea ~385:
   ```typescript
   // Cambiar:
   await page.screenshot({ path: screenshotPath as `${string}.png`, fullPage: true });
   
   // A:
   await page.screenshot({ 
     path: screenshotPath as `${string}.png`, 
     fullPage: true,
     timeout: 10000
   });
   ```

2. **O guarda HTML también:**
   ```typescript
   const html = await page.content();
   await fs.writeFile(screenshotPath.replace('.png', '.html'), html);
   ```

---

## Síntoma 10: Redis conecta pero los mensajes no se procesan

```
✅ Conectado a Redis
🔄 Procesamiento de colas iniciado
📋 Colas existentes: queue:default (5 mensajes)
```

(pero no procesa nada)

**Causa:** Error silencioso en `processAllQueues()`

**Solución:**

1. **Agrega más logs:**
   Abre `src/whatsapp/services/queue.service.ts`, línea ~150:
   ```typescript
   for (const queueKey of keys) {
     this.logger.log(`🔍 Procesando cola: ${queueKey}`); // ← Agrega
     const sessionName = queueKey.replace('queue:', '');
     // ...
   }
   ```

2. **Verifica Redis directamente:**
   ```bash
   redis-cli
   > KEYS queue:*
   > LLEN queue:default
   > LPOP queue:default
   ```

---

## Herramientas de Debug

### 1. Ver screenshot de error
```bash
ls -lah error-*.png
file error-*.png
xdg-open error-*.png  # Linux
open error-*.png      # Mac
```

### 2. Inspeccionar elemento en browser
```javascript
// En console de DevTools
document.querySelector('._2auQ3')  // Verifica selector
document.querySelectorAll('[contenteditable="true"]')  // Ve todos
```

### 3. Monitorear Redis
```bash
redis-cli MONITOR  # En otra terminal
# Luego corre: npm run start:dev
```

### 4. Ver logs filtrados
```bash
npm run start:dev 2>&1 | grep -E "\[PASO\]|Error|Contacto"
```

### 5. Test individual
```bash
bash test-message-sending.sh 963828458 "Test"
```

---

## Rollback rápido

Si algo sale mal:
```bash
git checkout HEAD -- src/whatsapp/services/queue.service.ts
npm run start:dev
```

---

## Checklist de Debugging

- [ ] ¿Reiniciaste `npm run start:dev`?
- [ ] ¿Redis está corriendo? (`redis-cli ping`)
- [ ] ¿La sesión está autenticada? (`GET /whatsapp/sessions`)
- [ ] ¿El selector existe en DevTools? (`document.querySelector('._2auQ3')`)
- [ ] ¿Aumentaste los timeouts? (PUPPETEER_WAIT_FOR_UI_TIMEOUT)
- [ ] ¿Comparaste con screenshots? (error-*.png)
- [ ] ¿Viste logs completos? (grep all)

---

## Si Nada Funciona

1. **Abre un issue en GitHub** con:
   - Screenshot de error
   - Logs completos
   - Qué número estás intentando
   - URL de WhatsApp que usas

2. **O corre el diagnostic:**
   ```bash
   bash diagnose-queue.sh
   ```

3. **O busca en los otros docs:**
   - `QUICK_FIX.md` - Soluciones rápidas
   - `DEBUG_REDIS_QUEUE.md` - Queue issues
   - `README.md` - Arquitectura

---

**Recuerda:** El 90% de los issues se solucionan con:
1. Aumentar timeouts
2. Cambiar selectors
3. Reiniciar `npm run start:dev`

¡Buena suerte! 🚀
