/**
 * TechonERP Certification Dataset Generator — Computer Shop (Phase 1).
 *
 * Builds a realistic multi-month computer sales & repair company as operational
 * documents, then attaches GL / inventory snapshots via the SAME production engines
 * used by the live app (rebuildJournalFromState + deriveInventoryEconomics).
 *
 * Does not bypass accounting or inventory rules: stock is tracked chronologically;
 * negative-stock attempts are recorded as blocked warnings when policy is Block.
 */

import {
  rebuildJournalFromState,
  DEFAULT_GL_CHART,
  hashJournalLines,
  profitAndLossFromLedger,
} from "../accounting/generalLedger.js";
import {
  deriveInventoryEconomics,
  reconcileInventoryToLedger,
  serializeInventoryLayers,
} from "../accounting/inventoryEngine.js";
import { resolveCertScale } from "./sizes.js";
import {
  CERT_PRODUCT_TEMPLATES,
  CERT_SERVICE_SKUS,
  CERT_CUSTOMER_NAMES,
  CERT_SUPPLIER_NAMES,
  CERT_OTHER_NAMES,
  CERT_REPAIR_PROBLEMS,
  CERT_BANKS,
  CERT_EXPENSE_CATS,
  CERT_BRANDS,
} from "./catalogComputerShop.js";
import {
  CERT_ADMIN_PASSWORD,
  CERT_ADMIN_PASSWORD_HASH,
  round2,
  intCost,
  makeRng,
  rint,
  pick,
  makeDateHelpers,
  paymentHistoryEntry as ph,
  applyTaxBundle,
} from "./util.js";
import { verifyCertificationDataset } from "./verifyCertificationDataset.js";

function progress(onProgress, phase, pct, detail) {
  if (typeof onProgress === "function") {
    try {
      onProgress({ phase: phase, pct: pct, detail: detail || "" });
    } catch (e) { /* ignore UI errors */ }
  }
}

function purchaseQty(rng, prod) {
  var cost = prod.cost || 0;
  if (cost >= 100000) return rint(rng, 1, 5);
  if (cost >= 40000) return rint(rng, 2, 10);
  if (cost >= 10000) return rint(rng, 4, 20);
  return rint(rng, 8, 40);
}

function normalizeOptions(raw) {
  var o = raw || {};
  var taxOn = o.taxEnabled === true || o.tax === "ON" || o.tax === "on";
  var taxPct = Number(o.taxPercent != null ? o.taxPercent : o.taxPercentage);
  if (!isFinite(taxPct) || taxPct < 0) taxPct = 15;
  var neg = String(o.negativeStock || o.negativeStockPolicy || "block").toLowerCase();
  var costing = String(o.inventoryCosting || o.costing || "wac").toLowerCase();
  if (costing !== "fifo") costing = "wac";
  return {
    businessType: o.businessType || "computer_shop",
    country: o.country || "Sri Lanka",
    currency: o.currency || "Rs",
    inventoryCostingMethod: costing,
    taxEnabled: taxOn,
    taxPercent: taxPct,
    preventNegativeStock: neg !== "allow",
    datasetSize: o.datasetSize || o.size || "medium",
    seed: o.seed != null ? Number(o.seed) : 20260725,
    shopName: o.shopName || "Techon Certification Computers",
    includeEmployees: o.includeEmployees !== false,
  };
}

function attachGlSnapshot(data) {
  var glSeq = 0;
  var state = {
    settings: data.tc3_settings || {},
    products: data.tc3_products || [],
    customers: data.tc3_customers || [],
    suppliers: data.tc3_suppliers || [],
    sales: data.tc3_sales || [],
    purchases: data.tc3_purchases || [],
    expenses: data.tc3_expenses || [],
    salesReturns: data.tc3_salesReturns || [],
    purchaseReturns: data.tc3_purchaseReturns || [],
    cheques: data.tc3_cheques || [],
    repairs: data.tc3_repairs || [],
    manualPayables: data.tc3_manualPayables || [],
    damageLog: data.tc3_damageLog || [],
    assets: data.tc3_assets || [],
  };
  var smock = {
    get: function (k, def) {
      return data[k] !== undefined ? data[k] : def;
    },
  };
  var invDer = deriveInventoryEconomics(state, smock);
  var r = rebuildJournalFromState(state, smock, function () {
    glSeq += 1;
    return "cert_gl_" + glSeq;
  }, invDer);
  if (!r || !r.validate || !r.validate.ok || !r.lines || !r.lines.length) {
    return { ok: false, message: "GL rebuild failed", validate: r && r.validate };
  }
  data.tc3_journal_lines = r.lines;
  data.tc3_gl_accounts = r.chart || DEFAULT_GL_CHART;
  data.tc3_gl_mode = "live";
  data.tc3_journal_hash = hashJournalLines(r.lines);
  data.tc3_inventory_layers = serializeInventoryLayers(invDer.layersByProduct || {});
  data.tc3_inv_reconciliation = reconcileInventoryToLedger(r.lines, invDer, r.chart || DEFAULT_GL_CHART);
  data.tc3_stock_movements = (invDer.movements || []).slice(-5000);
  return { ok: true, invDer: invDer, rebuild: r };
}

/**
 * @param {object} rawOptions
 * @param {function} [onProgress]
 * @returns {Promise<{ backup: object, summary: object, verification: object, warnings: string[] }>}
 */
export async function buildCertificationDataset(rawOptions, onProgress) {
  var opts = normalizeOptions(rawOptions);
  if (opts.businessType !== "computer_shop" && opts.businessType !== "Computer Shop") {
    throw new Error("Phase 1 supports Computer Shop only. Glass Industry / General Trading are reserved for future releases.");
  }

  var scale = resolveCertScale(opts.datasetSize);
  var rng = makeRng(opts.seed);
  var dates = makeDateHelpers("2026-07-01T12:00:00.000Z");
  var dateStr = dates.dateStr;
  var isoAt = dates.isoAt;
  var warnings = [];
  var stockLedger = {};
  var cheques = [];
  var chSeq = 0;

  function trackStock(pid, delta) {
    stockLedger[pid] = round2((stockLedger[pid] || 0) + delta);
  }
  function availStock(pid) {
    return Math.max(0, stockLedger[pid] || 0);
  }
  function tryConsumeStock(pid, qty, context) {
    var have = availStock(pid);
    if (have >= qty) {
      trackStock(pid, -qty);
      return { ok: true, qty: qty };
    }
    if (!opts.preventNegativeStock) {
      trackStock(pid, -qty);
      warnings.push("Negative stock allowed: " + context + " (had " + have + ", took " + qty + ")");
      return { ok: true, qty: qty, negative: true };
    }
    warnings.push("Blocked out-of-stock / negative attempt: " + context + " (available " + have + ", requested " + qty + ")");
    return { ok: false, qty: 0 };
  }

  progress(onProgress, "Company & settings", 4);

  /* ── Products ── */
  var products = [];
  var i;
  var STOCK_N = scale.stockProducts;
  for (i = 0; i < STOCK_N; i++) {
    var tpl = CERT_PRODUCT_TEMPLATES[i % CERT_PRODUCT_TEMPLATES.length];
    var variant = i >= CERT_PRODUCT_TEMPLATES.length
      ? " (" + CERT_BRANDS[i % CERT_BRANDS.length] + " batch " + (Math.floor(i / CERT_PRODUCT_TEMPLATES.length) + 1) + ")"
      : "";
    var cost = intCost(tpl.cost * (0.94 + (i % 6) * 0.015));
    var price = intCost(tpl.price * (0.96 + (i % 5) * 0.02));
    products.push({
      id: "cert-p-" + i,
      productId: String(3000 + i),
      name: tpl.name + variant,
      barcode: "CT" + String(800000 + i),
      category: tpl.cat,
      brand: tpl.brand || "",
      type: "stock",
      unit: "Pcs",
      cost: cost,
      price: price,
      stock: 0,
      damaged: 0,
      description: i % 5 === 0 ? "Certified retail unit" : "",
      require_comment: false,
      comment_label: "Comment",
      createdAt: isoAt(dateStr(scale.months * 30 + 5), 9, rint(rng, 0, 59)),
    });
  }
  CERT_SERVICE_SKUS.forEach(function (svc, si) {
    products.push({
      id: "cert-svc-" + si,
      productId: String(9100 + si),
      name: svc.name,
      barcode: "",
      category: "Services",
      brand: "",
      type: "service",
      unit: "Job",
      cost: 0,
      price: intCost(svc.price),
      stock: 0,
      damaged: 0,
      description: "Service charge",
      require_comment: true,
      comment_label: "Job details",
      createdAt: isoAt(dateStr(scale.months * 30), 10, 0),
    });
  });

  progress(onProgress, "Master data", 10);

  var customers = [];
  for (i = 0; i < scale.customers; i++) {
    customers.push({
      id: "cert-c-" + i,
      name: i < CERT_CUSTOMER_NAMES.length ? CERT_CUSTOMER_NAMES[i] : "Client " + String.fromCharCode(65 + (i % 26)) + " " + (i + 1),
      phone: "077" + String(4000000 + i * 137).slice(0, 7),
      address: ["Colombo 03", "Kandy", "Negombo", "Gampaha", "Matara", "Kurunegala"][i % 6],
      credit: 0,
      totalSpent: 0,
      createdAt: isoAt(dateStr(rint(rng, 20, scale.months * 30)), 8, rint(rng, 0, 59)),
    });
  }

  var suppliers = [];
  for (i = 0; i < scale.suppliers; i++) {
    suppliers.push({
      id: "cert-s-" + i,
      name: i < CERT_SUPPLIER_NAMES.length ? CERT_SUPPLIER_NAMES[i] : "Wholesale Partner " + (i + 1),
      phone: "011" + String(7000000 + i * 211).slice(0, 7),
      email: i % 3 === 0 ? "orders@supplier" + (i + 1) + ".lk" : "",
      address: ["Colombo 10", "Peliyagoda", "Nugegoda", "Dehiwala"][i % 4],
      note: i % 4 === 0 ? "Net 30 terms" : "",
      payable: 0,
      createdAt: isoAt(dateStr(rint(rng, 25, scale.months * 30 + 10)), 9, 0),
    });
  }

  var others = [];
  for (i = 0; i < scale.others; i++) {
    others.push({
      id: "cert-o-" + i,
      name: (i < CERT_OTHER_NAMES.length ? CERT_OTHER_NAMES[i] : "Other Party " + (i + 1)),
      phone: "011" + String(6100000 + i * 173).slice(0, 7),
      address: ["Colombo 01", "Colombo 03", "Nugegoda", "Rajagiriya"][i % 4],
      note: ["Courier", "Landlord", "Service provider", "Referral"][i % 4],
      createdAt: isoAt(dateStr(rint(rng, 10, scale.months * 30)), 9, rint(rng, 0, 59)),
    });
  }

  var employees = [];
  if (opts.includeEmployees) {
    employees = [
      { id: "cert-emp-1", name: "Rashid Ahmed", role: "Owner / Technician", phone: "0771234567" },
      { id: "cert-emp-2", name: "Amjad Farook", role: "Sales", phone: "0772345678" },
      { id: "cert-emp-3", name: "Fazil Mohamed", role: "Workshop", phone: "0773456789" },
    ].slice(0, scale.id === "small" ? 2 : 3);
  }

  function saleLine(prod, qty, extra) {
    return Object.assign({
      id: prod.id, product_id: prod.id, name: prod.name, barcode: prod.barcode,
      qty: qty, inputQty: qty, inputUnit: prod.unit, price: prod.price, cost: prod.cost,
      comment: "", saleUnit: prod.unit,
    }, extra || {});
  }
  function purLine(prod, qty) {
    var lineVal = round2(prod.cost * qty);
    return {
      id: prod.id, name: prod.name, barcode: prod.barcode, unit: prod.unit,
      qty: qty, inputQty: qty, inputUnit: prod.unit, cost: prod.cost,
      lineStockValue: lineVal, sellPrice: prod.price,
    };
  }

  progress(onProgress, "Opening purchases", 18);

  /* ── Purchases (stock in first — chronological by month buckets) ── */
  var purchases = [];
  for (i = 0; i < scale.purchases; i++) {
    var sup = suppliers[i % suppliers.length];
    var lineCount = i % 3 === 0 ? rint(rng, 3, 5) : (i % 3 === 1 ? 2 : 1);
    var items = [];
    var lineVal = 0;
    var j;
    for (j = 0; j < lineCount; j++) {
      var pidx = (i * 3 + j * 17) % STOCK_N;
      var prod = products[pidx];
      if (prod.type === "service") continue;
      var qty = purchaseQty(rng, prod);
      items.push(purLine(prod, qty));
      lineVal = round2(lineVal + prod.cost * qty);
      trackStock(prod.id, qty);
    }
    if (!items.length) {
      var fallback = products[i % Math.min(20, STOCK_N)];
      var fq = purchaseQty(rng, fallback);
      items.push(purLine(fallback, fq));
      lineVal = round2(fallback.cost * fq);
      trackStock(fallback.id, fq);
    }
    var monthIdx = Math.min(scale.months - 1, Math.floor((i / scale.purchases) * scale.months));
    var dt = dates.monthDay(monthIdx, rint(rng, 1, 25), scale.months);
    var taxB = applyTaxBundle(lineVal, opts.taxPercent, opts.taxEnabled);
    var invTotal = taxB.total;
    var payMode = i % 10;
    var paidAmount = 0;
    var paymentHistory = [];
    var chId = null;

    if (payMode === 0) {
      paidAmount = invTotal;
      paymentHistory = [ph("cert-ph-pur-" + i + "-1", dt, invTotal, "Bank", { note: "Full bank transfer" })];
    } else if (payMode === 1) {
      paidAmount = invTotal;
      paymentHistory = [ph("cert-ph-pur-" + i + "-1", dt, invTotal, "Cash", { note: "Cash on delivery" })];
    } else if (payMode === 2 || payMode === 3) {
      paidAmount = round2(invTotal * (payMode === 2 ? 0.35 : 0.45));
      paymentHistory = [ph("cert-ph-pur-" + i + "-1", dt, paidAmount, payMode === 2 ? "Cash" : "Bank", { note: "Partial advance" })];
    } else if (payMode === 4 || payMode === 5) {
      paidAmount = round2(invTotal * 0.25);
      chId = "cert-ch-out-" + (++chSeq);
      var chAmt = round2(invTotal - paidAmount);
      paymentHistory = [
        ph("cert-ph-pur-" + i + "-1", dt, paidAmount, "Bank", { note: "Advance paid" }),
        ph("cert-ph-pur-" + i + "-2", dt, 0, "Cheque", { chequeId: chId, note: "Balance by cheque" }),
      ];
      cheques.push({
        id: chId, type: "outgoing", status: payMode === 4 ? "Pending" : "Cleared",
        chequeNo: String(45000 + chSeq), bankName: pick(rng, CERT_BANKS), amount: chAmt,
        dueDate: dateStr(-rint(rng, 3, 20)), issuedDate: dt, createdAt: dt,
        clearedDate: payMode === 4 ? undefined : dateStr(rint(rng, 0, 12)),
        supplierName: sup.name, purchaseId: "cert-pur-" + i,
        purchaseNo: "PUR-CERT-" + String(1000 + i), note: "Supplier payment cheque",
      });
      if (payMode === 5) {
        paidAmount = round2(paidAmount + chAmt);
        paymentHistory.push(ph("cert-ph-pur-" + i + "-3", dateStr(rint(rng, 0, 10)), chAmt, "Bank", { chequeId: chId, note: "Cheque cleared" }));
      }
    } else {
      paidAmount = 0;
    }

    var purRec = {
      id: "cert-pur-" + i,
      supplier: sup.name,
      supplierId: sup.id,
      invoiceNo: "PUR-CERT-" + String(1000 + i),
      date: dt,
      payMode: paidAmount >= invTotal - 0.01 ? "paid" : (paidAmount > 0 ? "partial" : "credit"),
      items: items,
      total: invTotal,
      subTotal: taxB.subTotal,
      totalTax: taxB.totalTax,
      selectedTaxes: taxB.selectedTaxes,
      taxMode: "exclusive",
      paidAmount: paidAmount,
      balance: round2(invTotal - paidAmount),
      status: paidAmount >= invTotal - 0.01 ? "Paid" : (paidAmount > 0 ? "Partial" : "Unpaid"),
      paymentHistory: paymentHistory,
      createdAt: isoAt(dt, rint(rng, 8, 17), rint(rng, 0, 59)),
    };
    purchases.push(purRec);
  }

  progress(onProgress, "Sales timeline", 35);

  /* ── Sales ── */
  var sales = [];
  for (i = 0; i < scale.sales; i++) {
    var cust = i % 5 === 0 ? null : customers[rint(rng, 0, customers.length - 1)];
    var lineCountS = i % 3 === 0 ? rint(rng, 2, 4) : 1;
    var saleItems = [];
    var subTotal = 0;
    var j2;
    for (j2 = 0; j2 < lineCountS; j2++) {
      var availableProducts = products.filter(function (p) {
        return p.type === "stock" && availStock(p.id) >= 1;
      });
      if (!availableProducts.length) break;
      var sprod = pick(rng, availableProducts);
      var maxQty = Math.min(8, Math.floor(availStock(sprod.id)));
      var sqty = rint(rng, 1, Math.max(1, maxQty));
      var consumed = tryConsumeStock(sprod.id, sqty, "Sale line " + sprod.name);
      if (!consumed.ok) continue;
      saleItems.push(saleLine(sprod, consumed.qty));
      subTotal = round2(subTotal + sprod.price * consumed.qty);
    }
    if (!saleItems.length) {
      var fb = products.find(function (p) { return p.type === "stock" && availStock(p.id) >= 1; });
      if (!fb) {
        warnings.push("Stock exhausted before completing all planned sales (sale index " + i + ")");
        break;
      }
      tryConsumeStock(fb.id, 1, "Fallback sale " + fb.name);
      saleItems.push(saleLine(fb, 1));
      subTotal = fb.price;
    }
    var discount = i % 8 === 0 ? round2(subTotal * 0.05) : 0;
    var netSub = round2(subTotal - discount);
    var sTax = applyTaxBundle(netSub, opts.taxPercent, opts.taxEnabled);
    var total = sTax.total;
    var monthIdxS = Math.min(scale.months - 1, Math.floor((i / scale.sales) * scale.months));
    var sdt = dates.monthDay(monthIdxS, rint(rng, 2, 27), scale.months);
    var invNo = "INV-CERT-" + String(2000 + i);
    var saleId = "cert-sale-" + i;
    var mode = i % 9;
    var paid = 0;
    var balance = total;
    var payStatus = "Unpaid";
    var cashMethod = "Cash";
    var paymentHistory = [];

    if (mode === 0) {
      paid = total; balance = 0; payStatus = "Paid"; cashMethod = "Cash";
      paymentHistory = [ph("cert-ph-sale-" + i + "-1", sdt, total, "Cash", { note: "Full cash" })];
    } else if (mode === 1) {
      paid = total; balance = 0; payStatus = "Paid"; cashMethod = "Bank";
      paymentHistory = [ph("cert-ph-sale-" + i + "-1", sdt, total, "Bank", { note: "Bank transfer" })];
    } else if (mode === 2) {
      paid = round2(total * pick(rng, [0.35, 0.45, 0.5])); balance = round2(total - paid); payStatus = "Partial"; cashMethod = "Cash";
      paymentHistory = [ph("cert-ph-sale-" + i + "-1", sdt, paid, "Cash", { note: "Advance / partial collection" })];
    } else if (mode === 3) {
      paid = 0; balance = total; payStatus = "Unpaid"; cashMethod = "Credit";
    } else if (mode === 4) {
      var c1 = round2(total * 0.6);
      var c2 = round2(total - c1);
      paid = total; balance = 0; payStatus = "Paid"; cashMethod = "Cash";
      paymentHistory = [
        ph("cert-ph-sale-" + i + "-1", sdt, c1, "Cash", { note: "Split — cash" }),
        ph("cert-ph-sale-" + i + "-2", sdt, c2, "Bank", { note: "Split — bank" }),
      ];
    } else if (mode === 5) {
      var chIn = "cert-ch-in-" + (++chSeq);
      paid = 0; balance = total; payStatus = "Unpaid"; cashMethod = "Cheque";
      paymentHistory = [ph("cert-ph-sale-" + i + "-1", sdt, 0, "Cheque", { chequeId: chIn, note: "Cheque received — pending" })];
      cheques.push({
        id: chIn, type: "incoming", status: "Pending",
        chequeNo: String(98000 + chSeq), bankName: pick(rng, CERT_BANKS), amount: total,
        dueDate: dateStr(-rint(rng, 2, 18)), issuedDate: sdt, createdAt: sdt,
        customerId: cust ? cust.id : "", customerName: cust ? cust.name : "Walk-in",
        saleId: saleId, invoiceNo: invNo, note: "Customer cheque — pending clearance",
      });
    } else if (mode === 6) {
      var chClr = "cert-ch-in-" + (++chSeq);
      paid = total; balance = 0; payStatus = "Paid"; cashMethod = "Cheque";
      paymentHistory = [ph("cert-ph-sale-" + i + "-1", sdt, total, "Cheque", { chequeId: chClr, note: "Cheque cleared" })];
      cheques.push({
        id: chClr, type: "incoming", status: "Cleared",
        chequeNo: String(98000 + chSeq), bankName: pick(rng, CERT_BANKS), amount: total,
        dueDate: dateStr(-rint(rng, 1, 10)), issuedDate: sdt, createdAt: sdt,
        clearedDate: dateStr(rint(rng, 0, 8)),
        customerId: cust ? cust.id : "", customerName: cust ? cust.name : "Walk-in",
        saleId: saleId, invoiceNo: invNo, note: "Customer cheque cleared",
      });
    } else if (mode === 7) {
      /* Overpayment / advance: pay slightly more than total → balance 0, overpay recorded on history */
      var over = round2(total + rint(rng, 500, 2500));
      paid = total; balance = 0; payStatus = "Paid"; cashMethod = "Cash";
      paymentHistory = [
        ph("cert-ph-sale-" + i + "-1", sdt, over, "Cash", { note: "Customer overpayment — change due / advance retained" }),
      ];
      warnings.push("Overpayment recorded on " + invNo + " (paid " + over + " vs total " + total + ")");
    } else {
      paid = round2(total * 0.5); balance = round2(total - paid); payStatus = "Partial"; cashMethod = "Bank";
      paymentHistory = [
        ph("cert-ph-sale-" + i + "-1", sdt, paid, "Bank", { note: "First collection" }),
        ph("cert-ph-sale-" + i + "-2", dateStr(rint(rng, 0, 5)), 0, "Bank", { note: "Follow-up scheduled" }),
      ];
    }

    sales.push({
      id: saleId,
      invoiceNo: invNo,
      date: sdt,
      customerId: cust ? cust.id : "",
      customerName: cust ? cust.name : "Walk-in",
      customerPhone: cust ? cust.phone : "",
      items: saleItems,
      subTotal: sTax.subTotal,
      discount: discount,
      totalTax: sTax.totalTax,
      selectedTaxes: sTax.selectedTaxes,
      taxMode: "exclusive",
      total: total,
      paid: paid,
      balance: balance,
      payStatus: payStatus,
      cashMethod: cashMethod,
      paymentHistory: paymentHistory,
      createdAt: isoAt(sdt, rint(rng, 9, 18), rint(rng, 0, 59)),
    });
  }

  /* Simulate blocked negative-stock attempt (never mutates stock when blocked) */
  var highCost = products.find(function (p) { return p.type === "stock" && availStock(p.id) === 0; }) || products[0];
  tryConsumeStock(highCost.id, 50, "Certification negative-stock probe on " + highCost.name);

  progress(onProgress, "Returns & quotations", 48);

  /* ── Sales returns (partial returns included) ── */
  var salesReturns = [];
  for (i = 0; i < scale.salesReturns; i++) {
    var parentSale = sales[rint(rng, 0, Math.max(0, sales.length - 1))];
    if (!parentSale || !parentSale.items || !parentSale.items.length) continue;
    var rit = parentSale.items[0];
    var rqty = i % 3 === 0 ? Math.max(1, Math.floor((rit.qty || 1) / 2)) : 1;
    rqty = Math.min(rqty, rit.qty || 1);
    trackStock(rit.id, rqty);
    var retAmt = round2((rit.price || 0) * rqty);
    var rTax = applyTaxBundle(retAmt, opts.taxPercent, opts.taxEnabled);
    salesReturns.push({
      id: "cert-sr-" + i,
      invoiceId: parentSale.id,
      invoiceNo: parentSale.invoiceNo,
      date: dateStr(rint(rng, 0, 20)),
      productId: rit.id,
      name: rit.name,
      qty: rqty,
      price: rit.price,
      cost: rit.cost,
      amount: rTax.total,
      totalTax: rTax.totalTax,
      selectedTaxes: rTax.selectedTaxes,
      reason: pick(rng, ["Customer changed mind", "DOA unit", "Wrong item", "Partial return — unused qty"]),
      refundMethod: pick(rng, ["Cash", "Bank", "Credit"]),
      createdAt: isoAt(dateStr(rint(rng, 0, 20)), 14, rint(rng, 0, 59)),
    });
  }

  /* ── Purchase returns ── */
  var purchaseReturns = [];
  for (i = 0; i < scale.purchaseReturns; i++) {
    var parentPur = purchases[rint(rng, 0, Math.max(0, purchases.length - 1))];
    if (!parentPur || !parentPur.items || !parentPur.items.length) continue;
    var pit = parentPur.items[0];
    var prqty = Math.min(i % 2 === 0 ? 1 : 2, Math.floor(availStock(pit.id)) || 1);
    if (prqty < 1) continue;
    var cons = tryConsumeStock(pit.id, prqty, "Purchase return " + pit.name);
    if (!cons.ok) continue;
    var prAmt = round2((pit.cost || 0) * prqty);
    purchaseReturns.push({
      id: "cert-pr-" + i,
      purchaseId: parentPur.id,
      purchaseNo: parentPur.invoiceNo,
      date: dateStr(rint(rng, 0, 25)),
      productId: pit.id,
      name: pit.name,
      qty: prqty,
      cost: pit.cost,
      amount: prAmt,
      reason: pick(rng, ["Damaged on arrival", "Wrong model", "Supplier credit note", "Partial short-supply return"]),
      createdAt: isoAt(dateStr(rint(rng, 0, 25)), 11, 0),
    });
  }

  /* ── Quotations ── */
  var quotations = [];
  for (i = 0; i < scale.quotations; i++) {
    var qc = customers[i % customers.length];
    var qprod = products[i % STOCK_N];
    var qqty = rint(rng, 1, 3);
    var qSub = round2(qprod.price * qqty);
    var qTax = applyTaxBundle(qSub, opts.taxPercent, opts.taxEnabled);
    var qStatus = i % 7 === 0 ? "Cancelled" : (i % 5 === 0 ? "Accepted" : (i % 3 === 0 ? "Sent" : "Draft"));
    quotations.push({
      id: "cert-q-" + i,
      quotationNo: "QT-CERT-" + String(100 + i),
      date: dateStr(rint(rng, 5, scale.months * 28)),
      customerId: qc.id,
      customerName: qc.name,
      customerPhone: qc.phone,
      items: [saleLine(qprod, qqty)],
      subTotal: qTax.subTotal,
      totalTax: qTax.totalTax,
      selectedTaxes: qTax.selectedTaxes,
      total: qTax.total,
      status: qStatus,
      note: qStatus === "Cancelled" ? "Customer cancelled quotation" : "",
      createdAt: isoAt(dateStr(rint(rng, 5, scale.months * 28)), 10, 0),
    });
  }
  for (i = 0; i < scale.quotationConversions && i < quotations.length && i < sales.length; i++) {
    quotations[i].status = "Converted";
    quotations[i].convertedAt = sales[i].date;
    quotations[i].saleId = sales[i].id;
    sales[i].fromQuotationId = quotations[i].id;
    sales[i].quotationNo = quotations[i].quotationNo;
  }

  progress(onProgress, "Repairs & 3rd party", 58);

  /* ── Manual AR/AP (opening + operational) ── */
  var manualReceivables = [];
  for (i = 0; i < scale.manualReceivables; i++) {
    var mrc = customers[i % customers.length];
    var mra = round2(rint(rng, 5000, 85000));
    var mrp = i % 3 === 0 ? 0 : round2(mra * (i % 2 === 0 ? 0.4 : 1));
    manualReceivables.push({
      id: "cert-mr-" + i,
      date: dateStr(rint(rng, 10, scale.months * 30)),
      source: mrc.name,
      customerId: mrc.id,
      type: i % 4 === 0 ? "Opening Receivable" : "Service Charge",
      amount: mra,
      paymentHistory: mrp > 0 ? [ph("cert-ph-mr-" + i, dateStr(rint(rng, 0, 15)), mrp, "Cash", { note: "Collection" })] : [],
      note: i % 4 === 0 ? "Brought-forward AR" : "Workshop charge billed separately",
      createdAt: isoAt(dateStr(rint(rng, 10, scale.months * 30)), 10, 0),
    });
  }
  var manualPayables = [];
  for (i = 0; i < scale.manualPayables; i++) {
    var mps = suppliers[i % suppliers.length];
    var mpa = round2(rint(rng, 8000, 120000));
    var mpp = i % 3 === 0 ? 0 : round2(mpa * (i % 2 === 0 ? 0.5 : 1));
    manualPayables.push({
      id: "cert-mp-" + i,
      date: dateStr(rint(rng, 12, scale.months * 30)),
      source: mps.name,
      supplierId: mps.id,
      type: i % 4 === 0 ? "Opening Payable" : "Expense Payable",
      amount: mpa,
      paymentHistory: mpp > 0 ? [ph("cert-ph-mp-" + i, dateStr(rint(rng, 0, 12)), mpp, "Bank", { note: "Supplier payment" })] : [],
      note: i % 4 === 0 ? "Brought-forward AP" : "Accrued supplier bill",
      createdAt: isoAt(dateStr(rint(rng, 12, scale.months * 30)), 11, 0),
    });
  }

  /* ── Repairs ── */
  var repairs = [];
  var repairSaleSeq = 0;
  var DEVICE_TYPES = ["Laptop", "Desktop", "Printer", "Monitor", "Phone", "Tablet"];
  var mpSeq = manualPayables.length;

  function repairDevice(type, brand, model, problem, status, extra) {
    return Object.assign({
      deviceType: type, brand: brand, modelNo: model, problem: problem, status: status || "Accepted",
    }, extra || {});
  }
  function deriveRepairBillStatus(devices) {
    var list = devices || [];
    var counts = list.reduce(function (acc, d) {
      var k = d.status || "Accepted";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    var total = list.length;
    if ((counts.Delivered || 0) === total) return "Delivered";
    if ((counts.Returned || 0) === total) return "Returned";
    if ((counts.Accepted || 0) > 0) return "Accepted";
    if ((counts["Third Party"] || 0) > 0) return "Third Party";
    if ((counts.Ready || 0) > 0) return "Ready";
    return "Accepted";
  }
  function buildRepairBill(id, cust, dateIn, devices, extra) {
    var first = devices[0] || repairDevice("Laptop", "HP", "MOD-0", "Issue", "Accepted");
    return Object.assign({
      id: id,
      date: dateIn,
      dateIn: dateIn,
      dateOut: "",
      customer: cust.name,
      customerId: cust.id,
      phone: cust.phone,
      deviceType: first.deviceType,
      brand: first.brand,
      modelNo: first.modelNo,
      problem: first.problem,
      description: "Workshop repair ticket — certification dataset",
      estimatedCost: round2(rint(rng, 3500, 28000)),
      technician: pick(rng, employees.length ? employees.map(function (e) { return e.name; }) : ["Rashid", "Amjad", "Fazil"]),
      accessories: "Charger",
      devices: devices,
      returnedLog: [],
      internalPartsUsed: [],
      internalPartsCost: 0,
      status: deriveRepairBillStatus(devices),
      createdAt: isoAt(dateIn, 9, rint(rng, 0, 59)),
    }, extra || {});
  }

  function create3pProduct(repairId, deviceIndex, repair, device, cost, sell) {
    var pid = "cert-3p-prod-" + repairId + "-d" + deviceIndex;
    var name = "3P Repair - " + repair.customer + " - " + device.deviceType + " " + device.brand + " " + device.modelNo;
    var prod = {
      id: pid,
      productId: "RP3P-" + repairId.slice(-6).toUpperCase() + "-" + (deviceIndex + 1),
      name: name,
      barcode: "3P" + String(880000 + products.length),
      category: "Repair 3rd Party",
      type: "stock",
      unit: "Pcs",
      cost: intCost(cost),
      price: intCost(sell),
      stock: 0,
      damaged: 0,
      _repair3pOneTime: true,
      _repairId: repairId,
      _repairDeviceIndex: deviceIndex,
      createdAt: isoAt(dateStr(5), 10, 0),
    };
    products.push(prod);
    trackStock(pid, 1);
    return prod;
  }

  function addRepairSale(repair, deviceIndexes, lines, saleDate, paySpec) {
    var total = round2(lines.reduce(function (a, ln) { return a + (ln.price || 0) * (ln.qty || 1); }, 0));
    var paid = paySpec.paid != null ? round2(paySpec.paid) : total;
    var balance = round2(total - paid);
    var saleId = "cert-rep-sale-" + (++repairSaleSeq);
    lines.forEach(function (ln) {
      if (ln.id && products.find(function (p) { return p.id === ln.id && p.type !== "service"; })) {
        tryConsumeStock(ln.id, ln.qty || 1, "Repair invoice part " + ln.name);
      }
    });
    var sale = {
      id: saleId,
      invoiceNo: "INV-REP-" + String(5000 + repairSaleSeq),
      date: saleDate,
      customerId: repair.customerId || "",
      customerName: repair.customer,
      customerPhone: repair.phone || "",
      items: lines,
      subTotal: total,
      discount: 0,
      total: total,
      paid: paid,
      balance: balance,
      payStatus: balance <= 0.01 ? "Paid" : (paid > 0 ? "Partial" : "Unpaid"),
      cashMethod: paySpec.cashMethod || "Cash",
      paymentHistory: paySpec.paymentHistory || (paid > 0 ? [ph("cert-ph-rs-" + repairSaleSeq, saleDate, paid, paySpec.cashMethod || "Cash", { note: "Repair invoice payment" })] : []),
      fromRepairId: repair.id,
      fromRepairDeviceIndexes: deviceIndexes,
      createdAt: isoAt(saleDate, 15, 30),
    };
    sales.push(sale);
    return sale;
  }

  for (i = 0; i < scale.repairs; i++) {
    var rc = customers[i % customers.length];
    var rDate = dateStr(rint(rng, 3, scale.months * 28));
    var statusCycle = i % 6;
    var st = statusCycle === 0 ? "Accepted"
      : statusCycle === 1 ? "Ready"
        : statusCycle === 2 ? "Delivered"
          : statusCycle === 3 ? "Returned"
            : statusCycle === 4 ? "Third Party"
              : "Accepted";
    var devices = [
      repairDevice(
        pick(rng, DEVICE_TYPES),
        pick(rng, CERT_BRANDS.slice(0, 8)),
        "M-" + (100 + i),
        pick(rng, CERT_REPAIR_PROBLEMS),
        st
      ),
    ];
    if (i % 4 === 0) {
      devices.push(repairDevice("Laptop", "Dell", "Lat-" + i, pick(rng, CERT_REPAIR_PROBLEMS), i % 2 === 0 ? "Ready" : "Accepted"));
    }
    var bill = buildRepairBill("cert-rep-" + i, rc, rDate, devices, {
      returnedLog: st === "Returned" ? [{
        id: "cert-retlog-" + i, date: dateStr(rint(rng, 0, 10)), deviceIndex: 0,
        device: devices[0],
      }] : [],
    });
    repairs.push(bill);

    if (st === "Delivered" || st === "Ready") {
      var svc = products.find(function (p) { return p.id === "cert-svc-" + (i % CERT_SERVICE_SKUS.length); });
      var part = products.find(function (p) { return p.category === "Repair Parts" && availStock(p.id) >= 1; });
      var lines = [];
      if (svc) lines.push(saleLine(svc, 1));
      if (part && i % 2 === 0) lines.push(saleLine(part, 1));
      if (lines.length) {
        addRepairSale(bill, [0], lines, dateStr(rint(rng, 0, 8)), {
          paid: i % 3 === 0 ? 0 : undefined,
          cashMethod: i % 3 === 0 ? "Credit" : "Cash",
        });
      }
    }

    if (st === "Third Party" || i < scale.extra3pRepairs) {
      var tps = suppliers[i % suppliers.length];
      var cost3 = rint(rng, 4000, 18000);
      var sell3 = intCost(cost3 * 1.35);
      var tpProd = create3pProduct(bill.id, 0, bill, devices[0], cost3, sell3);
      devices[0].status = "Third Party";
      devices[0].thirdParty = {
        supplierId: tps.id,
        supplierName: tps.name,
        productId: tpProd.id,
        amount: cost3,
        sellAmount: sell3,
        payMode: i % 2 === 0 ? "paid" : "unpaid",
      };
      bill.status = "Third Party";
      bill.devices = devices;
      var payableId = "cert-3p-mp-" + (++mpSeq);
      manualPayables.push({
        id: payableId,
        date: rDate,
        source: tps.name,
        type: "3rd Party Repair Cost",
        productId: tpProd.id,
        qty: 1,
        amount: round2(cost3),
        paymentMethod: i % 2 === 0 ? "Bank" : "Credit",
        reference: bill.id.slice(-8).toUpperCase(),
        note: tpProd.name,
        paymentHistory: i % 2 === 0 ? [ph("cert-ph-3p-" + i, rDate, cost3, "Bank", { note: "3P repair cost paid" })] : [],
        createdAt: isoAt(rDate, 11, 0),
        thirdPartyRepairId: bill.id,
        thirdPartyDeviceIndex: 0,
        supplierId: tps.id,
      });
    }
  }

  progress(onProgress, "Expenses & capital", 68);

  var expenses = [];
  for (i = 0; i < scale.expenses; i++) {
    expenses.push({
      id: "cert-exp-" + i,
      date: dateStr(rint(rng, 0, scale.months * 28)),
      category: pick(rng, CERT_EXPENSE_CATS),
      description: pick(rng, CERT_EXPENSE_CATS) + " — " + pick(rng, ["Showroom", "Workshop", "Delivery", "Admin"]),
      amount: round2(rint(rng, 2000, 45000)),
      cashMethod: i % 4 === 0 ? "Cash" : "Bank",
      paymentMethod: i % 4 === 0 ? "Cash" : "Bank",
      createdAt: isoAt(dateStr(rint(rng, 0, scale.months * 28)), 12, 0),
    });
  }

  /* Dishonoured cheques */
  cheques.push({
    id: "cert-ch-bounced-1", type: "incoming", status: "Bounced",
    chequeNo: "99101", bankName: "HNB", amount: 45000,
    dueDate: dateStr(8), issuedDate: dateStr(20), createdAt: dateStr(20),
    bouncedDate: dateStr(5), customerName: customers[0].name, customerId: customers[0].id,
    saleId: "", invoiceNo: "", note: "Dishonoured — customer to reissue",
  });
  cheques.push({
    id: "cert-ch-out-bounced-1", type: "outgoing", status: "Bounced",
    chequeNo: "77101", bankName: "BOC", amount: 82000,
    dueDate: dateStr(7), issuedDate: dateStr(18), createdAt: dateStr(18),
    bouncedDate: dateStr(4), supplierName: suppliers[0].name,
    note: "Dishonoured supplier cheque — reissued by bank transfer",
  });

  var damageLog = [];
  for (i = 0; i < scale.damageEntries; i++) {
    var damageCandidates = products.filter(function (p) { return p.type === "stock" && availStock(p.id) >= 1; });
    if (!damageCandidates.length) break;
    var dprod = pick(rng, damageCandidates);
    var dqty = Math.min(rint(rng, 1, 2), Math.floor(availStock(dprod.id)));
    damageLog.push({
      id: "cert-dmg-" + i,
      date: dateStr(rint(rng, 5, 35)),
      isoDateTime: isoAt(dateStr(rint(rng, 5, 35)), 13, rint(rng, 0, 59)),
      productId: dprod.id,
      productName: dprod.name,
      qty: dqty,
      cost: dprod.cost || 0,
      reason: pick(rng, ["Damaged in store", "Dead stock write-off", "Demo unit scrap", "Courier damage"]),
      createdAt: isoAt(dateStr(rint(rng, 5, 35)), 13, 0),
    });
    trackStock(dprod.id, -dqty);
  }

  var assets = [];
  var assetTemplates = [
    { name: "Showroom Display Rack", category: "Furniture", cost: 85000 },
    { name: "Workshop Bench & Tools", category: "Equipment", cost: 120000 },
    { name: "Delivery Van (used)", category: "Vehicle", cost: 2800000 },
    { name: "Server / NAS Backup", category: "IT Equipment", cost: 185000 },
    { name: "POS Terminal", category: "IT Equipment", cost: 95000 },
    { name: "Air Conditioner — Showroom", category: "Equipment", cost: 175000 },
  ];
  for (i = 0; i < scale.assets; i++) {
    var atpl = assetTemplates[i % assetTemplates.length];
    assets.push({
      id: "cert-asset-" + i,
      name: atpl.name + (i >= assetTemplates.length ? " #" + (i + 1) : ""),
      category: atpl.category,
      date: dateStr(rint(rng, 60, scale.months * 30 + 40)),
      purchaseDate: dateStr(rint(rng, 60, scale.months * 30 + 40)),
      amount: atpl.cost,
      value: atpl.cost,
      cost: atpl.cost,
      cashMethod: i % 2 === 0 ? "Cash" : "Bank",
      depreciationMethod: i % 2 === 0 ? "straight_line" : "none",
      usefulLifeYears: i % 2 === 0 ? 5 : 0,
      note: "Certification fixed asset",
      createdAt: isoAt(dateStr(rint(rng, 60, scale.months * 30 + 40)), 10, 0),
    });
  }

  var capLedger = [
    { type: "invest", amount: 2500000, cashMethod: "Bank", note: "Owner working-capital injection", ref: "CAP-001" },
    { type: "invest", amount: 850000, cashMethod: "Cash", note: "Showroom expansion capital", ref: "CAP-002" },
    { type: "withdraw", amount: 175000, cashMethod: "Cash", note: "Owner drawings", ref: "CAP-003" },
    { type: "invest", amount: 1250000, cashMethod: "Bank", note: "Inventory season funding", ref: "CAP-004" },
  ].map(function (entry, ci) {
    return Object.assign({
      id: "cert-cap-" + ci,
      date: dateStr(scale.months * 28 - ci * 12),
      createdAt: isoAt(dateStr(scale.months * 28 - ci * 12), 10, 0),
    }, entry);
  });
  var profitDist = [
    { partner: "Rashid Ahmed", amount: 180000, paymentMethod: "Bank", note: "Month-end profit distribution" },
    { partner: "Partner Ali", amount: 125000, paymentMethod: "Cash", note: "Month-end profit distribution" },
  ].map(function (entry, pi) {
    return Object.assign({
      id: "cert-pd-" + pi,
      date: dateStr(12 - pi * 4),
      createdAt: isoAt(dateStr(12 - pi * 4), 16, 0),
    }, entry);
  });

  progress(onProgress, "Edge cases", 78);

  /* ── Edge cases: voided & edited documents (stock already netted correctly for voids) ── */
  for (i = 0; i < scale.voidedSales && i < sales.length; i++) {
    var vs = sales[sales.length - 1 - i];
    if (!vs || vs.fromRepairId) continue;
    /* Restore stock as void would — documents stay for audit */
    (vs.items || []).forEach(function (it) {
      if (it && it.id) trackStock(it.id, it.qty || 0);
    });
    vs.status = "Voided";
    vs.voidedAt = isoAt(dateStr(rint(rng, 0, 5)), 16, 0);
    vs.voidReason = "Test / training entry";
    vs.payStatus = "Voided";
    vs.paid = 0;
    vs.balance = 0;
    vs.paymentHistory = [];
  }
  for (i = 0; i < scale.voidedPurchases && i < purchases.length; i++) {
    var vp = purchases[purchases.length - 1 - i];
    if (!vp) continue;
    (vp.items || []).forEach(function (it) {
      if (it && it.id) tryConsumeStock(it.id, it.qty || 0, "Void purchase rollback " + it.name);
    });
    vp.status = "Voided";
    vp.voidedAt = isoAt(dateStr(rint(rng, 0, 5)), 16, 0);
    vp.voidReason = "Duplicate entry";
    vp.paidAmount = 0;
    vp.balance = 0;
    vp.paymentHistory = [];
  }
  for (i = 0; i < scale.editedSales && i < sales.length; i++) {
    var es = sales[i];
    if (!es || es.status === "Voided") continue;
    es.updatedAt = isoAt(dateStr(rint(rng, 0, 8)), 17, 10);
    es.editNote = "Price corrected after customer negotiation";
    es.edited = true;
  }
  for (i = 0; i < scale.editedPurchases && i < purchases.length; i++) {
    var ep = purchases[i];
    if (!ep || ep.status === "Voided") continue;
    ep.updatedAt = isoAt(dateStr(rint(rng, 0, 8)), 17, 20);
    ep.editNote = "Supplier invoice quantity amended";
    ep.edited = true;
  }

  products.forEach(function (p) {
    if (p.type === "service") return;
    p.stock = Math.max(0, Math.round(stockLedger[p.id] || 0));
  });

  progress(onProgress, "Settings & auth", 85);

  var settings = {
    shopName: opts.shopName,
    address: "No. 45, Main Street, Colombo 03",
    phone: "0112345678",
    phone2: "0112987654",
    whatsapp: "0771234567",
    email: "cert@techon.lk",
    website: "www.techon.lk",
    brn: "PV00998877",
    footer: "TechonERP Certification Dataset — official regression company",
    currency: opts.currency,
    country: opts.country,
    taxEnabled: opts.taxEnabled,
    taxMode: "exclusive",
    selectedTaxes: opts.taxEnabled
      ? [{ name: "VAT", rate: opts.taxPercent, amount: 0 }]
      : [],
    warrantyEnabled: true,
    warrantyText: "1 Year Manufacturer Warranty on eligible items.",
    invoiceDefaultSize: "a4",
    invoiceThermalSize: "thermal80",
    invoiceFormatA4: true,
    invoiceFormatA5: true,
    invoiceFormatThermal58: true,
    invoiceFormatThermal80: true,
    defaultInvoiceLang: "en",
    requirePasswordOnLogin: true,
    adminPin: "",
    autoLockEnabled: false,
    autoLockMinutes: 10,
    inventoryCostingMethod: opts.inventoryCostingMethod,
    preventNegativeStock: opts.preventNegativeStock,
    glVatPostingEnabled: true,
    glArApNegativeTolerance: 50,
    glArApHardBlockAt: 1000000,
    glInventoryReconcileTolerance: opts.inventoryCostingMethod === "fifo" ? 5000 : 25000,
    moduleFlags: { tech: true, repairs: true, quotations: true, cheques: true, cod: false, accounting: true },
    optionalModules: { repairs: true, quotations: true, cheques: true, cod: false, accounting: true },
    certificationMeta: {
      generator: "TechonERP Certification Dataset Generator",
      version: 1,
      businessType: "computer_shop",
      datasetSize: scale.id,
      generatedAt: new Date().toISOString(),
      seed: opts.seed,
    },
  };

  var adminHash = CERT_ADMIN_PASSWORD_HASH;
  var certAdminUser = {
    id: "cert-admin",
    username: "admin",
    name: "Certification Admin",
    role: "admin",
    passwordHash: adminHash,
    active: true,
    createdAt: "2026-04-01T08:00:00.000Z",
  };

  var data = {
    tc3_businessType: "tech",
    tc3_apppass: adminHash,
    tc3_admin_name: "Certification Admin",
    tc3_startup_wizard_done: true,
    tc3_users: [certAdminUser],
    tc3_settings: settings,
    tc3_products: products,
    tc3_customers: customers,
    tc3_suppliers: suppliers,
    tc3_others: others,
    tc3_sales: sales,
    tc3_purchases: purchases,
    tc3_salesReturns: salesReturns,
    tc3_purchaseReturns: purchaseReturns,
    tc3_cheques: cheques,
    tc3_manualReceivables: manualReceivables,
    tc3_manualPayables: manualPayables,
    tc3_quotations: quotations,
    tc3_repairs: repairs,
    tc3_expenses: expenses,
    tc3_assets: assets,
    tc3_capLedger: capLedger,
    tc3_profitDist: profitDist,
    tc3_damageLog: damageLog,
    tc3_productLog: [],
    tc3_auditLog: [{
      id: "cert-audit-gen",
      action: "certification_dataset_generated",
      at: new Date().toISOString(),
      detail: { size: scale.id, costing: opts.inventoryCostingMethod, tax: opts.taxEnabled },
    }],
    tc3_openBal: {
      completed: true,
      date: dateStr(scale.months * 30 + 2),
      cash: 2500000,
      bank: 8500000,
      note: "Certification opening cash/bank — working capital",
    },
    tc3_employees: employees,
  };

  progress(onProgress, "Rebuilding GL & inventory", 90);
  var glAttach = attachGlSnapshot(data);
  if (!glAttach.ok) {
    warnings.push("GL snapshot attach warning: " + (glAttach.message || "rebuild failed"));
  }

  var backup = {
    version: 2,
    timestamp: new Date().toISOString(),
    shopName: settings.shopName,
    certificationDataset: true,
    data: data,
  };

  progress(onProgress, "Verifying reports", 95);
  var verification = verifyCertificationDataset(backup, { warnings: warnings });

  var pl = null;
  try {
    pl = profitAndLossFromLedger(
      data.tc3_journal_lines || [],
      data.tc3_gl_accounts || DEFAULT_GL_CHART,
      dateStr(scale.months * 30),
      dateStr(0)
    );
  } catch (ePl) {
    warnings.push("P&L compute warning: " + (ePl && ePl.message));
  }

  var totalSales = (sales || []).filter(function (s) { return s.status !== "Voided" && s.status !== "Cancelled"; })
    .reduce(function (a, s) { return a + (Number(s.total) || 0); }, 0);
  var totalPurchases = (purchases || []).filter(function (p) { return p.status !== "Voided" && p.status !== "Cancelled"; })
    .reduce(function (a, p) { return a + (Number(p.total) || 0); }, 0);
  var invValue = (products || []).reduce(function (a, p) {
    if (p.type === "service") return a;
    return a + round2((Number(p.stock) || 0) * (Number(p.cost) || 0));
  }, 0);

  var summary = {
    businessType: "Computer Shop",
    country: opts.country,
    currency: opts.currency,
    inventoryCosting: opts.inventoryCostingMethod.toUpperCase(),
    tax: opts.taxEnabled ? ("ON " + opts.taxPercent + "%") : "OFF",
    negativeStock: opts.preventNegativeStock ? "Block" : "Allow",
    datasetSize: scale.label,
    products: products.length,
    customers: customers.length,
    suppliers: suppliers.length,
    others: others.length,
    employees: employees.length,
    purchases: purchases.length,
    sales: sales.length,
    repairs: repairs.length,
    salesReturns: salesReturns.length,
    purchaseReturns: purchaseReturns.length,
    expenses: expenses.length,
    cheques: cheques.length,
    quotations: quotations.length,
    damageEntries: damageLog.length,
    openingCash: data.tc3_openBal.cash,
    openingBank: data.tc3_openBal.bank,
    totalInventoryValue: round2(invValue),
    totalSales: round2(totalSales),
    totalPurchases: round2(totalPurchases),
    profit: pl && typeof pl.net === "number" ? round2(pl.net) : null,
    journalLines: (data.tc3_journal_lines || []).length,
    verificationPassed: !!(verification && verification.ok),
    adminLogin: { username: "admin", password: CERT_ADMIN_PASSWORD },
  };

  progress(onProgress, "Complete", 100);
  return {
    backup: backup,
    summary: summary,
    verification: verification,
    warnings: warnings.concat((verification && verification.warnings) || []),
  };
}

export { CERT_ADMIN_PASSWORD, CERT_ADMIN_PASSWORD_HASH };
