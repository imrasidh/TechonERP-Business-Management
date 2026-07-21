# TechonERP — Source of Truth Architecture

**Filename:** docs/architecture/10_SOURCE_OF_TRUTH.md

**Document ID:** TERP-010

**Classification:** Internal Engineering Documentation

**Audience:**
- Software Engineers
- Software Architects
- Backend Engineers
- QA Engineers
- Future Maintainers

**Version:** 1.0

**Status:** Production

**Owner:** Chief Software Architect

**Last Updated:** 2026-07-17

---

# Executive Summary

One of the most important architectural principles in TechonERP is the **Single Source of Truth (SSOT)**.

Every piece of business information must have exactly one authoritative owner.

This document defines what the Source of Truth is, why it exists, how every module should respect it, and how violating this principle can lead to data corruption, synchronization failures, inconsistent reports, and difficult debugging.

Every developer working on TechonERP must understand and follow this document.

---

# Purpose

The purpose of this document is to establish a single authoritative location for every business entity.

This ensures:

- Data consistency
- Reliable synchronization
- Predictable business logic
- Easier debugging
- Cleaner architecture
- Better scalability

---

# What is the Source of Truth?

The Source of Truth is the single authoritative location from which a particular business fact originates.

Every other location in the system must treat that information as a copy, cache, reference, or generated result.

There must never be two authoritative owners of the same business information.

---

# Why It Matters

Without a Source of Truth:

- Different screens may display different values.
- Reports may not match invoices.
- Inventory may become inaccurate.
- Synchronization conflicts increase.
- Debugging becomes extremely difficult.
- Duplicate updates become common.

A clear Source of Truth eliminates these problems.

---

# Source of Truth Philosophy

TechonERP follows these principles.

## One Business Fact

One owner.

---

## One Owner

One location.

---

## One Update

One write operation.

---

## Many Readers

Unlimited read operations.

---

## Generated Information

Generated values are never the Source of Truth.

---

# Business Entity Ownership

The following table defines the official owner of every major business entity.

| Business Entity | Source of Truth |
|-----------------|-----------------|
| Product | Product Module |
| Customer | Customer Module |
| Supplier | Supplier Module |
| Sales Invoice | Sales Module |
| Purchase Invoice | Purchase Module |
| Repair Job | Repair Module |
| Expense | Expense Module |
| User | User Management |
| Company Information | System Configuration |
| Settings | System Configuration |
| Inventory Movement | Sales / Purchases / Adjustments |
| Audit Log | Audit System |

No other module may become the owner of these entities.

---

# Inventory Example

Inventory is often misunderstood.

The current stock quantity is **not** entered manually during a sale.

Instead, inventory is derived from business transactions.

```
Purchase

↓

Stock Increase

-----------------------

Sale

↓

Stock Decrease

-----------------------

Return

↓

Stock Adjustment

-----------------------

Current Stock
```

The Source of Truth is the transaction history.

Current stock is simply the calculated result.

---

# Sales Example

```
Sales Invoice

↓

Invoice Items

↓

Payment

↓

Accounting Entry

↓

Reports
```

The Sales Invoice is the Source of Truth.

Accounting records and reports are derived from it.

If an invoice changes, dependent information must be regenerated.

---

# Reporting Example

Reports are **never** business data.

```
Sales

↓

Purchases

↓

Expenses

↓

Calculations

↓

Reports
```

Reports should always be generated from stored business documents.

Reports must never be edited manually.

---

# Dashboard Example

Dashboard values are summaries.

```
Sales

↓

Calculations

↓

Dashboard Cards
```

Dashboard cards are visual representations.

They do not own business information.

---

# Synchronization Example

```
Business Document

↓

Local Storage

↓

Synchronization Queue

↓

Remote Computer
```

Synchronization copies information.

It never becomes the owner of the information.

---

# Backup Example

```
Business Database

↓

Backup File
```

Backup files are snapshots.

They are not the Source of Truth while the system is running.

---

# Cache Example

```
Business Document

↓

Memory Cache

↓

User Interface
```

The cache exists only to improve performance.

If the cache is cleared, no business information should be lost.

---

# Configuration Example

Company information belongs to the System Configuration module.

Examples

- Company Name
- Address
- Telephone
- Currency
- Tax Rate
- Printer Settings

Other modules may read this information but should never maintain independent copies.

---

# Derived Data

Derived data is calculated from authoritative data.

Examples

- Current Stock
- Profit
- Outstanding Balance
- Dashboard Statistics
- Monthly Revenue
- Customer Purchase Total

Derived data must never replace its underlying business documents.

---

# Temporary Data

Temporary data includes

- Form inputs
- Search filters
- Selected rows
- UI state
- Session information

Temporary data should never be treated as permanent business information.

---

# Data Ownership Rules

Every business entity must satisfy the following rules.

- One owner.
- One authoritative location.
- Multiple readers.
- No duplicate ownership.
- Controlled updates.

---

# Update Rules

Whenever data changes,

the following process must occur.

```
Locate Owner

↓

Validate

↓

Update Source of Truth

↓

Persist

↓

Refresh Cache

↓

Refresh UI

↓

Synchronize

↓

Regenerate Reports
```

Updates must never begin from generated data.

---

# Read Rules

All modules should read business information from its authoritative owner.

If caching is used,

the cache must always be refreshable from the Source of Truth.

---

# Synchronization Rules

Synchronization should

- Copy documents.
- Never generate business rules.
- Preserve document identity.
- Preserve ownership.
- Preserve version history.

Synchronization does not redefine ownership.

---

# Common Violations

The following practices violate the Source of Truth principle.

❌ Editing reports directly.

❌ Editing dashboard values.

❌ Updating inventory manually after a sale.

❌ Keeping multiple copies of customer information.

❌ Calculating profit independently in multiple modules.

❌ Allowing different modules to own the same business entity.

---

# Benefits

Following the Source of Truth architecture provides:

- Consistent business data
- Easier debugging
- Reliable synchronization
- Predictable reporting
- Simpler maintenance
- Reduced duplication
- Better scalability

---

# Developer Checklist

Before introducing a new feature, ask:

- Who owns this business information?
- Is there already a Source of Truth?
- Am I creating duplicate ownership?
- Is this value derived or authoritative?
- Will synchronization preserve ownership?

If any answer is unclear, the design should be reviewed before implementation.

---

# Developer Guidelines

Developers should follow these principles.

✅ Every business entity must have one owner.

✅ Reports must remain read-only.

✅ Cache should never become authoritative.

✅ Synchronization should only replicate.

✅ Derived values should always be recalculated from business data.

✅ Never duplicate ownership.

---

# Related Documents

- docs/architecture/05_STORAGE_ARCHITECTURE.md
- docs/database/06_DATABASE_ARCHITECTURE.md
- docs/architecture/07_DATA_FLOW.md
- docs/synchronization/08_SYNCHRONIZATION_ARCHITECTURE.md
- docs/business/09_MODULE_REFERENCE.md
- docs/business/11_BUSINESS_RULES.md

---

# Revision History

| Version | Date | Author | Description |
|---------|------------|-------------------------|-----------------------------|
| 1.0 | 2026-07-17 | Chief Software Architect | Initial Source of Truth Architecture |

---

End of Document