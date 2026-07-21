/**
 * Backup restore integrity: JSON round-trip and schema checks (no storage I/O).
 */
import fs from "fs";
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

  try {
    var demoPath = new URL("../../demo-data/techon-demo-backup.json", import.meta.url);
    var demoRaw = fs.readFileSync(demoPath, "utf8");
    var demo = JSON.parse(demoRaw);
    if (!validateJsonBackupPayload(demo)) return fail("Demo backup file validates");
    var demoSales = (demo.data && demo.data.tc3_sales && demo.data.tc3_sales.length) || 0;
    if (demoSales < 100) return fail("Demo backup has expected sales volume", demoSales);
    pass("Demo backup file — " + demoSales + " sales ready for restore");
  } catch (eDemo) {
    return fail("Demo backup file readable", eDemo);
  }
}
