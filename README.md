# TechonERP

## Overview

TechonERP is a desktop ERP system built with React, Electron, Node.js,
and MySQL. It is designed to support standalone and multi-PC
environments with live synchronization while keeping business rules
centralized and maintainable.

## Technology Stack

-   React
-   Electron
-   Node.js
-   MySQL
-   REST API

## Project Structure

```text
TechonERP/
├── README.md
├── AI_CONTEXT.md
├── CONTRIBUTING.md
├── SECURITY.md
├── docs/
│   ├── architecture/
│   ├── business/
│   ├── database/
│   ├── api/
│   ├── synchronization/
│   ├── security/
│   ├── deployment/
│   ├── development/
│   ├── operations/
│   ├── reference/
│   ├── diagrams/
│   ├── requirements/
│   └── manuals/
├── erp-app/
└── public_html/
```

## Core Principles

-   Preserve the Source of Truth.
-   Keep synchronization reliable.
-   Reuse existing architecture before creating new components.
-   Follow coding standards and documentation.
-   Protect business data and backward compatibility.

## Development Rules

Always:

-   Understand the existing module before changing it.
-   Reuse components where possible.
-   Keep database migrations safe.
-   Update documentation when behavior changes.
-   Test standalone and multi-PC workflows.

Never:

-   Break the synchronization engine.
-   Duplicate business logic.
-   Rename APIs unnecessarily.
-   Remove audit or validation logic.
-   Introduce hardcoded values.

## Documentation

Detailed documentation is organized by domain under `docs/`.

Core entry points:

-   **Documentation home:** [docs/README.md](docs/README.md)
-   Repository context: [AI_CONTEXT.md](AI_CONTEXT.md)
-   Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
-   Security policy: [SECURITY.md](SECURITY.md)
-   Full index (TERP-000): [docs/architecture/00_README.md](docs/architecture/00_README.md)

Reference documents:

-   Project Overview: `docs/architecture/01_PROJECT_OVERVIEW.md`
-   System Architecture: `docs/architecture/02_SYSTEM_ARCHITECTURE.md`
-   Application Lifecycle: `docs/architecture/04_APPLICATION_LIFECYCLE.md`
-   Storage Architecture: `docs/architecture/05_STORAGE_ARCHITECTURE.md`
-   Database Architecture: `docs/database/06_DATABASE_ARCHITECTURE.md`
-   Data Flow: `docs/architecture/07_DATA_FLOW.md`
-   Synchronization Architecture: `docs/synchronization/08_SYNCHRONIZATION_ARCHITECTURE.md`
-   Source of Truth: `docs/architecture/10_SOURCE_OF_TRUTH.md`
-   API Reference: `docs/api/26_API_REFERENCE.md`
-   Testing Guide: `docs/development/20_TESTING_GUIDE.md`
-   Backup and Recovery: `docs/operations/16_BACKUP_AND_RECOVERY.md`
-   User Manual: `docs/manuals/37_USER_MANUAL.md`

## Goal

Build a stable, scalable, maintainable ERP platform while preserving
architecture consistency and long-term maintainability.
