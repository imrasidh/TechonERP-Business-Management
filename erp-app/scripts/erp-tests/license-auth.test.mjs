/**
 * Licensing / backup auth surface: only validates payload shapes (no network, no main-process IPC).
 */
import { validateJsonBackupPayload } from "../../src/productionConfig.js";

export function runLicenseAuthTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  if (!validateJsonBackupPayload({ version: 2, data: { tc3_settings: {} } })) {
    return fail("License/backup: minimal valid backup");
  }

  if (validateJsonBackupPayload({ version: 2, data: { tc3_settings: "bad" } })) {
    return fail("License/backup: reject invalid tc3_settings type");
  }

  /* Typical backup includes multiple keys */
  var full = {
    version: 2,
    data: {
      tc3_settings: { shopName: "Q" },
      tc3_products: [],
      tc3_sales: [],
    },
  };
  if (!validateJsonBackupPayload(full)) return fail("License/backup: multi-key payload");

  pass("Licensing / backup payload validation (auth surface)");
}
