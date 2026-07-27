#!/usr/bin/env node
/**
 * Non-accounting integration tests — exit 1 on failure.
 * npm run test:erp
 * --disable-warning: avoid noisy MODULE_TYPELESS_PACKAGE_JSON when loading src/*.js as ESM from tests.
 */
import { runSyncChunkingTests } from "./sync-chunking.test.mjs";
import { runSyncEdgeExtraTests } from "./sync-edge-extra.test.mjs";
import { runInventoryFlowTests } from "./inventory-flow.test.mjs";
import { runBackupLicenseTests } from "./backup-license.test.mjs";
import { runBackupRestoreTests } from "./backup-restore.test.mjs";
import { runLicenseAuthTests } from "./license-auth.test.mjs";
import { runSettingsMigrationTests } from "./settings-migration.test.mjs";
import { runReconciliationGateTests } from "./reconciliation-gate.test.mjs";
import { runInventoryValuationTests } from "./inventory-valuation.test.mjs";
import { runSettingsRegressionTests } from "./settings-regression.test.mjs";
import { runRiskFlowRegressionTests } from "./risk-flow-regression.test.mjs";
import { runTrialLimitsTests } from "./trial-limits.test.mjs";
import { runPosFreeItemsTests } from "./pos-free-items.test.mjs";
import { runProductNameMatchTests } from "./product-name-match.test.mjs";
import { runVoidInvoiceTests } from "./void-invoice.test.mjs";
import { runRepairVoidChainTests, runVoidReturnResidualTests, runMediumLowFixTests } from "./repair-void-chain.test.mjs";
import { runConcurrencyMergeTests } from "./concurrency-merge.test.mjs";
import { runDemo360Tests } from "./demo-360.test.mjs";
import { runGlassDimensionsTests } from "./glass-dimensions.test.mjs";
import { runBackupPreviewTests } from "./backup-preview.test.mjs";
import { runStandaloneSmokeTests } from "./standalone-smoke.test.mjs";
import { runPerformanceScaleTests } from "./performance-scale.test.mjs";
import { runMultiPcSyncTests } from "./multi-pc-sync.test.mjs";
import { runStatementGlRefsTests } from "./statement-gl-refs.test.mjs";
import { runSourceDocumentNavTests } from "./source-document-nav.test.mjs";

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
runSettingsRegressionTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runRiskFlowRegressionTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runReconciliationGateTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runInventoryValuationTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runTrialLimitsTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runPosFreeItemsTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runProductNameMatchTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runVoidInvoiceTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runRepairVoidChainTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runVoidReturnResidualTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runMediumLowFixTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runConcurrencyMergeTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runMultiPcSyncTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runStatementGlRefsTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runSourceDocumentNavTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runGlassDimensionsTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runDemo360Tests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runBackupPreviewTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runStandaloneSmokeTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}
runPerformanceScaleTests(ctx);
if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("\nSummary: ERP integration tests finished (exit " + (process.exitCode || 0) + ").");
