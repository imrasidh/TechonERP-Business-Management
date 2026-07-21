# TechonERP — Critical Files Reference

**Filename:** docs/reference/12_CRITICAL_FILES.md

**Document ID:** TERP-012

**Classification:** Internal Engineering Documentation

**Audience:**
- Software Engineers
- Software Architects
- Technical Leads
- DevOps Engineers
- QA Engineers
- Future Maintainers

**Version:** 1.0

**Status:** Production

**Owner:** Chief Software Architect

**Last Updated:** 2026-07-17

---

# Executive Summary

This document identifies the most critical files within the TechonERP codebase.

These files form the foundation of the ERP system and are responsible for application startup, storage, synchronization, business processing, configuration, and user interaction.

Modifying these files without understanding their purpose can affect the stability of the entire application.

---

# Purpose

The purpose of this document is to:

- Identify critical system files.
- Explain the responsibility of each file.
- Define ownership boundaries.
- Highlight modification risks.
- Assist future developers during maintenance.

This document should be reviewed before modifying any core application file.

---

# Critical File Categories

The TechonERP codebase can be divided into the following categories.

- Application Bootstrap
- User Interface
- Business Logic
- Storage
- Synchronization
- Configuration
- Security
- Reporting
- Utilities

Each category contains files that are essential for the operation of the ERP.

---

# Category 1 — Application Bootstrap

## Responsibility

Responsible for starting the application.

Typical files include:

- Electron main process
- React entry point
- Application initialization
- Startup configuration

### Responsibilities

- Create application window
- Initialize runtime
- Load React application
- Register IPC handlers
- Handle application lifecycle

### Risk Level

🔴 Critical

Incorrect modifications may prevent the application from starting.

---

# Category 2 — Application Shell

## Responsibility

Provides the overall application structure.

Typical responsibilities

- Navigation
- Routing
- Layout
- Session management
- Global state initialization

### Risk Level

🔴 Critical

---

# Category 3 — Storage Layer

## Responsibility

Manages local persistence.

Typical files

- Storage API
- Database manager
- Cache manager
- IndexedDB interface

### Responsibilities

- Save documents
- Read documents
- Update documents
- Delete documents
- Cache management

### Risk Level

🔴 Critical

Every business module depends on this layer.

---

# Category 4 — Synchronization Layer

## Responsibility

Coordinates communication between multiple computers.

Typical files

- Synchronization engine
- Upload manager
- Download manager
- Queue processor
- HTTP client

### Responsibilities

- Queue changes
- Upload documents
- Download updates
- Retry failures
- Maintain synchronization state

### Risk Level

🔴 Critical

---

# Category 5 — Business Logic

## Responsibility

Implements business rules.

Typical responsibilities

- Sales processing
- Purchase processing
- Inventory calculations
- Accounting calculations
- Validation

### Risk Level

🔴 Critical

Incorrect business logic can corrupt business data.

---

# Category 6 — Configuration

## Responsibility

Stores system-wide settings.

Examples

- Company details
- Currency
- Printer settings
- Network settings
- Feature flags

### Risk Level

🟠 High

Configuration errors may affect the entire application.

---

# Category 7 — Authentication

## Responsibility

Controls access to the ERP.

Typical responsibilities

- Login
- Session handling
- Permissions
- User validation

### Risk Level

🔴 Critical

Security depends on this category.

---

# Category 8 — Reporting

## Responsibility

Generates reports.

Examples

- Sales reports
- Purchase reports
- Inventory reports
- Profit reports

### Risk Level

🟡 Medium

Reports should never modify business data.

---

# Category 9 — Printing

## Responsibility

Creates printable business documents.

Examples

- Invoices
- Receipts
- Barcode labels
- Quotations

### Risk Level

🟡 Medium

Printing errors should never affect business data.

---

# Category 10 — Utility Files

## Responsibility

Provides reusable helper functions.

Examples

- Date utilities
- Number formatting
- Currency formatting
- Validation helpers
- Common constants

### Risk Level

🟠 High

Utility functions are often shared across many modules.

---

# File Dependency Hierarchy

```
Application Bootstrap

↓

Application Shell

↓

Business Modules

↓

Business Logic

↓

Storage Layer

↓

Synchronization Layer

↓

Database

↓

Reports / Printing
```

Higher layers should not bypass lower layers.

---

# Critical File Characteristics

Critical files typically have one or more of the following characteristics.

- Used by many modules.
- Executes during startup.
- Handles business data.
- Controls synchronization.
- Implements security.
- Manages storage.
- Controls configuration.

Such files require extra care during modification.

---

# File Ownership

| Category | Primary Owner |
|-----------|---------------|
| Bootstrap | Core Architecture |
| Application Shell | UI Architecture |
| Storage | Storage Layer |
| Synchronization | Network Layer |
| Business Logic | Business Modules |
| Authentication | Security Layer |
| Configuration | System Configuration |
| Reports | Reporting Module |
| Utilities | Shared Services |

Ownership helps prevent conflicting modifications.

---

# Change Management

Before modifying any critical file:

1. Understand its responsibility.
2. Identify dependent modules.
3. Review related documentation.
4. Create a backup.
5. Test all affected workflows.
6. Perform regression testing.

---

# Testing Requirements

Every modification to a critical file should include:

- Unit testing
- Integration testing
- Regression testing
- Multi-PC testing (where applicable)
- Performance testing
- Manual verification

No critical file should be changed without verification.

---

# Version Control

Critical files should:

- Have meaningful commit messages.
- Be reviewed before merging.
- Maintain backward compatibility whenever practical.
- Avoid unnecessary refactoring during bug fixes.

---

# Documentation Requirements

Whenever a critical file changes:

- Update technical documentation if behavior changes.
- Record architectural changes.
- Document new dependencies.
- Update changelog when necessary.

Documentation must evolve with the codebase.

---

# Developer Guidelines

Developers should follow these principles.

✅ Understand a file before modifying it.

✅ Keep responsibilities focused.

✅ Preserve backward compatibility.

✅ Minimize side effects.

✅ Test thoroughly.

✅ Update documentation when architecture changes.

---

# Common Mistakes

❌ Editing startup files without understanding initialization.

❌ Mixing business logic into utility files.

❌ Bypassing the Storage API.

❌ Creating circular dependencies.

❌ Modifying shared utilities without impact analysis.

❌ Changing synchronization behavior without testing Multi-PC mode.

---

# Related Documents

- docs/architecture/02_SYSTEM_ARCHITECTURE.md
- docs/architecture/04_APPLICATION_LIFECYCLE.md
- docs/architecture/05_STORAGE_ARCHITECTURE.md
- docs/synchronization/08_SYNCHRONIZATION_ARCHITECTURE.md
- docs/development/13_CRITICAL_FUNCTIONS.md
- docs/operations/17_ERROR_HANDLING.md
- docs/development/21_REGRESSION_CHECKLIST.md

---

# Revision History

| Version | Date | Author | Description |
|---------|------------|-------------------------|-----------------------------|
| 1.0 | 2026-07-17 | Chief Software Architect | Initial Critical Files Reference |

---

End of Document