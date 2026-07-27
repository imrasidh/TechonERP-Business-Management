/**
 * Backup payload shape + restore integrity (same rules as production backup validation).
 */
import { validateJsonBackupPayload } from "../../src/productionConfig.js";

export function runBackupLicenseTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  var good = {
    version: 2,
    data: {
      tc3_settings: { shopName: "S" },
      tc3_products: [],
    },
  };
  if (!validateJsonBackupPayload(good)) return fail("Backup: valid v2 payload accepted");

  if (validateJsonBackupPayload({ version: 1, data: {} })) return fail("Backup: reject v1");

  if (validateJsonBackupPayload({ version: 2, data: [] })) return fail("Backup: reject non-object data");

  if (validateJsonBackupPayload(null)) return fail("Backup: reject null");

  if (validateJsonBackupPayload({ version: 2, data: { tc3_settings: {}, tc3_sales: { bad: true } } })) {
    return fail("Backup: reject non-array tc3_sales");
  }

  pass("Backup / license payload validation (v2 shape)");
}
