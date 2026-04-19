/**
 * Cost of raw materials consumed via Inventory → Daily count (usage log).
 * - sumRawMaterialKitchenCostInRange: FIFO/WAC replay from inventoryEngine — matches GL kitchen COGS (5005).
 * - sumRawMaterialUsageCostInRange: legacy estimate qtyBase × latest purchase unit cost (reconciliation / POS-style).
 */
import { round2 } from "./moneyRound.js";
import { deriveInventoryEconomics } from "../accounting/inventoryEngine.js";

export function getLatestRawMaterialUnitCost(productId, onOrBeforeDateStr, state) {
  var p = (state.products || []).find(function (x) {
    return x && String(x.id) === String(productId);
  });
  var cap = String(onOrBeforeDateStr || "");
  var latest = null;
  (state.purchases || []).forEach(function (pu) {
    var pDate = String(pu && pu.date || "");
    if (!pDate || pDate > cap) return;
    (pu.items || []).forEach(function (li) {
      var lid = li && (li.id != null ? li.id : li.productId);
      if (!li || String(lid) !== String(productId)) return;
      if (!latest || pDate > latest.date) latest = { date: pDate, cost: Number(li.cost) || 0 };
    });
  });
  if (latest && latest.cost > 0) return round2(latest.cost);
  return round2(Number(p && p.cost) || 0);
}

/**
 * Sum base-qty × unit cost for raw_material rows in tc3_raw_material_usage, dates inclusive (YYYY-MM-DD).
 * Pass null/undefined for fromStr or toStr to leave that end unbounded.
 */
export function sumRawMaterialUsageCostInRange(state, fromStr, toStr) {
  var usages = Array.isArray(state.rawMaterialUsages) ? state.rawMaterialUsages : [];
  var fs = fromStr != null && String(fromStr) !== "" ? String(fromStr) : null;
  var ts = toStr != null && String(toStr) !== "" ? String(toStr) : null;
  var total = 0;
  usages.forEach(function (u) {
    if (!u || u.productId == null) return;
    var d = String(u.date || "");
    if (fs && d < fs) return;
    if (ts && d > ts) return;
    var p = (state.products || []).find(function (x) {
      return x && String(x.id) === String(u.productId);
    });
    if (String((p && p.type) || "").toLowerCase() !== "raw_material") return;
    var base = Number(u.qtyBase);
    if (!isFinite(base) || base <= 0) return;
    var uc = getLatestRawMaterialUnitCost(u.productId, d, state);
    total += round2(base * uc);
  });
  return round2(total);
}

function movementDateInRange(d, fromStr, toStr) {
  var fs = fromStr != null && String(fromStr) !== "" ? String(fromStr) : null;
  var ts = toStr != null && String(toStr) !== "" ? String(toStr) : null;
  var ds = String(d || "");
  if (fs && ds < fs) return false;
  if (ts && ds > ts) return false;
  return true;
}

/**
 * Kitchen ingredient COGS from inventory replay (same economics as GL Dr 5005 / Cr 1200).
 * Optional invDer avoids a second derive when caller already computed it.
 */
export function sumRawMaterialKitchenCostInRange(state, fromStr, toStr, invDerOpt) {
  var invDer = invDerOpt || deriveInventoryEconomics(state, null, {});
  var total = 0;
  (invDer.movements || []).forEach(function (mv) {
    if (!mv || mv.referenceType !== "raw_material_usage") return;
    if (!movementDateInRange(mv.date, fromStr, toStr)) return;
    var tc = mv.totalCost != null ? round2(mv.totalCost) : round2((mv.qtyOut || 0) * round2(mv.unitCost || 0));
    total += round2(tc);
  });
  return round2(total);
}

/**
 * Kitchen COGS summed by calendar month (YYYY-MM) — same replay economics as GL 5005 / monthlyBD.
 */
export function aggregateKitchenCostByMonthInRange(state, fromStr, toStr, invDerOpt) {
  var invDer = invDerOpt || deriveInventoryEconomics(state, null, {});
  var byMonth = {};
  (invDer.movements || []).forEach(function (mv) {
    if (!mv || mv.referenceType !== "raw_material_usage") return;
    if (!movementDateInRange(mv.date, fromStr, toStr)) return;
    var d = String(mv.date || "");
    var m = d.slice(0, 7);
    if (!m || m.length < 7) return;
    var tc = mv.totalCost != null ? round2(mv.totalCost) : round2((mv.qtyOut || 0) * round2(mv.unitCost || 0));
    byMonth[m] = round2((byMonth[m] || 0) + tc);
  });
  return byMonth;
}
