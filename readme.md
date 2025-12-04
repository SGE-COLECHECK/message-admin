# Message Admin - Sistema Multi-Navegador WhatsApp

Sistema de administración de mensajes de WhatsApp con soporte para **múltiples cuentas dinámicas**.

## 🚀 Nuevo: Sistema Dinámico Multi-Navegador

Este proyecto ahora soporta **N navegadores** de forma dinámica. Puedes gestionar 2, 3, 4 o más cuentas de WhatsApp simultáneamente.

### Características

- ✅ **Configuración JSON centralizada** - Agrega cuentas sin modificar código
- ✅ **Scripts cross-platform** - Linux (.sh) y Windows (.bat)
- ✅ **Modo headless** - Ejecuta sin interfaz gráfica
- ✅ **Auto-detección de navegadores** - Edge, Chrome, Chromium
- ✅ **Habilitar/Deshabilitar cuentas** individualmente

### Inicio Rápido

1. **Configurar cuentas** en `browsers.config.json`:
```json
{
  "headless": false,
  "accounts": [
    {
      "id": "ieguillermo",
      "description": "Colegio IE Guillermo",
      "debuggingPort": 9222,
      "enabled": true
    },
    {
      "id": "ieindependencia",
      "description": "Colegio IE Independencia",
      "debuggingPort": 9223,
      "enabled": true
    }
  ]
}
```

2. **Lanzar navegadores**:
```bash
# Linux/macOS
./start-browsers.sh

# Windows
start-browsers.bat
```

3. **Iniciar aplicación**:
```bash
npm run start:dev
```

📚 **[Ver Guía Completa](MULTI_BROWSER_GUIDE.md)** para más detalles sobre configuración, modo headless, y troubleshooting.

---

## 📋 Comandos de Mantenimiento

# Eliminar los archivos de lock que Chrome crea
rm -rf /root/message-admin/profiles/ieguillermo/SingletonLock
rm -rf /root/message-admin/profiles/ieindependencia/SingletonLock
rm -rf /root/message-admin/profiles/ieguillermo/SingletonSocket
rm -rf /root/message-admin/profiles/ieindependencia/SingletonSocket

# Luego reinicia la app
npm run start:dev


# Eliminar perfiles completamente
rm -rf /root/message-admin/profiles/ieguillermo
rm -rf /root/message-admin/profiles/ieindependencia

# Luego reinicia - se crearán nuevos perfiles limpios
npm run start:dev

microsoft-edge --remote-debugging-port=9222

# API Endpoints para Postman

Aquí se describen los endpoints de la API para que puedas probarlos con Postman.

**URL Base:** `http://localhost:3000` (Asegúrate de que este sea el puerto correcto donde corre tu aplicación)

---

### 1. Enviar Reporte de Asistencia

Este endpoint se usa para enviar un reporte de asistencia a un número de teléfono específico a través de una sesión de WhatsApp ya iniciada.

*   **Método:** `POST`
*   **URL:** `https://<TU_URL_DE_NGROK>/wapp-web/<ACCOUNT_ID>/send-report`

    *   **`<TU_URL_DE_NGROK>`**: Es la URL que te da ngrok, por ejemplo: `https://8d1fa9305ce6.ngrok-free.app`. **Esta URL cambia cada vez que reinicias ngrok.**
    *   **`<ACCOUNT_ID>`**: Es el nombre del perfil/cuenta que está usando WhatsApp, por ejemplo: `ieindependencia` o `ieguillermo`.

    **Ejemplo de URL completa:** `https://8d1fa9305ce6.ngrok-free.app/wapp-web/ieindependencia/send-report`

#### ¿Cómo usar en Postman?

1.  Selecciona el método **POST**.
2.  Pega la URL completa en Postman, asegurándote de usar tu URL de ngrok actual y el `accountId` correcto.
3.  Ve a la pestaña **Body**.
4.  Selecciona la opción **raw**.
5.  En el menú desplegable que aparece a la derecha, elige **JSON**.
6.  Pega el siguiente cuerpo (body) en formato JSON. Reemplaza los valores con la información real que quieres enviar.

```json
{
    "time_assistance": "08:30:00",
    "student": "Nombre del Estudiante",
    "phoneNumber": "51965352740",
    "type_assistance": "entrance",
    "classroom": false,
    "isCommunicated": false,
    "communicated": "Agreguenos como contacto para evitar baneos de whatsapp"
}
```

---

### Obtener todos los mensajes (Ejemplo)

Este es un endpoint de ejemplo para obtener todos los mensajes.

*   **Método:** `GET`
*   **URL:** `/api/messages`

#### Respuesta esperada (Ejemplo)

```json
[
    {
        "id": 1,
        "to": "numero_de_telefono_1",
        "message": "Hola, este es un mensaje de prueba.",
        "status": "sent"
    }
]
```

