# TechonERP — LAN WebSocket Reliability Improvements Report

**Date:** July 4, 2026  
**Scope:** WebSocket layer only (`lan-ws-sync.cjs` + minimal IPC/App hooks)  
**Unchanged:** HTTP sync, SyncEngine, PHP, MySQL, business logic

---

## Files Changed

| File | Changes |
|------|---------|
| **`erp-app/lan-ws-sync.cjs`** | Major reliability hardening (heartbeat, batching, validation, health metrics, catch-up) |
| **`erp-app/main.cjs`** | `tc-ws-stop` IPC; `lastRevision` on restart; cleanup on window close |
| **`erp-app/preload.js`** | `stopLanWebSocket()` API |
| **`erp-app/src/App.jsx`** | `sync_catchup` full pull; `msg_id` dedup; stop WS on logout; pass `lastRevision` |
| **`erp-app/scripts/lan-ws-stress-test.mjs`** | **New** automated WS layer stress test |

**Not modified:** `SyncEngine.js`, `sync_patch.php`, `server_state.php`, merge logic, business modules.

---

## Improvements Made

### 1. Heartbeat / Keep Alive

| What | Detail |
|------|--------|
| **Server** | Native WebSocket `ping()` every **15s**; terminate clients that miss `pong` |
| **Client** | App-level `{ type: "ping" }` every **15s**; watchdog terminates if no `pong` within **45s** |
| **On failure** | Connection terminated → automatic exponential backoff reconnect |

**Why:** Detects half-open / dead TCP connections that HTTP ping alone cannot see quickly enough for live sync.

---

### 2. Connection Health Monitoring (debug logs only)

Logged under **`[LanWS:health]`** at **`debug`** level to `Documents/TechonERP/logs/techon-YYYY-MM-DD.log`:

- Connection latency (`lastPingLatencyMs`)
- `lastMessageAt`, `lastPongAt`, `lastAuthAt`
- `lastReconnectAt`, `totalReconnects`, `reconnectAttempt`
- Current `revision`, `lastKnownRevision`

**Why:** Enables field diagnosis without UI clutter or behavior changes.

---

### 3. Graceful Main PC Restart

| Step | Behavior |
|------|----------|
| Main PC restarts | WS server stops; Counter sockets close |
| Counter | Auto-reconnect with backoff |
| After `auth_ok` | Emits **`sync_catchup`** → renderer runs **one full HTTP pull** (`loadStateFromServer` all keys) |

**Why:** In-memory server `revision` resets on restart; full pull guarantees no missed updates during downtime.

---

### 4. Message Reliability

| Mechanism | Implementation |
|-----------|----------------|
| **Message IDs** | Every outbound message includes unique `msg_id` |
| **Duplicate ignore** | LRU map (512 entries) in main + renderer `msg_id` cache |
| **Out-of-order** | Ignore `kv_changed` where `revision < lastEmittedRevision` |
| **Exactly once** | Dedup at main process before IPC + revision gate in renderer |

**Why:** Prevents double-pulls from batched broadcasts, reconnect replay, or self-notify echo.

---

### 5. Offline Gap Recovery

- Client sends `last_revision` in auth payload.
- On reconnect, if **`wasReconnect`** OR **`lastKnownRevision < serverRevision`** → **`sync_catchup`** event.
- Renderer performs **full synchronization** automatically (no manual refresh).

**Why:** Covers multi-minute outages where individual `kv_changed` messages were never received.

---

### 6. Better Error Handling

- All parse failures logged (`warn`) — never silent.
- Malformed JSON, invalid `type`, oversized payloads rejected.
- Send failures logged with context.
- Socket `error` handlers on server and client.
- `maxPayload: 65536` on WS server and client.

**Why:** Prevents crashes from bad packets and improves supportability.

---

### 7. Performance — Notification Batching

- **`BATCH_WINDOW_MS = 150`**
- Multiple `broadcastAfterPatch` / `notify` calls within 150ms merge into **one** `kv_changed` with combined keys.
- Stress test: **20 rapid broadcasts → 1 batched message per client** (3 clients = 3 total).

**Why:** Bulk imports / rapid sales no longer flood the LAN with hundreds of tiny WS frames.

---

### 8. Resource Cleanup

| Event | Action |
|-------|--------|
| `stopAll()` | Clears heartbeat timers, batch timer, reconnect timer, terminates sockets |
| Window closed | `lanWsSync.stopAll()` |
| App exit | `lanWsSync.stopAll()` (existing) |
| Logout / switch user | `stopLanWebSocket()` IPC |
| Network config save | WS restart (existing) |
| Standalone mode | WS off |

**Why:** Prevents timer leaks and zombie connections across mode changes.

---

### 9. Security — Message Validation

| Check | Limit |
|-------|-------|
| Max payload size | 65,536 bytes |
| Allowed client types | `auth`, `ping`, `notify` |
| Allowed server types | `auth_ok`, `auth_fail`, `pong`, `kv_changed`, `sync_catchup` |
| Keys in notify | Must start with `tc3_`, max 64 keys |
| Auth timeout | 8 seconds |

**Why:** Rejects malformed or hostile traffic without affecting legitimate sync.

---

## HTTP Fallback (Preserved)

| WS state | Pull behavior |
|----------|---------------|
| `connected` | No 2.5s polling interval; pull on WS notify + catch-up + post-push flush |
| `disconnected` / `reconnecting` | **2.5s polling resumes** (unchanged) |

---

## Stress Test Results

**Command:** `node scripts/lan-ws-stress-test.mjs`

| Test | Result |
|------|--------|
| Reject malformed JSON | PASS |
| Reject oversized payload | PASS |
| Start WS server | PASS |
| 3 Counter PCs connect + auth | PASS |
| Rapid broadcasts batched (20 → 1 per client) | PASS |
| Revision tracking | PASS |
| Client role restart | PASS |
| Reconnect after main restart | PASS |

**Summary:** **8 passed, 0 failed**

### Manual LAN scenarios (recommended before release)

| Scenario | Expected |
|----------|----------|
| 3 Counter PCs + rapid sales | Live sync; batched notifications |
| Disconnect LAN | WS reconnecting → polling fallback |
| Reconnect LAN | Live sync resumes; polling stops |
| Main PC restart | Counter auto full sync via `sync_catchup` |
| Long idle (30+ min) | Heartbeat keeps connection or reconnects cleanly |
| Bulk product import | Single batched WS notify per ~150ms window |
| Simultaneous edits | Revision + msg_id dedup; no duplicate UI updates |

---

## New IPC / Preload API

| API | Purpose |
|-----|---------|
| `electronAPI.stopLanWebSocket()` | Stop WS on logout / mode change |
| `restartLanWebSocket({ clientId, lastRevision })` | Resume with revision continuity |

---

## Log Examples

```
[debug] [LanWS:health] client_connected {"lastPingLatencyMs":12,"totalReconnects":1,...}
[info] [LanWS] Broadcast revision=42 msg_id=kv_... keys=[tc3_sales]
[warn] [LanWS] Heartbeat timeout — reconnecting
[info] [LanWS] Sync catchup requested (reconnect) rev 41 -> 42
```

---

*End of report.*
