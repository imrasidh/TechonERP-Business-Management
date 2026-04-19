/**
 * Daily inventory reconciliation series (engine value vs GL 1200 through date).
 */

import { deriveInventoryEconomics, inventoryAccountBalanceThroughDate } from "./inventoryEngine.js";
import { round2 } from "./generalLedger.js";

function enumerateInclusiveDays(fromStr, toStr) {
  var out = [];
  var a = String(fromStr || "").slice(0, 10);
  var b = String(toStr || "").slice(0, 10);
  if (!a || !b || a.length < 10 || b.length < 10) return out;
  var partsA = a.split("-");
  var partsB = b.split("-");
  var y1 = parseInt(partsA[0], 10);
  var m1 = parseInt(partsA[1], 10);
  var d1 = parseInt(partsA[2], 10);
  var y2 = parseInt(partsB[0], 10);
  var m2 = parseInt(partsB[1], 10);
  var d2 = parseInt(partsB[2], 10);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return out;
  var dt = new Date(Date.UTC(y1, m1 - 1, d1));
  var end = new Date(Date.UTC(y2, m2 - 1, d2));
  if (isNaN(dt.getTime()) || isNaN(end.getTime()) || end < dt) return out;
  var guard = 0;
  while (dt <= end && guard < 800) {
    out.push(dt.toISOString().slice(0, 10));
    dt.setUTCDate(dt.getUTCDate() + 1);
    guard++;
  }
  return out;
}

/**
 * @returns {{ date: string, physicalValue: number, glBalance: number, delta: number }[]}
 */
export function buildInventoryReconTimeSeries(state, S, lines, chart, fromDate, toDate) {
  var days = enumerateInclusiveDays(fromDate, toDate);
  var out = [];
  var i;
  for (i = 0; i < days.length; i++) {
    var day = days[i];
    var invDer = deriveInventoryEconomics(state, S, { asOfDate: day });
    var gl = inventoryAccountBalanceThroughDate(lines, chart, day);
    var phys = invDer.physicalInventoryValue != null ? invDer.physicalInventoryValue : 0;
    out.push({
      date: day,
      physicalValue: round2(phys),
      glBalance: round2(gl),
      delta: round2(round2(gl) - round2(phys)),
    });
  }
  return out;
}
