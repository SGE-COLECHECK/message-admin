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
- **Processing Loop**: Runs every 1000ms (configurable via `QUEUE_PROCESSING_INTERVAL`), pulls pending items, executes via session pages
- **Env-Driven Timing**: Puppeteer delays (typing, clicks) are configurable via env vars:
  - `PUPPETEER_TYPING_DELAY=50` (ms between keystrokes)
  - `PUPPETEER_AFTER_CLICK_DELAY=150` (ms after DOM interactions)
  - `PUPPETEER_WAIT_FOR_UI_TIMEOUT=5000` (max wait for selectors)

### Session Persistence & Orphan Queue Cleanup
- Profiles stored in `./profiles/{sessionName}/` (Puppeteer's `userDataDir`)
- Docker volumes mount `./profiles:/app/profiles` for cross-container persistence
- Auth state persists in Chrome profile; no re-QR needed on restart if profile exists
- **⚠️ CRITICAL:** If session is not recreated after restart, its queue becomes "orphaned" in Redis
- **Auto-Cleanup:** `processAllQueues()` validates each queue's session exists before processing
  - If session missing from SessionManager, logs warning and **deletes orphaned queue automatically**
  - Prevents silent failures where messages get stuck in non-existent sessions
  - See `SOLUCION_SESIONES_HUERFANAS.md` for details

### Queue Item Processing Diagram
```
POST /send-assistance-report
  ↓
ScraperService.sendAssistanceReport()
  ↓
QueueService.addToQueue() → Redis RPUSH
  ↓
Response: "✅ Mensaje agregado a la cola" (ASYNCHRONOUS)
  ↓
[Every 1000ms] processAllQueues()
  ↓
Get session's Page → Use Puppeteer to send → Mark completed/failed
  ↓
Save to history or errors → Retry if needed
```

**CRITICAL**: Messages are queued **asynchronously**. HTTP success response ≠ message sent. Always check `/whatsapp/queues/:name` for actual status.

## Core Services & Responsibilities

| Service | Responsibility | Key Files |
|---------|---|---|
| **SessionManagerService** | In-memory Map of session name → Page | `services/session-manager.service.ts` |
| **BrowserService** | Launch browsers, create pages, manage profiles | `services/browser.service.ts` |
| **AuthService** | QR generation, auth detection, login flow | `services/auth.service.ts` |
| **QueueService** | Redis job queue, retry logic, processing loop | `services/queue.service.ts` |
| **ScraperService** | DOM interaction (send messages, construct formatted messages) | `services/scraper.service.ts` |
| **StatsService** | Track queue metrics (completed, failed, pending) | `services/stats.service.ts` |

## Endpoints & Typical Workflows

### Session Management
- `POST /whatsapp/sessions` — Create session, start auth flow, get QR
- `GET /whatsapp/sessions` — List active sessions with auth status
- `GET /whatsapp/sessions/:name/qr` — Get QR if waiting auth
- `GET /whatsapp/sessions/:name/status` — Check auth state
- `DELETE /whatsapp/sessions/:name` — Close browser, clear session

### Messaging
- `POST /whatsapp/sessions/:name/send-assistance-report` — Queue formatted message (async)
- `GET /whatsapp/queues` — All queue statuses
- `GET /whatsapp/queues/:name` — Specific queue with pending/processing/completed items
- `GET /whatsapp/queues/:name/errors` — Failed messages with error details
- `DELETE /whatsapp/queues/:name` — Clear queue

### Critical: Async Messaging Pattern
```typescript
// ❌ DON'T: Assume message is sent immediately
const result = await sessionManager.sendMessage(...);
if (result.success) {
  // Message is NOT sent yet, only queued!
}

// ✅ DO: Check queue status
const status = await queueService.getQueueStatus(sessionName);
const completed = status.items.filter(i => i.status === 'completed');
```

## NestJS Module Structure

```
src/
├── app.module.ts          # Root: imports WhatsappModule, ConfigModule
├── main.ts                # Bootstrap: port 3000, ValidationPipe, static assets /public
└── whatsapp/
    ├── whatsapp.module.ts # Declares all services, WhatsappController
    ├── whatsapp.controller.ts # HTTP routes
    ├── dto/                # CreateSessionDto, SendAssistanceDto, etc.
    ├── interfaces/         # Session interface (name, page, isAuthenticated, qrCode)
    └── services/
        ├── session-manager.service.ts
        ├── browser.service.ts
        ├── auth.service.ts
        ├── queue.service.ts
        ├── scraper.service.ts
        └── stats.service.ts
```

**Convention**: Services use `@Injectable()` and are auto-injected via constructor. DTOs validated with `class-validator` decorators.

## Development & Debugging

### Local Setup (npm run start:dev)

```bash
# 1. Start Redis in another terminal
redis-server
# OR: docker run -d -p 6379:6379 redis:7-alpine

# 2. Ensure .env.development has REDIS_HOST=localhost
cat .env.development

# 3. Install and run
npm install
npm run start:dev

# 4. Verify logs show:
# ✅ Conectado a Redis
# 🔄 Procesamiento de colas iniciado (cada 1000ms)
```

### Docker Deployment (Production)

```bash
# Ensure .env.production has REDIS_HOST=redis (service name)
cat .env.production

# Start everything
docker-compose up -d

# Verify logs
docker logs whatsapp_app | grep "✅ Conectado\|🔄 Procesamiento"
docker logs whatsapp_redis_queue | grep "ready to accept"
```

### Key Configuration Files

| File | Purpose |
|------|---------|
| `.env.development` | Local dev: `REDIS_HOST=localhost` |
| `.env.production` | Docker: `REDIS_HOST=redis` |
| `docker-compose.yml` | Orchestrates app + Redis containers |
| `tsconfig.json` | ES2023, strict null checks |
| `eslint.config.mjs` | Flat config format (not .eslintrc.js) |

### Common Debugging Patterns

1. **Queue not processing?**
   ```bash
   # Check Redis connection
   redis-cli KEYS 'queue:*'
   
   # Check if QueueService initialized
   npm run start:dev | grep "🔄 Procesamiento"
   
   # See detailed processing logs
   npm run start:dev 2>&1 | grep -E "\[QUEUE\]|\[PUPPETEER\]"
   ```

2. **Session not authenticating?**
   ```bash
   # Check if Browser initialized
   curl http://localhost:3000/whatsapp/sessions
   
   # If no sessions exist, the browser failed to launch
   # Check: BrowserService headless mode (set to false to see browser)
   ```

3. **Message not sending?**
   ```bash
   # Verify session is authenticated
   curl http://localhost:3000/whatsapp/sessions
   # isAuthenticated must be true
   
   # Check queue errors
   curl http://localhost:3000/whatsapp/queues/default/errors
   
   # Look for screenshots in project root
   ls -la error-*.png
   ```

## TypeScript & Linting

- **Target**: ES2023 (see `tsconfig.json`)
- **Strict Mode**: Enabled (`strictNullChecks: true`, `noImplicitAny: false`)
- **ESLint Config**: `eslint.config.mjs` (flat config format, NOT .eslintrc.js)
  - Allows loose any types (`@typescript-eslint/no-explicit-any: off`)
  - Warns on floating promises (queue jobs should always await)
- **Class Validation**: `class-validator` + `ValidationPipe` validate all DTOs on POST/PUT
  - All required DTO fields must be provided in tests/requests

## Docker-Specific Considerations

1. **Redis Host**: Inside containers, use service name `redis`, NOT `localhost`
   - `.env.production`: `REDIS_HOST=redis`
   - This refers to the `redis:` service in docker-compose.yml

2. **Chrome/Chromium**: 
   - Dockerfile installs system `chromium` package
   - Sets `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`
   - Sets `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`

3. **Shared Memory**: Set `shm_size: 1gb` in docker-compose.yml (Chrome needs extra memory)

4. **Health Checks**: Both app and Redis have health checks; app waits for Redis to be healthy before starting

5. **Volume Persistence**:
   - `./profiles:/app/profiles` — Chrome session data (CRITICAL)
   - `./wwebjs_auth:/app/.wwebjs_auth` — Alternative auth storage
   - `./public:/app/public` — Static HTML files
   - `redis_data:/data` — Redis persistence

## Key Files for Extending Features

| Feature | Edit These Files | Notes |
|---------|---|---|
| Add new endpoint | `whatsapp.controller.ts`, create DTO in `dto/` | Always add `@Body()` validation |
| Change auth flow | `auth.service.ts` | Modify QR extraction or login detection logic |
| Modify message sending | `scraper.service.ts` | Update DOM selectors (WhatsApp Web structure changes frequently) |
| Adjust performance | `.env` vars or `docker-compose.yml` | PUPPETEER_TYPING_DELAY, PUPPETEER_WAIT_FOR_UI_TIMEOUT, QUEUE_PROCESSING_INTERVAL |
| Add metrics/tracking | `stats.service.ts` | Already tracks pending/completed/failed counts |
| Handle new message format | `send-assistance.dto.ts` + `scraper.service.ts` | DTO defines shape, scraper formats the message content |

## Testing

- Unit tests in `test/` use Jest
- E2E tests use `test/jest-e2e.json` config
- All DTOs must include required fields; ValidationPipe rejects incomplete requests
- Queue processing is async; tests should use `getQueueStatus()` to verify completion rather than checking immediately

## Common Patterns & Anti-Patterns

### ✅ DO: Async Session Operations

```typescript
// Messages are queued, not sent immediately
const queueId = await this.queueService.addToQueue(sessionName, phone, msg);
// This returns immediately; actual sending happens in background loop

// To check if sent:
const status = await this.queueService.getQueueStatus(sessionName);
const item = status.items.find(i => i.id === queueId);
if (item?.status === 'completed') { /* sent */ }
```

### ❌ DON'T: Assume Immediate Completion

```typescript
// ❌ WRONG: Assuming message is sent after queue returns
await this.queueService.addToQueue(sessionName, phone, msg);
return { success: true }; // User thinks message was sent!

// ✅ RIGHT: Tell user message is queued
const queueId = await this.queueService.addToQueue(...);
return { success: true, queueId, status: 'pending' };
```

### ✅ DO: Use Detailed Error Logging

```typescript
// QueueService now logs with prefixes for easy filtering
// [QUEUE] - Redis queue operations
// [PUPPETEER] - Browser automation
// [ERROR] - Failures with context

npm run start:dev 2>&1 | grep "\[QUEUE\]"  // See all queue events
npm run start:dev 2>&1 | grep "\[PUPPETEER\]"  // See all browser automation
```

### ✅ DO: Diagnose Issues Systematically

```bash
# 1. Verify Redis
redis-cli ping

# 2. Check session auth
curl http://localhost:3000/whatsapp/sessions

# 3. View queue status
curl http://localhost:3000/whatsapp/queues/default

# 4. Check errors
curl http://localhost:3000/whatsapp/queues/default/errors
```

## Troubleshooting Reference

See these files for detailed help:
- `QUICK_FIX.md` — Common problems & solutions
- `DEBUG_REDIS_QUEUE.md` — Deep dive into queue debugging
- `SETUP_DEV_VS_PROD.md` — Development vs production setup
- `diagnose-queue.sh` — Automated diagnostic script

Run diagnostic:
```bash
bash diagnose-queue.sh
```
