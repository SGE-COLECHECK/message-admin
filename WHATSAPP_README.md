# 📱 WhatsApp Automation Module

Este módulo permite enviar mensajes de WhatsApp automatizados utilizando Puppeteer y una cola persistente en Redis.

## 🚀 Características Principales

1.  **Cola Persistente en Redis**: Los mensajes se guardan en Redis (`whatsapp:queue:{accountId}`). Si el servidor se reinicia, los mensajes **NO se pierden**.
2.  **Multicuenta**: Soporta múltiples sesiones de WhatsApp simultáneas, cada una con su propia cola independiente.
3.  **Seguridad Reforzada**:
    *   **Validación de Bloqueo**: Los números bloqueados se rechazan inmediatamente en el API.
    *   **Verificación de Chat**: Antes de enviar, el sistema verifica que el título del chat coincida con el destinatario para evitar envíos erróneos.
    *   **Limpieza Atómica**: La interfaz se limpia automáticamente (Escape/Backspace) después de cada intento.

## ⚙️ Configuración

Asegúrate de tener las siguientes variables en tu archivo `.env`:

```env
# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Puppeteer
PUPPETEER_BROWSER_HOST=host.docker.internal # O la IP de tu máquina host si usas WSL/Docker
WHATSAPP_COUNTRY_CODE=51
```

## 🛠️ Uso del API

### 1. Enviar Reporte de Asistencia
**POST** `/wapp-web/:accountId/senddReport`

Cuerpo (JSON):
```json
{
  "student": "Juan Perez",
  "phoneNumber": "999888777",
  "time_assistance": "08:00",
  "type_assistance": "entrance"
}
```

### 2. Enviar Reporte de Clase
**POST** `/wapp-web/:accountId/class-attendance-report`

Cuerpo (JSON):
```json
{
  "destinatario": {
    "telefono": "999888777"
  },
  "message": "Hola, este es un mensaje personalizado..."
}
```

### 3. Ping / Test
**POST** `/wapp-web/:accountId/ping-whatsapp`

Cuerpo (JSON):
```json
{
  "phoneNumber": "999888777"
}
```

## 🛡️ Números Bloqueados
Los siguientes números están bloqueados por código y no recibirán mensajes:
*   `963828458`
*   `51963828458`

## 🔍 Monitoreo de Colas (Redis)
Puedes inspeccionar las colas usando `redis-cli`:

```bash
# Ver longitud de la cola para la cuenta 'ieguillermo'
LLEN whatsapp:queue:ieguillermo

# Ver los mensajes en cola
LRANGE whatsapp:queue:ieguillermo 0 -1
```
