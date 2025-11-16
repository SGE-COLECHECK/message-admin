# 🔧 API Changes: Browser Service

## Methods Removed ❌

These methods were **deleted** because they're no longer needed with the permanent assignment model:

### `acquire(): Promise<Browser>`

**Old Signature:**
```typescript
private async acquire(): Promise<Browser>
```

**What it did:**
- Found the first available (non-busy) browser from the pool
- Marked it as `busy: true`
- Returned the browser for temporary use
- Required matching `release()` call

**Why removed:**
- Introduced checkout/return pattern complexity
- Hard to track which session uses which browser
- Could lead to orphaned browsers if release() not called
- Didn't provide pool ID information

**Old Usage:**
```typescript
const browser = await this.browserService.acquire();
try {
  // use browser...
} finally {
  await this.browserService.release(browser);
}
```

---

### `release(browser: Browser): Promise<void>`

**Old Signature:**
```typescript
private async release(browser: Browser): Promise<void>
```

**What it did:**
- Marked the browser as `busy: false`
- Made it available for other operations
- Required careful pairing with `acquire()`

**Why removed:**
- Part of the old checkout pattern
- Made resource management implicit
- Could cause leaks if not called
- No connection to session lifecycle

**Old Usage:**
```typescript
try {
  const browser = await this.browserService.acquire();
  // ...
} finally {
  await this.browserService.release(browser);  // ← Easy to forget or get wrong
}
```

---

## Methods Added ✅

These **new methods** replace the acquire/release pattern with explicit session-to-pool assignment:

### `assignPoolBrowserToSession(sessionName: string): { browser: Browser; poolId: number }`

**New Signature:**
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
```

**What it does:**
- Finds the first **free** browser (no sessionName assigned)
- **Permanently assigns** that browser to the session
- Stores sessionName in pool entry for tracking
- Returns both the browser and its pool ID
- Throws error if no free browsers available

**When called:**
- During session creation (`AuthService.createSessionAndGoToWhatsApp()`)
- Called once per session
- Browser stays assigned until session is deleted

**Why better:**
- ✅ Explicit 1-to-1 mapping
- ✅ Returns pool ID for logging/display
- ✅ Clear assignment semantics
- ✅ No pairing complexity
- ✅ Easy to track which browser for which session

**Usage:**
```typescript
const { browser, poolId } = this.browserService.assignPoolBrowserToSession(sessionName);
this.logger.log(`Assigned session '${sessionName}' to Pool #${poolId}`);
// Browser now permanently tied to this session
```

---

### `getPoolBrowserForSession(sessionName: string): { browser: Browser; poolId: number } | null`

**New Signature:**
```typescript
getPoolBrowserForSession(sessionName: string): { browser: Browser; poolId: number } | null {
  const poolBrowser = this.pool.find(b => b.sessionName === sessionName);
  return poolBrowser 
    ? { browser: poolBrowser.browser, poolId: poolBrowser.id }
    : null;
}
```

**What it does:**
- **Looks up** the assigned browser for a session
- Searches pool for entry with matching sessionName
- Returns browser + pool ID if found
- Returns `null` if session not assigned or doesn't exist

**When called:**
- During message queue processing (`QueueService.processSingleItem()`)
- When you need the same browser that handled auth
- Multiple times during session lifetime (every message)

**Why better:**
- ✅ Simple lookup instead of state management
- ✅ Always returns same browser for same session
- ✅ No state changes (just read)
- ✅ Provides pool ID for logging
- ✅ Null return means session not found (clear error)

**Usage:**
```typescript
const browserData = this.browserService.getPoolBrowserForSession(sessionName);
if (!browserData) {
  throw new Error(`Session '${sessionName}' not found or has no assigned browser`);
}
const { browser, poolId } = browserData;
// Now use browser for message sending - guaranteed same as auth
```

---

### `releasePoolBrowserFromSession(sessionName: string): void`

**New Signature:**
```typescript
releasePoolBrowserFromSession(sessionName: string): void {
  const poolBrowser = this.pool.find(b => b.sessionName === sessionName);
  if (poolBrowser) {
    poolBrowser.sessionName = undefined;
    this.logger.log(`🔄 Pool #${poolBrowser.id} liberado`);
  }
}
```

**What it does:**
- **Removes** the assignment of a browser from a session
- Finds pool entry with matching sessionName
- Sets sessionName back to `undefined` (marks as free)
- Logs the release for tracking

**When called:**
- When a session is deleted (`DELETE /sessions/:name`)
- Called by `SessionManagerService.remove()`
- Makes pool available for new sessions

**Why better:**
- ✅ Clear, explicit release semantics
- ✅ Tied to session lifecycle (only called on delete)
- ✅ Cannot be forgotten (automatic with session deletion)
- ✅ Provides logging for pool utilization

**Usage:**
```typescript
// In SessionManager.remove(sessionName):
await this.browserService.releasePoolBrowserFromSession(sessionName);
// Browser is now free for other sessions
```

---

## Pool Data Structure

### Before: `{ browser: Browser; busy: boolean }`

```typescript
pool: Array<{
  browser: Browser;    // The Puppeteer browser instance
  busy: boolean;       // Is it checked out?
}>

// State was implicit:
// { browser, busy: false } = available
// { browser, busy: true }  = in use
```

**Problems:**
- ❌ No session tracking
- ❌ No pool identification
- ❌ Implicit state (rely on boolean)
- ❌ Multiple browsers could be "not busy" but used by different operations

---

### After: `{ id: number; browser: Browser; sessionName?: string }`

```typescript
pool: Array<{
  id: number;              // Pool ID (1, 2, 3)
  browser: Browser;        // The Puppeteer browser instance
  sessionName?: string;    // Which session owns this (or undefined if free)
}>

// State is explicit:
// { id: 1, browser, sessionName: undefined }       = free, available
// { id: 2, browser, sessionName: 'colegio-a' }     = assigned to colegio-a
// { id: 3, browser, sessionName: 'colegio-b' }     = assigned to colegio-b
```

**Benefits:**
- ✅ Each browser has unique ID (1, 2, 3)
- ✅ Explicit session ownership (sessionName)
- ✅ Easy to find free browsers (sessionName === undefined)
- ✅ Can query which session owns which pool

---

## Method Migration Guide

If you have code using the old methods, here's how to migrate:

### Pattern 1: Temporary Browser Checkout

**Old Code:**
```typescript
const browser = await this.browserService.acquire();
try {
  // Do something with browser
  await doSomething(browser);
} finally {
  await this.browserService.release(browser);
}
```

**New Code:**
```typescript
const browserData = this.browserService.getPoolBrowserForSession(sessionName);
if (!browserData) {
  throw new Error(`No browser assigned to session`);
}
const { browser } = browserData;
// Do something with browser
// Browser is permanently assigned, no release needed
await doSomething(browser);
```

---

### Pattern 2: Checking Pool Availability

**Old Code:**
```typescript
const browser = await this.browserService.acquire();
if (!browser) {
  throw new Error('No browsers available');
}
```

**New Code:**
```typescript
const browserData = this.browserService.assignPoolBrowserToSession(newSessionName);
if (!browserData) {
  throw new Error('No browsers available');
}
const { browser, poolId } = browserData;
```

---

### Pattern 3: Getting Browser For Existing Session

**Old Code:**
```typescript
// Not really possible - no way to look up existing assignment
// Always had to maintain your own sessionName → browser mapping
```

**New Code:**
```typescript
const browserData = this.browserService.getPoolBrowserForSession(sessionName);
if (!browserData) {
  throw new Error(`Session '${sessionName}' has no assigned browser`);
}
const { browser, poolId } = browserData;
```

---

## Impact Analysis

### Where Changes Matter

| Component | Change | Impact |
|-----------|--------|--------|
| AuthService | `acquire()` → `assignPoolBrowserToSession()` | Now tracks pool assignment |
| QueueService | `acquire()/release()` → `getPoolBrowserForSession()` | Always uses same browser for messaging |
| SessionManager | Calls `releasePoolBrowserFromSession()` on delete | Automatic cleanup |
| Controller | Receives `poolId` from auth | Can return pool info to users |
| Dashboard | Shows `poolId` in messages | Users know which pool they're using |

### Backward Compatibility

- ✅ **No API changes** - Still returns same response shapes
- ✅ **No external API breaks** - REST endpoints unchanged
- ✅ **Internal refactoring** - Implementation details changed
- ❌ **Code calling old methods** - Will break (if any exists)

### Testing Impact

**Old tests using `acquire()/release()`:**
- ❌ Will fail - methods don't exist
- ✅ Update to use `assignPoolBrowserToSession()` instead

**New tests:**
- ✅ Should use `getPoolBrowserForSession()` for verification
- ✅ Verify pool assignments are persistent
- ✅ Verify cleanup on session deletion

---

## Summary Table

| Aspect | Before | After |
|--------|--------|-------|
| **Pool Structure** | `{ browser, busy }` | `{ id, browser, sessionName? }` |
| **Browser Tracking** | Implicit (via busy flag) | Explicit (via sessionName) |
| **Assignment** | `acquire()` returns any browser | `assignPoolBrowserToSession()` assigns permanently |
| **Lookup** | No way to look up assigned browser | `getPoolBrowserForSession()` finds it |
| **Release** | `release()` marks busy=false | `releasePoolBrowserFromSession()` clears sessionName |
| **State Management** | Temporary checkout/return | Permanent assignment |
| **Pool ID** | None (not tracked) | Always available |
| **Error Handling** | Implicit (check if browser is null) | Explicit (throws if no browsers or not found) |

---

## Code Examples

### Example 1: Creating a Session

**Before:**
```typescript
// AuthService didn't know about pool
const browser = await this.browserService.acquire();
const page = await browser.newPage();
// Which pool was this? Unknown!
```

**After:**
```typescript
// AuthService gets pool and ID
const { browser, poolId } = this.browserService.assignPoolBrowserToSession(sessionName);
const page = await browser.newPage();
this.logger.log(`Using Pool #${poolId} for session '${sessionName}'`);
// Now we know: Pool #2 for session 'colegio-a'
```

---

### Example 2: Sending a Message

**Before:**
```typescript
// QueueService acquires random browser
private async processSingleItem(item: QueueItem): Promise<void> {
  const browser = await this.browserService.acquire();
  // Could be Pool #1, #2, or #3 (unpredictable)
  // Might be different pool than auth (inconsistent!)
  await sendMessage(browser, item);
  await this.browserService.release(browser);
}
```

**After:**
```typescript
// QueueService gets assigned browser (same as auth)
private async processSingleItem(item: QueueItem): Promise<void> {
  const browserData = this.browserService.getPoolBrowserForSession(item.sessionName);
  if (!browserData) {
    throw new Error(`No browser assigned to session '${item.sessionName}'`);
  }
  const { browser, poolId } = browserData;
  // Same browser used in auth, guaranteed!
  this.logger.log(`Using Pool #${poolId}...`);
  await sendMessage(browser, item);
  // No release needed - browser stays assigned
}
```

---

### Example 3: Cleaning Up Session

**Before:**
```typescript
// SessionManager had no way to free pool
sessionManager.remove('colegio-a');
// Pool browser still marked busy! (leak)
```

**After:**
```typescript
// SessionManager explicitly frees pool
sessionManager.remove('colegio-a');
  ↓
this.browserService.releasePoolBrowserFromSession('colegio-a');
  ↓
// Pool is now free for new sessions
```

---

## Reference

**Files affected:**
- `src/whatsapp/services/browser.service.ts` - Method definitions
- `src/whatsapp/services/auth.service.ts` - Uses new `assignPoolBrowserToSession`
- `src/whatsapp/services/queue.service.ts` - Uses new `getPoolBrowserForSession`
- `src/whatsapp/services/session-manager.service.ts` - Calls `releasePoolBrowserFromSession`

**For more details:**
- See `ARCHITECTURE_UPDATE.md` for architecture overview
- See `IMPLEMENTATION_SUMMARY.md` for complete change list
- See `VALIDATION_CHECKLIST.md` for testing procedure

