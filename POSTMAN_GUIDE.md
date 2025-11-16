# 📮 Guía Completa: Postman + Dashboard WhatsApp

## 🎯 El Flujo Real (Lo que NECESITAS hacer)

```
1. Crear Sesión → 2. Escanear QR → 3. Verificar Auth → 4. Enviar Mensajes
```

---

## ✅ PASO 1: Crear Sesión + Obtener QR

### En POSTMAN:
```http
POST http://localhost:3000/whatsapp/colegios/default/sessions
Content-Type: application/json

{}
```

### Respuesta:
```json
{
  "sessionName": "default",
  "qrCode": "data:image/png;base64,...",
  "isAuthenticated": false
}
```

### En DASHBOARD:
1. Ve a tarjeta **"🔐 Autenticar Sesión"**
2. Selecciona un colegio
3. Click en **"🚀 Crear Sesión / QR"**
4. Se mostrará el QR automáticamente

---

## 📱 PASO 2: Escanear el QR

- **Abre WhatsApp Web** en tu navegador (en el mismo navegador donde has puesto el dashboard)
- **Escanea el QR** con tu teléfono
- **Espera a que se autentique** (el QR desaparecerá)

---

## 🔐 PASO 3: Verificar que está Autenticado

### En POSTMAN:
```http
GET http://localhost:3000/whatsapp/sessions
```

### Respuesta esperada:
```json
{
  "sessions": [
    {
      "name": "default",
      "isAuthenticated": true,  // ← DEBE SER true
      "hasQR": false
    }
  ]
}
```

### En DASHBOARD:
- Ve a **"⚡ Sesiones Activas"**
- Click en **"🔄 Recargar Sesiones"**
- Debe mostrar tu sesión con badge verde **"✓ Auth"**

---

## 💬 PASO 4: ENVIAR MENSAJE

### Con POSTMAN (Opción 1):

```http
POST http://localhost:3000/whatsapp/sessions/default/send-assistance-report
Content-Type: application/json

{
  "student": "yerson sanchez",
  "time_assistance": "15:23:32",
  "type_assistance": "entrance",
  "phoneNumber": "944101233",
  "classroom": false,
  "isCommunicated": true,
  "communicated": "verificación de teléfono"
}
```

### Respuesta:
```json
{
  "success": true,
  "message": "Mensaje agregado a la cola de Redis",
  "queueId": "5f8c3e2a1b9d7f4c"
}
```

**⚠️ IMPORTANTE:** El mensaje NO se envía inmediatamente. Se agrega a la **cola de Redis** y se procesa en background cada 1000ms.

---

### Con DASHBOARD (Opción 2):

1. Ve a tarjeta **"💬 Enviar Mensaje"**
2. Selecciona la sesión
3. **Rellena los campos:**
   - **Nombre del estudiante** (ej: "yerson sanchez")
   - **Hora** (ej: "15:23:32")
   - **Tipo**: "Entrada" o "Salida"
   - **Teléfono del padre** (ej: "944101233") ← **A QUIÉN LE ENVÍAS**
   - **¿En aula?** (checkbox)
   - **¿Comunicado a padres?** (checkbox)
   - **Nota** (ej: "verificación de teléfono")
4. Click en **"📤 Enviar Mensaje"**

---

## 📊 PASO 5: Verificar Estado del Mensaje

### Con POSTMAN:

```http
GET http://localhost:3000/whatsapp/queues/default
```

### Respuesta:
```json
{
  "sessionName": "default",
  "pending": 0,
  "completed": 5,
  "failed": 0,
  "total": 5,
  "items": [
    {
      "id": "5f8c3e2a1b9d7f4c",
      "phone": "944101233",
      "message": "Buenos días, Estudiante: yerson sanchez...",
      "status": "completed",  // ← completed = ✅ ENVIADO
      "timestamp": "2025-11-16T15:23:45.000Z"
    }
  ]
}
```

### Estados posibles:
- **pending** 🟡 → Esperando envío
- **processing** 🔄 → Siendo enviado ahora
- **completed** ✅ → Enviado exitosamente
- **failed** ❌ → Error

### Con DASHBOARD:

1. Ve a tarjeta **"📊 Colas y Estadísticas"**
2. Click en **"🔄 Actualizar Colas"**
3. Verá:
   - **Pendientes: 0** → No hay más en cola
   - **Completadas: 5** → Se enviaron 5 mensajes

---

## ⚠️ Si FALLA el Mensaje

### Ver errores con POSTMAN:

```http
GET http://localhost:3000/whatsapp/queues/default/errors
```

### Respuesta:
```json
{
  "errors": [
    {
      "phoneNumber": "944101233",
      "error": "Timeout esperando selector WhatsApp input",
      "timestamp": "2025-11-16T15:25:00.000Z"
    }
  ]
}
```

### Ver errores en DASHBOARD:

1. Ve a tarjeta **"⚙️ Gestión"**
2. Selecciona tu sesión
3. Click en **"⚠️ Ver Errores"**

### Causas comunes:
- ❌ Sesión no autenticada (hacer login de nuevo)
- ❌ Número de teléfono inválido
- ❌ WhatsApp Web se cerró o desconectó
- ❌ Timeout esperando cargar WhatsApp Web

---

## 🔧 Parámetros Completos para `send-assistance-report`

| Campo | Tipo | Requerido | Ejemplo |
|-------|------|-----------|---------|
| `student` | string | ✅ | "yerson sanchez" |
| `time_assistance` | string | ✅ | "15:23:32" |
| `type_assistance` | string | ✅ | "entrance" o "exit" |
| `phoneNumber` | string | ✅ | "944101233" |
| `classroom` | boolean | ❌ | true / false |
| `isCommunicated` | boolean | ❌ | true / false |
| `communicated` | string | ❌ | "verificación de teléfono" |

---

## 🚀 Flujo Rápido en Postman (Environment Variables)

Crea un **Environment** con:
```json
{
  "baseUrl": "http://localhost:3000",
  "sessionName": "default"
}
```

Luego usa:

1. **Create Session**
   ```
   POST {{baseUrl}}/whatsapp/colegios/default/sessions
   ```

2. **Check Auth**
   ```
   GET {{baseUrl}}/whatsapp/sessions
   ```

3. **Send Message**
   ```
   POST {{baseUrl}}/whatsapp/sessions/{{sessionName}}/send-assistance-report
   ```

4. **Check Queue**
   ```
   GET {{baseUrl}}/whatsapp/queues/{{sessionName}}
   ```

---

## 💡 Preguntas Frecuentes

### ❓ ¿A quién le envía el mensaje?
**Respuesta:** Al teléfono que especifiques en `phoneNumber` (ej: padre/apoderado)

### ❓ ¿Por qué dice "Agregado a la cola"?
**Respuesta:** Los mensajes son **asincronos**. Se procesan en background cada 1 segundo. No esperes respuesta inmediata.

### ❓ ¿Puedo enviar múltiples mensajes?
**Respuesta:** Sí. Cada uno se agrega a la cola y se procesa en orden (FIFO).

### ❓ ¿Qué pasa si se cierra WhatsApp Web?
**Respuesta:** Los mensajes quedarán en `pending`. La sesión se marcará como `isAuthenticated: false`. Deberás crear una nueva sesión y escanear el QR de nuevo.

### ❓ ¿Puedo usar múltiples sesiones?
**Respuesta:** Sí. Cada una tiene su propia cola. USA el parámetro `:name` para cambiar entre sesiones.

---

## 📸 Captura de Pantalla (Útil para debugging)

### Con POSTMAN:
```http
GET http://localhost:3000/whatsapp/sessions/default/screenshot
```
Devuelve un blob PNG que puedes guardar.

### Con DASHBOARD:
1. Ve a **"📸 Captura de Pantalla"**
2. Selecciona sesión
3. Click **"📷 Capturar"**
4. Se mostrará la imagen

---

## 🎬 Resumen del Flujo

```
┌─────────────────────────────────────────┐
│  1. POST /colegios/default/sessions     │
│     Obtener QR                          │
└────────────────┬────────────────────────┘
                 │
                 ↓
        📱 Escanear QR
                 │
                 ↓
┌─────────────────────────────────────────┐
│  2. GET /sessions                       │
│     Verificar isAuthenticated: true     │
└────────────────┬────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────┐
│  3. POST /sessions/default/send-...     │
│     Enviar mensaje (agrega a cola)      │
└────────────────┬────────────────────────┘
                 │
                 ↓
         🔄 Procesamiento en background
         (cada 1000ms)
                 │
                 ↓
┌─────────────────────────────────────────┐
│  4. GET /queues/default                 │
│     Ver status: "completed" ✅          │
└─────────────────────────────────────────┘
```

¡Listo! Ahora entiendes el flujo completo. 🎉
