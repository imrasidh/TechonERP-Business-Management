/**
 * Regression guards for settings hydration semantics (mirrors App.jsx loadState merge).
 * Does not mount React or touch localStorage keys beyond in-memory objects.
 */
import { defaultStrictPeriodLock } from "../../src/productionDefaults.js";

/** Subset of SEED.settings fields required for merge assertions — sync with App.jsx SEED.settings when adding checks */
function seedSettingsSubset() {
  return {
    shopName: "My Shop",
    currency: "Rs",
    strictPeriodLock: defaultStrictPeriodLock(),
    glArApNegativeTolerance: 50,
    glArApHardBlockAt: 1000000,
    taxEnabled: false,
    inventoryCostingMethod: "wac",
    requirePasswordOnLogin: true,
    adminPin: "",
    costCodeWord: "STARLIGHKZ",
  };
}

function mergeSettingsLikeApp(persisted) {
  return Object.assign({}, seedSettingsSubset(), persisted || {});
}

function hydrateAfterAssignLikeLoadState(st) {
  if (st && st.strictPeriodLock === undefined) st.strictPeriodLock = defaultStrictPeriodLock();
  if (st && st.glArApNegativeTolerance === undefined) st.glArApNegativeTolerance = 50;
  if (st && st.glArApHardBlockAt === undefined) st.glArApHardBlockAt = 1000000;
  return st;
}

export function runSettingsRegressionTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  var s0 = mergeSettingsLikeApp({});
  if (s0.shopName !== "My Shop") return fail("Settings: empty persist gets seed shopName");
  if (s0.glArApNegativeTolerance !== 50) return fail("Settings: default AR/AP tolerance");
  if (s0.currency !== "Rs") return fail("Settings: default currency");

  var s1 = mergeSettingsLikeApp({ shopName: "Legacy", glArApNegativeTolerance: 99 });
  if (s1.shopName !== "Legacy" || s1.glArApNegativeTolerance !== 99) return fail("Settings: explicit values preserved");
  if (s1.glArApHardBlockAt !== 1000000) return fail("Settings: other seed keys still default");

  var s2 = mergeSettingsLikeApp({ taxEnabled: true, shopName: "SameShop" });
  var s3 = mergeSettingsLikeApp({ taxEnabled: false, shopName: "SameShop" });
  if (s2.shopName !== "SameShop" || s3.shopName !== "SameShop") return fail("Settings: shop stable across tax flag");
  if (s2.taxEnabled !== true || s3.taxEnabled !== false) return fail("Settings: tax flag respected");

  var s4 = mergeSettingsLikeApp({ adminPin: "9999" });
  if (s4.adminPin !== "9999" || s4.inventoryCostingMethod !== "wac") return fail("Settings: security field + unrelated default");

  var h = hydrateAfterAssignLikeLoadState(mergeSettingsLikeApp({}));
  if (h.glArApNegativeTolerance !== 50) return fail("Settings: hydrate tolerance");

  var part = { shopName: "Only" };
  var h2 = hydrateAfterAssignLikeLoadState(mergeSettingsLikeApp(part));
  if (h2.shopName !== "Only" || h2.glArApHardBlockAt !== 1000000) return fail("Settings: partial persist + hydrate");

  pass("Settings regression — merge + hydrate baseline");
}
