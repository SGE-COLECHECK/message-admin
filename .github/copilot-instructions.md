# Message-Admin: AI Agent Instructions

## Project Overview

**message-admin** is a NestJS-based WhatsApp automation server that manages multiple concurrent WhatsApp sessions via Puppeteer browser automation. It enables programmatic message sending, session management, and queue-based job processing.

### Key Architecture Pattern: Session + Queue Paradigm

The application uses **two parallel systems**:
1. **Session Management** (in-memory): Stores active Puppeteer pages mapped to session names
2. **Queue System** (Redis): Persists message jobs for resilient processing across restarts

Data flows: HTTP Request → Controller → Service → SessionManager OR QueueService → Puppeteer Browser

## Critical Architecture: Session & Queue Lifecycle

### Session Lifecycle (Puppeteer-based)
1. **Create Session** → `SessionManagerService` stores session object with `Page` reference
2. **Auth Flow** → `AuthService` navigates to `web.whatsapp.com`, extracts QR, awaits manual scan
3. **Active Session** → Session becomes authenticated; messages can be sent via stored `Page`
4. **Cleanup** → Session must be manually deleted (no auto-cleanup)

### Message Queue System
- **Redis Queue** (`QueueService`): Stores `QueueItem` objects with retry logic (default 3 retries, 5s delay)
- **Processing Loop**: Runs every 1000ms, pulls pending items, executes via session pages
- **Env-Driven Timing**: Puppeteer delays (typing, clicks) are configurable via env vars:
  - `PUPPETEER_TYPING_DELAY=50` (ms between keystrokes)
  - `PUPPETEER_AFTER_CLICK_DELAY=150` (ms after DOM interactions)
  - `PUPPETEER_WAIT_FOR_UI_TIMEOUT=5000` (max wait for selectors)

### Session Persistence
- Profiles stored in `./profiles/{sessionName}/` (Puppeteer's `userDataDir`)
- Docker volumes mount `./profiles:/app/profiles` for cross-container persistence
- Auth state persists in Chrome profile; no re-QR needed on restart if profile exists

## Core Services & Responsibilities

| Service | Responsibility | Key Files |
|---------|---|---|
| **SessionManagerService** | In-memory Map of session name → Page | `services/session-manager.service.ts` |
| **BrowserService** | Launch browsers, create pages, manage profiles | `services/browser.service.ts` |
| **AuthService** | QR generation, auth detection, login flow | `services/auth.service.ts` |
| **QueueService** | Redis job queue, retry logic, processing loop | `services/queue.service.ts` |
| **ScraperService** | DOM interaction (send messages, extract data) | `services/scraper.service.ts` |
| **StatsService** | Track queue metrics (completed, failed, pending) | `services/stats.service.ts` |

## Endpoints & Typical Workflows

### Session Management
- `POST /whatsapp/sessions` — Create session, start auth flow, get QR
- `GET /whatsapp/sessions` — List active sessions with auth status
- `GET /whatsapp/sessions/:name/status` — Check auth state
- `DELETE /whatsapp/sessions/:name` — Close browser, clear session

### Messaging
- `POST /whatsapp/messages` — Queue message (immediately added to Redis)
- `GET /whatsapp/queue/stats` — Get queue metrics (pending, completed, failed)

**Critical**: Messages are **queued asynchronously**. Immediate `POST /messages` success ≠ message sent. Check stats or logs for actual delivery.

## NestJS Module Structure

```
src/
├── app.module.ts          # Root: imports WhatsappModule, ConfigModule
├── main.ts                # Bootstrap: port 3000, static assets /public
└── whatsapp/
    ├── whatsapp.module.ts # Declares all services, WhatsappController
    ├── whatsapp.controller.ts # HTTP routes
    ├── dto/                # CreateSessionDto, SendMessageDto, etc.
    ├── interfaces/         # Session interface (name, page, isAuthenticated)
    └── services/
        ├── session-manager.service.ts
        ├── browser.service.ts
        ├── auth.service.ts
        ├── queue.service.ts
        ├── scraper.service.ts
        └── stats.service.ts
```

**Convention**: Services use `@Injectable()` and are auto-injected via constructor.

## Development & Debugging

### Local Setup
```bash
npm install
npm run start:dev              # Watch mode, auto-reload
npm run lint                   # ESLint + Prettier
npm run test                   # Jest unit tests
npm run test:e2e              # E2E tests (test/jest-e2e.json)
```

### Docker Deployment
```bash
docker-compose up -d          # Builds app image, starts Redis
```
- App runs at `http://localhost:3000`
- Redis available at `localhost:6379` (or `redis:6379` from app container)
- Volumes: `./profiles` (persistent Chrome sessions), `./public` (static HTML)

### Common Debugging
1. **Session not authenticating?** Check browser console in `headless: false` mode (see `browser.service.ts`)
2. **Queue jobs failing?** Inspect `StatsService` metrics via `GET /whatsapp/queue/stats`
3. **Messages not sending?** Verify session is authenticated (`GET /sessions/:name/status`) and target phone exists in contacts

## TypeScript & Linting

- **Target**: ES2023 (see `tsconfig.json`)
- **Strict Mode**: Enabled (`strictNullChecks: true`)
- **ESLint Config**: `eslint.config.mjs` (flat config format, not .eslintrc.js)
  - Allows loose any types (`@typescript-eslint/no-explicit-any: off`)
  - Warns on floating promises (jobs should await)
- **Class Validation**: `class-validator` + `ClassTransformPipe` validate DTOs on POST/PUT

## Key Files for Extending Features

| Feature | Edit These Files |
|---------|---|
| Add new endpoint | `whatsapp.controller.ts`, create DTO in `dto/` |
| Change auth flow | `auth.service.ts` (QR extraction, login detection) |
| Modify DOM selectors | `scraper.service.ts` (hardcoded WhatsApp Web selectors) |
| Adjust timing | `.env` or `docker-compose.yml` env vars (PUPPETEER_* vars) |
| Add metrics | `stats.service.ts` (already tracks pending/completed/failed) |

## Docker-Specific Gotchas

1. **Chromium not found?** Dockerfile installs system `chromium` + sets `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`
2. **Session profiles not persisting?** Ensure `./profiles` is mounted as volume
3. **Redis host wrong?** In Docker, use `redis` (service name), not `localhost`
4. **Memory crash?** Increase `shm_size: 1gb` in docker-compose.yml (Chrome needs shared memory)

## Testing

- Unit tests in `test/` use Jest
- `ValidationPipe` validates all DTOs; tests must include required DTO fields
- No database ORM (sessions are in-memory, messages in Redis)

## Common Patterns

### Async Session Operations
```typescript
// ❌ DON'T: Assume immediate completion
await sessionManager.set(session);
// ✅ DO: Session is available immediately; pages process async
```

### Queue Processing
```typescript
// Messages are queued, not sent immediately
// QueueService.processAllQueues() runs every QUEUE_PROCESSING_INTERVAL ms
// Check stats for actual completion
```

### Puppeteer Page Handling
- Never reuse pages across sessions; each session gets unique `Page` instance
- `AuthService.waitForAuthentication()` is a Promise that resolves when DOM indicates login
- All page interactions use `page.goto()`, `page.click()`, `page.type()` with configured delays
