# CONTRIBUTING.md

# TechonERP Contribution Guide

## Purpose

This guide defines how developers and AI assistants should contribute to
TechonERP while maintaining quality and consistency.

------------------------------------------------------------------------

## Before You Start

-   Read `AI_CONTEXT.md`
-   Review the relevant document in the `docs/` folder.
-   Understand the existing implementation before making changes.

------------------------------------------------------------------------

## Development Workflow

1.  Understand the requirement.
2.  Identify affected modules.
3.  Design the solution.
4.  Implement using existing architecture.
5.  Test standalone mode.
6.  Test multi-PC synchronization (if affected).
7.  Update documentation when behavior changes.

------------------------------------------------------------------------

## Coding Rules

-   Keep functions small and focused.
-   Reuse existing components.
-   Do not duplicate business logic.
-   Use meaningful names.
-   Avoid unnecessary dependencies.
-   Preserve backward compatibility.

------------------------------------------------------------------------

## Pull Request Checklist

-   [ ] Code builds successfully
-   [ ] No existing functionality is broken
-   [ ] Business rules are preserved
-   [ ] Database changes are documented
-   [ ] Sync behavior verified (if applicable)
-   [ ] Documentation updated

------------------------------------------------------------------------

## Commit Message Format

Examples:

    feat: add sales return module
    fix: resolve inventory sync issue
    refactor: simplify customer service
    docs: update API reference

------------------------------------------------------------------------

## AI Contribution Rules

AI assistants should:

-   Prefer extending existing code.
-   Never rewrite stable modules without approval.
-   Preserve the Source of Truth.
-   Protect synchronization logic.
-   Ask for clarification before major architectural changes.

------------------------------------------------------------------------

End of Document
