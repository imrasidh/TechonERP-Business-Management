/**
 * Reconciliation report must show no mismatch for golden rebuild (release gate).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { rebuildJournalFromState, DEFAULT_GL_CHART, validateJournalBalanced } from "../../src/accounting/generalLedger.js";
import { deriveInventoryEconomics } from "../../src/accounting/inventoryEngine.js";
import { buildReconciliationReport } from "../../src/accounting/reconciliationReport.js";

var __dirname = path.dirname(fileURLToPath(import.meta.url));

function uid() {
  return "rg_" + Math.random().toString(36).slice(2, 9);
}

export function runReconciliationGateTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  var goldenPath = path.join(__dirname, "..", "accounting-tests", "golden-data.json");
  var raw = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
  var Smock = {
    get: function (k, def) {
      var d = {
        tc3_openBal: null,
        tc3_manualReceivables: [],
        tc3_manualPayables: [],
        tc3_capLedger: [],
        tc3_profitDist: [],
        tc3_assets: [],
        tc3_gl_accounts: DEFAULT_GL_CHART,
      };
      return d[k] !== undefined ? d[k] : def;
    },
  };
  var state = {
    settings: raw.settings,
    products: raw.products,
    purchases: raw.purchases,
    sales: raw.sales,
    salesReturns: raw.salesReturns || [],
    purchaseReturns: raw.purchaseReturns || [],
    customers: raw.customers || [],
    suppliers: raw.suppliers || [],
    expenses: raw.expenses || [],
  };

  var invDer = deriveInventoryEconomics(state, Smock);
  var r = rebuildJournalFromState(state, Smock, uid, invDer);
  if (!r.validate.ok) return fail("Reconciliation gate: rebuild", r.validate);

  var rep = buildReconciliationReport({
    lines: r.lines,
    chart: r.chart || DEFAULT_GL_CHART,
    invDer: invDer,
    validateJournalBalanced: validateJournalBalanced,
    settings: state.settings || {},
  });

  if (!rep.summaryOk) return fail("Reconciliation gate: summaryOk", rep.rows);

  pass("Reconciliation report — no mismatch (golden rebuild)");
}
