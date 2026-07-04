# TechonERP — Enterprise LAN Device Authentication

**Date:** July 4, 2026  
**Scope:** Replace shared `X-TC-KEY` with per-device HMAC authentication (phased migration)  
**Unchanged:** Sync logic, WebSocket architecture, HTTP fallback, standalone mode, business rules

---

## Summary

Each Counter PC becomes a **trusted device** with its own UUID and 256-bit secret. The Main PC is the authority. Authentication uses **HMAC-SHA256** request signing — no JWT, no OAuth, no internet.

**`X-TC-KEY` is retained** until all installations complete migration. Dual-auth accepts either method.

---

## Architecture

```
Counter PC                              Main PC
──────────                              ───────
tc_device.dat (encrypted)               trusted_devices (MySQL)
  device_id (UUID)                        device_id, secret_enc, status
  device_secret (after approval)          permissions, audit log
        │                                        │
        ├─ POST device_register.php ────────────►│ pending
        ├─ GET  device_status.php  ◄────────────│ approved + one-time secret
        ├─ HTTP: X-TC-DEVICE-ID + HMAC ─────────►│ requireAuth() dual
        └─ WS:   device_id + HMAC on auth ─────►│ device_validate.php
```

---

## Shared Authentication Engine

### PHP — `network-api/device_auth.php`

| Function | Purpose |
|----------|---------|
| `tcComputeSignature()` | HMAC-SHA256 over canonical string |
| `tcValidateDeviceAuth()` | HTTP header validation + replay protection |
| `tcValidateWsDeviceAuth()` | WebSocket auth message validation |
| `tcRequireAuthDual()` | Device first, legacy `X-TC-KEY` fallback |
| `tcRegisterDeviceRequest()` | Pending device registration |
| `tcApproveDevice()` | Generate secret on Main PC |
| `tcDeliverDeviceSecret()` | One-time secret delivery to counter |

**Canonical sign string:**
```
METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_SHA256_HEX
```

### Node — `device-crypto.cjs` + `device-store.cjs` + `lan-auth.cjs`

| Module | Purpose |
|--------|---------|
| `device-crypto.cjs` | Sign/verify HTTP + WS (must match PHP) |
| `device-store.cjs` | Encrypted `tc_device.dat` in userData |
| `lan-auth.cjs` | Build headers: device → legacy fallback |

### Tests

```bash
cd erp-app
node scripts/device-auth-engine.test.mjs   # 19 tests
php network-api/device_auth_selftest.php   # PHP crypto parity (optional)
```

---

## Registration Flow

1. Counter connects with legacy **Security Key** (`X-TC-KEY`) — unchanged.
2. Counter → **Register Device** (Settings → Network) or auto on setup.
3. Main PC admin sees pending device in **Trusted Devices**.
4. Admin clicks **Approve** → Main PC generates 256-bit secret.
5. Counter clicks **Check Approval** → receives secret once via `device_status.php`.
6. Secret saved encrypted locally; HTTP/WS switch to device HMAC automatically.

---

## Authentication Flow (HTTP)

**Headers:**
- `X-TC-DEVICE-ID`
- `X-TC-TIMESTAMP` (unix seconds)
- `X-TC-NONCE` (32+ hex chars)
- `X-TC-SIGNATURE` (HMAC-SHA256 hex)

**Replay protection:**
- ±5 minute timestamp window
- Nonce store (`device_nonces`, 10 min TTL)
- Disabled / unknown / pending devices rejected

**Fallback:** If no device headers → existing `X-TC-KEY` check.

---

## WebSocket Authentication

- Client: `signWsAuth()` when approved credentials exist; else legacy `apiKey`.
- Server: validates device via `device_validate.php` (LAN-only); legacy key still accepted.

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `trusted_devices` | Device registry + encrypted secrets |
| `device_nonces` | Replay protection |
| `device_audit_log` | register / approve / auth_fail / replay |

Schema in `network-api/schema.sql` (auto-created on first use).

---

## Files Changed

| File | Change |
|------|--------|
| `network-api/device_auth.php` | **New** — auth engine |
| `network-api/device_register.php` | **New** |
| `network-api/device_status.php` | **New** |
| `network-api/device_manage.php` | **New** |
| `network-api/device_validate.php` | **New** — WS validation |
| `network-api/config.php` | Dual `requireAuth()`, CORS headers |
| `network-api/schema.sql` | Device tables |
| `device-crypto.cjs` | **New** |
| `device-store.cjs` | **New** |
| `lan-auth.cjs` | **New** |
| `main.cjs` | Signed LAN requests, device IPC |
| `preload.js` | Device + lanRequest APIs |
| `lan-ws-sync.cjs` | Device WS auth + legacy fallback |
| `src/sync/SyncEngine.js` | IPC lanRequest for pulls |
| `src/pages/Settings.jsx` | Trusted Devices + counter registration |
| `scripts/device-auth-engine.test.mjs` | **New** |

---

## Migration Strategy

| Phase | Behavior |
|-------|----------|
| **Now** | Both auth methods work; legacy key required for registration |
| **Per counter** | Register → approve → device auth used automatically |
| **Future** | Admin disables legacy key when all counters migrated (manual) |

No data loss. Existing `tc_network.json` + `X-TC-KEY` unchanged.

---

## Security Model

- 256-bit device secrets generated on Main PC only
- Secrets encrypted at rest (MySQL + local `tc_device.dat`)
- Secrets never exposed to renderer (main process only)
- Permissions JSON prepared for future module ACLs
- Audit log for all auth events

---

## Performance Impact

- HMAC signing: &lt;1 ms per request (main process)
- One extra HTTP call on WS connect for device validation
- Nonce GC on each auth check (lightweight)

---

## Manual Verification Checklist

| # | Test | Expected |
|---|------|----------|
| 1 | Legacy counter (key only) | Sync works via `X-TC-KEY` |
| 2 | Register + approve | Counter gets device secret |
| 3 | Approved counter sync | Uses device HMAC |
| 4 | Disabled device | 401 on HTTP and WS |
| 5 | Replay (reuse nonce) | Rejected |
| 6 | WS reconnect | Device or legacy auth |
| 7 | Main PC restart | Counter recovers via catch-up + device auth |
| 8 | Standalone mode | No device auth activity |

---

*End of report.*
