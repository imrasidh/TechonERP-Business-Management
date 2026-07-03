/**
 * Document numbers (invoices, purchases, quotations, returns).
 * Format: PREFIX-YYYYMMDD-TERM-NNNN
 *   TERM = MAIN (server) | 4-char counter id | LOC1 (standalone)
 *   NNNN = daily sequence per prefix per terminal (localStorage)
 * Counters cannot collide; save-time scan catches any synced duplicate.
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayYmd() {
  var d = new Date();
  return String(d.getFullYear()) + pad2(d.getMonth() + 1) + pad2(d.getDate());
}

export function getDocTerminalSuffix() {
  try {
    if (typeof window !== "undefined") {
      var role = window._tcNetRole;
      if (role === "network_server") return "MAIN";
      if (role === "network_client") {
        var id = localStorage.getItem("tc_net_client_id");
        if (id && typeof id === "string") {
          var clean = id.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
          if (clean.length >= 4) return clean.slice(-4);
          if (clean.length > 0) return clean.padStart(4, "0");
        }
      }
    }
  } catch (_e) {}
  return "LOC1";
}

export function generateDocumentNumber(prefix) {
  var p = prefix || "INV";
  var day = todayYmd();
  var term = getDocTerminalSuffix();
  var seqKey = "tc_docseq_" + p + "_" + day + "_" + term;
  var seq = 1;
  try {
    seq = parseInt(localStorage.getItem(seqKey) || "0", 10) + 1;
    localStorage.setItem(seqKey, String(seq));
  } catch (_e2) {
    seq = (Date.now() % 9999) + 1;
  }
  return p + "-" + day + "-" + term + "-" + String(seq).padStart(4, "0");
}

export function docNumberExists(no, state, opts) {
  if (!no || !state) return false;
  opts = opts || {};
  var excludeSaleId = opts.excludeSaleId;
  var excludePurchaseId = opts.excludePurchaseId;
  var excludeQuotationId = opts.excludeQuotationId;

  if ((state.sales || []).some(function (s) {
    return s.invoiceNo === no && s.id !== excludeSaleId;
  })) return true;

  if ((state.purchases || []).some(function (p) {
    return p.invoiceNo === no && p.id !== excludePurchaseId;
  })) return true;

  if ((state.quotations || []).some(function (q) {
    return q.quotationNo === no && q.id !== excludeQuotationId;
  })) return true;

  if ((state.salesReturns || []).some(function (r) {
    return r.returnId === no;
  })) return true;

  if ((state.purchaseReturns || []).some(function (r) {
    return r.returnId === no;
  })) return true;

  return false;
}

/** Return a document number that is not already used in local state (re-gen if needed). */
export function ensureUniqueDocumentNumber(proposed, prefix, state, opts) {
  var p = prefix || "INV";
  var no = proposed || generateDocumentNumber(p);
  var guard = 0;
  while (docNumberExists(no, state, opts) && guard < 300) {
    no = generateDocumentNumber(p);
    guard++;
  }
  return no;
}
