/**
 * Migration / rollback safety: rebuild integrity after restore.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { validateJournalBalanced } from "./lib/harness.mjs";
import { makeSmock, rebuildJournalFromState, deriveInventoryEconomics, DEFAULT_GL_CHART } from "./lib/harness.mjs";
import { buildFinancialSnapshot, validateSnapshotIntegrity } from "../../src/accounting/financialSnapshot.js";

var __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {{ fail: (name: string, detail?: unknown) => void, pass: (name: string) => void }} ctx
 */
export function runMigrationTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  var dataPath = path.join(__dirname, "golden-data.json");
  var raw;
  try {
    raw = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch (e) {
    return fail("Migration: read fixture", e && e.message);
  }

  var Smock = makeSmock();
  function stateFromRaw(r) {
    return {
      settings: r.settings,
      products: r.products,
      purchases: r.purchases,
      sales: r.sales,
      salesReturns: r.salesReturns || [],
      purchaseReturns: r.purchaseReturns || [],
      customers: r.customers || [],
      suppliers: r.suppliers || [],
      expenses: r.expenses || [],
    };
  }

  function deterministicRebuild(state) {
    var n = 0;
    var genId = function () {
      n++;
      return "gl_det_" + n;
    };
    var invDer = deriveInventoryEconomics(state, Smock);
    var r = rebuildJournalFromState(state, Smock, genId, invDer);
    return { r: r, invDer: invDer };
  }

  var baseline = stateFromRaw(raw);
  var r1 = deterministicRebuild(baseline);
  if (!r1.r.validate.ok) return fail("Migration: baseline rebuild validate", r1.r.validate);
  if (!validateJournalBalanced(r1.r.lines).ok) return fail("Migration: baseline journal balance");
  var inv1 = deriveInventoryEconomics(baseline, Smock);
  if (!inv1 || typeof inv1.physicalInventoryValue !== "number") {
    return fail("Migration: inventory economics derived", inv1);
  }

  /* Simulate failed upgrade: corrupt canonical state */
  var corrupted = JSON.parse(JSON.stringify(baseline));
  corrupted.sales = [{ id: "bad", date: "", invoiceNo: "", total: 1e15, paid: 0, totalTax: 0, items: [], paymentHistory: [] }];
  deterministicRebuild(corrupted);

  var restored = JSON.parse(JSON.stringify(baseline));
  var r2 = deterministicRebuild(restored);
  function normalizeLinesForCompare(lines) {
    var rows = (lines || []).map(function (ln) {
      return {
        accountId: String(ln.accountId || ""),
        debit: Number(ln.debit) || 0,
        credit: Number(ln.credit) || 0,
        date: String(ln.date || ""),
        referenceType: String(ln.referenceType || ""),
        referenceId: String(ln.referenceId || ""),
        memo: String(ln.memo || ""),
      };
    });
    rows.sort(function (a, b) {
      var c = a.date.localeCompare(b.date);
      if (c !== 0) return c;
      c = a.referenceType.localeCompare(b.referenceType);
      if (c !== 0) return c;
      c = a.referenceId.localeCompare(b.referenceId);
      if (c !== 0) return c;
      return a.accountId.localeCompare(b.accountId);
    });
    return JSON.stringify(rows);
  }
  if (normalizeLinesForCompare(r1.r.lines) !== normalizeLinesForCompare(r2.r.lines)) {
    return fail("Migration: rollback restore must reproduce identical economic journal", { len1: r1.r.lines.length, len2: r2.r.lines.length });
  }

  /* Snapshot validity: legacy content hash (structural) */
  try {
    var snap = buildFinancialSnapshot(
      { get: function () { return null; } },
      r1.r.lines,
      r1.r.chart || DEFAULT_GL_CHART,
      r1.invDer,
      { label: "migration-test" }
    );
    if (!validateSnapshotIntegrity(snap)) return fail("Migration: snapshot content hash invalid");
  } catch (e) {
    return fail("Migration: snapshot build", e && e.message);
  }

  pass("Migration / rollback safety (journal + inventory + snapshot hash)");
}
