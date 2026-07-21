# TechonERP — Storage Architecture Report

**Filename:** docs/architecture/05_STORAGE_ARCHITECTURE.md

**Document ID:** TERP-005

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

This document defines the complete storage architecture of TechonERP.

It explains where business data is stored, how it flows through the application, how persistence is maintained, and how multiple storage technologies work together to provide a reliable, high-performance, offline-first ERP system.

The storage architecture is one of the most critical components of TechonERP and should be understood before modifying any business module.

---

# Purpose

The purpose of this document is to define every storage layer used within TechonERP and clearly explain the responsibility of each layer.

This document also establishes the relationship between application memory, local databases, synchronization storage, backup systems, and generated output files.

---

# Storage Design Philosophy

The storage system of TechonERP is built around five primary principles.

## 1. Offline First

The ERP must continue functioning without internet connectivity.

Business operations should never depend on an active network connection.

---

## 2. Local Ownership

Every computer owns its own working copy of the business data.

The local system should always remain operational regardless of the synchronization status.

---

## 3. Single Source of Truth

Every business entity has only one authoritative storage location.

Duplicate ownership of business data is prohibited.

---

## 4. Layered Storage

Different storage technologies serve different purposes.

No storage mechanism should perform responsibilities outside its intended role.

---

## 5. Synchronization Without Dependency

Synchronization improves collaboration but should never become a requirement for daily business operations.

---

# Storage Architecture Overview

```
                User
                  │
                  ▼
         React Components
                  │
                  ▼
         Business Logic Layer
                  │
                  ▼
          Storage API (S)
                  │
                  ▼
          Runtime Memory Cache
                  │
                  ▼
             IndexedDB
                  │
                  ▼
            localStorage
                  │
                  ▼
        Synchronization Engine
                  │
                  ▼
             HTTP / API
                  │
                  ▼
          MySQL kv_store
                  │
                  ▼
          Other Computers
                  │
                  ▼
        Reports / Backup
```

Each layer exists for a specific purpose and should never replace another layer.

---

# Storage Layers

## Layer 1 — Runtime Memory

Purpose

Stores frequently accessed data while the application is running.

Examples

- Loaded products
- Current invoices
- Active customer
- Cached configuration

Advantages

- Extremely fast
- Eliminates unnecessary database reads
- Improves UI responsiveness

Limitations

- Volatile
- Cleared when the application exits
- Never considered permanent storage

---

## Layer 2 — Storage API

The Storage API is the official gateway between business modules and physical storage.

Responsibilities

- Read data
- Save data
- Update documents
- Delete records
- Trigger synchronization
- Validate operations

Business modules should never communicate directly with storage engines.

---

## Layer 3 — IndexedDB

IndexedDB is the primary persistent database.

Responsibilities

- Store business documents
- Maintain local business information
- Support offline operation

Examples

- Products
- Sales
- Customers
- Suppliers
- Repairs
- Accounting
- Settings

Advantages

- Persistent
- High performance
- Local
- Independent of internet connectivity

---

## Layer 4 — localStorage

Purpose

Stores lightweight configuration information and cached values.

Typical contents

- UI preferences
- Recently used values
- Configuration cache
- Small application settings

Business documents should not rely solely on localStorage.

---

## Layer 5 — Synchronization Queue

Every business change enters the synchronization queue before being transmitted.

Responsibilities

- Detect changes
- Queue updates
- Retry failed synchronization
- Maintain synchronization order

This layer isolates business operations from network reliability.

---

## Layer 6 — Synchronization Database

In Multi-PC mode, synchronized business documents are temporarily stored in MySQL.

Purpose

- Exchange data between computers
- Synchronize updates
- Preserve pending synchronization

The synchronization database is **not** the operational business database.

---

## Layer 7 — Backup Storage

Backup storage exists solely for disaster recovery.

Backup contents

- Business documents
- Settings
- Accounting information
- Configuration
- Metadata

Backups are read only during restoration.

---

## Layer 8 — Generated Files

Generated files include

- PDF invoices
- Reports
- Barcode labels
- Export files

Generated files are outputs.

They are never considered business data.

---

# Storage Responsibilities

| Storage Layer | Responsibility |
|---------------|----------------|
| Runtime Memory | Temporary working data |
| Storage API | Storage management |
| IndexedDB | Primary business database |
| localStorage | Configuration cache |
| Sync Queue | Pending synchronization |
| MySQL | Synchronization storage |
| Backup | Disaster recovery |
| Generated Files | Reports and exports |

---

# Data Lifecycle

Every business document follows the same lifecycle.

```
User Input

↓

Validation

↓

Business Logic

↓

Storage API

↓

IndexedDB

↓

Memory Cache

↓

Synchronization Queue

↓

Remote Systems

↓

Reports / Backup
```

Every document follows this lifecycle unless explicitly documented otherwise.

---

# Storage Ownership

| Data | Primary Owner |
|------|---------------|
| Products | IndexedDB |
| Sales | IndexedDB |
| Customers | IndexedDB |
| Suppliers | IndexedDB |
| Purchases | IndexedDB |
| Repairs | IndexedDB |
| Settings | IndexedDB |
| Reports | Generated from Business Data |
| PDFs | Generated Output |
| Backups | Recovery Storage |

---

# Data Persistence Rules

Business data should always be saved before it is synchronized.

Synchronization should never replace local persistence.

A failed synchronization must never result in lost business information.

---

# Performance Strategy

The storage subsystem is optimized by

- Memory caching
- Incremental updates
- Local persistence
- Reduced disk operations
- Deferred synchronization
- Efficient document storage

The objective is to maintain a responsive user experience regardless of network conditions.

---

# Reliability Strategy

The storage architecture is designed to tolerate

- Internet failures
- Local network failures
- Power interruptions
- Unexpected shutdowns
- Temporary synchronization failures

Business operations should continue whenever possible.

---

# Backup Strategy

Backups should be created

- Before major upgrades
- Before restoration
- Before destructive operations
- On scheduled intervals
- On manual request

Backups must remain independent of the live application.

---

# Security Considerations

Storage operations should

- Validate permissions
- Prevent unauthorized access
- Protect sensitive information
- Avoid duplicate writes
- Preserve document integrity

Security should be enforced before persistence.

---

# Developer Guidelines

Developers must follow these principles.

✅ Always use the Storage API.

✅ Never bypass persistence layers.

✅ Never modify storage directly from UI components.

✅ Never use generated reports as business data.

✅ Never treat synchronization storage as the primary database.

✅ Keep storage operations atomic whenever possible.

✅ Preserve backward compatibility during storage changes.

---

# Common Mistakes

❌ Writing directly to IndexedDB from UI components.

❌ Treating localStorage as the database.

❌ Skipping validation before persistence.

❌ Saving duplicate business documents.

❌ Mixing business logic with storage logic.

❌ Depending on synchronization before saving locally.

---

# Related Documents

- docs/architecture/02_SYSTEM_ARCHITECTURE.md
- docs/architecture/04_APPLICATION_LIFECYCLE.md
- docs/database/06_DATABASE_ARCHITECTURE.md
- docs/architecture/07_DATA_FLOW.md
- docs/synchronization/08_SYNCHRONIZATION_ARCHITECTURE.md
- docs/architecture/10_SOURCE_OF_TRUTH.md

---

# Revision History

| Version | Date | Author | Description |
|---------|------------|-------------------------|-----------------------------|
| 1.0 | 2026-07-17 | Chief Software Architect | Initial Storage Architecture Report |

---

End of Document