# TechonERP — Database Entity Relationship (ER) Diagram Reference

**Filename:** docs/database/41_DATABASE_ER_DIAGRAM.md

**Document ID:** TERP-041

**Classification:** Internal Technical Documentation

**Audience:**
- Software Architects
- Backend Developers
- Database Administrators (DBA)
- Technical Leads
- System Integrators

**Version:** 1.0

**Status:** Production

**Owner:** Database Architecture Team

**Last Updated:** 2026-07-17

---

# Executive Summary

This document defines the logical Entity Relationship (ER) model for the TechonERP database.

It describes the primary database entities, their relationships, keys, and cardinality. This document serves as the authoritative reference for database design and should be used alongside the Database Schema and API documentation.

This document describes the logical design rather than a database-specific implementation.

---

# Purpose

This document explains

- Core database entities
- Primary keys
- Foreign keys
- Entity relationships
- Relationship cardinality
- Data ownership
- Referential integrity
- Database design principles

---

# Database Design Principles

The TechonERP database is designed to be

- Normalized
- Scalable
- Maintainable
- Secure
- Transaction-safe
- Extensible

Every entity has a unique identifier and clearly defined relationships.

---

# High-Level Entity Overview

The primary entities include

- Users
- Roles
- Permissions
- Customers
- Suppliers
- Products
- Categories
- Inventory
- Sales
- Sales Items
- Purchases
- Purchase Items
- Repairs
- Expenses
- Payments
- Settings
- Audit Logs
- Synchronization Queue
- Backup Records

---

# Core Entity Relationship Diagram

```text
                 +-----------+
                 |   Roles   |
                 +-----------+
                      |
                  One-to-Many
                      |
                 +-----------+
                 |   Users   |
                 +-----------+
                      |
       ---------------------------------
       |               |              |
       |               |              |
   Created By      Updated By     Approved By
       |               |              |
       |               |              |
----------------------------------------------------------
|        |         |        |         |                  |
Customers Products Sales Purchases Repairs Expenses
```

---

# Customer Relationships

```text
Customer

↓

Sales

↓

Payments
```

Relationship

```
One Customer

↓

Many Sales

↓

Many Payments
```

Cardinality

```
Customer (1)

↓

Sales (N)
```

---

# Supplier Relationships

```text
Supplier

↓

Purchases

↓

Purchase Items
```

Cardinality

```
Supplier (1)

↓

Purchases (N)
```

---

# Product Relationships

```text
Category

↓

Products

↓

Inventory

↓

Sales Items

↓

Purchase Items

↓

Repair Items (Future)
```

A product may appear in many transactions.

---

# Sales Relationship

```text
Customer

↓

Sales

↓

Sales Items

↓

Product
```

Cardinality

```
Customer (1)

↓

Sales (N)

↓

Sales Items (N)

↓

Product (1)
```

---

# Purchase Relationship

```text
Supplier

↓

Purchase

↓

Purchase Items

↓

Product
```

Cardinality

```
Supplier (1)

↓

Purchase (N)

↓

Purchase Items (N)

↓

Product (1)
```

---

# Inventory Relationship

```text
Product

↓

Inventory Record

↓

Inventory Movements
```

Inventory tracks quantity changes resulting from

- Sales
- Purchases
- Adjustments
- Repairs (future)

---

# Repair Relationship

```text
Customer

↓

Repair

↓

Technician (User)

↓

Status
```

One customer may have multiple repair jobs.

Each repair is assigned to one technician.

---

# Expense Relationship

```text
Expense Category

↓

Expense
```

One category may contain many expenses.

---

# User Relationships

Users interact with almost every business entity.

Example

```text
User

↓

Sales

↓

Purchase

↓

Inventory

↓

Repair

↓

Expense

↓

Audit Log
```

Users are responsible for business actions performed within the system.

---

# Settings Relationship

```text
System Settings

↓

Application Configuration

↓

Runtime Components
```

Settings provide centralized configuration values used throughout the application.

---

# Audit Log Relationship

```text
User

↓

Audit Log

↓

Business Entity
```

Every significant action performed by a user should generate an audit entry.

---

# Synchronization Relationship

```text
Client

↓

Synchronization Queue

↓

Server

↓

Database
```

Synchronization records maintain consistency between client devices and the primary database.

---

# Backup Relationship

```text
Database

↓

Backup

↓

Storage Location
```

Backup metadata records

- Timestamp
- File Name
- Size
- Status
- Verification Result

---

# Primary Key Strategy

Every entity uses a unique primary key.

Examples

| Entity | Primary Key |
|----------|-------------|
| Users | UserID |
| Customers | CustomerID |
| Suppliers | SupplierID |
| Products | ProductID |
| Sales | SaleID |
| Purchases | PurchaseID |
| Repairs | RepairID |
| Expenses | ExpenseID |

Primary keys are immutable.

---

# Foreign Key Strategy

Foreign keys enforce referential integrity.

Examples

| Child Table | Foreign Key | Parent Table |
|--------------|-------------|--------------|
| Sales | CustomerID | Customers |
| Sales | UserID | Users |
| SalesItems | SaleID | Sales |
| SalesItems | ProductID | Products |
| Purchases | SupplierID | Suppliers |
| Purchases | UserID | Users |
| Repairs | CustomerID | Customers |
| Repairs | TechnicianID | Users |

---

# Relationship Cardinality Summary

| Parent | Child | Relationship |
|---------|-------|--------------|
| Role | Users | One-to-Many |
| Customer | Sales | One-to-Many |
| Supplier | Purchases | One-to-Many |
| Product | Sales Items | One-to-Many |
| Product | Purchase Items | One-to-Many |
| Sales | Sales Items | One-to-Many |
| Purchase | Purchase Items | One-to-Many |
| User | Audit Logs | One-to-Many |
| Customer | Repairs | One-to-Many |
| Product | Inventory Records | One-to-One |

---

# Referential Integrity Rules

The database should enforce

- Valid foreign keys
- No orphan records
- Cascading updates where appropriate
- Restricted deletion of referenced records
- Transaction consistency

Data integrity should always take precedence over convenience.

---

# Database Normalization

The database is designed to approximately Third Normal Form (3NF).

Objectives include

- Eliminate duplicate data
- Reduce redundancy
- Improve maintainability
- Preserve consistency

Selective denormalization may be introduced only when justified by performance requirements.

---

# Future Entity Expansion

The database architecture supports future entities such as

- Warehouses
- Multiple Branches
- Barcode Management
- Purchase Orders
- Sales Orders
- Delivery Notes
- Manufacturing
- Accounting Ledger
- Payroll
- HR Management
- CRM
- Glass Industry Module
- AI Assistant Logs

These additions should integrate without requiring redesign of existing core entities.

---

# Best Practices

Database designers should

✓ Use primary keys consistently.

✓ Enforce foreign key constraints.

✓ Preserve referential integrity.

✓ Avoid duplicate entities.

✓ Maintain normalized structures.

✓ Document schema changes.

✓ Review relationships before deployment.

---

# Related Documents

- docs/database/06_DATABASE_ARCHITECTURE.md
- docs/database/27_DATABASE_SCHEMA.md
- docs/synchronization/28_SYNC_PROTOCOL.md
- docs/diagrams/42_SYSTEM_SEQUENCE_DIAGRAMS.md
- docs/development/43_CLASS_DESIGN_REFERENCE.md

---

# Revision History

| Version | Date | Author | Description |
|---------|------------|----------------------------|------------------------------|
| 1.0 | 2026-07-17 | Database Architecture Team | Initial Database ER Diagram Reference |

---

End of Document