# Techon ERP — operations & recovery runbook

## Observability (built-in)

- **GL audit** (`tc3_gl_audit`): last 500 rows include merge failures, invariant failures, commit failures, sync merge issues.
- **Operational snapshot**: in the desktop app, `window.TechonOperationalHealth()` returns a summary (sync meta, GL failure counts, inventory reconciliation flag).
- **Critical events**: when `TC_BLOCK_WRITES_ON_CRITICAL=1` in the main process, invariant/sync critical audit rows can block further journal writes until resolved.

---

## Pre-release checklist (mandatory)

1. On a clean checkout: `npm ci` then `npm run ci` (typecheck, audit, secret scan, accounting + ERP tests, production build).
2. Confirm **no** `LICENSE_SECRET` / `TC_LIC_SERVER_SECRET` literals in source (CI runs `npm run ci:scan-secrets`).
3. Smoke the **installed** desktop build (not only `vite dev`): open app, open a read-only screen, confirm no startup errors.
4. Tag / record the git commit and build artifact version (e.g. `package.json` version + build id).

Optional but recommended:

```bash
npm run release:gate
```

(`release:gate` runs full `ci` then prints a short manual follow-up list.)

---

## Rollback (if a bad build shipped)

1. **Stop** distributing the faulty installer; keep previous installer/binary available per your policy.
2. **Clients**: uninstall or install the **last known good** build; do not mix mismatched DB backup versions without testing.
3. **Data**: restore from the **last verified backup** (Settings → backup, or your file-level procedure).
4. **Verify** after restore: app starts, login/license OK, spot-check Accounts / inventory figures vs. expectations.
5. **Document** incident: what version failed, what was restored, who approved rollback.

---

## Monthly discipline

1. **Backup**: Settings → backup (or your documented backup path). Confirm `version: 2` JSON shape.
2. **Restore test**: Restore to a non-production machine or empty profile; confirm app opens, trial balance/reconciliation acceptable.
3. **Secrets**: Confirm `LICENSE_SECRET` or `tc_license_secret.txt` is present on packaged installs that talk to the license API.

---

## Recovery outline

1. Stop the app.
2. Restore the latest good backup (or IDB export) per your IT policy.
3. Start the app; run **Accounts → reconciliation** (or equivalent) and confirm no unexpected mismatches.
4. If GL audit shows repeated `journal_sync_merge_imbalance`, treat as sync conflict — resolve on the server PC first, then clients.

---

## Automated release gate

```bash
npm run ci
```

Do not ship if this fails.
