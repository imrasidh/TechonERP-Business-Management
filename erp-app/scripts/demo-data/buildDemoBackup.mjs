/**
 * Full demo dataset for 360° ERP + accounting engine testing (glass shop).
 * Import via Settings → Backup → Restore → demo-data/techon-demo-backup.json
 * Regenerate: npm run seed:demo
 */

import {
  rebuildJournalFromState,
  DEFAULT_GL_CHART,
  hashJournalLines,
} from "../../src/accounting/generalLedger.js";
import {
  deriveInventoryEconomics,
  reconcileInventoryToLedger,
  serializeInventoryLayers,
} from "../../src/accounting/inventoryEngine.js";

var BASE_DATE = new Date("2026-06-27T12:00:00.000Z");

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function intCost(base) {
  return Math.max(1, Math.round(base));
}

function ph(id, date, amount, method, extra) {
  return Object.assign({ id: id, date: date, amount: round2(amount), cashMethod: method, note: "" }, extra || {});
}

function dateStr(offsetDays) {
  var d = new Date(BASE_DATE);
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

/* Reproducible pseudo-random (LCG) */
function makeRng(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rint(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

var CATEGORIES = [
  "Plain Float Glass", "Tempered Glass", "Mirrors", "Laminated Glass",
  "Tinted Glass", "Frosted Glass", "Aluminium Frames", "Silicone & Sealants",
];

var EXPENSE_CATS = ["Transport", "Utilities", "Salaries", "Rent", "Maintenance", "Marketing", "Office", "Tools"];

var BANKS = ["BOC", "HNB", "Sampath", "Peoples", "Commercial", "DFCC"];

/** Max allowed inventory vs GL drift (Rs) for bulk WAC demo data — journal must still balance exactly. */
export var DEMO_INV_GL_TOLERANCE = 2500;

export function buildDemoBackup() {
  var rng = makeRng(20260627);
  var stockLedger = {};
  var cheques = [];
  var chSeq = 0;

  function trackStock(pid, delta) {
    stockLedger[pid] = round2((stockLedger[pid] || 0) + delta);
  }

  function availStock(pid) {
    return Math.max(0, stockLedger[pid] || 0);
  }

  /* ── Products (60) ── */
  var products = [];
  var i;
  for (i = 0; i < 60; i++) {
    var cat = CATEGORIES[i % CATEGORIES.length];
    var unit = cat.indexOf("Frames") >= 0 || cat.indexOf("Sealants") >= 0 ? "Pcs" : (cat === "Mirrors" ? "Pcs" : "Sq Ft");
    var cost = intCost(80 + (i % 12) * 35 + rint(rng, 0, 40));
    var price = intCost(cost * (1.35 + (i % 5) * 0.08));
    products.push({
      id: "demo-p-" + i,
      productId: String(1000 + i),
      name: cat.split(" ")[0] + " " + (6 + (i % 8)) + "MM Item " + (i + 1),
      barcode: "BC" + String(600000 + i),
      category: cat,
      type: "stock",
      unit: unit,
      cost: cost,
      price: price,
      stock: 0,
      damaged: 0,
      description: "",
      require_comment: unit === "Sq Ft",
      comment_label: unit === "Sq Ft" ? "Cut size" : "Comment",
    });
  }

  /* ── Customers (50) ── */
  var customers = [];
  for (i = 0; i < 50; i++) {
    customers.push({
      id: "demo-c-" + i,
      name: (i === 0 ? "Anwardeen" : i === 1 ? "Mohamed Builders" : i === 2 ? "Homes & Glass Pvt Ltd" : "Customer " + (i + 1)),
      phone: "077" + String(1000000 + i * 137).slice(0, 7),
      address: ["Colombo", "Kotte", "Negombo", "Gampaha", "Ja-Ela"][i % 5],
      credit: 0,
      totalSpent: 0,
    });
  }

  /* ── Suppliers (30) ── */
  var suppliers = [];
  for (i = 0; i < 30; i++) {
    suppliers.push({
      id: "demo-s-" + i,
      name: (i === 0 ? "Asia Glass Traders" : i === 1 ? "Local Aluminium Works" : "Supplier " + (i + 1)),
      phone: "011" + String(7000000 + i * 211).slice(0, 7),
      email: i % 3 === 0 ? "sales@supplier" + i + ".lk" : "",
      address: ["Peliyagoda", "Ja-Ela", "Colombo 10"][i % 3],
      note: i % 4 === 0 ? "Preferred vendor" : "",
      payable: 0,
    });
  }

  /* ── Purchases (55) — build inventory first (older dates so replay sees stock before sales) ── */
  var purchases = [];
  for (i = 0; i < 55; i++) {
    var sup = suppliers[i % suppliers.length];
    var pidx = i % products.length;
    var prod = products[pidx];
    var qty = rint(rng, 15, 120);
    var lineVal = round2(prod.cost * qty);
    var dt = dateStr(rint(rng, 45, 90));
    var payMode = i % 5;
    var paidAmount = 0;
    var paymentHistory = [];
    var chId = null;

    if (payMode === 0) {
      paidAmount = lineVal;
      paymentHistory = [ph("demo-ph-pur-" + i + "-1", dt, lineVal, "Bank", { note: "Full payment" })];
    } else if (payMode === 1) {
      paidAmount = lineVal;
      paymentHistory = [ph("demo-ph-pur-" + i + "-1", dt, lineVal, "Bank", { note: "Cash on delivery (bank transfer)" })];
    } else if (payMode === 2) {
      paidAmount = round2(lineVal * 0.55);
      paymentHistory = [ph("demo-ph-pur-" + i + "-1", dt, paidAmount, "Bank", { note: "Partial advance" })];
    } else if (payMode === 3) {
      paidAmount = round2(lineVal * 0.4);
      chId = "demo-ch-out-" + (++chSeq);
      var chAmt = round2(lineVal - paidAmount);
      paymentHistory = [
        ph("demo-ph-pur-" + i + "-1", dt, paidAmount, "Bank", { note: "Partial bank transfer" }),
        ph("demo-ph-pur-" + i + "-2", dt, 0, "Cheque", { chequeId: chId, note: "Cheque pending" }),
      ];
      cheques.push({
        id: chId, type: "outgoing", status: "Pending",
        chequeNo: String(55000 + chSeq), bankName: pick(rng, BANKS), amount: chAmt,
        dueDate: dateStr(-rint(rng, 5, 25)), issuedDate: dt, createdAt: dt,
        supplierName: sup.name, purchaseId: "demo-pur-" + i, purchaseNo: "PUR-DEMO-" + String(i + 1).padStart(3, "0"),
        note: "Supplier cheque",
      });
    } else {
      paidAmount = 0;
    }

    trackStock(prod.id, qty);
    purchases.push({
      id: "demo-pur-" + i,
      supplier: sup.name,
      invoiceNo: "PUR-DEMO-" + String(i + 1).padStart(3, "0"),
      date: dt,
      payMode: paidAmount >= lineVal ? "paid" : (paidAmount > 0 ? "partial" : "credit"),
      items: [{
        id: prod.id, name: prod.name, barcode: prod.barcode, unit: prod.unit,
        qty: qty, inputQty: qty, inputUnit: prod.unit, cost: prod.cost,
        lineStockValue: lineVal, sellPrice: prod.price,
      }],
      total: lineVal,
      paidAmount: paidAmount,
      balance: round2(lineVal - paidAmount),
      status: paidAmount >= lineVal ? "Paid" : (paidAmount > 0 ? "Partial" : "Unpaid"),
      paymentHistory: paymentHistory,
    });
  }

  /* ── Sales (80) — paid / partial / cheque / split / credit ── */
  var sales = [];
  for (i = 0; i < 80; i++) {
    var cust = i < 3 ? customers[i] : (i % 4 === 0 ? null : customers[rint(rng, 0, customers.length - 1)]);
    var prod = products[rint(rng, 0, products.length - 1)];
    var maxQty = Math.max(1, Math.min(40, Math.floor(availStock(prod.id))));
    if (maxQty < 1) {
      prod = products[i % products.length];
      maxQty = Math.max(1, Math.min(20, Math.floor(availStock(prod.id))));
    }
    var sqty = rint(rng, 1, maxQty);
    trackStock(prod.id, -sqty);
    var subTotal = round2(prod.price * sqty);
    var discount = i % 7 === 0 ? Math.round(subTotal * 0.05) : 0;
    var total = round2(subTotal - discount);
    var dt = dateStr(rint(rng, 0, 44));
    var invNo = "INV-DEMO-" + String(i + 1).padStart(3, "0");
    var saleId = "demo-sale-" + i;
    var mode = i % 8;
    var paid = 0;
    var balance = total;
    var payStatus = "Unpaid";
    var cashMethod = "Cash";
    var paymentHistory = [];

    if (mode === 0) {
      paid = total; balance = 0; payStatus = "Paid"; cashMethod = "Cash";
      paymentHistory = [ph("demo-ph-sale-" + i + "-1", dt, total, "Cash", { note: "Full cash" })];
    } else if (mode === 1) {
      paid = total; balance = 0; payStatus = "Paid"; cashMethod = "Bank";
      paymentHistory = [ph("demo-ph-sale-" + i + "-1", dt, total, "Bank", { note: "Bank transfer" })];
    } else     if (mode === 2) {
      paid = Math.round(total * 0.45); balance = total - paid; payStatus = "Partial"; cashMethod = "Cash";
      paymentHistory = [ph("demo-ph-sale-" + i + "-1", dt, paid, "Cash", { note: "Advance" })];
    } else if (mode === 3) {
      paid = 0; balance = total; payStatus = "Unpaid"; cashMethod = "Credit";
    } else if (mode === 4) {
      var c1 = Math.round(total * 0.65);
      var c2 = total - c1;
      paid = total; balance = 0; payStatus = "Paid"; cashMethod = "Cash";
      paymentHistory = [
        ph("demo-ph-sale-" + i + "-1", dt, c1, "Cash", { note: "Split cash" }),
        ph("demo-ph-sale-" + i + "-2", dt, c2, "Bank", { note: "Split bank" }),
      ];
    } else if (mode === 5) {
      var chIn = "demo-ch-in-" + (++chSeq);
      paid = 0; balance = total; payStatus = "Unpaid"; cashMethod = "Cheque";
      paymentHistory = [ph("demo-ph-sale-" + i + "-1", dt, 0, "Cheque", { chequeId: chIn, note: "Cheque pending" })];
      cheques.push({
        id: chIn, type: "incoming", status: "Pending",
        chequeNo: String(88000 + chSeq), bankName: pick(rng, BANKS), amount: total,
        dueDate: dateStr(-rint(rng, 3, 20)), issuedDate: dt, createdAt: dt,
        customerId: cust ? cust.id : "", customerName: cust ? cust.name : "Walk-in",
        saleId: saleId, invoiceNo: invNo, note: "Customer cheque",
      });
    } else if (mode === 6) {
      var chClr = "demo-ch-in-" + (++chSeq);
      paid = total; balance = 0; payStatus = "Paid"; cashMethod = "Bank";
      paymentHistory = [ph("demo-ph-sale-" + i + "-1", dt, total, "Bank", { chequeId: chClr, note: "Cheque cleared" })];
      cheques.push({
        id: chClr, type: "incoming", status: "Cleared",
        chequeNo: String(77000 + chSeq), bankName: pick(rng, BANKS), amount: total,
        dueDate: dt, issuedDate: dateStr(rint(rng, 1, 10)), createdAt: dateStr(rint(rng, 1, 10)),
        clearedDate: dt, customerId: cust ? cust.id : "", customerName: cust ? cust.name : "Walk-in",
        saleId: saleId, invoiceNo: invNo, note: "Cleared incoming",
      });
    } else {
      paid = Math.round(total * 0.25); balance = total - paid; payStatus = "Partial"; cashMethod = "Bank";
      paymentHistory = [ph("demo-ph-sale-" + i + "-1", dt, paid, "Bank", { note: "Small deposit" })];
    }

    if (cust) {
      cust.totalSpent = round2((cust.totalSpent || 0) + total);
      if (balance > 0) cust.credit = round2((cust.credit || 0) + balance);
    }

    sales.push({
      id: saleId,
      invoiceNo: invNo,
      date: dt,
      customerId: cust ? cust.id : "",
      customerName: cust ? cust.name : "Walk-in",
      customerPhone: cust ? cust.phone : "",
      items: [{
        id: prod.id, product_id: prod.id, name: prod.name, barcode: prod.barcode,
        qty: sqty, inputQty: sqty, inputUnit: prod.unit, price: prod.price, cost: prod.cost,
        comment: prod.unit === "Sq Ft" ? "Standard cut" : "",
      }],
      subTotal: subTotal,
      discount: discount,
      total: total,
      paid: paid,
      balance: balance,
      payStatus: payStatus,
      cashMethod: cashMethod,
      paymentHistory: paymentHistory,
      includeWarranty: false,
    });
  }

  /* Bounced cheque (standalone) */
  cheques.push({
    id: "demo-ch-bounced-1", type: "incoming", status: "Bounced",
    chequeNo: "66100", bankName: "Peoples", amount: 12000,
    dueDate: "2026-06-20", issuedDate: "2026-06-15", createdAt: "2026-06-15",
    bouncedDate: dateStr(2), customerId: customers[0].id, customerName: customers[0].name,
    saleId: "", invoiceNo: "", note: "Bounced — reissue needed",
  });

  /* ── Sales returns (12) ── */
  var salesReturns = [];
  for (i = 0; i < 12; i++) {
    var src = sales[rint(rng, 0, Math.min(40, sales.length - 1))];
    var item = src.items[0];
    var rqty = Math.max(1, Math.min(3, Math.floor(item.qty / 2) || 1));
    var ramt = round2(item.price * rqty);
    var isRefund = i % 2 === 0;
    salesReturns.push({
      id: "demo-sr-" + i,
      returnId: "SR-DEMO-" + String(i + 1).padStart(3, "0"),
      invoiceId: src.id,
      invoiceNo: src.invoiceNo,
      productId: item.id,
      productName: item.name,
      qty: rqty,
      amount: ramt,
      cost: item.cost,
      date: dateStr(rint(rng, 0, 20)),
      customer: src.customerName,
      customerId: src.customerId,
      reason: pick(rng, ["Cracked edge", "Wrong size", "Customer changed mind", "Damaged in delivery"]),
      isRefund: isRefund,
      refundMethod: isRefund ? (i % 3 === 0 ? "Bank" : "Cash") : null,
      refundAmount: isRefund ? ramt : 0,
    });
    trackStock(item.id, rqty);
  }

  /* ── Purchase returns (8) ── */
  var purchaseReturns = [];
  for (i = 0; i < 8; i++) {
    var pur = purchases[rint(rng, 0, purchases.length - 1)];
    var pitem = pur.items[0];
    var prqty = Math.max(1, Math.min(5, Math.floor(pitem.qty / 4) || 1));
    purchaseReturns.push({
      id: "demo-pr-" + i,
      returnId: "PR-DEMO-" + String(i + 1).padStart(3, "0"),
      purchaseId: pur.id,
      purchaseNo: pur.invoiceNo,
      purchaseLineId: pitem.id,
      productId: pitem.id,
      productName: pitem.name,
      qty: prqty,
      amount: round2(pitem.cost * prqty),
      date: dateStr(rint(rng, 25, 44)),
      supplier: pur.supplier,
      cost: pitem.cost,
      reason: pick(rng, ["Damaged in transit", "Wrong spec", "Supplier error"]),
      isRefund: i % 3 === 0,
      refundMethod: i % 3 === 0 ? "Cash" : null,
      refundAmount: i % 3 === 0 ? round2(pitem.cost * prqty) : 0,
    });
    trackStock(pitem.id, -prqty);
  }

  /* Mirror Returns.jsx: reduce purchase totals when returns exist (integrity check expects this). */
  purchaseReturns.forEach(function (ret) {
    var pur = purchases.find(function (p) { return p.id === ret.purchaseId; });
    if (!pur) return;
    var returnAmt = round2(ret.amount || 0);
    if (!(returnAmt > 0)) return;
    var newTotal = Math.max(0, round2((pur.total || 0) - returnAmt));
    var newBal = Math.max(0, round2((pur.balance != null ? pur.balance : newTotal) - returnAmt));
    var newPaid = Math.min(round2(pur.paidAmount || 0), newTotal);
    pur.total = newTotal;
    pur.balance = newBal;
    pur.paidAmount = newPaid;
    if (newPaid >= newTotal - 0.01) pur.status = "Paid";
    else if (newPaid > 0.01) pur.status = "Partial";
    else pur.status = "Unpaid";
  });

  /* ── Manual receivables (12) ── */
  var manualReceivables = [];
  for (i = 0; i < 12; i++) {
    var mramt = round2(rint(rng, 5000, 80000));
    var mrPaid = round2(mramt * (rint(rng, 0, 70) / 100));
    var mrHist = [];
    if (mrPaid > 0) {
      mrHist.push(ph("demo-ph-mr-" + i, dateStr(rint(rng, 0, 30)), mrPaid, pick(rng, ["Cash", "Bank"]), { note: "Collection" }));
    }
    manualReceivables.push({
      id: "demo-mr-" + i,
      date: dateStr(rint(rng, 20, 70)),
      person: customers[i % customers.length].name,
      type: pick(rng, ["Loan Given", "Advance", "Other Receivable"]),
      amount: mramt,
      paymentMethod: "Bank",
      reference: "MR-" + (i + 1),
      note: "Manual receivable demo",
      paymentHistory: mrHist,
      createdAt: dateStr(rint(rng, 20, 70)) + "T10:00:00.000Z",
    });
  }

  /* ── Manual payables (12) ── */
  var manualPayables = [];
  for (i = 0; i < 12; i++) {
    var mpamt = round2(rint(rng, 3000, 60000));
    var mpPaid = round2(mpamt * (rint(rng, 0, 60) / 100));
    var mpHist = [];
    if (mpPaid > 0) {
      mpHist.push(ph("demo-ph-mp-" + i, dateStr(rint(rng, 0, 25)), mpPaid, "Cash", { note: "Settlement" }));
    }
    manualPayables.push({
      id: "demo-mp-" + i,
      date: dateStr(rint(rng, 15, 65)),
      source: suppliers[i % suppliers.length].name,
      type: pick(rng, ["Borrowed Money", "Credit Purchase", "Other Payable"]),
      amount: mpamt,
      paymentMethod: "Cash",
      reference: "MP-" + (i + 1),
      note: "Manual payable demo",
      paymentHistory: mpHist,
      createdAt: dateStr(rint(rng, 15, 65)) + "T11:00:00.000Z",
    });
  }

  /* ── Quotations (15) ── */
  var quotations = [];
  for (i = 0; i < 15; i++) {
    var qprod = products[rint(rng, 0, products.length - 1)];
    var qqty = rint(rng, 10, 200);
    var qsub = round2(qprod.price * qqty);
    var qdisc = i % 4 === 0 ? round2(qsub * 0.03) : 0;
    quotations.push({
      id: "demo-q-" + i,
      quotationNo: "QT-DEMO-" + String(i + 1).padStart(3, "0"),
      customer: customers[rint(rng, 0, customers.length - 1)].name,
      customerId: customers[rint(rng, 0, customers.length - 1)].id,
      customerPhone: customers[i % customers.length].phone,
      items: [{
        id: qprod.id, name: qprod.name, barcode: qprod.barcode, unit: qprod.unit,
        saleUnit: qprod.unit, qty: qqty, price: qprod.price,
        description: "", comment: "", commentLabel: "", customPrice: false,
      }],
      notes: i % 3 === 0 ? "Valid 14 days." : "",
      status: pick(rng, ["Draft", "Sent", "Accepted", "Expired"]),
      date: dateStr(rint(rng, 0, 45)),
      createdAt: dateStr(rint(rng, 0, 45)),
      createdBy: "Admin",
      subTotal: qsub,
      discount: qdisc,
      total: round2(qsub - qdisc),
      totalTax: 0,
      taxMode: "exclusive",
      taxApplyBase: "after_discount",
      selectedTaxes: [],
    });
  }

  /* ── Expenses (20) ── */
  var expenses = [];
  for (i = 0; i < 20; i++) {
    expenses.push({
      id: "demo-exp-" + i,
      date: dateStr(rint(rng, 0, 55)),
      category: pick(rng, EXPENSE_CATS),
      description: pick(rng, EXPENSE_CATS) + " — demo expense " + (i + 1),
      amount: round2(rint(rng, 1500, 25000)),
      paymentMethod: i % 4 === 0 ? "Cash" : "Bank",
    });
  }

  /* Sync product.stock from ledger */
  products.forEach(function (p) {
    p.stock = Math.max(0, Math.round(stockLedger[p.id] || 0));
  });

  var settings = {
    shopName: "GP TEMPERED",
    address: "Main Street, Colombo",
    phone: "0117654321",
    phone2: "",
    whatsapp: "0771234567",
    email: "info@gptempered.lk",
    website: "www.gptempered.lk",
    brn: "",
    footer: "Thank you for your business!",
    currency: "Rs",
    taxEnabled: false,
    taxMode: "exclusive",
    selectedTaxes: [],
    warrantyEnabled: false,
    invoiceDefaultSize: "a4",
    invoiceThermalSize: "thermal80",
    defaultInvoiceLang: "en",
    requirePasswordOnLogin: false,
    adminPin: "",
    autoLockEnabled: false,
    autoLockMinutes: 10,
    inventoryCostingMethod: "wac",
    preventNegativeStock: true,
    glVatPostingEnabled: true,
    glArApNegativeTolerance: 50,
    glArApHardBlockAt: 1000000,
    glInventoryReconcileTolerance: 2500,
  };

  var data = {
    tc3_businessType: "glass",
    tc3_settings: settings,
    tc3_products: products,
    tc3_customers: customers,
    tc3_suppliers: suppliers,
    tc3_sales: sales,
    tc3_purchases: purchases,
    tc3_salesReturns: salesReturns,
    tc3_purchaseReturns: purchaseReturns,
    tc3_cheques: cheques,
    tc3_manualReceivables: manualReceivables,
    tc3_manualPayables: manualPayables,
    tc3_quotations: quotations,
    tc3_expenses: expenses,
    tc3_repairs: [],
    tc3_assets: [],
    tc3_damageLog: [],
    tc3_productLog: [],
    tc3_auditLog: [],
    tc3_openBal: {
      completed: true,
      date: "2026-05-01",
      cash: 500000,
      bank: 1200000,
      note: "Demo opening balances",
    },
  };

  attachDemoGlSnapshot(data);

  return {
    version: 2,
    timestamp: new Date().toISOString(),
    shopName: settings.shopName,
    data: data,
  };
}

function attachDemoGlSnapshot(data) {
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
  };
  var smock = {
    get: function (k, def) {
      return data[k] !== undefined ? data[k] : def;
    },
  };
  var invDer = deriveInventoryEconomics(state, smock);
  var r = rebuildJournalFromState(state, smock, function () {
    glSeq += 1;
    return "demo_gl_" + glSeq;
  }, invDer);
  if (!r || !r.validate || !r.validate.ok || !r.lines || !r.lines.length) return;
  data.tc3_journal_lines = r.lines;
  data.tc3_gl_accounts = r.chart || DEFAULT_GL_CHART;
  data.tc3_gl_mode = "live";
  data.tc3_journal_hash = hashJournalLines(r.lines);
  data.tc3_inventory_layers = serializeInventoryLayers(invDer.layersByProduct || {});
  data.tc3_inv_reconciliation = reconcileInventoryToLedger(r.lines, invDer, r.chart || DEFAULT_GL_CHART);
  data.tc3_stock_movements = (invDer.movements || []).slice(-5000);
}
