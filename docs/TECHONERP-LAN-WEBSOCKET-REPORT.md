# TechonERP — LAN WebSocket Sync Report

**Date:** July 4, 2026  
**Scope:** Instant LAN synchronization via WebSockets (additive layer on existing HTTP sync)  
**Status:** Implemented in source — build verified; stress tests pass (8/8)

---

## Table of Contents

1. [Summary](#summary)
2. [What Did NOT Change](#what-did-not-change)
3. [Files Changed](#files-changed)
4. [Architecture](#architecture)
5. [WebSocket Protocol](#websocket-protocol)
6. [Reconnect & Fallback](#reconnect--fallback)
7. [Duplicate Update Prevention](#duplicate-update-prevention)
8. [Reliability Improvements](#reliability-improvements)
9. [UI Changes](#ui-changes)
10. [Configuration](#configuration)
11. [IPC / Preload API](#ipc--preload-api)
12. [Stress Test Results](#stress-test-results)
13. [Verification Checklist](#verification-checklist)
14. [Dependencies](#dependencies-added)
15. [Rollback](#rollback)

---

## Summary

TechonERP previously synchronized Main PC and Counter PCs using **HTTP polling** every **2.5 seconds** (`GET server_state.php`). That flow is unchanged and remains the **fallback**.

This upgrade adds a **WebSocket notification layer** inside the Electron main process:

- **Main PC** runs a WebSocket **server** (port **9876** by default).
- **Counter PCs** connect as WebSocket **clients**.
- When data changes, peers receive a **`kv_changed`** notification and pull **only the changed keys** via the existing `server_state.php?keys=...` API.
- When WebSocket is unavailable, **2.5s polling resumes automatically**.

No database schema changes. No PHP API changes. No SyncEngine push/pull business logic changes.

---

## What Did NOT Change

| Area | Status |
|------|--------|
| MySQL / `kv_store` schema | Unchanged |
| `sync_patch.php`, `server_state.php`, `merge_records.php` | Unchanged |
| SyncEngine push queue, debounce, retry, chunking | Unchanged |
| Standalone mode | Unchanged (WebSocket off) |
| Manual upload, offline queue, patch dedup on server | Unchanged |
| Multi-PC roles (standalone / main server / counter) | Unchanged |

---

## Files Changed

| File | Change |
|------|--------|
| **`erp-app/lan-ws-sync.cjs`** | **New.** WS server (Main PC) + client (Counter). Auth, broadcast, reconnect, notify relay, heartbeat, batching, validation, health metrics, catch-up. |
| **`erp-app/main.cjs`** | Requires `lan-ws-sync.cjs`; starts WS on app launch; broadcasts after successful `tc-sync-patch`; IPC `tc-ws-restart`, `tc-ws-status`, `tc-ws-stop`; `lastRevision` on restart; cleanup on window close. |
| **`erp-app/preload.js`** | Exposes `restartLanWebSocket`, `stopLanWebSocket`, `getLanWebSocketStatus`, `onLanWebSocketStatus`, `onLanWebSocketKvChanged`. |
| **`erp-app/src/App.jsx`** | WS-driven targeted pull; `sync_catchup` full pull; `msg_id` dedup; polling fallback; connection state in header; stop WS on logout. |
| **`erp-app/src/sync/SyncEngine.js`** | Added export **`getSyncClientId()`** only (for WS auth + dedup). No change to sync behavior. |
| **`erp-app/scripts/lan-ws-stress-test.mjs`** | **New.** Automated WS layer stress test. |
| **`erp-app/package.json`** | Added dependency **`ws`** (^8.18.3). |
| **`erp-app/package-lock.json`** | Lockfile updated for `ws`. |

**Not included:** `erp-app/_asar_extract/` (local build artifact).

---

## Architecture

### Before (polling only)

```
Counter / Main PC  ──every 2.5s──►  GET server_state.php  ──►  merge local state
Counter / Main PC  ──on change──►  POST sync_patch.php   ──►  MySQL kv_store
```

### After (WebSocket + polling fallback)

```
┌─────────────────────────────────────────────────────────────────┐
│                        MAIN PC (network_server)                    │
│  Electron main.cjs                                               │
│    ├── WebSocket server :9876                                    │
│    ├── On sync_patch success → broadcast kv_changed              │
│    └── Renderer ← IPC tc-ws-kv-changed                           │
└─────────────────────────────────────────────────────────────────┘
         ▲ WS                           ▲ WS
         │ notify (counter change)      │ kv_changed broadcast
         │                               │
┌────────┴──────────┐         ┌────────┴──────────┐
│  COUNTER PC #1    │         │  COUNTER PC #2    │
│  WS client        │         │  WS client        │
│  HTTP sync_patch  │         │  HTTP sync_patch  │
└───────────────────┘         └───────────────────┘
         │                               │
         └─────────── HTTP (unchanged) ──┘
                    sync_patch.php / server_state.php
                              │
                         MySQL kv_store
```

### Change propagation paths

#### Main PC saves data (sale, product, settings, etc.)

1. Renderer → SyncEngine → `tc-sync-patch` → `sync_patch.php` (unchanged).
2. On success, main process calls **`broadcastAfterPatch(keys, clientId)`**.
3. All connected Counter WS clients receive `kv_changed`.
4. Main PC renderer also receives `tc-ws-kv-changed` via IPC (for changes from other counters).

#### Counter PC saves data

1. Renderer → SyncEngine → `tc-sync-patch` → `sync_patch.php` on Main PC (unchanged).
2. On success, counter main process sends WS message **`{ type: "notify", keys, client_id }`** to Main PC.
3. Main PC WS server validates authenticated client and calls **`broadcastAfterPatch`**.
4. All counters + Main PC renderer receive `kv_changed`.

#### On `kv_changed` (all network PCs)

1. Renderer checks **revision dedup**, **msg_id dedup**, and **self-echo skip**.
2. Calls existing **`loadStateFromServer(apiUrl, keys)`** — partial pull only.
3. Merges with local state via existing **`mergeServerStateWithLocal`** (unchanged).

---

## WebSocket Protocol

### Connection

- **URL:** `ws://{apiUrl-host}:9876` (host parsed from `tc_network.json` `apiUrl`).
- **Port:** `wsPort` in network config, default **9876** (must be ≥ 1024).

### Auth (first message after connect)

```json
{ "type": "auth", "apiKey": "...", "clientId": "client_...", "last_revision": 42 }
```

Server responds:

```json
{ "type": "auth_ok", "revision": 42, "server_time": "2026-07-04T...", "msg_id": "..." }
```

or `{ "type": "auth_fail", "message": "..." }`.

Uses the same **`X-TC-KEY`** value as HTTP sync.

### Change notification

```json
{
  "type": "kv_changed",
  "keys": ["tc3_sales", "tc3_products"],
  "revision": 43,
  "source_client_id": "client_1234_abc",
  "server_time": "2026-07-04T11:30:00.000Z",
  "msg_id": "kv_..."
}
```

### Counter → Main relay (after local HTTP push succeeds)

```json
{ "type": "notify", "keys": ["tc3_sales"], "client_id": "client_..." }
```

### Catch-up (on reconnect or revision gap)

```json
{ "type": "sync_catchup", "revision": 43, "msg_id": "...", "reason": "reconnect" }
```

Renderer performs one **full HTTP pull** of all keys.

---

## Reconnect & Fallback

### Reconnect strategy (Counter client)

| Setting | Value |
|---------|-------|
| Base delay | 1000 ms |
| Backoff | Exponential: 1s → 2s → 4s → 8s → … |
| Max delay | 30000 ms |
| Auth timeout | 8000 ms |

### Connection states (UI + IPC)

| State | Meaning |
|-------|---------|
| **connecting** | First connection attempt |
| **connected** | Authenticated; live sync active |
| **reconnecting** | Lost connection; retry scheduled |
| **disconnected** | Not connected; polling fallback active |

States are sent to the renderer via IPC event **`tc-ws-status`**.

### Fallback strategy (polling preserved)

| Condition | Pull behavior |
|-----------|---------------|
| `wsConnStatus === 'connected'` | **No** 2.5s interval; pull on WS `kv_changed` + catch-up + after own push |
| `wsConnStatus !== 'connected'` | **2.5s polling** via `CLIENT_PULL_INTERVAL_MS` (unchanged) |
| HTTP ping fails (counter offline) | Pull paused when `connStatus === 'disconnected'` (unchanged) |
| WS down but HTTP up | Polling keeps data in sync until WS reconnects |

When WebSocket reconnects, polling interval is **removed** again automatically. Initial full pull still runs once on login (unchanged).

---

## Duplicate Update Prevention

1. **Monotonic revision** — Server increments `revision` on each broadcast. Client ignores messages where `revision <= lastWsRevision`.
2. **Message IDs** — Every outbound message includes unique `msg_id`. LRU cache (512 entries) in main + renderer dedup.
3. **Self-echo skip** — If `source_client_id` equals local `getSyncClientId()` and all notified keys are still **`TC_SYNC.isKeyPending(key)`**, skip pull.
4. **Server-side patch dedup** — Existing `processed_patches` table in `sync_patch.php` (unchanged).
5. **Pull in-flight guard** — Single concurrent pull per effect instance.

---

## Reliability Improvements

### 1. Heartbeat / Keep Alive

| What | Detail |
|------|--------|
| **Server** | Native WebSocket `ping()` every **15s**; terminate clients that miss `pong` |
| **Client** | App-level `{ type: "ping" }` every **15s**; watchdog terminates if no `pong` within **45s** |
| **On failure** | Connection terminated → automatic exponential backoff reconnect |

### 2. Connection Health Monitoring (debug logs only)

Logged under **`[LanWS:health]`** at **`debug`** level to `Documents/TechonERP/logs/techon-YYYY-MM-DD.log`:

- Connection latency (`lastPingLatencyMs`)
- `lastMessageAt`, `lastPongAt`, `lastAuthAt`
- `lastReconnectAt`, `totalReconnects`, `reconnectAttempt`
- Current `revision`, `lastKnownRevision`

### 3. Graceful Main PC Restart

| Step | Behavior |
|------|----------|
| Main PC restarts | WS server stops; Counter sockets close |
| Counter | Auto-reconnect with backoff |
| After `auth_ok` | Emits **`sync_catchup`** → renderer runs **one full HTTP pull** |

### 4. Offline Gap Recovery

- Client sends `last_revision` in auth payload.
- On reconnect, if **`wasReconnect`** OR **`lastKnownRevision < serverRevision`** → **`sync_catchup`** event.
- Renderer performs **full synchronization** automatically (no manual refresh).

### 5. Better Error Handling

- All parse failures logged (`warn`) — never silent.
- Malformed JSON, invalid `type`, oversized payloads rejected.
- `maxPayload: 65536` on WS server and client.

### 6. Performance — Notification Batching

- **`BATCH_WINDOW_MS = 150`**
- Multiple `broadcastAfterPatch` / `notify` calls within 150ms merge into **one** `kv_changed` with combined keys.
- Stress test: **20 rapid broadcasts → 1 batched message per client**.

### 7. Resource Cleanup

| Event | Action |
|-------|--------|
| `stopAll()` | Clears heartbeat timers, batch timer, reconnect timer, terminates sockets |
| Window closed | `lanWsSync.stopAll()` |
| App exit | `lanWsSync.stopAll()` |
| Logout / switch user | `stopLanWebSocket()` IPC |
| Network config save | WS restart |
| Standalone mode | WS off |

### 8. Security — Message Validation

| Check | Limit |
|-------|-------|
| Max payload size | 65,536 bytes |
| Allowed client types | `auth`, `ping`, `notify` |
| Allowed server types | `auth_ok`, `auth_fail`, `pong`, `kv_changed`, `sync_catchup` |
| Keys in notify | Must start with `tc3_`, max 64 keys |
| Auth timeout | 8 seconds |

---

## UI Changes

Top-right header (network modes) now reflects WebSocket state:

| Label | When |
|-------|------|
| **Live sync** | WS connected, idle |
| **Saving** | WS connected + push in progress |
| **Polling** | WS disconnected; 2.5s fallback active |
| **Connecting / Reconnecting** | WS client retrying |
| **Offline** | HTTP ping failed (counter) |

Tooltip includes `WS: {status}` plus existing sync/connection info.

---

## Configuration

Stored in **`userData/tc_network.json`** (sanitized on save):

```json
{
  "role": "network_server",
  "apiUrl": "http://192.168.1.10/api/",
  "apiKey": "...",
  "wsPort": 9876,
  "wizardComplete": true
}
```

- **`wsPort`** is optional; defaults to **9876**.
- WebSocket starts automatically when `role` is `network_server` or `network_client`.
- Standalone role: WebSocket **off**.

### Firewall note

Ensure **TCP port 9876** (or custom `wsPort`) is allowed on the Main PC LAN interface for Counter PCs to connect.

---

## IPC / Preload API

| Method | Description |
|--------|-------------|
| `electronAPI.restartLanWebSocket({ clientId, lastRevision })` | Start/restart WS for current network role |
| `electronAPI.stopLanWebSocket()` | Stop WS on logout / mode change |
| `electronAPI.getLanWebSocketStatus()` | Returns `{ status, role, revision, port }` |
| `electronAPI.onLanWebSocketStatus(cb)` | Subscribe to connection state changes |
| `electronAPI.onLanWebSocketKvChanged(cb)` | Subscribe to `kv_changed` payloads |

Main process IPC handlers: **`tc-ws-restart`**, **`tc-ws-status`**, **`tc-ws-stop`**.

---

## Stress Test Results

**Command:**

```bash
cd erp-app
node scripts/lan-ws-stress-test.mjs
```

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

## Verification Checklist

Test on two machines (Main PC + Counter PC) after `npm run build` + `npm run dist`:

| # | Test | Expected |
|---|------|----------|
| 1 | Counter creates sale | Main PC updates within ~1s (Live sync), not 2.5s wait |
| 2 | Main creates product | Counter shows product without manual refresh |
| 3 | Disconnect LAN cable / stop Apache | Header → **Offline** / **Polling** or **Reconnecting**; no crash |
| 4 | Restore LAN | WS reconnects → **Live sync**; polling stops |
| 5 | WS port blocked but HTTP works | **Polling** keeps sync every 2.5s |
| 6 | Standalone PC | No WebSocket activity; normal single-PC behavior |

### Build verification performed

```text
npm install ws@^8.18.3
npm run build   → success
node scripts/lan-ws-stress-test.mjs   → 8 passed, 0 failed
```

---

## Dependencies Added

```json
"ws": "^8.18.3"
```

Used only in **`lan-ws-sync.cjs`** (Electron main process, Node.js).

---

## Log Examples

```
[debug] [LanWS:health] client_connected {"lastPingLatencyMs":12,"totalReconnects":1,...}
[info]  [LanWS] Broadcast revision=42 msg_id=kv_... keys=[tc3_sales]
[warn]  [LanWS] Heartbeat timeout — reconnecting
[info]  [LanWS] Sync catchup requested (reconnect) rev 41 -> 42
```

---

## Rollback

To disable WebSocket without removing code:

1. Block port 9876 on Main PC firewall → polling fallback continues.
2. Or revert commits touching `lan-ws-sync.cjs`, `main.cjs`, `preload.js`, `App.jsx`, and `package.json`.

HTTP sync remains fully functional without WebSocket.

---

*End of report.*
