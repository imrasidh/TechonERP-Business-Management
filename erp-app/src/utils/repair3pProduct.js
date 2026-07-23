/** 3rd-party repair products — shop-wide forever #NNNN codes; not retail inventory. */

export var REPAIR_3P_SEQ_KEY = "tc3_repair3p_product_seq";
export var REPAIR_3P_SEQ_START = 1001;

/** True for repair-only 3P products (unsold and sold). Excluded from Inventory / Sales search / name suggestions. */
export function isRepair3pInternalProduct(p) {
  if (!p) return false;
  if (p._repair3pOneTime === true || p._repairInternal === true) return true;
  return !!(p._repairId && String(p.category || "").toLowerCase() === "repair 3rd party");
}

export function isRepair3pSoldProduct(p) {
  return !!(p && (p._repairSold === true || (isRepair3pInternalProduct(p) && (p.stock || 0) <= 0)));
}

export function parseRepair3pCodeNum(code) {
  var m = String(code || "").trim().match(/^#(\d+)$/);
  if (!m) return null;
  var n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function readSeq(S) {
  var n = parseInt(S.get(REPAIR_3P_SEQ_KEY, REPAIR_3P_SEQ_START), 10);
  if (!Number.isFinite(n) || n < REPAIR_3P_SEQ_START) n = REPAIR_3P_SEQ_START;
  return n;
}

/** Next forever code without consuming the counter (for receive-form default name). */
export function peekRepair3pCode(S) {
  return "#" + readSeq(S);
}

/** Allocate next forever shop-wide code (#1001, #1002, …). */
export function nextRepair3pCode(S) {
  var n = readSeq(S);
  S.set(REPAIR_3P_SEQ_KEY, n + 1);
  return "#" + n;
}

/**
 * Default editable name: "#1001 Lenovo Yoga Laptop Repair 3P"
 * @param {string} code e.g. "#1001"
 */
export function defaultRepair3pProductName(code, repair, device) {
  var c = String(code || "").trim() || "#????";
  var d = device || {};
  var bits = [d.brand, d.modelNo, d.deviceType || "Device", "Repair 3P"]
    .map(function (x) { return String(x || "").trim(); })
    .filter(Boolean);
  return (c + " " + bits.join(" ")).replace(/\s+/g, " ").trim();
}

/**
 * Migrate legacy RP3P-* / uncoded repair 3P rows to forever #NNNN productIds.
 * Also marks zero-stock rows as sold (hidden, not deleted).
 * Returns { products, changed }.
 */
export function migrateRepair3pProducts(products, S) {
  var list = Array.isArray(products) ? products.slice() : [];
  var maxCode = REPAIR_3P_SEQ_START - 1;
  var i;
  for (i = 0; i < list.length; i++) {
    var p0 = list[i];
    if (!isRepair3pInternalProduct(p0)) continue;
    var n0 = parseRepair3pCodeNum(p0.productId);
    if (n0 != null) maxCode = Math.max(maxCode, n0);
  }

  var next = maxCode + 1;
  var changed = false;
  list = list.map(function (p) {
    if (!isRepair3pInternalProduct(p)) return p;
    var upd = Object.assign({}, p);
    var codeNum = parseRepair3pCodeNum(upd.productId);
    if (codeNum == null) {
      upd.productId = "#" + next;
      next++;
      changed = true;
    }
    var name = String(upd.name || "").trim();
    if (!name || !name.startsWith("#")) {
      var legacy = name.replace(/^3P\s*Repair\s*-?\s*/i, "").trim() || "Repair 3P";
      upd.name = upd.productId + " " + legacy;
      changed = true;
    }
    if ((upd.stock || 0) <= 0 && upd._repairSold !== true) {
      upd._repairSold = true;
      changed = true;
    }
    if (upd._repair3pOneTime !== true || upd._repairInternal !== true) {
      upd._repair3pOneTime = true;
      upd._repairInternal = true;
      changed = true;
    }
    return upd;
  });

  if (S) {
    var stored = readSeq(S);
    if (stored < next) S.set(REPAIR_3P_SEQ_KEY, next);
  }
  return { products: list, changed: changed };
}

/**
 * Keep repair 3P sold flag in sync with stock: sold (hidden) when stock hits 0;
 * unsold again if stock is restored (void / edit). Never deletes the product.
 */
export function applyRepair3pStockFlags(product, nextStock) {
  if (!isRepair3pInternalProduct(product)) {
    return Object.assign({}, product, { stock: nextStock });
  }
  var sold = (nextStock || 0) <= 0;
  return Object.assign({}, product, { stock: nextStock, _repairSold: sold });
}

/** After a sale deducts stock, mark repair 3P products sold when stock hits 0 (hide, don't delete). */
export function markRepair3pSoldAfterStockDeduct(product, nextStock) {
  if (!isRepair3pInternalProduct(product)) return product;
  return applyRepair3pStockFlags(product, nextStock);
}
