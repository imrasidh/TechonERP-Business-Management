# Changelog

## 2.0.1 - 2026-07-03

- Fixed a production IndexedDB startup failure where existing installations could open `techon_erp_v1` without the required `kv` object store, causing local saves to fail before live sync started.
- Added permanent IndexedDB schema recovery during app startup: verify `kv`, attempt versioned recovery, recreate the database only when recovery cannot restore the required store, and stop startup with a clear error if the local database is still invalid.
- Removed temporary multi-PC sync diagnostic tracing and debug-only IPC hooks used during investigation.
- Fixed customer delete not syncing live between Main and Counter PCs by applying server membership on pull merge.
- Fixed quotation edit crash (`getDuplicateNormalizedNameKeys` not passed to Quotations form).
- Fixed manual **Sync License** on network server (cloud verify returns `VALID`, not `OK`).
