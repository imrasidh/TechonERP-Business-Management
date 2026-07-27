/** Shared helpers for certification dataset generation. */

export var CERT_ADMIN_PASSWORD = "cert1234";
/** Precomputed pbkdf2 for CERT_ADMIN_PASSWORD + salt "techon-cert-salt-v1" (100k iters). */
export var CERT_ADMIN_PASSWORD_HASH =
  "pbkdf2:100000:746563686f6e2d636572742d73616c742d7631:1d024777029ff2549bee93ae038d7406c0a72cf14943fc35c76434d07b9359d6";

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function intCost(base) {
  return Math.max(1, Math.round(base));
}

export function makeRng(seed) {
  var s = (seed >>> 0) || 1;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function rint(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function makeDateHelpers(baseIso) {
  var BASE = new Date(baseIso || "2026-07-01T12:00:00.000Z");
  function dateStr(offsetDays) {
    var d = new Date(BASE);
    d.setUTCDate(d.getUTCDate() - offsetDays);
    return d.toISOString().slice(0, 10);
  }
  function isoAt(date, h, m) {
    return date + "T" + String(h).padStart(2, "0") + ":" + String(m || 0).padStart(2, "0") + ":00.000Z";
  }
  /** Day offset within a business month bucket (0 = newest month). */
  function monthDay(monthIndex, dayInMonth, months) {
    var span = Math.max(1, months) * 30;
    var start = Math.floor((monthIndex / Math.max(1, months)) * span);
    var end = Math.floor(((monthIndex + 1) / Math.max(1, months)) * span);
    var day = start + Math.min(Math.max(0, dayInMonth), Math.max(0, end - start - 1));
    return dateStr(span - day);
  }
  return { dateStr: dateStr, isoAt: isoAt, monthDay: monthDay, BASE: BASE };
}

export function paymentHistoryEntry(id, date, amount, method, extra) {
  return Object.assign(
    { id: id, date: date, amount: round2(amount), cashMethod: method, note: "" },
    extra || {}
  );
}

export function applyTaxBundle(subTotal, taxPct, taxEnabled) {
  if (!taxEnabled || !(taxPct > 0)) {
    return {
      subTotal: round2(subTotal),
      totalTax: 0,
      total: round2(subTotal),
      selectedTaxes: [],
    };
  }
  var rate = round2(taxPct);
  var tax = round2(subTotal * (rate / 100));
  return {
    subTotal: round2(subTotal),
    totalTax: tax,
    total: round2(subTotal + tax),
    selectedTaxes: [{ name: "VAT", rate: rate, amount: tax }],
  };
}
