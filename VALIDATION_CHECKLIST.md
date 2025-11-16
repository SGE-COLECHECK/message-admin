# ✅ Pool Assignment Model: Validation Checklist

This document provides a step-by-step checklist to verify that the new pool assignment architecture is working correctly.

---

## Pre-Test Verification

### Code Compilation
- [ ] Run `npm run build`
- [ ] Output: "nest build" completes with NO errors
- [ ] Verify: `dist/` directory exists with compiled JS

### Dependencies
- [ ] Redis running: `redis-cli ping` → "PONG"
- [ ] Node 18+: `node --version` → v18.x or higher
- [ ] npm packages installed: `npm list puppeteer` shows version

---

## Test 1: Server Startup

### Startup
```bash
npm run start:dev
```

### Verify Logs
- [ ] See: `✅ Pool Navegador #1 iniciado`
- [ ] See: `✅ Pool Navegador #2 iniciado`
- [ ] See: `✅ Pool Navegador #3 iniciado`
- [ ] See: `🔄 Procesamiento de colas iniciado`
- [ ] See: `✅ Conectado a Redis`

### Browser Windows
- [ ] 3 visible Chromium browser windows appear on screen
- [ ] Each window is labeled/identifiable (Pool #1, #2, #3)
- [ ] Windows show: "Chromium" or "Chrome" in title bar
- [ ] Windows are NOT headless (you can see them interact)

---

## Test 2: Create Session & Get QR

### Request
```bash
curl -X POST http://localhost:3000/colegios/colegio-a/sessions \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Response Verification
- [ ] HTTP Status: 200 OK
- [ ] Response includes `poolId` (should be 1, 2, or 3)
- [ ] Response message includes: "Pool Navegador #X"
- [ ] Response includes `qrCode` (data:image/png;base64...)
- [ ] Response includes `isAuthenticated: false`

**Example Response:**
```json
{
  "message": "Sesión para 'colegio-a' creada. Escanea el QR en Pool Navegador #2.",
  "isAuthenticated": false,
  "poolId": 2,
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANS..."
}
```

### Browser Behavior
- [ ] One of the 3 visible browser windows navigates to WhatsApp Web
- [ ] The window that navigates matches the `poolId` returned (e.g., Pool #2)
- [ ] QR code appears in that browser window
- [ ] Other browsers (Pool #1, #3) remain idle

### Dashboard (Optional)
- [ ] Open `http://localhost:3000/` in your main browser
- [ ] Click "Crear Sesión / QR"
- [ ] Select a colegio
- [ ] Message shows: "🖥️ Pool Navegador #2: Esperando escaneo..."

---

## Test 3: Verify Pool Assignment

### Check Session Status
```bash
curl http://localhost:3000/whatsapp/sessions
```

### Response Verification
- [ ] Session appears in list with name: `colegio-a`
- [ ] Field `isAuthenticated: false` (not yet scanned QR)
- [ ] Session has `poolId: 2` (or whichever was assigned)
- [ ] Field `page` exists (non-null)

**Example Response:**
```json
{
  "sessions": [
    {
      "name": "colegio-a",
      "isAuthenticated": false,
      "poolId": 2,
      "page": "Page object"
    }
  ]
}
```

### Pool State Verification
- [ ] Check server logs for: `✅ Sesión 'colegio-a' asignada a Pool #2`
- [ ] That pool remains assigned until session is deleted

---

## Test 4: Authentication (Manual QR Scan)

### QR Scanning
- [ ] Find the pool browser window (Pool #2 from example)
- [ ] Scan the QR code with your WhatsApp mobile phone
- [ ] Monitor the browser - should show WhatsApp Web interface loading
- [ ] Wait 3-5 seconds for full loading

### Verification After Auth
```bash
curl http://localhost:3000/whatsapp/sessions
```

### Response Verification
- [ ] `isAuthenticated: true` for the session
- [ ] `poolId: 2` still assigned (unchanged)
- [ ] Chat list visible in the Pool #2 browser window

### Log Verification
- [ ] Server logs show: `✅ Autenticación exitosa para 'colegio-a'`
- [ ] Logs include: `🖥️ [Pool #2]` entries

---

## Test 5: Queue Message Sending

### Send Message Request
```bash
curl -X POST http://localhost:3000/colegios/colegio-a/sessions/send-assistance-report \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "943828123",
    "student": "Juan Pérez",
    "time": "14:30:45",
    "type": "entrance",
    "inClassroom": true,
    "communicatedToParents": false,
    "notes": "Verificar asistencia"
  }'
```

### Response Verification
- [ ] HTTP Status: 200/201 OK
- [ ] Response includes: `"queueId": "uuid-string"`
- [ ] Response includes: `"status": "pending"` or `"queued"`
- [ ] Message: "Mensaje agregado a la cola"

### Queue Status (Check Async Processing)
Wait 2-3 seconds, then:
```bash
curl http://localhost:3000/whatsapp/queues/colegio-a
```

### Response Verification
- [ ] Queue exists: `status: "processing"`
- [ ] Items array shows the message
- [ ] Item status changes from `pending` → `processing` → `completed`

### Browser Observation
- [ ] In Pool #2 browser, watch for:
  - Search box clicks
  - Phone number typing
  - Message composition
  - Message send button click
  - Confirmation message in chat

### Verification
- [ ] Queue item shows `status: "completed"`
- [ ] No errors in queue: `curl http://localhost:3000/whatsapp/queues/colegio-a/errors` → should be empty
- [ ] Server logs show: `🖥️ [PUPPETEER] Usando Pool Navegador #2`

---

## Test 6: Multiple Sessions, Different Pools

### Create Second Session
```bash
curl -X POST http://localhost:3000/colegios/colegio-b/sessions \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Verify Different Pool
- [ ] Response `poolId` is different from first session (e.g., #1 or #3)
- [ ] Different browser window navigates to WhatsApp Web
- [ ] Server logs: `✅ Sesión 'colegio-b' asignada a Pool #1`

### Create Third Session
```bash
curl -X POST http://localhost:3000/colegios/colegio-c/sessions \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Verify
- [ ] Response `poolId` is the remaining pool (e.g., #3)
- [ ] All 3 pools now assigned (one per session)
- [ ] All 3 browser windows show WhatsApp Web

### Try to Create Fourth Session
```bash
curl -X POST http://localhost:3000/colegios/colegio-d/sessions \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Verify
- [ ] Error response: "No free browsers in pool"
- [ ] HTTP Status: 409 or 500
- [ ] This is expected behavior (max 3 concurrent sessions)

---

## Test 7: Message Consistency

### Send Message to Session A (Pool #2)
```bash
curl -X POST http://localhost:3000/colegios/colegio-a/sessions/send-assistance-report \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "943828123",
    "student": "Student A",
    "time": "14:30:00",
    "type": "entrance"
  }'
```

### Send Message to Session B (Pool #1)
```bash
curl -X POST http://localhost:3000/colegios/colegio-b/sessions/send-assistance-report \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "943828124",
    "student": "Student B",
    "time": "14:31:00",
    "type": "exit"
  }'
```

### Verify Parallel Processing
- [ ] Both messages appear in queue immediately
- [ ] Pool #2 processes first message
- [ ] Pool #1 processes second message in parallel
- [ ] Check logs: both `[Pool #2]` and `[Pool #1]` active simultaneously

### Check Queue Status
```bash
curl http://localhost:3000/whatsapp/queues
```

- [ ] Shows `colegio-a` queue with completed message
- [ ] Shows `colegio-b` queue with completed message
- [ ] Both messages sent to their respective pools

---

## Test 8: Session Cleanup

### Delete Session A
```bash
curl -X DELETE http://localhost:3000/whatsapp/sessions/colegio-a
```

### Verify
- [ ] HTTP Status: 200 OK
- [ ] Response: "Sesión 'colegio-a' eliminada"
- [ ] Server logs: `🔄 Pool #2 liberado`

### Check Sessions
```bash
curl http://localhost:3000/whatsapp/sessions
```

- [ ] `colegio-a` no longer in list
- [ ] `colegio-b` and `colegio-c` still active

### Pool Reuse
```bash
curl -X POST http://localhost:3000/colegios/colegio-d/sessions \
  -H "Content-Type: application/json" \
  -d '{}'
```

- [ ] Now succeeds (Pool #2 is free)
- [ ] Response `poolId: 2`
- [ ] Server logs: `✅ Sesión 'colegio-d' asignada a Pool #2`

---

## Test 9: Error Scenarios

### Try to Send Message Without Creating Session
```bash
curl -X POST http://localhost:3000/colegios/new-school/sessions/send-assistance-report \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "943828125",
    "student": "Test",
    "time": "15:00:00",
    "type": "entrance"
  }'
```

- [ ] Error response: "Session not found" or similar
- [ ] HTTP Status: 404 or 400

### Try to Send Before Authentication
```bash
# Create session (don't scan QR)
curl -X POST http://localhost:3000/colegios/test-school/sessions \
  -H "Content-Type: application/json" \
  -d '{}'

# Wait 30 seconds (without scanning QR)

# Try to send
curl -X POST http://localhost:3000/colegios/test-school/sessions/send-assistance-report \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "943828126",
    "student": "Test2",
    "time": "15:01:00",
    "type": "exit"
  }'
```

- [ ] Message queues successfully (asynchronous)
- [ ] When processing, it might fail because session not authenticated
- [ ] Check queue errors: `curl http://localhost:3000/whatsapp/queues/test-school/errors`
- [ ] Error message shows: "Not authenticated" or similar

---

## Test 10: Logs Validation

### Filter Logs by Pool ID
```bash
npm run start:dev 2>&1 | grep "\[Pool #"
```

- [ ] See entries like: `[Pool #2] Navegando...`
- [ ] See entries like: `[Pool #1] enviando...`

### Filter Logs by Queue
```bash
npm run start:dev 2>&1 | grep "\[QUEUE\]"
```

- [ ] See: `[QUEUE] Agregado a cola`
- [ ] See: `[QUEUE] Procesando`
- [ ] See: `[QUEUE] Completado`

### Filter Logs by Puppeteer
```bash
npm run start:dev 2>&1 | grep "\[PUPPETEER\]"
```

- [ ] See: `[PUPPETEER] Navegando a WhatsApp...`
- [ ] See: `[PUPPETEER] Enviando mensaje...`
- [ ] See: `[PUPPETEER] Pool Navegador #X`

---

## Summary Checklist

### Architecture ✅
- [ ] 3 pool browsers launch on startup
- [ ] All browsers visible (headless: false)
- [ ] Each session assigned to one pool permanently
- [ ] Same browser used for auth and messaging

### API Responses ✅
- [ ] `poolId` returned in session creation
- [ ] Pool browser number shown in messages
- [ ] Messages include: "Pool Navegador #X"

### Browser Behavior ✅
- [ ] Correct pool browser loads WhatsApp Web
- [ ] QR scan works in that browser
- [ ] Messages sent from same browser

### Queue Processing ✅
- [ ] Messages queue successfully
- [ ] Queue processes asynchronously
- [ ] Same pool browser sends message
- [ ] Errors logged when appropriate

### Error Handling ✅
- [ ] No browser assigned → clear error
- [ ] Session not found → 404
- [ ] Session not authenticated → error in queue
- [ ] All 3 pools busy → "No free browsers" error

### Cleanup ✅
- [ ] Delete session → pool freed
- [ ] Deleted session → pool available for reuse
- [ ] Queue for deleted session → orphaned (auto-cleanup)

---

## Success Criteria

**All tests pass if:**

✅ 3 visible browsers launch  
✅ API returns `poolId` in session creation  
✅ Messages mention "Pool Navegador #X"  
✅ Same pool browser handles QR and messaging  
✅ Multiple sessions use different pools  
✅ Logs show pool IDs clearly  
✅ Queue processes messages asynchronously  
✅ Cleanup frees pools for reuse  

---

## Troubleshooting

If a test fails, check:

1. **Server logs**: `npm run start:dev` with full output
2. **Redis connection**: `redis-cli ping`
3. **Browser windows**: Are they actually visible?
4. **API endpoints**: Try with curl before using dashboard
5. **Network**: Check if `localhost:3000` is accessible

For detailed debugging, see:
- `ARCHITECTURE_UPDATE.md` - Full architecture details
- `POOL_ASSIGNMENT_QUICK_START.md` - Quick reference
- `DEBUG_REDIS_QUEUE.md` - Queue-specific debugging

---

**Run this checklist before deploying to production!**

