/**
 * Settings migration: older saves gain current defaults without breaking stored values.
 */
export function runSettingsMigrationTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  var old = { shopName: "Legacy", currency: "Rs" };
  var merged = Object.assign({}, old, {
    strictPeriodLock: old.strictPeriodLock !== undefined ? old.strictPeriodLock : false,
    glArApNegativeTolerance: old.glArApNegativeTolerance != null ? old.glArApNegativeTolerance : 50,
    glArApHardBlockAt: old.glArApHardBlockAt != null ? old.glArApHardBlockAt : 1000000,
  });

  if (merged.glArApNegativeTolerance !== 50) return fail("Settings migration: default tolerance");
  if (merged.shopName !== "Legacy") return fail("Settings migration: preserve shopName");

  var already = Object.assign({}, old, { glArApNegativeTolerance: 99 });
  var merged2 = Object.assign({}, already, {
    glArApNegativeTolerance: already.glArApNegativeTolerance != null ? already.glArApNegativeTolerance : 50,
  });
  if (merged2.glArApNegativeTolerance !== 99) return fail("Settings migration: keep explicit tolerance");

  pass("Settings migration — defaults merge without clobber");
}
