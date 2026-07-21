# TechonERP — Class Design Reference

**Filename:** docs/development/43_CLASS_DESIGN_REFERENCE.md

**Document ID:** TERP-043

**Classification:** Internal Technical Documentation

**Audience:**
- Software Architects
- Backend Developers
- Frontend Developers
- Technical Leads
- QA Engineers

**Version:** 1.0

**Status:** Production

**Owner:** Software Architecture Team

**Last Updated:** 2026-07-17

---

# Executive Summary

This document defines the logical class design for TechonERP.

It provides a high-level object-oriented representation of the application's business domain, including core entities, services, repositories, controllers, and utilities. The purpose of this document is to establish a consistent architectural model independent of any specific programming language or framework.

This is a logical class reference and does not prescribe implementation details.

---

# Purpose

This document defines

- Core domain classes
- Service classes
- Repository classes
- Controller responsibilities
- Utility classes
- Relationships between classes
- Design principles
- Future extensibility

---

# Design Principles

The class architecture follows these principles

- Single Responsibility Principle (SRP)
- Separation of Concerns
- Dependency Injection
- Composition over Inheritance
- Loose Coupling
- High Cohesion
- Reusable Components
- Testable Design

---

# High-Level Class Architecture

```text
Presentation Layer

↓

Controllers

↓

Business Services

↓

Repositories

↓

Database
```

Each layer has clearly defined responsibilities.

---

# Core Domain Classes

Primary business classes include

- User
- Role
- Customer
- Supplier
- Product
- Category
- Inventory
- Sale
- SaleItem
- Purchase
- PurchaseItem
- Repair
- Expense
- Payment
- Company
- Settings

These classes represent the core business entities.

---

# User Class

### Responsibilities

- Store user information
- Authentication identity
- Permission assignment
- Audit ownership

### Key Properties

- UserID
- Username
- PasswordHash
- FullName
- RoleID
- Status
- CreatedAt

### Relationships

- One Role
- Many Sales
- Many Purchases
- Many Repairs
- Many Audit Logs

---

# Role Class

### Responsibilities

- Define user roles
- Manage permissions

### Properties

- RoleID
- RoleName
- Description

Relationship

```
Role

↓

Users
```

---

# Customer Class

### Responsibilities

- Customer profile
- Contact information
- Sales history
- Repair history

### Relationships

- Many Sales
- Many Repairs
- Many Payments

---

# Supplier Class

### Responsibilities

- Supplier information
- Purchase history

Relationship

```
Supplier

↓

Purchases
```

---

# Product Class

### Responsibilities

- Product details
- Pricing
- Inventory reference
- Category assignment

### Relationships

- Category
- Inventory
- SaleItem
- PurchaseItem

---

# Category Class

Responsibilities

- Product grouping
- Classification
- Reporting

Relationship

```
Category

↓

Products
```

---

# Inventory Class

Responsibilities

- Stock quantity
- Available stock
- Reorder level
- Stock adjustments

Relationship

```
Product

↓

Inventory
```

---

# Sale Class

Responsibilities

- Invoice information
- Customer reference
- Totals
- Payment status

Contains

```
Sale

↓

SaleItems
```

---

# SaleItem Class

Responsibilities

- Product
- Quantity
- Unit Price
- Discount
- Tax
- Total

Relationship

```
Sale

↓

SaleItem

↓

Product
```

---

# Purchase Class

Responsibilities

- Supplier
- Purchase totals
- Purchase date
- Invoice number

Contains

```
Purchase

↓

PurchaseItems
```

---

# PurchaseItem Class

Responsibilities

- Product
- Quantity
- Cost Price
- Total

---

# Repair Class

Responsibilities

- Customer repair
- Device information
- Technician assignment
- Repair status

Relationships

- Customer
- User
- Status

---

# Expense Class

Responsibilities

- Expense category
- Amount
- Date
- Description

---

# Payment Class

Responsibilities

- Payment amount
- Payment method
- Payment status
- Reference number

---

# Company Class

Responsibilities

- Company profile
- Invoice information
- Business settings

---

# Settings Class

Responsibilities

- Global configuration
- System preferences
- Runtime options

---

# Service Layer Classes

Major service classes include

- AuthenticationService
- CustomerService
- SupplierService
- ProductService
- InventoryService
- SalesService
- PurchaseService
- RepairService
- ExpenseService
- ReportService
- SyncService
- BackupService

Services implement business rules.

---

# Repository Layer

Repositories abstract database operations.

Typical repositories

- UserRepository
- CustomerRepository
- SupplierRepository
- ProductRepository
- InventoryRepository
- SalesRepository
- PurchaseRepository
- RepairRepository
- ExpenseRepository
- SettingsRepository

Repositories should not contain business logic.

---

# Controller Layer

Controllers receive requests and coordinate processing.

Typical controllers

- LoginController
- DashboardController
- CustomerController
- SupplierController
- ProductController
- InventoryController
- SalesController
- PurchaseController
- RepairController
- ExpenseController
- ReportController
- SettingsController

Controllers should remain lightweight.

---

# Utility Classes

Shared utility classes include

- ValidationHelper
- DateHelper
- CurrencyHelper
- NumberHelper
- PrinterHelper
- FileHelper
- BackupHelper
- Logger
- ErrorHandler
- ConfigManager

Utilities provide reusable functionality across modules.

---

# Synchronization Classes

Logical synchronization components

- SyncEngine
- SyncQueue
- SyncRequest
- SyncResponse
- ConflictResolver
- RetryManager

These classes coordinate data synchronization between clients and the central database.

---

# Security Classes

Security-related classes include

- AuthManager
- PermissionManager
- SessionManager
- PasswordHasher
- AuditLogger

These classes enforce authentication and authorization policies.

---

# Reporting Classes

Reporting components include

- ReportBuilder
- ReportExporter
- PDFGenerator
- PrintManager

Responsibilities include report generation and output formatting.

---

# Backup Classes

Logical backup components

- BackupManager
- RestoreManager
- BackupValidator
- BackupScheduler

These classes support data protection and recovery.

---

# Class Relationships

```text
Customer
   │
   ▼
 Sale
   │
   ▼
SaleItem
   │
   ▼
Product
   │
   ▼
Inventory
```

---

# Layer Dependency Rules

Dependencies should flow only in one direction.

```
Presentation

↓

Controllers

↓

Services

↓

Repositories

↓

Database
```

Lower layers should never depend on higher layers.

---

# Future Classes

Future modules may introduce

- Warehouse
- Branch
- Barcode
- PurchaseOrder
- SalesOrder
- Delivery
- Manufacturing
- Accounting
- Payroll
- CRM
- GlassProduction
- GlassCutting
- GlassSheet
- AIAssistant
- NotificationService

Future classes should integrate with the existing architecture without modifying established core classes wherever possible.

---

# Best Practices

Developers should

✓ Keep classes focused on one responsibility.

✓ Avoid duplicate business logic.

✓ Use services for business rules.

✓ Keep repositories responsible only for data access.

✓ Minimize coupling between modules.

✓ Favor composition over deep inheritance.

✓ Write reusable utility classes.

---

# Related Documents

- docs/architecture/02_SYSTEM_ARCHITECTURE.md
- docs/database/06_DATABASE_ARCHITECTURE.md
- docs/business/09_MODULE_REFERENCE.md
- docs/development/13_CRITICAL_FUNCTIONS.md
- docs/database/27_DATABASE_SCHEMA.md
- docs/database/41_DATABASE_ER_DIAGRAM.md
- docs/diagrams/42_SYSTEM_SEQUENCE_DIAGRAMS.md
- docs/development/44_MODULE_DESIGN_SPECIFICATION.md

---

# Revision History

| Version | Date | Author | Description |
|---------|------------|----------------------------|------------------------------|
| 1.0 | 2026-07-17 | Software Architecture Team | Initial Class Design Reference |

---

End of Document