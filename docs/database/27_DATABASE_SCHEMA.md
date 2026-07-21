# TechonERP — Database Schema Reference

**Filename:** docs/database/27_DATABASE_SCHEMA.md

**Document ID:** TERP-027

**Classification:** Internal Engineering Documentation

**Audience:**
- Database Engineers
- Backend Developers
- Software Architects
- QA Engineers
- Future Maintainers

**Version:** 1.0

**Status:** Production

**Owner:** Chief Software Architect

**Last Updated:** 2026-07-17

---

# Executive Summary

This document defines the logical database schema for TechonERP.

The database is the authoritative repository of all business information. It stores transactional records, master data, configuration, user accounts, audit logs, and synchronization metadata. A well-designed schema ensures consistency, scalability, maintainability, and high performance.

This document describes the logical structure of the database rather than implementation-specific SQL statements.

---

# Purpose

This document defines

- Database design philosophy
- Entity definitions
- Relationships
- Naming standards
- Constraints
- Indexing strategy
- Data integrity rules
- Migration guidelines

---

# Database Philosophy

The database follows these principles.

- Single Source of Truth
- Data integrity first
- Normalize where practical
- Optimize after measurement
- Avoid duplicate data
- Preserve transaction history
- Maintain referential consistency

---

# High-Level Entity Model

```
Users

↓

Customers

↓

Suppliers

↓

Products

↓

Inventory

↓

Sales

↓

Purchases

↓

Repairs

↓

Expenses

↓

Reports
```

Each entity has a clearly defined business responsibility.

---

# Core Entity Groups

The database consists of the following logical groups.

### System

- Users
- Roles
- Permissions
- Settings
- Company

---

### Master Data

- Products
- Categories
- Brands
- Customers
- Suppliers
- Units

---

### Transactions

- Sales
- Sale Items
- Purchases
- Purchase Items
- Payments
- Expenses
- Repairs

---

### Supporting Data

- Audit Logs
- Synchronization Queue
- Backup Metadata
- Notifications

---

# Users Entity

Purpose

Stores user accounts.

Typical fields

```
User ID

Username

Password Hash

Role

Status

Created Date

Last Login
```

Passwords must always be stored securely.

---

# Roles Entity

Purpose

Defines permission groups.

Typical fields

```
Role ID

Role Name

Description
```

Permissions should be assigned through roles.

---

# Customers Entity

Purpose

Stores customer information.

Typical fields

```
Customer ID

Customer Name

Phone

Address

Email

Balance

Status
```

Customer records should remain unique.

---

# Suppliers Entity

Purpose

Stores supplier information.

Typical fields

```
Supplier ID

Supplier Name

Phone

Address

Email

Balance
```

---

# Products Entity

Purpose

Stores product master information.

Typical fields

```
Product ID

SKU

Product Name

Category

Brand

Unit

Cost Price

Selling Price

Status
```

Product records should never be duplicated.

---

# Categories Entity

Purpose

Organizes products.

Example

```
Laptops

Accessories

Printers

Networking
```

---

# Inventory Entity

Purpose

Maintains current stock.

Typical fields

```
Product ID

Quantity

Reserved Quantity

Available Quantity

Last Updated
```

Inventory values should always reflect completed business transactions.

---

# Sales Entity

Purpose

Stores invoice headers.

Typical fields

```
Invoice Number

Customer ID

Invoice Date

Sub Total

Discount

Tax

Grand Total

Payment Status
```

Invoice numbers should remain unique.

---

# Sale Items Entity

Purpose

Stores invoice line items.

Typical fields

```
Invoice Number

Product ID

Quantity

Unit Price

Discount

Line Total
```

Each item belongs to exactly one invoice.

---

# Purchases Entity

Purpose

Stores purchase headers.

Typical fields

```
Purchase Number

Supplier ID

Purchase Date

Grand Total
```

---

# Purchase Items Entity

Purpose

Stores purchased products.

Typical fields

```
Purchase Number

Product ID

Quantity

Cost Price

Line Total
```

---

# Expenses Entity

Purpose

Stores operational expenses.

Typical fields

```
Expense ID

Category

Amount

Date

Description
```

---

# Repairs Entity

Purpose

Stores repair jobs.

Typical fields

```
Repair Number

Customer ID

Device

Problem

Status

Assigned Technician

Completion Date
```

---

# Payments Entity

Purpose

Stores payment transactions.

Typical fields

```
Payment ID

Reference

Amount

Method

Date
```

---

# Audit Logs Entity

Purpose

Stores audit history.

Typical fields

```
Log ID

User

Action

Timestamp

Module

Details
```

Audit records should never be modified.

---

# Synchronization Queue Entity

Purpose

Stores pending synchronization operations.

Typical fields

```
Queue ID

Document Type

Document ID

Operation

Status

Retry Count

Timestamp
```

---

# Company Entity

Purpose

Stores organization information.

Typical fields

```
Company Name

Address

Phone

Email

Registration Number

Tax Number
```

Normally only one active company record exists.

---

# Settings Entity

Purpose

Stores application configuration.

Examples

```
Currency

Tax Rate

Printer

Theme

Synchronization Settings

Backup Schedule
```

---

# Entity Relationships

```
Customer

↓

Sales

↓

Sale Items

↓

Products

↓

Inventory
```

Relationships should enforce business integrity.

---

# Primary Keys

Every entity should have

- Stable identifier
- Unique value
- Immutable key whenever practical

Examples

```
CustomerID

ProductID

InvoiceNo

RepairNo
```

---

# Foreign Keys

Relationships should use foreign keys.

Examples

```
CustomerID

ProductID

SupplierID

RoleID
```

Referential integrity should always be preserved.

---

# Indexing Strategy

Indexes should exist for

- Primary keys
- Frequently searched fields
- Invoice numbers
- Product codes
- Customer names
- Dates

Indexes should improve search performance without excessive storage overhead.

---

# Data Integrity Rules

The database should enforce

- Unique identifiers
- Required fields
- Valid references
- Business constraints
- Transaction consistency

Business integrity is more important than convenience.

---

# Transactions

Related operations should execute within a transaction.

Example

```
Create Invoice

↓

Save Items

↓

Update Inventory

↓

Commit
```

Partial updates should not occur.

---

# Migration Strategy

Schema changes should

- Be versioned
- Be reversible where practical
- Preserve existing data
- Be documented
- Be tested

---

# Performance Considerations

The schema should support

- Fast lookups
- Efficient joins
- Predictable growth
- Minimal redundancy
- Large transaction volumes

Performance tuning should be based on measured usage.

---

# Developer Guidelines

Developers should

✅ Keep entities focused.

✅ Preserve referential integrity.

✅ Avoid duplicate business data.

✅ Version schema changes.

✅ Document every structural modification.

---

# Common Mistakes

❌ Storing duplicate information.

❌ Breaking foreign key relationships.

❌ Editing primary keys.

❌ Removing audit records.

❌ Skipping migrations.

❌ Using inconsistent naming.

---

# Related Documents

- docs/architecture/05_STORAGE_ARCHITECTURE.md
- docs/database/06_DATABASE_ARCHITECTURE.md
- docs/architecture/07_DATA_FLOW.md
- docs/synchronization/08_SYNCHRONIZATION_ARCHITECTURE.md
- docs/architecture/10_SOURCE_OF_TRUTH.md
- docs/api/26_API_REFERENCE.md
- docs/synchronization/28_SYNC_PROTOCOL.md

---

# Revision History

| Version | Date | Author | Description |
|---------|------------|-------------------------|-----------------------------|
| 1.0 | 2026-07-17 | Chief Software Architect | Initial Database Schema Reference |

---

End of Document