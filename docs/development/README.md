# Development Documentation

## Purpose

This folder documents how to develop, test, debug, and maintain TechonERP source code: critical functions, globals, performance, testing, coding standards, and module design.

---

## Documents

| File | Description |
|------|-------------|
| [13_CRITICAL_FUNCTIONS.md](13_CRITICAL_FUNCTIONS.md) | Core functions (`S.set`, sync, GL, checkout) and their risks |
| [14_GLOBAL_OBJECTS.md](14_GLOBAL_OBJECTS.md) | Global variables, caches, and window objects |
| [18_PERFORMANCE_GUIDE.md](18_PERFORMANCE_GUIDE.md) | Performance optimization and profiling |
| [20_TESTING_GUIDE.md](20_TESTING_GUIDE.md) | Testing methodology and test suites |
| [21_REGRESSION_CHECKLIST.md](21_REGRESSION_CHECKLIST.md) | Regression testing checklist by module |
| [31_DEVELOPER_HANDBOOK.md](31_DEVELOPER_HANDBOOK.md) | Developer onboarding and workflow |
| [32_TROUBLESHOOTING_GUIDE.md](32_TROUBLESHOOTING_GUIDE.md) | Debugging common issues |
| [43_CLASS_DESIGN_REFERENCE.md](43_CLASS_DESIGN_REFERENCE.md) | Class and object design patterns |
| [44_MODULE_DESIGN_SPECIFICATION.md](44_MODULE_DESIGN_SPECIFICATION.md) | Per-module design specifications |
| [46_UI_STYLE_GUIDE.md](46_UI_STYLE_GUIDE.md) | UI styling and component conventions |
| [47_CODING_STANDARDS.md](47_CODING_STANDARDS.md) | Coding standards and best practices |

---

## Recommended Reading Order

1. [31_DEVELOPER_HANDBOOK.md](31_DEVELOPER_HANDBOOK.md)
2. [47_CODING_STANDARDS.md](47_CODING_STANDARDS.md)
3. [reference/12_CRITICAL_FILES.md](../reference/12_CRITICAL_FILES.md)
4. [13_CRITICAL_FUNCTIONS.md](13_CRITICAL_FUNCTIONS.md)
5. [14_GLOBAL_OBJECTS.md](14_GLOBAL_OBJECTS.md)
6. [20_TESTING_GUIDE.md](20_TESTING_GUIDE.md)
7. [21_REGRESSION_CHECKLIST.md](21_REGRESSION_CHECKLIST.md)
8. [32_TROUBLESHOOTING_GUIDE.md](32_TROUBLESHOOTING_GUIDE.md)

---

## Related Folders

- [../architecture/](../architecture/README.md) — System design
- [../reference/](../reference/README.md) — Critical files and UI components
- [../business/](../business/README.md) — Business rules and modules
- [../synchronization/](../synchronization/README.md) — Sync engine (high-risk area)
