NestJS arranca
   ↓
Carga WhatsappModule
   ↓
Ejecuta onModuleInit() → lanza Puppeteer
   ↓
Puppeteer abre navegador → va a web.whatsapp.com
   ↓
(Desde el navegador puedes escanear el QR)
   ↓
Puedes controlar abrir/cerrar desde /whatsapp/open o /whatsapp/close



src/
├── app.module.ts
├── main.ts
│
├── common/                     # Código reutilizable en toda la app
│   ├── constants/              # Constantes (ej. SELECTORES DE CSS)
│   ├── decorators/             # Decoradores personalizados
│   ├── filters/                # Filtros de excepción global
│   └── utils/                  # Funciones de ayuda (ej. formatear número)
│
├── config/                     # Configuración (TypeORM, Redis, etc.)
│   └── configuration.ts        # Usando @nestjs/config
│
├── whatsapp/                   # Módulo principal de WhatsApp
│   ├── dto/                    # Data Transfer Objects
│   │   ├── create-session.dto.ts
│   │   └── send-message.dto.ts
│   ├── interfaces/             # Contratos y Tipos
│   │   └── session.interface.ts
│   ├── whatsapp.module.ts
│   ├── whatsapp.controller.ts  # Solo maneja peticiones HTTP
│   └── services/               # Lógica de negocio, dividida
│       ├── session-manager.service.ts  # ¡CLAVE! Gestiona múltiples sesiones
│       ├── browser.service.ts          # Lanza y cierra el navegador
│       ├── auth.service.ts             # Maneja QR y estado de login
│       └── scraper.service.ts          # Interactúa con el DOM de WhatsApp
│
├── messaging/                  # Módulo de colas de mensajes
│   ├── dto/
│   │   └── message-job.dto.ts
│   ├── messaging.module.ts
│   ├── processors/
│   │   └── message.processor.ts       # El "trabajador" que procesa la cola
│   └── interfaces/
│       └── job.interface.ts
│
└── public/
    └── index.html



docker compose up -d redis