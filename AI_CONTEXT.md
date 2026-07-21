# AI_CONTEXT.md

# TechonERP AI Context

**Version:** 2.0\
**Audience:** AI Coding Assistants (Cursor, Codex, Claude Code, Gemini
CLI, ChatGPT)

------------------------------------------------------------------------

# Purpose

Read this file **before modifying any TechonERP code**.

This document provides the architectural mindset, engineering rules, and
navigation needed to work safely within TechonERP. It is a guide---not a
replacement---for the detailed documentation in the `docs/` folder.

------------------------------------------------------------------------

# Project Mission

TechonERP is a modular desktop ERP built with **React + Electron +
Node.js + MySQL**.

Primary goals:

-   Stable and maintainable code
-   Reliable standalone and multi-PC operation
-   Clean architecture
-   Reusable components
-   Business correctness over shortcuts

------------------------------------------------------------------------

# Architecture Overview

``` text
Electron Desktop
        │
     React UI
        │
     REST API
        │
 Business Services
        │
      MySQL
        │
 Synchronization
```

The **database is the Source of Truth**.

------------------------------------------------------------------------

# Core Engineering Principles

Always:

-   Understand existing code before changing it.
-   Extend existing modules instead of rewriting them.
-   Keep business logic centralized.
-   Preserve backward compatibility.
-   Prefer readable code over clever code.
-   Update documentation when behavior changes.

Never:

-   Break synchronization.
-   Duplicate business logic.
-   Hardcode configuration or credentials.
-   Rename APIs without a compelling reason.
-   Introduce architectural changes without understanding downstream
    impact.

------------------------------------------------------------------------

# Development Workflow

1.  Understand the requirement.
2.  Identify affected modules.
3.  Read the related documentation.
4.  Design the solution.
5.  Implement.
6.  Test.
7.  Review.
8.  Update documentation if required.

------------------------------------------------------------------------

# Business Rules

-   Inventory accuracy is critical.
-   Financial records must remain consistent.
-   Auditability should be preserved.
-   Validation belongs in shared business logic.

------------------------------------------------------------------------

# Synchronization

The synchronization engine is a critical subsystem.

Before modifying it:

-   Understand push/pull flow.
-   Understand conflict handling.
-   Test standalone mode.
-   Test multi-PC mode.

------------------------------------------------------------------------

# Database Guidelines

-   Preserve data integrity.
-   Prefer migrations over destructive schema changes.
-   Keep relationships consistent.
-   Do not bypass validation.

------------------------------------------------------------------------

# UI Guidelines

The interface should be:

-   Fast
-   Simple
-   Consistent
-   Business-focused

Avoid unnecessary complexity.

------------------------------------------------------------------------

# Security Guidelines

-   Validate all input.
-   Enforce authorization.
-   Protect credentials.
-   Preserve audit logging.
-   Apply least privilege.

------------------------------------------------------------------------

# Performance Guidelines

-   Minimize unnecessary database queries.
-   Avoid repeated rendering.
-   Reuse components.
-   Profile before optimizing.

------------------------------------------------------------------------

# Documentation Map

Use these detailed documents when needed:

  -----------------------------------------------------------------------
  Topic                         Document
  ----------------------------- -----------------------------------------
  Architecture                  docs/architecture/02_SYSTEM_ARCHITECTURE.md

  Data Flow                     docs/architecture/07_DATA_FLOW.md

  Synchronization               docs/synchronization/08_SYNCHRONIZATION_ARCHITECTURE.md /
                                docs/synchronization/28_SYNC_PROTOCOL.md

  Source of Truth               docs/architecture/10_SOURCE_OF_TRUTH.md

  Security                      docs/security/15_SECURITY_ARCHITECTURE.md

  Database                      docs/database/27_DATABASE_SCHEMA.md

  API                           docs/api/26_API_REFERENCE.md

  Coding Standards              docs/development/47_CODING_STANDARDS.md

  Deployment                    docs/deployment/19_DEPLOYMENT_GUIDE.md

  DevOps                        docs/deployment/51_DEVOPS_PIPELINE.md
  -----------------------------------------------------------------------

All remaining reference material is located in the `docs/` folder.

------------------------------------------------------------------------

# AI Decision Checklist

Before making any code change ask:

-   Does this preserve the Source of Truth?
-   Will standalone mode still work?
-   Will multi-PC synchronization still work?
-   Am I reusing existing architecture?
-   Am I breaking backward compatibility?
-   Does documentation need updating?

If any answer is uncertain, investigate before coding.

------------------------------------------------------------------------

# Final Instruction

Treat TechonERP as a long-term enterprise project.

Favor stability, consistency, maintainability, and business correctness
over quick fixes.

End of Document.
