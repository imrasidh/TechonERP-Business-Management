# TechonERP — API Examples

**Filename:** docs/api/45_API_EXAMPLES.md

**Document ID:** TERP-045

**Classification:** Internal Technical Documentation

**Audience:**
- Backend Developers
- Frontend Developers
- Integration Engineers
- QA Engineers
- API Consumers

**Version:** 1.0

**Status:** Production

**Owner:** API Development Team

**Last Updated:** 2026-07-17

---

# Executive Summary

This document provides practical examples of the APIs used throughout TechonERP. It demonstrates common request and response structures, HTTP methods, status codes, authentication requirements, validation behavior, and error handling.

The examples in this document are illustrative and are intended to serve as implementation references. Actual endpoint URLs and payloads may evolve over time.

---

# Purpose

This document explains

- API conventions
- Authentication
- Request examples
- Response examples
- Error responses
- Status codes
- Validation behavior
- Best practices

---

# API Design Principles

All APIs should

- Follow REST principles
- Use HTTPS
- Return JSON
- Be stateless
- Validate inputs
- Return meaningful status codes
- Produce consistent response formats

---

# Standard Request Headers

```http
Content-Type: application/json
Accept: application/json
Authorization: Bearer <AccessToken>
```

---

# Standard Success Response

```json
{
  "success": true,
  "message": "Operation completed successfully.",
  "data": {}
}
```

---

# Standard Error Response

```json
{
  "success": false,
  "message": "Validation failed.",
  "errors": []
}
```

---

# Authentication API

## Login

### Request

```http
POST /api/auth/login
```

```json
{
  "username": "admin",
  "password": "********"
}
```

### Success Response

```json
{
  "success": true,
  "token": "jwt_token",
  "user": {
    "id": 1,
    "name": "Administrator",
    "role": "Administrator"
  }
}
```

---

## Logout

```http
POST /api/auth/logout
```

### Response

```json
{
  "success": true,
  "message": "Logged out successfully."
}
```

---

# Customer API

## Get Customers

```http
GET /api/customers
```

### Response

```json
{
  "success": true,
  "data": [
    {
      "customerId": 1,
      "name": "John Smith",
      "phone": "0771234567"
    }
  ]
}
```

---

## Create Customer

```http
POST /api/customers
```

### Request

```json
{
  "name": "John Smith",
  "phone": "0771234567",
  "address": "Colombo"
}
```

### Response

```json
{
  "success": true,
  "message": "Customer created successfully."
}
```

---

## Update Customer

```http
PUT /api/customers/{customerId}
```

---

## Delete Customer

```http
DELETE /api/customers/{customerId}
```

---

# Supplier API

## Get Suppliers

```http
GET /api/suppliers
```

---

## Create Supplier

```http
POST /api/suppliers
```

Example Request

```json
{
  "name": "ABC Suppliers",
  "phone": "0711234567"
}
```

---

# Product API

## Get Products

```http
GET /api/products
```

---

## Create Product

```http
POST /api/products
```

Request

```json
{
  "productCode": "LAP001",
  "name": "Dell Latitude",
  "category": "Laptop",
  "sellingPrice": 85000
}
```

---

## Update Product

```http
PUT /api/products/{productId}
```

---

## Delete Product

```http
DELETE /api/products/{productId}
```

---

# Inventory API

## Get Inventory

```http
GET /api/inventory
```

---

## Inventory Adjustment

```http
POST /api/inventory/adjust
```

Example

```json
{
  "productId": 10,
  "quantity": -2,
  "reason": "Damaged Item"
}
```

---

# Sales API

## Create Sale

```http
POST /api/sales
```

Example Request

```json
{
  "customerId": 1,
  "items": [
    {
      "productId": 15,
      "quantity": 2,
      "unitPrice": 55000
    }
  ]
}
```

Example Response

```json
{
  "success": true,
  "invoiceNumber": "INV-2026-00045"
}
```

---

## Get Sales

```http
GET /api/sales
```

---

## Get Sale by ID

```http
GET /api/sales/{saleId}
```

---

# Purchase API

## Create Purchase

```http
POST /api/purchases
```

Example

```json
{
  "supplierId": 5,
  "items": [
    {
      "productId": 3,
      "quantity": 20,
      "costPrice": 42000
    }
  ]
}
```

---

## Get Purchases

```http
GET /api/purchases
```

---

# Repair API

## Register Repair

```http
POST /api/repairs
```

Example

```json
{
  "customerId": 12,
  "device": "Dell Latitude",
  "problem": "No Display"
}
```

---

## Update Repair Status

```http
PUT /api/repairs/{repairId}
```

---

# Expense API

## Add Expense

```http
POST /api/expenses
```

Example

```json
{
  "category": "Transport",
  "amount": 2500
}
```

---

# Reports API

## Sales Report

```http
GET /api/reports/sales
```

Example

```
GET /api/reports/sales?from=2026-01-01&to=2026-01-31
```

---

## Inventory Report

```http
GET /api/reports/inventory
```

---

# Backup API

## Create Backup

```http
POST /api/backup/create
```

---

## Restore Backup

```http
POST /api/backup/restore
```

---

# Synchronization API

## Push Changes

```http
POST /api/sync/push
```

---

## Pull Updates

```http
GET /api/sync/pull
```

---

## Synchronization Status

```http
GET /api/sync/status
```

---

# Settings API

## Get Settings

```http
GET /api/settings
```

---

## Update Settings

```http
PUT /api/settings
```

---

# Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Resource Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 422 | Validation Error |
| 500 | Internal Server Error |

---

# Validation Error Example

```json
{
  "success": false,
  "message": "Validation failed.",
  "errors": [
    {
      "field": "customerName",
      "message": "Customer name is required."
    }
  ]
}
```

---

# Pagination Example

```json
{
  "page": 1,
  "pageSize": 20,
  "totalRecords": 580,
  "totalPages": 29,
  "data": []
}
```

---

# Best Practices

API consumers should

✓ Always validate responses.

✓ Handle error responses gracefully.

✓ Never assume response ordering.

✓ Use authentication tokens securely.

✓ Retry only idempotent operations when appropriate.

✓ Validate all user input before submission.

✓ Respect API version compatibility.

---

# Related Documents

- docs/api/26_API_REFERENCE.md
- docs/synchronization/28_SYNC_PROTOCOL.md
- docs/development/31_DEVELOPER_HANDBOOK.md
- docs/diagrams/42_SYSTEM_SEQUENCE_DIAGRAMS.md
- docs/development/44_MODULE_DESIGN_SPECIFICATION.md

---

# Revision History

| Version | Date | Author | Description |
|---------|------------|----------------------|------------------------------|
| 1.0 | 2026-07-17 | API Development Team | Initial API Examples Document |

---

End of Document