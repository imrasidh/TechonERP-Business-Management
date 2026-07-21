# Synchronization Documentation

## Purpose

This folder documents TechonERP multi-PC synchronization: architecture, HTTP push/pull, WebSocket notifications, conflict handling, and the sync protocol.

---

## Documents

| File | Description |
|------|-------------|
| [08_SYNCHRONIZATION_ARCHITECTURE.md](08_SYNCHRONIZATION_ARCHITECTURE.md) | Multi-PC sync architecture, roles, and data flow |
| [28_SYNC_PROTOCOL.md](28_SYNC_PROTOCOL.md) | Detailed sync protocol, endpoints, and conflict resolution |

---

## Recommended Reading Order

1. [08_SYNCHRONIZATION_ARCHITECTURE.md](08_SYNCHRONIZATION_ARCHITECTURE.md)
2. [28_SYNC_PROTOCOL.md](28_SYNC_PROTOCOL.md)

---

## Related Folders

- [../architecture/](../architecture/README.md) — Storage and data flow
- [../api/](../api/README.md) — LAN API endpoints used by sync
- [../database/](../database/README.md) — MySQL `kv_store` hub on Main PC
- [../security/](../security/README.md) — Device auth and API keys
- [../operations/](../operations/README.md) — Troubleshooting sync issues
