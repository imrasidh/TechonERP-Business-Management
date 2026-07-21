# SECURITY.md

# TechonERP Security Policy

## Supported Versions

Only actively maintained releases should receive security updates.

  Version          Supported
  ---------------- ------------
  Latest Stable    ✅
  Older Releases   ⚠️ Limited
  Deprecated       ❌

------------------------------------------------------------------------

## Reporting a Security Issue

If you discover a security vulnerability:

1.  Do **not** disclose it publicly.
2.  Report it privately to the project maintainer.
3.  Include:
    -   Description
    -   Steps to reproduce
    -   Impact
    -   Suggested fix (if available)

Please allow reasonable time for investigation before public disclosure.

------------------------------------------------------------------------

## Security Principles

TechonERP follows these principles:

-   Least privilege
-   Secure authentication
-   Input validation
-   Role-based access control
-   Audit logging
-   Secure backups
-   Principle of Source of Truth
-   Defense in depth

------------------------------------------------------------------------

## Developer Responsibilities

Developers should:

-   Validate all user input.
-   Protect sensitive data.
-   Never hardcode secrets.
-   Keep dependencies updated.
-   Review authentication and authorization changes carefully.

------------------------------------------------------------------------

## AI Assistant Responsibilities

AI-generated code must:

-   Preserve existing security controls.
-   Avoid introducing insecure defaults.
-   Follow the project's coding standards.
-   Never bypass validation or permission checks.

------------------------------------------------------------------------

## Security Checklist

Before releasing:

-   [ ] Authentication verified
-   [ ] Authorization tested
-   [ ] Input validation reviewed
-   [ ] Database queries safe
-   [ ] Error handling checked
-   [ ] Sensitive information protected
-   [ ] Audit logging preserved

------------------------------------------------------------------------

## Related Documentation

See the following documents:

-   docs/security/15_SECURITY_ARCHITECTURE.md
-   docs/security/48_SECURITY_OPERATIONS_MANUAL.md
-   docs/security/49_DISASTER_RECOVERY_PLAN.md
-   docs/deployment/50_RELEASE_MANAGEMENT.md

------------------------------------------------------------------------

End of Document
