# TechonERP — Codebase Structure

Filename: docs/architecture/25_CODEBASE_STRUCTURE.md

Document ID: TERP-025

Classification: Internal Engineering Documentation

Audience:
- Software Engineers
- Technical Leads
- Software Architects
- Future Maintainers

Version: 1.0

Status: Production

Owner: Chief Software Architect

Last Updated: 2026-07-17

---

# Executive Summary

This document describes the complete organization of the TechonERP source code.

Unlike previous documents that explain architecture conceptually, this document explains how the actual source code should be organized on disk.

It defines directory responsibilities, ownership, dependencies, naming conventions, and architectural boundaries.

A consistent project structure improves maintainability, onboarding, scalability, and long-term development.

---

# Purpose

This document defines

- Folder hierarchy
- Module organization
- Layer separation
- Naming conventions
- Dependency rules
- File ownership
- Import guidelines

---

# Code Organization Philosophy

The codebase follows these principles.

- One responsibility per folder.
- One responsibility per file whenever practical.
- Business logic separated from UI.
- Shared code centralized.
- No circular dependencies.
- Predictable directory structure.

---

# High-Level Project Layout

```
TechonERP/

├── client/
├── server/
├── electron/
├── database/
├── shared/
├── scripts/
├── assets/
├── documentation/
├── tests/
├── build/
└── configuration/
```

Each directory has a clearly defined responsibility.

---

# Client Directory

Purpose

Contains the React application.

Typical contents

```
client/

├── components/
├── pages/
├── modules/
├── hooks/
├── context/
├── services/
├── sync/
├── storage/
├── utils/
├── styles/
└── assets/
```

The client should contain only presentation logic and client-side business interaction.

---

# Server Directory

Purpose

Contains backend APIs and business services.

Example

```
server/

├── api/
├── routes/
├── controllers/
├── middleware/
├── services/
├── repositories/
├── models/
└── utilities/
```

The server owns data access and server-side business processing.

---

# Electron Directory

Purpose

Desktop application wrapper.

Responsibilities

- Window creation
- Native dialogs
- IPC
- File system access
- Auto updates
- Native integrations

Electron should never contain business logic.

---

# Database Directory

Purpose

Contains database-related resources.

Example

```
database/

├── schema/
├── migrations/
├── seeds/
├── indexes/
└── backup/
```

---

# Shared Directory

Purpose

Contains reusable code.

Examples

- Constants
- Shared models
- Validation
- DTOs
- Enumerations

Shared code should remain platform independent.

---

# Scripts Directory

Purpose

Development automation.

Examples

- Build
- Packaging
- Deployment
- Backup
- Migration
- Maintenance

Scripts should never contain business rules.

---

# Assets Directory

Contains

- Images
- Icons
- Fonts
- Logos
- Templates
- Static resources

Assets should remain independent from executable code.

---

# Documentation Directory

Contains

- Architecture
- API documentation
- Developer guides
- Changelogs
- Deployment guides

Documentation should evolve alongside the source code.

---

# Tests Directory

Contains

```
tests/

├── unit/
├── integration/
├── regression/
├── performance/
├── security/
└── fixtures/
```

Every major module should have corresponding tests.

---

# Build Directory

Contains generated build artifacts.

Examples

- Installers
- Executables
- Packages

No source code should be edited inside this directory.

---

# Configuration Directory

Contains

- Environment configuration
- Build configuration
- Deployment configuration
- Feature flags

Configuration should never be hardcoded into source files.

---

# Dependency Rules

```
UI

↓

Business Services

↓

Storage API

↓

Database

↓

Persistence
```

Dependencies should always flow downward.

Reverse dependencies are prohibited.

---

# File Naming Standards

Examples

```
SalesService.js

CustomerRepository.js

InventoryController.js

SyncManager.js

StorageAPI.js
```

Names should clearly indicate responsibility.

---

# Folder Ownership

| Folder | Owner |
|---------|-------|
| client | Frontend Team |
| server | Backend Team |
| electron | Desktop Team |
| database | Database Team |
| shared | Architecture Team |
| tests | QA Team |
| documentation | Engineering Team |

Ownership ensures accountability.

---

# Architectural Boundaries

Business rules belong only in business services.

UI components must never

- Query databases directly
- Modify synchronization
- Access storage directly
- Perform security validation

Every layer communicates only through approved interfaces.

---

# Developer Guidelines

Developers should

✅ Keep folders focused.

✅ Avoid duplicate utilities.

✅ Separate UI from business logic.

✅ Maintain consistent naming.

✅ Document new directories.

---

# Common Mistakes

❌ Mixing UI and business logic.

❌ Creating circular imports.

❌ Hardcoding configuration.

❌ Duplicating utilities.

❌ Placing business rules inside React components.

---

# Related Documents

- docs/architecture/02_SYSTEM_ARCHITECTURE.md
- docs/architecture/03_TECH_STACK.md
- docs/architecture/05_STORAGE_ARCHITECTURE.md
- docs/business/09_MODULE_REFERENCE.md
- docs/reference/12_CRITICAL_FILES.md
- docs/development/13_CRITICAL_FUNCTIONS.md

---

# Revision History

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0 | 2026-07-17 | Chief Software Architect | Initial Codebase Structure |

---

End of Document