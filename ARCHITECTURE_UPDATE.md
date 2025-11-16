# Architecture Update: Pool Browser Assignment Model

## Summary of Changes

This update transforms the browser management system from a **temporary checkout pattern** to a **permanent assignment model**, making the multi-tenant WhatsApp Web automation more transparent and user-friendly.

---

## ✅ What Changed

### 1. **BrowserService** - Pool Structure Redesign

**Old Model:**
```typescript
pool: { browser: Browser; busy: boolean }[]
acquire() → Browser (temporary)
release(browser: Browser) → void
```

**New Model:**
```typescript
pool: { id: number; browser: Browser; sessionName?: string }[]
assignPoolBrowserToSession(sessionName) → { browser, poolId }
getPoolBrowserForSession(sessionName) → { browser, poolId } | null
releasePoolBrowserFromSession(sessionName) → void
```

**Key Difference:**
- **Old:** Queue calls `acquire()` → gets ANY available browser → `release()` after use
- **New:** Session calls `assignPoolBrowserToSession()` → **permanently assigned** → Queue uses same browser for lifetime of session

### 2. **AuthService** - Returns Pool ID

**Updated Signature:**
```typescript
async createSessionAndGoToWhatsApp(sessionName: string): Promise<{
  page: Page;
  isAuthenticated: boolean;
  poolId: number;  // ← NEW
}>
```

**Flow:**
1. Call `browserService.assignPoolBrowserToSession(sessionName)` → get poolId
2. Create page on assigned browser: `await browser.newPage()`
3. Navigate to WhatsApp Web
4. Return `{ page, isAuthenticated, poolId }`

### 3. **WhatsappController** - Pool ID in API Responses

**Updated Endpoints:**

#### `POST /colegios/:colegioId/sessions`
```json
{
  "message": "Sesión para 'Colegio A' creada. Escanea el QR en Pool Navegador #2.",
  "isAuthenticated": false,
  "poolId": 2,
  "qrCode": "data:image/png;base64,..."
}
```

#### `POST /sessions` (generic)
```json
{
  "message": "Sesión 'default' creada. Escanea el QR en Pool Navegador #1.",
  "isAuthenticated": false,
  "poolId": 1,
  "qrCode": "data:image/png;base64,..."
}
```

### 4. **QueueService** - Uses Assigned Browser

**Old Code:**
```typescript
private async processSingleItem(item: QueueItem): Promise<void> {
  const browser = await this.browserService.acquire(); // ❌ Deleted method
  // ... use browser ...
  await this.browserService.release(browser); // ❌ Deleted method
}
```

**New Code:**
```typescript
private async processSingleItem(item: QueueItem): Promise<void> {
  const sessionName = item.sessionName;
  const browserData = this.browserService.getPoolBrowserForSession(sessionName);
  if (!browserData) {
    throw new Error(`No browser assigned to session '${sessionName}'`);
  }
  const { browser, poolId } = browserData;
  // ... use same browser for message sending ...
  // No release() needed - browser stays assigned
}
```

### 5. **HTML Dashboard** - Shows Pool ID

**Updated `public/index.html`:**
```javascript
const poolMsg = data.poolId ? `🖥️ Pool Navegador #${data.poolId}` : 'Sin asignar';
qrStatus.innerHTML = `${poolMsg}: Esperando escaneo... <span class="loading"></span>`;
```

**User sees:**
```
🖥️ Pool Navegador #2: Esperando escaneo... ⟳
```

---

## 🎯 Benefits of This Architecture

| Issue | Before | After |
|-------|--------|-------|
| **Visibility** | User doesn't know which browser is used | API response shows "Pool Navegador #2" |
| **Consistency** | Auth uses browser A, messages use browser B (random) | Auth + messages use same browser #2 |
| **Resource Mgmt** | Browsers frequently acquired/released | Stable 1-to-1 session-to-browser mapping |
| **Debugging** | Hard to track which browser for which session | Pool IDs in logs and API responses |
| **UI Feedback** | Generic "Esperando escaneo..." | "Pool Navegador #2: Esperando escaneo..." |

---

## 🔄 Session Lifecycle (New Model)

```
┌─────────────────────────────────────────────────────────┐
│ User requests: POST /colegios/001/sessions              │
└────────────────────────┬────────────────────────────────┘
                         ↓
         AuthService.createSessionAndGoToWhatsApp()
                         ↓
      BrowserService.assignPoolBrowserToSession('001')
                         ↓
              Pool Browser #2 (assigned to '001')
                         ↓
        Generate QR + navigate to whatsapp.com
                         ↓
    Response: "Pool Navegador #2: Esperando escaneo..."
                         ↓
      [User scans QR with phone]
                         ↓
        Session '001' becomes isAuthenticated=true
                         ↓
   ┌─ Later: User requests POST /sessions/001/send-message
   ↓
 QueueService.processSingleItem()
   ↓
 getPoolBrowserForSession('001') → returns Pool Browser #2
   ↓
 Use same Pool #2 to send message
   ↓
 Message sent successfully
```

---

## 🧪 Testing the New Architecture

### 1. Start the server:
```bash
npm run start:dev
```

### 2. Create a session:
```bash
curl -X POST http://localhost:3000/colegios/001/sessions \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response:**
```json
{
  "message": "Sesión para '001' creada. Escanea el QR en Pool Navegador #2.",
  "isAuthenticated": false,
  "poolId": 2,
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANS..."
}
```

### 3. Check which Pool Browser window opened:
- Look at your screen: **Pool Browser #1, #2, or #3** window should be visible with WhatsApp Web loading
- The number in the response matches the window you see

### 4. Scan the QR code in that specific browser window

### 5. Send a message:
```bash
curl -X POST http://localhost:3000/colegios/001/sessions/send-assistance-report \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "943828123",
    "student": "Juan",
    "time": "14:30:45",
    "type": "entrance"
  }'
```

**Expected Result:**
- Queue item added to Redis
- `processSingleItem()` retrieves Pool Browser #2 (the same one used for QR)
- Message sent from that same browser

---

## 📝 Key Implementation Details

### Pool Initialization (BrowserService.onModuleInit)

```typescript
async onModuleInit() {
  // Create 3 visible pool browsers
  for (let i = 1; i <= 3; i++) {
    const browser = await puppeteer.launch({
      headless: false,  // ← Visible windows
      args: ['--disable-blink-features=AutomationControlled']
    });
    this.pool.push({ id: i, browser, sessionName: undefined });
    this.logger.log(`✅ Pool Navegador #${i} iniciado`);
  }
  
  // Start monitoring sessions for cleanup
  this.startSessionMonitoring();
}
```

### Pool Browser Assignment (BrowserService)

```typescript
assignPoolBrowserToSession(sessionName: string): { browser: Browser; poolId: number } {
  const freeBrowser = this.pool.find(b => !b.sessionName);
  if (!freeBrowser) {
    throw new Error('No free browsers in pool');
  }
  
  freeBrowser.sessionName = sessionName;
  this.logger.log(`✅ Sesión '${sessionName}' asignada a Pool #${freeBrowser.id}`);
  
  return { browser: freeBrowser.browser, poolId: freeBrowser.id };
}

getPoolBrowserForSession(sessionName: string): { browser: Browser; poolId: number } | null {
  const poolBrowser = this.pool.find(b => b.sessionName === sessionName);
  return poolBrowser 
    ? { browser: poolBrowser.browser, poolId: poolBrowser.id }
    : null;
}

releasePoolBrowserFromSession(sessionName: string): void {
  const poolBrowser = this.pool.find(b => b.sessionName === sessionName);
  if (poolBrowser) {
    poolBrowser.sessionName = undefined;
    this.logger.log(`🔄 Pool #${poolBrowser.id} liberado`);
  }
}
```

---

## 🚨 Important Notes

### 1. **Browser Assignment is Permanent**
- Once a session is assigned to Pool #2, it stays there until `DELETE /sessions/:name`
- All messages for that session will use Pool #2
- This ensures consistent cookies and state

### 2. **All 3 Pool Browsers are Visible**
- No more hidden browsers
- User can see which pool browser is being used for QR scan
- Useful for debugging: you can see the browser automation in real-time

### 3. **No More General Browser**
- Removed the separate `launchBrowser` pathway
- System now uses ONLY the 3-pool model
- Simpler, fewer resources, more transparent

### 4. **Queue Processing Uses Same Browser**
- When a message is queued, it's processed using the session's assigned browser
- Cookies persist in that browser instance
- Auth state is maintained across QR scan and message sending

### 5. **Error Handling for Unassigned Sessions**
```typescript
const browserData = this.browserService.getPoolBrowserForSession(sessionName);
if (!browserData) {
  throw new Error(`No browser assigned to session '${sessionName}'`);
}
```
- If you try to send a message to a session that hasn't been created yet, you get a clear error
- Session MUST be created (QR scanned) before messages can be sent

---

## 🔧 Troubleshooting

### "Pool Navegador #2: Esperando escaneo..." but I don't see the window

**Solution:**
```bash
# Check that pool browsers launched
npm run start:dev | grep "Pool Navegador"

# Expected output:
# ✅ Pool Navegador #1 iniciado
# ✅ Pool Navegador #2 iniciado
# ✅ Pool Navegador #3 iniciado
```

### Message sent but says "No browser assigned"

**Cause:** Session was not created first  
**Solution:**
1. `POST /colegios/001/sessions` → get QR + poolId
2. Scan QR in that pool browser
3. Wait for `isAuthenticated: true`
4. Then send message

### Different browsers used for QR and sending

**Cause:** Bug in implementation  
**Solution:** Verify `getPoolBrowserForSession()` is called correctly in QueueService.processSingleItem()

---

## 📊 Comparison: Old vs New

### Old Architecture
```
Session '001' → QR auth in "general" browser
Message queue → acquire() random browser → send → release()
Problem: Auth in browser A, messages in browser B ❌
```

### New Architecture
```
Session '001' → QR auth in Pool Browser #2
Message queue → getPoolBrowserForSession('001') → Pool Browser #2 → send
Benefit: Same browser for auth + messaging ✅
Transparency: User knows exactly which pool browser ✅
```

---

## 📚 Related Files

- `src/whatsapp/services/browser.service.ts` — Pool management
- `src/whatsapp/services/auth.service.ts` — QR generation + auth
- `src/whatsapp/services/queue.service.ts` — Message queue processing
- `src/whatsapp/whatsapp.controller.ts` — REST API endpoints
- `public/index.html` — Dashboard with Pool ID display

