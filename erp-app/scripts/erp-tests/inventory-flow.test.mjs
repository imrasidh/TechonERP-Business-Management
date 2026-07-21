/**
 * Inventory economics + GL reconciliation (inventory “flow” invariants).
 */
import { deriveInventoryEconomics } from "../../src/accounting/inventoryEngine.js";
import { reconcileInventoryToLedger } from "../../src/accounting/inventoryEngine.js";
import { rebuildJournalFromState, DEFAULT_GL_CHART, GL } from "../../src/accounting/generalLedger.js";

function uid() {
  return "inv_" + Math.random().toString(36).slice(2, 9);
}

export function runInventoryFlowTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

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
    settings: { inventoryCostingMethod: "wac", taxEnabled: false, glVatPostingEnabled: false },
    products: [{ id: "p1", productId: "1", name: "T", stock: 5, cost: 10, sellPrice: 20 }],
    purchases: [
      {
        id: "pur1",
        date: "2026-06-01",
        total: 100,
        totalTax: 0,
        items: [{ id: "p1", productId: "p1", inputQty: 10, qty: 10, cost: 10 }],
        paymentHistory: [],
      },
    ],
    sales: [],
    salesReturns: [],
    purchaseReturns: [],
    customers: [],
    suppliers: [],
    expenses: [],
  };

  var invDer = deriveInventoryEconomics(state, Smock);
  if (!invDer || invDer.physicalInventoryValue == null) return fail("Inventory derive: physical value");

  var r = rebuildJournalFromState(state, Smock, uid, invDer);
  if (!r.validate.ok) return fail("Inventory flow: journal validate", r.validate);

  var rec = reconcileInventoryToLedger(r.lines, invDer, r.chart || DEFAULT_GL_CHART);
  if (!rec.ok) return fail("Inventory flow: reconcile vs GL", rec);

  pass("Inventory economics + inventory vs GL reconciliation");

  /* Damage / stock removal posts GL damage expense via damageLog replay */
  var stateDmg = {
    settings: { inventoryCostingMethod: "wac", taxEnabled: false, glVatPostingEnabled: false },
    products: [{ id: "p1", name: "T", stock: 3, cost: 10 }],
    purchases: [
      {
        id: "pur1",
        date: "2026-06-01",
        total: 50,
        items: [{ id: "p1", qty: 5, cost: 10 }],
        paymentHistory: [],
      },
    ],
    sales: [],
    salesReturns: [],
    purchaseReturns: [],
    customers: [],
    suppliers: [],
    expenses: [],
    damageLog: [
      { id: "dmg1", date: "2026-07-01", productId: "p1", qty: 2, cost: 10, reason: "Stock removal: test" },
    ],
  };
  var invDmg = deriveInventoryEconomics(stateDmg, Smock);
  var rDmg = rebuildJournalFromState(stateDmg, Smock, uid, invDmg);
  if (!rDmg.validate.ok) return fail("Damage GL: journal validate", rDmg.validate);
  var dmgDebit = (rDmg.lines || []).filter(function (ln) {
    return ln && ln.accountId === GL.DAMAGE && (ln.debit || 0) > 0;
  });
  if (!dmgDebit.length) return fail("Damage GL: expected DAMAGE debit lines");
  if (Math.abs((dmgDebit[0].debit || 0) - 20) > 0.02) {
    return fail("Damage GL: expected ~20 damage expense", dmgDebit[0].debit);
  }

  pass("Inventory damage write-off posts GL DAMAGE expense");
}
