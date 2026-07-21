# TechonERP — Database Architecture Report

**Filename:** docs/database/06_DATABASE_ARCHITECTURE.md

**Document ID:** TERP-006

**Classification:** Internal Engineering Documentation

**Audience:**
- Software Engineers
- Software Architects
- Technical Leads
- Database Engineers
- QA Engineers
- Future Maintainers

**Version:** 1.0

**Status:** Production

**Owner:** Chief Software Architect

**Last Updated:** 2026-07-17

---

# Executive Summary

This document defines the logical database architecture of TechonERP.

Unlike the Storage Architecture document, which explains *where* data is stored, this document explains *how* business data is organized, structured, related, and maintained throughout the system.

The database architecture is designed around business documents rather than traditional relational database tables, making the system flexible, scalable, and suitable for offline-first operations.

---

# Purpose

The purpose of this document is to establish the official data model used by TechonERP.

It defines:

- Business entities
- Document structure
- Entity relationships
- Data ownership
- Primary identifiers
- Referential integrity
- Database design principles

---

# Database Design Philosophy

TechonERP follows a document-oriented business model.

Business operations revolve around complete business documents instead of individual database rows.

This approach provides:

- Better maintainability
- Easier synchronization
- Simpler backups
- Flexible schema evolution
- Improved offline support

---

# Core Database Principles

## 1. Business Document First

Every important business operation is represented as a complete document.

Examples

- Sales Invoice
- Purchase Invoice
- Repair Job
- Customer Record
- Product Record

---

## 2. Unique Identity

Every document must have one globally unique identifier.

Examples

- Product ID
- Customer ID
- Invoice ID
- Supplier ID

Identifiers must never be reused.

---

## 3. Immutable Identity

A document's identity never changes during its lifetime.

Names, descriptions, and prices may change.

The document ID must remain constant.

---

## 4. Single Source of Truth

Each business entity has exactly one authoritative owner.

Example

A customer exists only once.

Invoices reference that customer rather than storing duplicate customer records.

---

## 5. Consistency

All modules should represent the same business entity consistently.

For example,

the same Product ID should identify the same product throughout every module.

---

# Primary Business Entities

The ERP database consists of multiple independent business entities.

Examples include:

- Products
- Categories
- Customers
- Suppliers
- Sales
- Purchases
- Repairs
- Expenses
- Payments
- Users
- Companies
- Settings
- Inventory
- Reports Metadata

Each entity represents a specific business concept.

---

# High-Level Entity Relationship

```
Company
   │
   ├──────── Users
   │
   ├──────── Products
   │             │
   │             │
   │        Inventory
   │             │
   │
Customers ─── Sales ─── Payments
      │
      │
 Suppliers ─ Purchases

Repairs ─ Products

Expenses

Settings
```

This diagram illustrates logical relationships rather than physical storage.

---

# Entity Responsibilities

## Products

Stores information about sellable items.

Typical attributes

- Product ID
- Name
- SKU
- Barcode
- Category
- Cost Price
- Selling Price
- Stock Information

---

## Customers

Stores customer information.

Typical attributes

- Customer ID
- Name
- Phone
- Address
- Email
- Credit Information

---

## Suppliers

Stores supplier information.

Typical attributes

- Supplier ID
- Business Name
- Contact Details
- Payment Information

---

## Sales

Represents completed sales transactions.

Contains

- Invoice Number
- Customer
- Product Lines
- Totals
- Discounts
- Taxes
- Payment Information

Sales documents should remain immutable after completion except through controlled correction procedures.

---

## Purchases

Represents inventory purchases.

Contains

- Supplier
- Purchased Items
- Cost
- Invoice Details
- Payment Status

---

## Inventory

Tracks product quantities.

Responsibilities

- Current stock
- Stock movement
- Availability
- Reorder information

Inventory values are derived from business transactions.

---

## Repairs

Represents repair jobs.

Contains

- Device Details
- Customer
- Technician
- Status
- Charges
- Parts Used

---

## Expenses

Stores operational expenses.

Examples

- Rent
- Salaries
- Utilities
- Transport
- Marketing

---

## Users

Represents system users.

Contains

- User ID
- Name
- Role
- Permissions
- Login Credentials

---

## Settings

Stores system-wide configuration.

Examples

- Company Information
- Currency
- Tax Rates
- Printing Preferences
- Network Configuration

---

# Document Structure

Each business document generally follows this structure.

```
Document

├── Metadata

├── Header

├── Business Information

├── Detail Items

├── Financial Information

├── Audit Information

└── Status Information
```

The exact structure varies depending on the module.

---

# Primary Keys

Every entity requires a unique primary identifier.

Examples

| Entity | Primary Key |
|----------|-------------|
| Product | ProductID |
| Customer | CustomerID |
| Supplier | SupplierID |
| Sale | SaleID |
| Purchase | PurchaseID |
| Repair | RepairID |
| User | UserID |

Primary keys must never be duplicated.

---

# Relationships

The database primarily uses logical references.

Example

```
Sale

↓

CustomerID

↓

Customer Document
```

The sale stores the Customer ID rather than embedding the complete customer record.

This minimizes duplication.

---

# Referential Integrity

Every reference should point to an existing document.

Examples

- Sales must reference valid customers.
- Purchase documents must reference valid suppliers.
- Inventory transactions must reference valid products.

Invalid references should be rejected during validation.

---

# Audit Information

Business documents should maintain audit information.

Typical fields include

- Created Date
- Created By
- Modified Date
- Modified By
- Version
- Status

Audit information improves traceability.

---

# Soft Delete Strategy

Business documents should generally not be permanently deleted.

Preferred approach

```
Active

↓

Inactive

↓

Archived
```

This preserves historical business records.

---

# Versioning

Where appropriate,

documents may maintain version information.

Versioning helps:

- Synchronization
- Conflict detection
- Change tracking
- Recovery

---

# Data Validation

Before persistence,

every document should be validated.

Validation includes

- Required fields
- Data types
- Business rules
- Duplicate detection
- Permission verification

Only valid documents should enter the database.

---

# Database Scalability

The architecture supports future additions without redesign.

Examples

- New modules
- Additional document types
- Industry-specific entities
- New business workflows

New entities should follow existing architectural principles.

---

# Database Independence

Business modules should not depend on database implementation details.

Whether data resides in IndexedDB, SQL, or another storage engine,

the logical data model should remain unchanged.

---

# Developer Guidelines

Developers should follow these rules.

✅ Every entity requires a unique ID.

✅ Never duplicate business data unnecessarily.

✅ Use references instead of copying documents.

✅ Preserve audit information.

✅ Validate before persistence.

✅ Keep entity responsibilities focused.

✅ Follow naming conventions consistently.

---

# Common Mistakes

❌ Using names instead of IDs for references.

❌ Embedding entire customer records inside sales documents.

❌ Duplicating product information.

❌ Deleting historical business documents.

❌ Allowing orphaned references.

❌ Mixing unrelated business entities.

---

# Related Documents

- docs/architecture/05_STORAGE_ARCHITECTURE.md
- docs/architecture/07_DATA_FLOW.md
- docs/synchronization/08_SYNCHRONIZATION_ARCHITECTURE.md
- docs/architecture/10_SOURCE_OF_TRUTH.md
- docs/business/11_BUSINESS_RULES.md

---

# Revision History

| Version | Date | Author | Description |
|---------|------------|-------------------------|-----------------------------|
| 1.0 | 2026-07-17 | Chief Software Architect | Initial Database Architecture Report |

---

End of Document