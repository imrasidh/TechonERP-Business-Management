#!/usr/bin/env node
/**
 * Accounting test harness — exit 1 on any failure.
 * npm run test:accounting
 */
import { runScenarioTests } from "./scenarios.mjs";
import { runGoldenTests } from "./golden.mjs";
import { runMigrationTests } from "./migration.mjs";
import { runV3BusinessWorkflowTests } from "./v3-business-workflow.mjs";

function fail(name, detail) {
  console.error("FAIL —", name, detail != null ? detail : "");
  process.exitCode = 1;
}

function pass(name) {
  console.log("PASS —", name);
}

var ctx = { fail: fail, pass: pass };

runScenarioTests(ctx);
if (process.exitCode) {
  console.error("\nSummary: accounting tests failed (exit " + process.exitCode + ").");
  process.exit(process.exitCode);
}

runGoldenTests(ctx);
if (process.exitCode) {
  console.error("\nSummary: accounting tests failed (exit " + process.exitCode + ").");
  process.exit(process.exitCode);
}

runMigrationTests(ctx);
if (process.exitCode) {
  console.error("\nSummary: accounting tests failed (exit " + process.exitCode + ").");
  process.exit(process.exitCode);
}

runV3BusinessWorkflowTests(ctx);
if (process.exitCode) {
  console.error("\nSummary: accounting tests failed (exit " + process.exitCode + ").");
  process.exit(process.exitCode);
}

/* Snapshot HMAC v2 + optional rotation (Node env) */
(async function snapshotHmacTests() {
  try {
    var hmacMod = await import("../../src/accounting/snapshotIntegrityHmac.js");
    var canon = "{\"reg\":1}";
    var sec = "reg-test-license-secret";
    var hex = await hmacMod.computeSnapshotHmacHexV2(canon, sec);
    if (!hex || !(await hmacMod.verifySnapshotHmacV2(canon, hex, sec))) {
      fail("Snapshot HMAC v2 round-trip");
      return;
    }
    var pL = process.env.LICENSE_SECRET;
    var pTc = process.env.TC_LIC_SERVER_SECRET;
    process.env.LICENSE_SECRET = sec;
    if (process.env.TC_LIC_SERVER_SECRET) delete process.env.TC_LIC_SERVER_SECRET;
    try {
      var flex = await hmacMod.verifySnapshotHmacFlexible({ integrityHmac: hex, algorithm: "hmac-sha256-v2" }, canon);
      if (!flex.ok || flex.matched !== "v2_license") {
        fail("verifySnapshotHmacFlexible primary secret", JSON.stringify(flex));
        return;
      }
    } finally {
      if (pL !== undefined) process.env.LICENSE_SECRET = pL;
      else delete process.env.LICENSE_SECRET;
      if (pTc !== undefined) process.env.TC_LIC_SERVER_SECRET = pTc;
    }

    var pL2 = process.env.LICENSE_SECRET;
    var pPrev = process.env.TC_SNAPSHOT_HMAC_SECRET_PREVIOUS;
    process.env.LICENSE_SECRET = "wrong-primary-not-used";
    process.env.TC_SNAPSHOT_HMAC_SECRET_PREVIOUS = sec;
    try {
      var flexRot = await hmacMod.verifySnapshotHmacFlexible({ integrityHmac: hex, algorithm: "hmac-sha256-v2" }, canon);
      if (!flexRot.ok || flexRot.matched !== "v2_license_previous") {
        fail("verifySnapshotHmacFlexible rotation (TC_SNAPSHOT_HMAC_SECRET_PREVIOUS)", JSON.stringify(flexRot));
        return;
      }
    } finally {
      if (pL2 !== undefined) process.env.LICENSE_SECRET = pL2;
      else delete process.env.LICENSE_SECRET;
      if (pPrev !== undefined) process.env.TC_SNAPSHOT_HMAC_SECRET_PREVIOUS = pPrev;
      else delete process.env.TC_SNAPSHOT_HMAC_SECRET_PREVIOUS;
    }

    pass("Snapshot HMAC v2 (LICENSE_SECRET) + key rotation path");

    var fsnap = await import("../../src/accounting/financialSnapshot.js");
    var goodBody = {
      id: "snap_validate_t",
      createdAt: "2026-03-01T12:00:00.000Z",
      label: "unit test",
      periodCloseDate: "2026-02-28",
      trialBalance: { totalDebit: 1, totalCredit: 1, balanced: true, rowCount: 1 },
      balanceSheet: { assets: 1, liabilities: 0, equity: 1, balanced: true, difference: 0 },
    };
    var badSnap = JSON.parse(JSON.stringify(goodBody));
    badSnap.contentHash = "snap_deadbeef1234";
    var vrBad = await fsnap.validateSnapshotIntegrityFull(badSnap);
    if (!vrBad.tampered || vrBad.reason !== "legacy_hash_mismatch") {
      fail("Snapshot full validate — hash mismatch", vrBad);
      return;
    }
    if (!vrBad.recomputedContentHashShort || !vrBad.snapshotPeriodDate) {
      fail("Snapshot full validate — diagnostic fields missing", vrBad);
      return;
    }
    pass("validateSnapshotIntegrityFull (hash mismatch diagnostics)");
  } catch (e) {
    fail("Snapshot HMAC v2 suite", e && e.message ? e.message : String(e));
  }
})()
  .then(function () {
    console.log("\nSummary: accounting tests finished (exit " + (process.exitCode || 0) + ").");
    process.exit(process.exitCode || 0);
  })
  .catch(function (e) {
    console.error("FAIL — suite async", e);
    process.exit(1);
  });
