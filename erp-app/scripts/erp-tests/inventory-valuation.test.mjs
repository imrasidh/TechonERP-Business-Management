/**
 * Purchase line valuation + raw material daily qty helpers.
 */
import { factorForNamedUnit } from "../../src/units/productUnits.js";
import {
  normalizePurchaseLineItem,
  normalizePurchaseLineEconomics,
  purchaseLineStockTotal,
  sumPurchaseLinesStockTotal,
  COST_INPUT_PER_INPUT,
  COST_INPUT_PER_BASE,
} from "../../src/utils/purchaseValuation.js";
import {
  netPurchasedBaseQtyForDate,
  rawMaterialOpeningQty,
} from "../../src/utils/rawMaterialQty.js";
import { catalogSellPricePerBaseFromLine } from "../../src/utils/purchaseUnitGuard.js";

function toProductBaseQty(qty, inputUnit, product) {
  var q = parseFloat(qty) || 0;
  var f = factorForNamedUnit(product, inputUnit || product.unit || "kg");
  if (f != null && f > 0) return Math.round(q * f * 1000000) / 1000000;
  return q;
}

export function runInventoryValuationTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  /* Multi-unit sack → kg: 2 sacks @ 2500/sack = 5000; base 100 kg → 50/kg */
  var flour = {
    id: "flour1",
    unit: "kg",
    units: [
      { name: "kg", factor: 1, sellPrice: 120, cost: 60 },
      { name: "Sack", factor: 50, sellPrice: 5500, cost: 2500 },
    ],
  };
  var lineIn = {
    id: flour.id,
    qty: 100,
    inputQty: 2,
    inputUnit: "Sack",
    cost: 2500,
    costInputMode: COST_INPUT_PER_INPUT,
  };
  var norm = normalizePurchaseLineItem(lineIn, flour, toProductBaseQty);
  if (Math.abs(norm.cost - 50) > 0.02) return fail("Multi-unit: per-kg cost", norm.cost);
  if (Math.abs(purchaseLineStockTotal(norm) - 5000) > 0.05) return fail("Multi-unit: line stock total", purchaseLineStockTotal(norm));

  /* CASE 1: 1 sack (25 kg), cost per sack 2875 → baseQty 25, 115/kg, value 2875 */
  var sackKg = {
    id: "sk1",
    unit: "kg",
    units: [
      { name: "kg", factor: 1, sellPrice: 0, cost: 115 },
      { name: "sack", factor: 25, sellPrice: 0, cost: 2875 },
    ],
  };
  var eSack = normalizePurchaseLineEconomics(1, "sack", 2875, sackKg, toProductBaseQty, COST_INPUT_PER_INPUT);
  if (Math.abs(eSack.baseQty - 25) > 0.001) return fail("CASE1 baseQty", eSack.baseQty);
  if (Math.abs(eSack.unitCostBase - 115) > 0.02) return fail("CASE1 unitCostBase", eSack.unitCostBase);
  if (Math.abs(eSack.lineStockValue - 2875) > 0.05) return fail("CASE1 lineStockValue", eSack.lineStockValue);

  /* CASE 2: 25 kg @ 115/kg → total 2875 */
  var eKg = normalizePurchaseLineEconomics(25, "kg", 115, sackKg, toProductBaseQty, COST_INPUT_PER_BASE);
  if (Math.abs(eKg.baseQty - 25) > 0.001) return fail("CASE2 baseQty", eKg.baseQty);
  if (Math.abs(eKg.unitCostBase - 115) > 0.02) return fail("CASE2 unitCostBase", eKg.unitCostBase);
  if (Math.abs(eKg.lineStockValue - 2875) > 0.05) return fail("CASE2 lineStockValue", eKg.lineStockValue);

  /* CASE 3: edit line (2 sacks @ 2875/sack) stays consistent after normalize */
  var lineOneSack = normalizePurchaseLineItem(
    {
      id: sackKg.id,
      inputQty: 1,
      inputUnit: "sack",
      cost: 2875,
      costInputMode: COST_INPUT_PER_INPUT,
    },
    sackKg,
    toProductBaseQty
  );
  if (Math.abs(lineOneSack.cost - 115) > 0.02) return fail("CASE3 first normalize cost", lineOneSack.cost);
  if (Math.abs(purchaseLineStockTotal(lineOneSack) - 2875) > 0.1) return fail("CASE3 first total", purchaseLineStockTotal(lineOneSack));
  var lineTwoSack = normalizePurchaseLineItem(
    {
      id: sackKg.id,
      inputQty: 2,
      inputUnit: "sack",
      cost: 2875,
      costInputMode: COST_INPUT_PER_INPUT,
    },
    sackKg,
    toProductBaseQty
  );
  if (Math.abs(lineTwoSack.qty - 50) > 0.001) return fail("CASE3 edit baseQty", lineTwoSack.qty);
  if (Math.abs(lineTwoSack.cost - 115) > 0.02) return fail("CASE3 edit unit cost", lineTwoSack.cost);
  if (Math.abs(purchaseLineStockTotal(lineTwoSack) - 5750) > 0.1) return fail("CASE3 edit line total", purchaseLineStockTotal(lineTwoSack));

  /* Edit qty (base) only — totals follow qty × unit cost (lineStockValue recalculated in UI) */
  var edited = Object.assign({}, norm, { qty: 50, lineStockValue: 2500 });
  var norm2 = normalizePurchaseLineItem(edited, flour, toProductBaseQty);
  if (Math.abs(norm2.cost - 50) > 0.02) return fail("Edit qty: unit cost unchanged", norm2.cost);
  if (Math.abs(purchaseLineStockTotal(norm2) - 2500) > 1) return fail("Edit qty: line total", purchaseLineStockTotal(norm2));

  /* Invoice stock lines sum */
  var sum = sumPurchaseLinesStockTotal([norm, { qty: 10, cost: 5 }]);
  if (Math.abs(sum - 5050) > 0.1) return fail("Sum purchase lines", sum);

  /* Net purchased = gross − returns */
  var state = {
    purchases: [
      {
        date: "2026-04-10",
        items: [{ id: "rm1", qty: 100, cost: 40, lineStockValue: 4000 }],
      },
    ],
    purchaseReturns: [{ date: "2026-04-10", productId: "rm1", qty: 25 }],
    damageLog: [],
  };
  var net = netPurchasedBaseQtyForDate("rm1", "2026-04-10", state);
  if (net !== 75) return fail("Net purchased qty", net);

  var stateNeg = {
    purchases: [{ date: "2026-04-10", items: [{ id: "rm1", qty: 10, cost: 1 }] }],
    purchaseReturns: [{ date: "2026-04-10", productId: "rm1", qty: 25 }],
  };
  var netNeg = netPurchasedBaseQtyForDate("rm1", "2026-04-10", stateNeg);
  if (netNeg !== -15) return fail("Net purchased can be negative when returns exceed purchases", netNeg);

  /* Raw opening: future snapshot must not leak into past dates */
  var counts = [
    { date: "2026-04-05", items: [{ productId: "rm2", closingQty: 42 }] },
    { date: "2026-04-08", items: [{ productId: "rm2", closingQty: 10 }] },
  ].sort(function (a, b) {
    return String(a.date) < String(b.date) ? -1 : 1;
  });
  var past = rawMaterialOpeningQty(undefined, "rm2", "2026-04-03", counts);
  if (past.openingQty !== 0 || !past.isMissingOpening) return fail("Opening before any count", past);

  var anchored = rawMaterialOpeningQty(undefined, "rm2", "2026-04-06", counts);
  if (anchored.openingQty !== 42 || anchored.isMissingOpening) return fail("Opening from latest prior snapshot (strictly before date)", anchored);

  var latestPrior = rawMaterialOpeningQty(undefined, "rm2", "2026-04-09", counts);
  if (latestPrior.openingQty !== 10 || latestPrior.isMissingOpening) return fail("Opening uses most recent prior count, not earliest", latestPrior);

  var priorUse = rawMaterialOpeningQty(99, "rm2", "2026-04-10", counts);
  if (priorUse.openingQty !== 99 || priorUse.isMissingOpening) return fail("Opening prefers prior snapshot closing", priorUse);

  /* Base unit Kg + pack-total sell (3375 for 25 kg) → catalogue price per Kg = 135 */
  var riceKg = {
    id: "rice1",
    unit: "Kg",
    units: [
      { name: "Kg", factor: 1, sellPrice: 120, cost: 60 },
    ],
    price: 120,
    cost: 60,
  };
  var mockGetCost = function (p, u) {
    return Number(p && p.cost) || 0;
  };
  var mockGetSell = function (p, u) {
    return Number(p && p.price) || 0;
  };
  var packTotalLine = {
    inputUnit: "Kg",
    inputQty: 25,
    qty: 25,
    sellPrice: 3375,
    cost: 60,
  };
  var catPerBase = catalogSellPricePerBaseFromLine(packTotalLine, riceKg, toProductBaseQty, mockGetCost, mockGetSell);
  if (Math.abs(catPerBase - 135) > 0.01) return fail("Pack-total sell on base unit → per-base catalogue price", catPerBase);

  /* Raw material with already-corrupted catalogue sell should still normalize base-unit line totals */
  var chilli = {
    id: "ch1",
    unit: "Kg",
    type: "raw_material",
    units: [{ name: "Kg", factor: 1, sellPrice: 15000, cost: 800 }],
    price: 15000,
    cost: 800,
  };
  var chilliLine = {
    inputUnit: "Kg",
    inputQty: 15,
    qty: 15,
    sellPrice: 15000,
    cost: 800,
  };
  var chilliBaseSell = catalogSellPricePerBaseFromLine(chilliLine, chilli, toProductBaseQty, mockGetCost, mockGetSell);
  if (Math.abs(chilliBaseSell - 1000) > 0.01) return fail("Raw material base-line total sell -> per-base catalogue price", chilliBaseSell);

  var sugarStock = {
    id: "sg1",
    unit: "Kg",
    type: "stock",
    units: [{ name: "Kg", factor: 1, sellPrice: 15000, cost: 800 }],
    price: 15000,
    cost: 800,
  };
  var sugarLine = {
    inputUnit: "Kg",
    inputQty: 15,
    qty: 15,
    sellPrice: 15000,
    cost: 800,
  };
  var sugarBaseSell = catalogSellPricePerBaseFromLine(sugarLine, sugarStock, toProductBaseQty, mockGetCost, mockGetSell);
  if (Math.abs(sugarBaseSell - 1000) > 0.01) return fail("Stock base-unit line total sell -> per-base catalogue price", sugarBaseSell);

  pass("Purchase valuation + raw material qty helpers");
}

