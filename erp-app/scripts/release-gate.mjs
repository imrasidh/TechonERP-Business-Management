#!/usr/bin/env node
/**
 * Post-CI checklist (manual steps). Run: npm run release:gate
 * (release:gate = npm run ci && node scripts/release-gate.mjs)
 */
console.log("");
console.log("══ Techon ERP — release gate (manual follow-up) ══");
console.log("");
console.log("Automated suite already passed if you ran: npm run release:gate");
console.log("Or full standalone gate: npm run readiness:standalone");
console.log("");
console.log("Automated gates (CI):");
console.log("  ✓ Accounting + ERP + Certification (78 scenarios)");
console.log("  ✓ Electron main-process smoke (DPAPI, crypto, backup sanitize)");
console.log("  ✓ Performance (50k journal lines)");
console.log("");
console.log("Operational (docs/RUNBOOK.md):");
console.log("  □ Staging smoke on installed build");
console.log("  □ Backup restore drill logged");
console.log("  □ Production LICENSE_SECRET / tc_license_secret.txt verified");
console.log("");
process.exit(0);
