#!/usr/bin/env node
/**
 * Non-accounting integration tests — exit 1 on failure.
 * npm run test:erp
 */
import { runSyncChunkingTests } from "./sync-chunking.test.mjs";
import { runSyncEdgeExtraTests } from "./sync-edge-extra.test.mjs";
import { runInventoryFlowTests } from "./inventory-flow.test.mjs";
import { runBackupLicenseTests } from "./backup-license.test.mjs";
import { runBackupRestoreTests } from "./backup-restore.test.mjs";
import { runLicenseAuthTests } from "./license-auth.test.mjs";
import { runSettingsMigrationTests } from "./settings-migration.test.mjs";
import { runReconciliationGateTests } from "./reconciliation-gate.test.mjs";

function fail(name, detail) {
  console.error("FAIL —", name, detail != null ? detail : "");
  process.exitCode = 1;
}

function pass(name) {
  console.log("PASS —", name);
}

var ctx = { fail: fail, pass: pass };

runSyncChunkingTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runSyncEdgeExtraTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runInventoryFlowTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runBackupLicenseTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runBackupRestoreTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runLicenseAuthTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runSettingsMigrationTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runReconciliationGateTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("\nSummary: ERP integration tests finished (exit " + (process.exitCode || 0) + ").");
