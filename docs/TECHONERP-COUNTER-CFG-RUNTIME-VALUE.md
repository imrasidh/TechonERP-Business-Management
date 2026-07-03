# Runtime Value of `cfg` at `SyncEngine.js` Line 558 (Counter PC)

> **No code was modified.**  
> Investigation date: **2026-07-03**  
> Scope: **Counter PC only** — actual value of `getActiveConfig()` immediately before:
>
> ```javascript
> if (!cfg || cfg.role === 'standalone' || !cfg.apiUrl) return;
> ```

---

## Result: ACTUAL VALUE NOT CAPTURED ON COUNTER PC

**The real runtime value of `cfg` on the Counter PC was not recorded in this session.**

| Attempt | Outcome |
|---------|---------|
| Counter PC `192.168.8.134` ping | **FAILED** (offline / unreachable) |
| Counter `tc_network.json` on this machine | **NOT FOUND** (config lives on Counter `UserData`, not Main PC) |
| Counter Electron logs on Main PC | **NOT AVAILABLE** (logs are local per machine) |
| Code instrumentation / logging | **NOT ALLOWED** (investigation rule) |
| Apache `POST` from Counter | **0 ever** (proves push never completed; does **not** reveal which `if` branch) |

**Therefore this report does not guess `cfg`.** It documents what was measured, what was not, and how to capture the exact value on Counter without changing source code.

---

## What `getActiveConfig()` does (source only)

```91:99:erp-app/src/sync/SyncEngine.js
function getActiveConfig() {
  if (_config && _config.apiUrl) return _config;
  try {
    if (typeof window !== 'undefined' && window._tcNetSyncConfig && window._tcNetSyncConfig.apiUrl) {
      return window._tcNetSyncConfig;
    }
  } catch (_) {}
  return _config;
}
```

`cfg` at line 558 is **exactly** the return value of this function at that moment.

It can only be:

1. Module `_config` (if `_config.apiUrl` is truthy), **or**
2. `window._tcNetSyncConfig` (if that object exists and `.apiUrl` is truthy), **or**
3. Module `_config` again (possibly `null` / missing `apiUrl`)

There is **no other source**.

---

## Which `if` branch is true? — UNKNOWN without measurement

```javascript
if (!cfg || cfg.role === 'standalone' || !cfg.apiUrl) return;
```

| Sub-condition | Actual value on Counter | Known? |
|---------------|----------------------|--------|
| `!cfg` | ? | **NO** |
| `cfg.role === 'standalone'` | ? | **NO** |
| `!cfg.apiUrl` | ? | **NO** |

**We know execution did not reach HTTP POST** (Apache: zero `POST` from `192.168.8.134`).  
**We do not know which of the three sub-conditions was true** without reading `cfg` on Counter at save time.

---

## How to capture ACTUAL `cfg` on Counter (no code changes)

On **Counter PC**, after login:

1. Open Techon ERP.
2. Press **F12** → **Console**.
3. Paste and run **before** saving a customer:

```javascript
(function () {
  // Replicates getActiveConfig() using only globals visible in DevTools
  var cfg = null;
  if (window._tcNetSyncConfig && window._tcNetSyncConfig.apiUrl) {
    cfg = window._tcNetSyncConfig;
  }
  var netRole = window._tcNetRole;
  var check = {
    cfg: cfg,
    cfgIsNull: cfg === null || cfg === undefined,
    role: cfg ? cfg.role : '(no cfg)',
    apiUrl: cfg ? cfg.apiUrl : '(no cfg)',
    apiKeyPresent: cfg ? !!cfg.apiKey : false,
    netRole: netRole,
    line558: {
      bangCfg: !cfg,
      roleIsStandalone: cfg ? cfg.role === 'standalone' : '(no cfg)',
      bangApiUrl: cfg ? !cfg.apiUrl : '(no cfg)',
      wouldReturn: !cfg || (cfg && cfg.role === 'standalone') || (cfg && !cfg.apiUrl)
    }
  };
  console.log(JSON.stringify(check, null, 2));
  return check;
})();
```

4. Save **one** customer in Customers.
5. Run the same snippet **immediately after** save.
6. Copy the JSON output — that is the **actual runtime evidence**.

Also read Counter disk config (main process source):

```powershell
Get-Content "$env:APPDATA\TechonERP\UserData\tc_network.json"
```

---

## Reference: Main PC config (NOT Counter — do not use as Counter `cfg`)

Captured on **Main PC** (`192.168.8.112`) during this session. **This is `network_server`, not Counter.**

```json
{
  "role": "network_server",
  "apiUrl": "http://192.168.8.112/api/",
  "apiKey": "6df6be87c665e9d5ada0cce5f4a51f6b76ecdccd8dd4bfc4a1b695ad66684d68",
  "xamppPath": "C:\\xampp",
  "port": 80,
  "wizardComplete": true
}
```

On Main PC, if line 558 ran with this config:

| Sub-condition | Would be |
|---------------|----------|
| `!cfg` | **false** |
| `cfg.role === 'standalone'` | **false** (`network_server`) |
| `!cfg.apiUrl` | **false** |
| Line 558 would return? | **NO** — would continue to push |

**This does not tell us Counter `cfg`.** Counter must use its own `tc_network.json` with `"role": "network_client"`.

---

## Expected Counter disk shape (for comparison only — not measured)

If Counter is set up correctly, disk file should look like:

```json
{
  "role": "network_client",
  "apiUrl": "http://192.168.8.112/api/",
  "apiKey": "<same key as main>",
  "wizardComplete": true
}
```

**If disk has this but `window._tcNetSyncConfig` is empty at save time**, then `getActiveConfig()` can still return `null` / bad `cfg` while pull works (pull uses React `systemConfig` prop, not `getActiveConfig()`). That mismatch is what line 558 investigation is for — but **must be confirmed with Console output above**, not assumed.

---

## Template to fill in after Counter capture

After you run the Console snippet on Counter, paste results here:

### Actual `cfg` immediately before line 558

```javascript
cfg = 
// PASTE Console output here
```

### Which `if` part was true

```
!cfg                 = 
cfg.role === 'standalone' = 
!cfg.apiUrl          = 

Therefore execution returned because:
```

---

## Summary

| Question | Answer |
|----------|--------|
| Actual `cfg` on Counter PC? | **NOT CAPTURED** (Counter offline; no Counter-side logs on Main PC) |
| Which `if` branch was true? | **UNKNOWN** until Console snippet run on Counter |
| Can we infer from Apache? | **NO** — zero POST only proves push failed, not which branch |
| Next step | Run DevTools snippet on Counter **before and after** one customer save |

---

*End of report. No code modified.*
