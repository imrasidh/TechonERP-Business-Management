# Architecture Documentation

## Purpose

This folder contains the core system architecture documentation for TechonERP: product overview, structural design, technology choices, application lifecycle, storage model, data flow, codebase layout, and source-of-truth rules.

---

## Documents

| File | Description |
|------|-------------|
| [00_README.md](00_README.md) | Documentation library index (TERP-000) and reading order |
| [01_PROJECT_OVERVIEW.md](01_PROJECT_OVERVIEW.md) | Product vision, objectives, modules, and operating modes |
| [02_SYSTEM_ARCHITECTURE.md](02_SYSTEM_ARCHITECTURE.md) | Overall system architecture and component relationships |
| [03_TECH_STACK.md](03_TECH_STACK.md) | Technologies, frameworks, and runtime dependencies |
| [04_APPLICATION_LIFECYCLE.md](04_APPLICATION_LIFECYCLE.md) | Startup, license gate, login, sync init, and shutdown |
| [05_STORAGE_ARCHITECTURE.md](05_STORAGE_ARCHITECTURE.md) | IndexedDB, localStorage, MySQL KV, and caching layers |
| [07_DATA_FLOW.md](07_DATA_FLOW.md) | End-to-end business data flow (e.g. sales invoice save) |
| [10_SOURCE_OF_TRUTH.md](10_SOURCE_OF_TRUTH.md) | Authoritative data ownership per feature |
| [25_CODEBASE_STRUCTURE.md](25_CODEBASE_STRUCTURE.md) | Repository folder layout and key file locations |

---

## Recommended Reading Order

1. [00_README.md](00_README.md) or [01_PROJECT_OVERVIEW.md](01_PROJECT_OVERVIEW.md)
2. [02_SYSTEM_ARCHITECTURE.md](02_SYSTEM_ARCHITECTURE.md)
3. [03_TECH_STACK.md](03_TECH_STACK.md)
4. [04_APPLICATION_LIFECYCLE.md](04_APPLICATION_LIFECYCLE.md)
5. [05_STORAGE_ARCHITECTURE.md](05_STORAGE_ARCHITECTURE.md)
6. [07_DATA_FLOW.md](07_DATA_FLOW.md)
7. [10_SOURCE_OF_TRUTH.md](10_SOURCE_OF_TRUTH.md)
8. [25_CODEBASE_STRUCTURE.md](25_CODEBASE_STRUCTURE.md)

---

## Related Folders

- [../database/](../database/README.md) — Data model and schema
- [../synchronization/](../synchronization/README.md) — Multi-PC sync
- [../business/](../business/README.md) — Modules and business rules
- [../reference/](../reference/README.md) — Critical source files
- [../development/](../development/README.md) — Implementation guides
