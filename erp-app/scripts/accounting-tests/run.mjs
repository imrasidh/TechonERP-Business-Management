#!/usr/bin/env node
/**
 * Accounting test harness — exit 1 on any failure.
 * npm run test:accounting
 */
import { runScenarioTests } from "./scenarios.mjs";
import { runGoldenTests } from "./golden.mjs";
import { runMigrationTests } from "./migration.mjs";

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
