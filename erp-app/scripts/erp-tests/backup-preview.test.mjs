/**
 * Backup preview + book repair smoke (no browser).
 */
import { summarizeBackupForRestore, formatBackupPreviewText } from "../../src/ops/backupPreview.js";
import { runStandaloneBookRepair } from "../../src/ops/bookRepair.js";
import { buildSupportBundle } from "../../src/utils/supportBundleExport.js";
import { validateJsonBackupPayload } from "../../src/productionConfig.js";
import { DEFAULT_GL_CHART } from "../../src/accounting/generalLedger.js";

export function runBackupPreviewTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  var backup = {
    version: 2,
    timestamp: new Date().toISOString(),
    shopName: "Preview Shop",
    data: {
      tc3_settings: { shopName: "Preview Shop", currency: "Rs" },
      tc3_sales: [{ id: "s1" }, { id: "s2" }],
      tc3_products: [{ id: "p1" }],
      tc3_journal_lines: [],
      tc3_gl_accounts: DEFAULT_GL_CHART.slice(),
    },
  };

  if (!validateJsonBackupPayload(backup)) return fail("Backup preview: fixture validates");
  var preview = summarizeBackupForRestore(backup);
  if (!preview.valid || preview.sales !== 2 || preview.products !== 1) {
    return fail("Backup preview: counts", JSON.stringify(preview));
  }
  var text = formatBackupPreviewText(preview);
  if (text.indexOf("Preview Shop") < 0) return fail("Backup preview: formatted text");

  pass("Backup preview — summarize + format");

  var store = {
    tc3_journal_lines: [
      { id: "a", transactionId: "t1", accountId: "1000", debit: 10, credit: 0, date: "2026-01-01" },
      { id: "b", transactionId: "t1", accountId: "1000", debit: 10, credit: 0, date: "2026-01-01" },
      { id: "c", transactionId: "t1", accountId: "4000", debit: 0, credit: 10, date: "2026-01-01" },
    ],
    tc3_gl_accounts: [],
    tc3_gl_mode: [],
  };
  var storage = {
    get: function (k, def) {
      return store[k] !== undefined ? store[k] : def;
    },
  };
  var writes = {};
  var writeFn = function (k, v) { store[k] = v; writes[k] = v; };

  var repair = runStandaloneBookRepair(storage, writeFn);
  if (repair.removedDuplicates < 1) return fail("Book repair: deduped duplicate journal line");
  if (!repair.actions.some(function (a) { return a.indexOf("healed:coa_empty") >= 0; })) {
    return fail("Book repair: healed empty COA");
  }

  pass("Book repair — heal COA + dedupe journal");

  var st = { settings: { shopName: "Bundle Shop" }, products: [], sales: [], purchases: [], expenses: [] };
  var smock = {
    get: function (k, def) {
      var map = {
        tc3_journal_lines: [],
        tc3_gl_accounts: DEFAULT_GL_CHART.slice(),
        tc3_settings: st.settings,
      };
      return map[k] !== undefined ? map[k] : def;
    },
  };
  var bundle = buildSupportBundle(st, smock, DEFAULT_GL_CHART, { anonymize: true });
  if (!bundle.techonSupportBundle || bundle.version !== 2) return fail("Support bundle v2 shape");
  if (!bundle.glStorage || !bundle.operationalHealth) return fail("Support bundle health sections");
  pass("Support bundle — v2 health export");
}
