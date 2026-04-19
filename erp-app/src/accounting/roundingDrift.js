/**
 * Dev-only warnings when aggregating many money values: sum(round) vs round(sum).
 */

import { round2 } from "./generalLedger.js";

var isDev = function () {
  try {
    return (
      (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV === true) ||
      (typeof process !== "undefined" && process.env && process.env.NODE_ENV === "development")
    );
  } catch (e) {
    return false;
  }
};

/**
 * A) round2(sum of raw) vs B) sum of round2(each). Returns { a, b, drift }.
 */
export function compareRoundSumMethods(numbers) {
  var raw = 0;
  var sumR = 0;
  var i;
  for (i = 0; i < (numbers || []).length; i++) {
    var n = Number(numbers[i]) || 0;
    raw += n;
    sumR += round2(n);
  }
  return { a: round2(raw), b: round2(sumR), drift: round2(round2(raw) - round2(sumR)) };
}

/**
 * If |A - B| > tol, log a dev warning with label + optional context (object).
 */
export function warnIfAggregateRoundingDrift(label, numbers, tol, context) {
  tol = tol != null ? tol : 0.01;
  var cmp = compareRoundSumMethods(numbers || []);
  if (Math.abs(cmp.drift) <= tol) return cmp;
  if (!isDev()) return cmp;
  try {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[TechonERP] aggregate rounding drift", label, { A_sumRoundRaw: cmp.a, B_sumOfRound2: cmp.b, drift: cmp.drift, context: context || null });
    }
  } catch (e) { /* ignore */ }
  return cmp;
}
