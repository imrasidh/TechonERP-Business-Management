/**
 * Backup restore integrity: JSON round-trip and schema checks (no storage I/O).
 */
import { validateJsonBackupPayload } from "../../src/productionConfig.js";

export function runBackupRestoreTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  var payload = {
    version: 2,
    data: {
      tc3_settings: { shopName: "RoundTrip", currency: "Rs" },
      tc3_products: [{ id: "1", name: "P", stock: 1, cost: 1, sellPrice: 2 }],
    },
  };

  var s = JSON.stringify(payload);
  var back = JSON.parse(s);
  if (!validateJsonBackupPayload(back)) return fail("Backup restore: round-trip JSON still validates");

  try {
    JSON.stringify(back.data);
  } catch (e) {
    return fail("Backup restore: data serializable", e);
  }

  pass("Backup / restore — JSON round-trip integrity");
}
