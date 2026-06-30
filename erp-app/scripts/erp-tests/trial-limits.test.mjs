#!/usr/bin/env node
import {
  TRIAL_MAX_RECORDS,
  getTrialLimitExceeded,
  evaluateLicenseStorageWrite,
  isLicenseReadOnly,
} from "../../src/licensing/trialLimits.js";

export function runTrialLimitsTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  var counts = { sales: 19, products: 5, customers: 0 };
  if (getTrialLimitExceeded(counts, 20)) {
    return fail("Trial limits: 19 sales should not exceed");
  }

  counts.sales = 20;
  var ex = getTrialLimitExceeded(counts, 20);
  if (!ex || ex.module !== "sales") {
    return fail("Trial limits: 20 sales should exceed");
  }

  var trialInfo = { status: "trial", trialMaxRecords: 20 };
  globalThis.window = { _tcLicInfo: trialInfo };

  var allow = evaluateLicenseStorageWrite("tc3_sales", [{ id: 1 }, { id: 2 }], [{ id: 1 }]);
  if (allow.blocked) return fail("Trial limits: allow growth under cap");

  var block = evaluateLicenseStorageWrite(
    "tc3_products",
    new Array(21).fill({ id: 1 }),
    new Array(20).fill({ id: 1 })
  );
  if (!block.blocked) return fail("Trial limits: block 21st product");

  globalThis.window = { _tcLicInfo: { status: "expired", isReadOnly: true, readOnlyReason: "license_expired" } };
  if (!isLicenseReadOnly()) return fail("Trial limits: expired is read-only");

  var roBlock = evaluateLicenseStorageWrite("tc3_sales", [{ x: 1 }], [{ x: 2 }]);
  if (!roBlock.blocked) return fail("Trial limits: read-only blocks sales edit");

  var roAllow = evaluateLicenseStorageWrite("tc3_settings", { shopName: "A" }, { shopName: "B" });
  if (roAllow.blocked) return fail("Trial limits: settings allowed in read-only");

  delete globalThis.window;
  pass("Trial limits — 20 cap, read-only, storage guard");
}
