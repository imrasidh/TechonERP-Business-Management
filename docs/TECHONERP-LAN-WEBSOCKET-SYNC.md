# TechonERP — LAN WebSocket Sync Upgrade Report

**Date:** July 4, 2026  
**Scope:** Instant LAN synchronization via WebSockets (additive layer on existing HTTP sync)  
**Status:** Implemented in source — build verified; not yet committed to git at time of writing

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
| **`erp-app/lan-ws-sync.cjs`** | **New.** WebSocket server (Main PC) and client (Counter). Auth, broadcast, reconnect, notify relay. |
| **`erp-app/main.cjs`** | Requires `lan-ws-sync.cjs`; starts WS on app launch; broadcasts after successful `tc-sync-patch`; IPC handlers `tc-ws-restart`, `tc-ws-status`; `wsPort` in network config sanitize. |
| **`erp-app/preload.js`** | Exposes `restartLanWebSocket`, `getLanWebSocketStatus`, `onLanWebSocketStatus`, `onLanWebSocketKvChanged` to renderer. |
| **`erp-app/src/App.jsx`** | WS-driven targeted pull; polling fallback when WS disconnected; connection state in header (`Live sync` / `Polling` / `Connecting` / `Reconnecting`). |
| **`erp-app/src/sync/SyncEngine.js`** | Added export **`getSyncClientId()`** only (for WS auth + dedup). No change to sync behavior. |
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

1. Renderer checks **revision dedup** and **self-echo skip**.
2. Calls existing **`loadStateFromServer(apiUrl, keys)`** — partial pull only.
3. Merges with local state via existing **`mergeServerStateWithLocal`** (unchanged).

---

## WebSocket Protocol

### Connection

- **URL:** `ws://{apiUrl-host}:9876` (host parsed from `tc_network.json` `apiUrl`).
- **Port:** `wsPort` in network config, default **9876** (must be ≥ 1024).

### Auth (first message after connect)

```json
{ "type": "auth", "apiKey": "...", "clientId": "client_..." }
```

Server responds:

```json
{ "type": "auth_ok", "revision": 42, "server_time": "2026-07-04T..." }
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
  "server_time": "2026-07-04T11:30:00.000Z"
}
```

### Counter → Main relay (after local HTTP push succeeds)

```json
{ "type": "notify", "keys": ["tc3_sales"], "client_id": "client_..." }
```

---

## Reconnect Strategy

Implemented in **`lan-ws-sync.cjs`** (Counter client only).

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

---

## Fallback Strategy (Polling Preserved)

| Condition | Pull behavior |
|-----------|---------------|
| `wsConnStatus === 'connected'` | **No** 2.5s interval; pull on WS `kv_changed` + after own push (flush callback) |
| `wsConnStatus !== 'connected'` | **2.5s polling** via `CLIENT_PULL_INTERVAL_MS` (unchanged) |
| HTTP ping fails (counter offline) | Pull paused when `connStatus === 'disconnected'` (unchanged) |
| WS down but HTTP up | Polling keeps data in sync until WS reconnects |

When WebSocket reconnects, polling interval is **removed** again automatically (React effect re-runs on `wsConnStatus` change).

Initial full pull still runs once on login (unchanged).

---

## Duplicate Update Prevention

1. **Monotonic revision** — Server increments `revision` on each broadcast. Client ignores messages where `revision <= lastWsRevision`.
2. **Self-echo skip** — If `source_client_id` equals local `getSyncClientId()` and all notified keys are still **`TC_SYNC.isKeyPending(key)`**, skip pull (local data already authoritative).
3. **Server-side patch dedup** — Existing `processed_patches` table in `sync_patch.php` (unchanged).
4. **Pull in-flight guard** — Single concurrent pull per effect instance (`pullInFlight` flag).

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

## IPC / Preload API (New)

| Method | Description |
|--------|-------------|
| `electronAPI.restartLanWebSocket({ clientId })` | Start/restart WS for current network role |
| `electronAPI.getLanWebSocketStatus()` | Returns `{ status, role, revision, port }` |
| `electronAPI.onLanWebSocketStatus(cb)` | Subscribe to connection state changes |
| `electronAPI.onLanWebSocketKvChanged(cb)` | Subscribe to `kv_changed` payloads |

Main process IPC handlers: **`tc-ws-restart`**, **`tc-ws-status`**.

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
```

Full two-PC LAN runtime testing should be performed on deployed `.exe` installs.

---

## Dependencies Added

```json
"ws": "^8.18.3"
```

Used only in **`lan-ws-sync.cjs`** (Electron main process, Node.js).

---

## Related Work in Same Branch (Context)

This WebSocket layer was added alongside other recent UI/sync improvements (header bar, POS line-comments module toggle, quotation footer text). Those are separate changes in `App.jsx`, `Settings.jsx`, `Sales.jsx`, and `invoicePrintLabels.js`.

---

## Rollback

To disable WebSocket without removing code:

1. Block port 9876 on Main PC firewall → polling fallback continues.
2. Or revert commits touching `lan-ws-sync.cjs`, `main.cjs`, `preload.js`, `App.jsx`, and `package.json`.

HTTP sync remains fully functional without WebSocket.

---

*End of report.*
