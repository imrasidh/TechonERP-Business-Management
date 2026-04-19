/**
 * Group recent GL inventory (1200) activity for reconciliation drill-down.
 */

import { GL, round2 } from "./generalLedger.js";

/** Signed effect on inventory asset (debit-normal INV): debit − credit */
function invSignedAmount(ln) {
  return round2(round2(ln.debit || 0) - round2(ln.credit || 0));
}

function absAmount(ln) {
  return Math.abs(invSignedAmount(ln));
}

function bucketForReferenceType(rt) {
  var t = String(rt || "").toLowerCase();
  if (t === "purchase") return "purchases";
  if (t === "sale_cogs") return "sales_cogs";
  if (t === "sales_return" || t === "sales_return_cogs") return "returns_sales";
  if (t === "purchase_return" || t === "purchase_return_refund") return "returns_purchase";
  if (t.indexOf("damage") >= 0 || t.indexOf("adjust") >= 0 || t.indexOf("stock") >= 0) return "adjustments";
  if (t === "sale" || t === "capital" || t === "expense" || t === "asset") return "other_gl";
  return "other";
}

/**
 * @param {Array} lines journal lines
 * @param {Array} chart GL accounts
 * @param {{ maxLines?: number, maxPerBucket?: number }} opts
 */
export function explainInventoryDifference(lines, chart, opts) {
  opts = opts || {};
  var maxLines = opts.maxLines != null ? opts.maxLines : 400;
  var maxPerBucket = opts.maxPerBucket != null ? opts.maxPerBucket : 8;
  var invNorm = "debit";
  (chart || []).forEach(function (a) {
    if (a.id === GL.INV) invNorm = a.normal === "credit" ? "credit" : "debit";
  });

  var buckets = {
    purchases: { label: "Purchases (stock-in)", rows: [], subtotal: 0 },
    sales_cogs: { label: "Sales / COGS", rows: [], subtotal: 0 },
    returns_sales: { label: "Sales returns", rows: [], subtotal: 0 },
    returns_purchase: { label: "Purchase returns", rows: [], subtotal: 0 },
    adjustments: { label: "Adjustments / other inventory", rows: [], subtotal: 0 },
    other_gl: { label: "Other GL pairs touching INV", rows: [], subtotal: 0 },
  };

  var flat = [];
  var i;
  var invLines = [];
  for (i = 0; i < (lines || []).length; i++) {
    if ((lines[i].accountId) === GL.INV) invLines.push(lines[i]);
  }
  invLines.sort(function (a, b) {
    var od = String(b.date || "").localeCompare(String(a.date || ""));
    if (od !== 0) return od;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
  var recent = invLines.slice(0, maxLines);

  for (i = 0; i < recent.length; i++) {
    var ln = recent[i];
    var rt = ln.referenceType || "";
    var b = bucketForReferenceType(rt);
    if (!buckets[b]) b = "adjustments";
    var row = {
      date: ln.date || "",
      referenceType: rt,
      referenceId: ln.referenceId,
      debit: round2(ln.debit || 0),
      credit: round2(ln.credit || 0),
      signedImpact: invNorm === "debit" ? invSignedAmount(ln) : round2(round2(ln.credit || 0) - round2(ln.debit || 0)),
      memo: (ln.memo || "").slice(0, 160),
      id: ln.id,
    };
    flat.push(row);
    var bucket = buckets[b];
    bucket.rows.push(row);
    bucket.subtotal = round2(bucket.subtotal + absAmount(ln));
  }

  var topContributors = flat.slice().sort(function (a, b) {
    return Math.abs(b.signedImpact || 0) - Math.abs(a.signedImpact || 0);
  }).slice(0, maxPerBucket);

  Object.keys(buckets).forEach(function (k) {
    var bk = buckets[k];
    bk.rows = bk.rows.sort(function (a, b) {
      return Math.abs(b.signedImpact || 0) - Math.abs(a.signedImpact || 0);
    }).slice(0, maxPerBucket);
  });

  return {
    inventoryNormal: invNorm,
    buckets: buckets,
    topContributors: topContributors,
  };
}
