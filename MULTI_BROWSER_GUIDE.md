# 🚀 Guía del Sistema Multi-Navegador Dinámico

## 📋 Descripción General

Este sistema te permite gestionar **múltiples cuentas de WhatsApp** de forma dinámica y escalable. Puedes tener 2, 3, 4 o más navegadores ejecutándose simultáneamente, cada uno con su propia sesión de WhatsApp.

### ✨ Características

- ✅ **Configuración centralizada** en un solo archivo JSON
- ✅ **Escalable** - Agrega N cuentas sin modificar código
- ✅ **Cross-platform** - Scripts para Linux y Windows
- ✅ **Modo headless** - Ejecuta navegadores sin interfaz gráfica
- ✅ **Auto-detección** - Encuentra automáticamente navegadores disponibles
- ✅ **Habilitar/Deshabilitar** cuentas individualmente

---

## 🎯 Inicio Rápido

### 1. Configurar Cuentas

Edita el archivo `browsers.config.json` en la raíz del proyecto:

```json
{
  "headless": false,
  "browserExecutable": {
    "linux": "microsoft-edge",
    "windows": "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  },
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

### 2. Lanzar Navegadores

**En Linux/macOS:**
```bash
chmod +x start-browsers.sh
./start-browsers.sh
```

**En Windows:**
```cmd
start-browsers.bat
```

### 3. Iniciar Aplicación NestJS

```bash
npm run start:dev
```

---

## 📝 Configuración Detallada

### Estructura del Archivo `browsers.config.json`

```json
{
  "headless": false,              // true = sin interfaz, false = con ventanas
  "browserExecutable": {
    "linux": "microsoft-edge",    // Comando del navegador en Linux
    "windows": "C:\\..."          // Ruta completa en Windows
  },
  "accounts": [                   // Array de cuentas
    {
      "id": "cuenta1",            // ID único (sin espacios)
      "description": "Nombre",    // Descripción legible
      "debuggingPort": 9222,      // Puerto único para esta cuenta
      "enabled": true             // true = activa, false = deshabilitada
    }
  ]
}
```

### Campos Importantes

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `headless` | boolean | `true` para modo sin interfaz, `false` para ver ventanas |
| `browserExecutable.linux` | string | Comando del navegador en Linux (ej: `microsoft-edge`, `google-chrome`) |
| `browserExecutable.windows` | string | Ruta completa al ejecutable en Windows |
| `accounts[].id` | string | Identificador único (usado en URLs de API) |
| `accounts[].debuggingPort` | number | Puerto único para cada navegador (9222, 9223, 9224...) |
| `accounts[].enabled` | boolean | Si está activa o no |

---

## 🔧 Agregar Nuevas Cuentas

### Paso 1: Editar `browsers.config.json`

Agrega un nuevo objeto al array `accounts`:

```json
{
  "accounts": [
    // ... cuentas existentes ...
    {
      "id": "iesanmartin",
      "description": "Colegio IE San Martin",
      "debuggingPort": 9224,
      "enabled": true
    }
  ]
}
```

### Paso 2: Asignar Puerto Único

Cada cuenta **debe tener un puerto diferente**:
- Cuenta 1: `9222`
- Cuenta 2: `9223`
- Cuenta 3: `9224`
- Cuenta 4: `9225`
- etc.

### Paso 3: Reiniciar Sistema

```bash
# 1. Detener navegadores actuales (Ctrl+C o cerrar ventanas)
# 2. Lanzar nuevamente
./start-browsers.sh  # o start-browsers.bat en Windows

# 3. Reiniciar aplicación NestJS
npm run start:dev
```

---

## 🎭 Modo Headless

### ¿Qué es el Modo Headless?

El modo headless ejecuta los navegadores **sin interfaz gráfica**, útil para:
- Servidores sin pantalla
- Reducir uso de recursos
- Automatización en producción

### Activar Modo Headless

Edita `browsers.config.json`:

```json
{
  "headless": true,  // ← Cambiar a true
  "accounts": [...]
}
```

### Desactivar Modo Headless

```json
{
  "headless": false,  // ← Cambiar a false para ver ventanas
  "accounts": [...]
}
```

> **⚠️ Importante:** En modo headless, debes escanear el código QR **antes** de activarlo, ya que no podrás ver la interfaz.

---

## 🌐 Usar las APIs

Cada cuenta tiene su propio endpoint basado en su `id`:

### Enviar Reporte de Asistencia

```http
POST /wapp-web/{accountId}/senddReport
Content-Type: application/json

{
  "time_assistance": "08:30:00",
  "student": "Juan Pérez García",
  "phoneNumber": "51965352740",
  "type_assistance": "entrance"
}
```

**Ejemplos:**
- Para `ieguillermo`: `POST /wapp-web/ieguillermo/senddReport`
- Para `ieindependencia`: `POST /wapp-web/ieindependencia/senddReport`
- Para `iesanmartin`: `POST /wapp-web/iesanmartin/senddReport`

### Verificar Estado (Ping)

```http
POST /wapp-web/{accountId}/ping-whatsapp
Content-Type: application/json

{
  "phoneNumber": "51965352740"
}
```

---

## 🐛 Troubleshooting

### Problema: "No se encontró ningún navegador disponible"

**Solución:**
1. Verifica que el navegador esté instalado
2. En Linux, prueba: `which microsoft-edge` o `which google-chrome`
3. Actualiza la ruta en `browsers.config.json`

### Problema: "No hay cuentas habilitadas"

**Solución:**
Asegúrate de que al menos una cuenta tenga `"enabled": true`:

```json
{
  "accounts": [
    {
      "id": "cuenta1",
      "enabled": true  // ← Debe ser true
    }
  ]
}
```

### Problema: Error de puerto en uso

**Solución:**
Cada cuenta necesita un puerto único. Verifica que no haya duplicados:

```json
// ❌ INCORRECTO (puertos duplicados)
{
  "accounts": [
    { "debuggingPort": 9222 },
    { "debuggingPort": 9222 }  // ← Duplicado!
  ]
}

// ✅ CORRECTO
{
  "accounts": [
    { "debuggingPort": 9222 },
    { "debuggingPort": 9223 }  // ← Único
  ]
}
```

### Problema: Navegadores no se cierran correctamente

**Solución Linux:**
```bash
# Matar todos los procesos de Edge/Chrome
pkill -f "remote-debugging-port"
```

**Solución Windows:**
```cmd
taskkill /F /IM msedge.exe
taskkill /F /IM chrome.exe
```

---

## 📊 Ejemplos de Configuración

### Configuración Mínima (2 Cuentas)

```json
{
  "headless": false,
  "browserExecutable": {
    "linux": "google-chrome",
    "windows": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  },
  "accounts": [
    {
      "id": "cuenta1",
      "description": "Cuenta Principal",
      "debuggingPort": 9222,
      "enabled": true
    },
    {
      "id": "cuenta2",
      "description": "Cuenta Secundaria",
      "debuggingPort": 9223,
      "enabled": true
    }
  ]
}
```

### Configuración Avanzada (5 Cuentas, 3 Activas)

```json
{
  "headless": false,
  "browserExecutable": {
    "linux": "microsoft-edge",
    "windows": "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  },
  "accounts": [
    {
      "id": "ieguillermo",
      "description": "IE Guillermo",
      "debuggingPort": 9222,
      "enabled": true
    },
    {
      "id": "ieindependencia",
      "description": "IE Independencia",
      "debuggingPort": 9223,
      "enabled": true
    },
    {
      "id": "iesanmartin",
      "description": "IE San Martin",
      "debuggingPort": 9224,
      "enabled": true
    },
    {
      "id": "iebolognesi",
      "description": "IE Bolognesi",
      "debuggingPort": 9225,
      "enabled": false,
      "comment": "Deshabilitado temporalmente"
    },
    {
      "id": "iesantarosa",
      "description": "IE Santa Rosa",
      "debuggingPort": 9226,
      "enabled": false,
      "comment": "En mantenimiento"
    }
  ]
}
```

### Configuración Producción (Headless)

```json
{
  "headless": true,
  "browserExecutable": {
    "linux": "chromium-browser",
    "windows": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  },
  "accounts": [
    {
      "id": "prod1",
      "description": "Producción 1",
      "debuggingPort": 9222,
      "enabled": true
    },
    {
      "id": "prod2",
      "description": "Producción 2",
      "debuggingPort": 9223,
      "enabled": true
    }
  ]
}
```

---

## 🔐 Mejores Prácticas

### 1. Nomenclatura de IDs

Usa IDs descriptivos y sin espacios:
- ✅ `ieguillermo`, `cuenta_principal`, `whatsapp-ventas`
- ❌ `Cuenta 1`, `IE Guillermo`, `cuenta principal`

### 2. Gestión de Puertos

- Comienza desde `9222` y aumenta secuencialmente
- Documenta qué puerto usa cada cuenta
- No reutilices puertos de cuentas deshabilitadas

### 3. Perfiles de Navegador

Los perfiles se guardan en:
- Linux: `~/message-admin/profiles/{accountId}/`
- Windows: `%USERPROFILE%\message-admin\profiles\{accountId}\`

**Limpieza de perfiles:**
```bash
# Eliminar perfil específico
rm -rf ~/message-admin/profiles/ieguillermo

# Eliminar todos los perfiles
rm -rf ~/message-admin/profiles/*
```

### 4. Backup de Configuración

```bash
# Hacer backup antes de cambios importantes
cp browsers.config.json browsers.config.json.backup
```

---

## 📚 Recursos Adicionales

- [Documentación de Puppeteer](https://pptr.dev/)
- [WhatsApp Web API](https://web.whatsapp.com/)
- [NestJS Documentation](https://docs.nestjs.com/)

---

## 💡 Tips y Trucos

### Verificar Cuentas Activas

```bash
# Ver cuántas cuentas están habilitadas
cat browsers.config.json | grep -A 3 '"enabled": true'
```

### Logs en Tiempo Real

```bash
# Ver logs de la aplicación
npm run start:dev | grep "WhatsappService"
```

### Probar Configuración sin Lanzar

```bash
# Validar JSON (Linux)
cat browsers.config.json | jq .

# Contar cuentas habilitadas
cat browsers.config.json | jq '.accounts[] | select(.enabled == true)' | wc -l
```

---

## 🆘 Soporte

Si encuentras problemas:

1. Verifica que `browsers.config.json` sea JSON válido
2. Revisa los logs de la aplicación NestJS
3. Confirma que los puertos no estén en uso
4. Asegúrate de que el navegador esté instalado

---

**¡Listo!** 🎉 Ahora tienes un sistema completamente dinámico y escalable para gestionar múltiples cuentas de WhatsApp.
