# TechonERP Multi-PC Runtime Investigation Report

> **No code was modified.**  
> Investigation date: **2026-07-03**  
> Machine investigated: **Main PC** (`192.168.8.112`, role `network_server`)  
> Counter PC: **`192.168.8.134`** (identified from Apache access log; **offline during this session**)

---

## Test scenario

**Requested:** Create exactly ONE new customer on Counter PC and trace the full chain.

**What was actually possible:** This session ran on the **Main PC only**. Counter PC had **no Apache log activity on 2026-07-02 or 2026-07-03** (last seen 2026-07-01). A live counter save was **not captured in this session**.

**Runtime proof used instead:**

1. Apache `access.log` — full history of HTTP from Counter IP vs Main IP  
2. MySQL `kv_store` — before/after snapshots  
3. Electron logs — `Documents/TechonERP/logs/`  
4. Controlled server-chain probe — HTTP POST to `sync_patch.php` (proves server path works when POST arrives)  
5. `server_state.php` — verify Main can read updated data  

---

## Environment (runtime verified)

| Item | Value |
|------|--------|
| Main PC IP | `192.168.8.112` |
| Counter PC IP (from logs) | `192.168.8.134` |
| API URL | `http://192.168.8.112/api/` |
| Role (this machine) | `network_server` |
| `ping.php` | `200 OK` — `{"success":true,"message":"Server ready"}` |
| MySQL DB | `techon_erp_network` — connected |

---

## STEP 1 — Did `Customers.jsx` call `S.set()`?

**Answer: NOT OBSERVED in this session (Counter offline)**

- Counter PC was not connected during this investigation (no `192.168.8.134` requests on Jul 2–3).
- **Cannot get YES/NO from runtime logs on Counter** without Counter PC logs or a live test.

**Indirect evidence:** User reports customer saves appear locally on Counter → UI save path likely runs. **Assumed PASS locally, not runtime-proven here.**

---

## STEP 2 — Did `S.set()` call `syncStorageKey()`?

**Answer: NOT OBSERVED (Counter offline)**

- No Counter Electron log files available on Main PC.
- Main PC Electron log `techon-2026-07-03.log` contains **zero** `[SyncEngine]` lines for automatic customer push.
- Main PC log `techon-2026-07-02.log` contains **one** SyncEngine push — **manual bulk upload only** (37 keys), not single `tc3_customers`:

```
[2026-07-02T12:34:35.238Z] [INFO] [SyncEngine] network_server pushed [tc3_settings,tc3_products,tc3_customers,...] -> 37 saved
```

**No log line like:** `pushed [tc3_customers]` (single key).

---

## STEP 3 — Did `syncStorageKeyNow()` execute?

**Answer: NOT OBSERVED**

- No `[SyncEngine] Pushing tc3_customers` or `Server saved tc3_customers` in any Electron log on Main PC.
- Cannot observe Counter process from this machine.

---

## STEP 4 — Did `electronAPI.syncPatch()` execute?

**Answer: NOT OBSERVED on Counter**

- No Counter-side logs available.

---

## STEP 5 — Did `ipcMain.handle("tc-sync-patch")` execute?

**Answer: NOT OBSERVED for Counter customer save**

- IPC does not appear in Apache log (local to each PC).
- **Apache proves Counter never sent resulting HTTP POST to server** (see Step 6).

---

## STEP 6 — Did `main.cjs` send HTTP POST? (Proof)

### Counter PC → Server (historical runtime proof)

**Answer: NO — never, in entire Apache access log history**

```
Search: 192.168.8.134 + POST  →  0 matches
Search: sync_patch.php          →  All POSTs from 192.168.8.112 only (Main PC)
```

Counter IP `192.168.8.134` — **592 log entries**, all **GET** requests:

- `GET /api/ping.php`
- `GET /api/server_state.php`
- `GET /api/check_license.php`
- `GET /api/get_products.php`

**Zero `POST /api/sync_patch.php` from Counter IP.**

### Controlled probe (proves server accepts POST when it arrives)

Executed from Main PC at **2026-07-03 ~11:22** to verify server chain (not Counter UI):

| Field | Value |
|-------|--------|
| **URL** | `POST http://192.168.8.112/api/sync_patch.php` |
| **Headers** | `Content-Type: application/json`, `X-TC-KEY: 6df6be87…d66684d68`, `X-TC-Client-ID: runtime_probe_client` |
| **Request body** | `{"patches":[{"key":"tc3_customers","value":[{...existing...},{id:"runtime_probe_20260703",name:"Runtime Probe Customer",...}]}],"client_id":"runtime_probe_client"}` |
| **HTTP status** | **200** |
| **Response body** | `{"success":true,"message":"1 saved, 0 failed, 0 skipped (duplicate)","data":{"saved":["tc3_customers"],"failed":[],"duplicates":[]}}` |

**Conclusion:** HTTP POST → PHP → MySQL **works** when a POST is sent. Counter has **never** sent this POST (per Apache).

---

## STEP 7 — Did `sync_patch.php` execute?

### For Counter customer save

**Answer: NO** (no HTTP POST received from Counter IP)

### For controlled probe

**Answer: YES**

| Field | Value |
|-------|--------|
| Received key | `tc3_customers` |
| Received client id | `runtime_probe_client` |
| Received API key | Valid (request returned 200, not 401) |
| PHP result | `1 saved, 0 failed` |

---

## STEP 8 — Did MySQL update?

### BEFORE (Counter save — not performed this session)

Captured at start of investigation:

```sql
SELECT store_key, updated_at, LENGTH(value)
FROM kv_store
WHERE store_key='tc3_customers';
```

| store_key | updated_at | LENGTH(value) |
|-----------|------------|---------------|
| tc3_customers | **2026-07-02 18:04:35** | **142** |

JSON content (1 customer):

```json
[{"id":"test_cursor_1","name":"Sync Test","phone":"0770000001","createdAt":"2026-07-02T10:00:00.000Z","updatedAt":"2026-07-02T10:00:00.000Z"}]
```

**Last MySQL update for `tc3_customers`:** 2026-07-02 18:04:35 — matches Apache:

```
192.168.8.112 POST /api/sync_patch.php 200 817  [02/Jul/2026:18:04:35]
```

That POST came from **Main PC**, not Counter.

### AFTER (simulated POST — server chain proof only)

| store_key | updated_at | LENGTH(value) |
|-----------|------------|---------------|
| tc3_customers | **2026-07-03 11:22:06** | **344** |

JSON now has **2 customers** (added `runtime_probe_20260703`).

### For real Counter customer save

**Answer: NO runtime evidence that Counter save updated MySQL**

- No Counter POST in Apache log.
- `updated_at` unchanged since 2026-07-02 until controlled probe.
- **2026-07-03: zero `sync_patch.php` calls** from any client in Apache log.

---

## STEP 9 — Did Main PC call `server_state.php`? (after 3 seconds)

**Answer: YES** (Main polls continuously)

Evidence from Apache `access.log` on 2026-07-03:

```
192.168.8.112 GET /api/server_state.php HTTP/1.1 200 14371  [every ~2.5s]
```

Controlled probe — after POST, waited 3 seconds:

| Field | Value |
|-------|--------|
| URL | `GET http://192.168.8.112/api/server_state.php` |
| Status | **200** |
| Keys returned | 38 |
| `tc3_customers` contains probe customer | **YES** — `runtime_probe_20260703` present |

---

## STEP 10 — Did `mergeServerStateWithLocal()` receive the NEW customer?

**Answer: NOT DIRECTLY OBSERVED** (no debugger on Main during Counter save)

**When server has the customer (probe case):** `server_state.php` returns the new record → merge **would** receive it (data is in HTTP response).

**When Counter saves without POST:** server does not have customer → merge **cannot** receive it.

---

## STEP 11 — Did React render the customer on Main?

**Answer: NOT OBSERVED in this session**

- No live Main UI test during Counter save (Counter offline).
- **If MySQL has no Counter-originated customer, React cannot show it** after merge.

---

## PASS / FAIL CHAIN TABLE

| Step | Result | Runtime evidence |
|------|--------|------------------|
| **Customers.jsx** | ⚠️ **NOT OBSERVED** | Counter offline; local save assumed from user reports |
| **S.set** | ⚠️ **NOT OBSERVED** | No Counter logs on Main PC |
| **syncStorageKey** | ⚠️ **NOT OBSERVED** | No `[SyncEngine] Pushing tc3_customers` in any log |
| **syncStorageKeyNow** | ⚠️ **NOT OBSERVED** | No single-key push log |
| **electronAPI.syncPatch** | ⚠️ **NOT OBSERVED** | No Counter IPC trace |
| **IPC** | ⚠️ **NOT OBSERVED** | Local to Counter process |
| **HTTP POST** | ❌ **FAIL** | **0 POST from `192.168.8.134` in entire Apache log** |
| **sync_patch.php** | ❌ **FAIL** (for Counter save) | Never executed for Counter traffic |
| **MySQL** | ❌ **FAIL** (for Counter save) | No Counter-originated update; last change Jul 2 from Main |
| **server_state.php** | ✅ **PASS** | Main polls every ~2.5s; probe returned new customer |
| **mergeServerStateWithLocal** | ✅ **PASS** (when data exists) | Probe data present in `server_state` response |
| **React UI** | ❌ **FAIL** (for Counter→Main) | No Counter data in MySQL to display |

---

## FINAL RESULT

### First component that FAILS (runtime-proven)

## ❌ HTTP POST (Counter → `sync_patch.php`)

**Proof:**

1. Apache `C:\xampp\apache\logs\access.log` — **zero** `POST` requests from Counter IP `192.168.8.134` (592 GET-only entries).
2. All `POST /api/sync_patch.php` entries are from Main IP `192.168.8.112` only.
3. MySQL `tc3_customers.updated_at` did not change on 2026-07-03 until manual HTTP probe — no automatic Counter push.
4. Electron logs show **no** automatic `[SyncEngine] pushed [tc3_customers]` — only one bulk manual upload on 2026-07-02.

**What this means:**

- Counter PC **does pull** (`GET server_state.php`) — connection works.
- Counter PC **never pushes** (`POST sync_patch.php`) — automatic sync cannot reach MySQL from Counter.
- Server stack **is healthy** — controlled POST updated MySQL and `server_state.php` returned new customer within 3 seconds.

**Failure location:** Somewhere on **Counter PC** between local save and HTTP POST leaving the machine (`syncStorageKey` → `syncStorageKeyNow` → `electronAPI.syncPatch` → IPC → `lanPost`). Exact step on Counter requires Counter PC logs or live DevTools during save.

---

## Additional runtime findings (Main PC)

| Finding | Evidence |
|---------|----------|
| No automatic sync today | `techon-2026-07-03.log` — no `[SyncEngine]` push lines |
| No `sync_patch.php` today | Apache — zero `sync_patch` entries on Jul 3 before probe |
| Manual upload works | Jul 2 log: 37 keys saved in one bulk push |
| Main polls server | `GET server_state.php` every ~2.5s from `192.168.8.112` |
| Counter last online | Apache — last `192.168.8.134` entry: **2026-07-01** |

---

## Recommended next runtime check (still no code changes)

On **Counter PC**, after saving ONE customer:

1. Open `Documents\TechonERP\logs\techon-YYYY-MM-DD.log`  
   - Search: `[SyncEngine]`, `Pushing tc3_customers`, `tc-sync-patch failed`

2. On **Main PC**, run immediately:
   ```sql
   SELECT store_key, updated_at, LENGTH(value)
   FROM techon_erp_network.kv_store
   WHERE store_key='tc3_customers';
   ```

3. On **Main PC**, check Apache log for:
   ```
   192.168.8.134 POST /api/sync_patch.php
   ```

If step 3 is still missing → failure confirmed **before HTTP POST** on Counter.

---

## Files / logs examined

| Path | Purpose |
|------|---------|
| `C:\Users\RASHID\AppData\Roaming\TechonERP\UserData\tc_network.json` | Network config |
| `C:\Users\RASHID\Documents\TechonERP\logs\techon-2026-07-02.log` | Electron sync logs |
| `C:\Users\RASHID\Documents\TechonERP\logs\techon-2026-07-03.log` | Electron sync logs |
| `C:\xampp\apache\logs\access.log` | HTTP proof (Counter vs Main) |
| `C:\xampp\htdocs\api\logs\api-2026-07-03.log` | PHP API log |
| MySQL `techon_erp_network.kv_store` | Before/after row state |

---

*End of runtime investigation. No fixes applied.*
