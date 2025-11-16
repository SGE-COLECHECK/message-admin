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







Añade un mensaje a la cola (como antes vía endpoint o usando QueueService.addToQueue):
Nota: addToQueue(sessionName, phoneNumber, message) ahora usará key whatsapp-queue:<sessionName>.
Observa logs:
Pool startup: 🧰 Inicializando pool de navegadores (max N) y ✅ Pool browser #i iniciado
Procesamiento de un item:
📱 [PUPPETEER] Iniciando envío para ...
📱 [PUPPETEER] Página lista, enviando mensaje...
✅ [QUEUE] Completado... o ❌ [QUEUE] Error...
Tiempos: ⏱️ [TIMING] Tiempo total (enqueue → envío): ...
Operaciones y migración

Si antes guardabas perfiles Chromium enteros en profiles/<session> y no tienes cookies.json:
Extrae cookies desde la instalación existente (ejecuta un script en un Chrome con ese profile o abre una página y copia document.cookie en formato correcto), y guarda en profiles/<colegioId>/cookies.json.
Alternativamente, modifica SessionManagerService.loadSession para leer cookies desde otro fichero u origen si es necesario.
Limpieza de perfiles:
Aun puedes mantener perfiles completos en disco (por compatibilidad), pero la nueva operación usa sólo cookies. Con el tiempo puedes archivar/destruir Cache/ etc con cleanupInactiveSessions().
Limitaciones y puntos a revisar (sugerencias)

Cookies expiradas: si las cookies caducaron, la llamada a WhatsApp dará error y el job fallará. Necesitas un mecanismo para re-login (manual o automatizado).
Dependencia de page.setCookie: algunas cookies necesitan campos específicos (domain, path); si setCookie falla, intento seguir e iniciar la página y detectar estado de login.
Seguridad: el pool y contextos comparten el mismo proceso Chromium; aunque los contexts son aislados por cookies/estado JS, evalúa el riesgo si code injection o cross-tenant data es crítico.
Tests E2E: ideal escribir pruebas de integración con 2 colegios usando Redis y un Chromium real para verificar concurrencia.
Siguientes pasos que puedo implementar por prioridad
Elige uno y lo implemento en el repo:

Hacer que ScraperService tenga helper para exportar cookies desde una página ya autenticada (UI) y guardarlas en profiles/<colegioId>/cookies.json (workflow de onboarding).
Implementar un LRU para sesiones activas: cerrar contextos/browsers por inactividad y mantener solo K sesiones "hot".
Agregar métricas Prometheus (memoria, pool usage, queue lengths) y alertas.
Migración automática de llaves antiguas queue:* → whatsapp-queue:* con script.
Ajustar para que los navegadores del pool respeten flags más agresivos de ahorro de memoria o usar --single-process/--no-zygote solo si validas.
Si quieres, hago un PR con:

Tests unitarios básicos para SessionManagerService.load/save.
Un script scripts/export-cookies-from-profile.js que ayuda a generar cookies.json desde un profile local.
Preguntas rápidas para afinar lo siguiente

¿Quieres que el sistema intente un re-login automático si las cookies fallan? (requeriría guardar credenciales o un flow de reconexión)
¿Prefieres mantener compatibilidad con las colas antiguas queue:* o puedo migrarlas automáticamente al arrancar?
¿Qué valor quieres para MAX_BROWSERS por defecto en producción (recomiendo 2–4 según RAM disponible)?
Si quieres que aplique alguno de los siguientes cambios automáticos (por ejemplo: migrar colas, agregar export cookie helper o añadir métricas), dime cuál y lo implemento ahora.