/**
 * Production-aligned workflow helpers for the Certification Runner.
 * Builds the same document shapes the UI persists, applies stock side-effects
 * consistently, and routes voids through voidInvoice.js.
 */

import { computeSaleTax } from "../../tax/taxCompute.js";
import { buildVoidSaleUpdates, buildVoidPurchaseUpdates } from "../../utils/voidInvoice.js";
import { assertPaymentFitsSaleBalance, assertPaymentFitsPurchaseBalance } from "../../utils/concurrencyGuards.js";
import { round2, near } from "./harness.js";

function findProduct(state, id) {
  return (state.products || []).find(function (p) { return p.id === id; });
}

function applyPurchaseStock(products, items) {
  var out = (products || []).map(function (p) { return Object.assign({}, p); });
  (items || []).forEach(function (it) {
    var idx = out.findIndex(function (p) { return p.id === it.id; });
    if (idx < 0) return;
    var p = out[idx];
    if (String(p.type || "stock").toLowerCase() === "service") return;
    var qty = Number(it.qty) || 0;
    var unitCost = Number(it.cost) || 0;
    var oldStock = Number(p.stock) || 0;
    var oldCost = Number(p.cost) || 0;
    var newStock = oldStock + qty;
    var newCost = oldCost;
    if (newStock > 0) {
      if (oldStock <= 0) newCost = unitCost;
      else newCost = ((oldStock * oldCost) + (qty * unitCost)) / newStock;
    }
    out[idx] = Object.assign({}, p, { stock: newStock, cost: round2(newCost) });
  });
  return out;
}

function applySaleStock(state, items) {
  var preventNeg = state.settings && state.settings.preventNegativeStock !== false;
  var out = (state.products || []).map(function (p) { return Object.assign({}, p); });
  var blocked = null;
  (items || []).forEach(function (it) {
    if (blocked) return;
    var idx = out.findIndex(function (p) { return p.id === it.id; });
    if (idx < 0) {
      blocked = "Product not found: " + it.id;
      return;
    }
    var p = out[idx];
    if (String(p.type || "stock").toLowerCase() === "service") return;
    var qty = Number(it.qty) || 0;
    var have = Number(p.stock) || 0;
    if (preventNeg && have + 1e-9 < qty) {
      blocked = "Negative stock is not allowed. Available " + have + " for " + (p.name || it.id);
      return;
    }
    out[idx] = Object.assign({}, p, { stock: have - qty });
  });
  return { products: out, error: blocked };
}

function bumpCustomer(state, customerId, total, balanceDelta) {
  if (!customerId) return state.customers || [];
  return (state.customers || []).map(function (c) {
    if (c.id !== customerId) return c;
    return Object.assign({}, c, {
      credit: round2(Math.max(0, (Number(c.credit) || 0) + (balanceDelta || 0))),
      totalSpent: round2((Number(c.totalSpent) || 0) + (total || 0)),
    });
  });
}

export function seedMasterData(sb) {
  var state = sb.state;
  var p1 = {
    id: "cr_p_laptop", productId: "3001", name: "Dell Latitude 5410",
    barcode: "CT800001", category: "Laptops", type: "stock", unit: "Pcs",
    cost: 100000, price: 140000, stock: 0, damaged: 0,
  };
  var p2 = {
    id: "cr_p_ram", productId: "3002", name: "Kingston 8GB DDR4",
    barcode: "CT800002", category: "Components", type: "stock", unit: "Pcs",
    cost: 4000, price: 6500, stock: 0, damaged: 0,
  };
  var p3 = {
    id: "cr_p_ssd", productId: "3003", name: "Samsung 980 NVMe",
    barcode: "CT800003", category: "Storage", type: "stock", unit: "Pcs",
    cost: 12000, price: 17500, stock: 0, damaged: 0,
  };
  var svc = {
    id: "cr_p_labour", productId: "9101", name: "Laptop Repair Labour",
    barcode: "", category: "Services", type: "service", unit: "Job",
    cost: 0, price: 4500, stock: 0, damaged: 0,
  };
  state.products = [p1, p2, p3, svc];
  state.customers = [
    { id: "cr_c_1", name: "Rashid Ahmed", phone: "0771111111", credit: 0, totalSpent: 0 },
    { id: "cr_c_2", name: "Tech Solutions Lanka", phone: "0772222222", credit: 0, totalSpent: 0 },
  ];
  state.suppliers = [
    { id: "cr_s_1", name: "Tech Distributors Lanka", phone: "0111111111", payable: 0 },
    { id: "cr_s_2", name: "Redline Technologies", phone: "0112222222", payable: 0 },
  ];
  state.others = [
    { id: "cr_o_1", name: "CityLink Couriers", phone: "0113333333" },
  ];
  return { p1: p1, p2: p2, p3: p3, svc: svc };
}

export function postPurchase(sb, spec) {
  var state = sb.state;
  var items = (spec.items || []).map(function (it) {
    var prod = findProduct(state, it.productId || it.id);
    if (!prod) throw new Error("Purchase product missing");
    var qty = Number(it.qty) || 1;
    var cost = it.cost != null ? Number(it.cost) : Number(prod.cost) || 0;
    return {
      id: prod.id, name: prod.name, barcode: prod.barcode, unit: prod.unit,
      qty: qty, inputQty: qty, inputUnit: prod.unit, cost: cost,
      lineStockValue: round2(cost * qty), sellPrice: prod.price,
    };
  });
  var subTotal = round2(items.reduce(function (a, it) { return a + it.cost * it.qty; }, 0));
  var tax = computeSaleTax(
    Object.assign({}, state.settings, { taxEnabled: spec.taxEnabled != null ? spec.taxEnabled : state.settings.taxEnabled }),
    subTotal
  );
  /* Purchases use exclusive inventory cost; tax on purchase when enabled mirrors sale tax helper for cert */
  var total = tax.applied ? tax.grandTotal : subTotal;
  if (spec.forceTotal != null) total = round2(spec.forceTotal);
  var paid = spec.paid != null ? round2(spec.paid) : (spec.payMode === "credit" ? 0 : total);
  if (spec.payMode === "partial" && spec.paid == null) paid = round2(total * 0.4);
  var balance = round2(total - paid);
  var id = spec.id || sb.nextId("pur");
  var date = spec.date || "2026-04-10";
  var paymentHistory = [];
  if (paid > 0) {
    paymentHistory.push({
      id: sb.nextId("ph"), date: date, amount: paid,
      cashMethod: spec.cashMethod || "Cash", note: spec.note || "Purchase payment",
    });
  }
  var purchase = {
    id: id,
    supplier: spec.supplierName || (state.suppliers[0] && state.suppliers[0].name) || "Supplier",
    supplierId: spec.supplierId || (state.suppliers[0] && state.suppliers[0].id) || "",
    invoiceNo: spec.invoiceNo || ("PUR-" + id),
    date: date,
    payMode: balance <= 0.01 ? "paid" : (paid > 0 ? "partial" : "credit"),
    items: items,
    subTotal: subTotal,
    totalTax: tax.applied ? tax.totalTax : 0,
    selectedTaxes: tax.applied ? tax.selectedTaxes : [],
    taxMode: "exclusive",
    total: total,
    paidAmount: paid,
    balance: balance,
    status: balance <= 0.01 ? "Paid" : (paid > 0 ? "Partial" : "Unpaid"),
    paymentHistory: paymentHistory,
    createdAt: date + "T10:00:00.000Z",
  };
  state.products = applyPurchaseStock(state.products, items);
  state.purchases = (state.purchases || []).concat([purchase]);
  return purchase;
}

export function postSale(sb, spec) {
  var state = sb.state;
  var items = (spec.items || []).map(function (it) {
    var prod = findProduct(state, it.productId || it.id);
    if (!prod) throw new Error("Sale product missing");
    var qty = Number(it.qty) || 1;
    var price = it.price != null ? Number(it.price) : Number(prod.price) || 0;
    return {
      id: prod.id, product_id: prod.id, name: prod.name, barcode: prod.barcode,
      qty: qty, inputQty: qty, inputUnit: prod.unit, price: price, cost: prod.cost,
      comment: "", saleUnit: prod.unit,
    };
  });
  var stock = applySaleStock(state, items);
  if (stock.error) return { ok: false, error: stock.error };

  var subTotal = round2(items.reduce(function (a, it) { return a + it.price * it.qty; }, 0));
  var discount = 0;
  if (spec.discountPercent != null) discount = round2(subTotal * (Number(spec.discountPercent) / 100));
  if (spec.discountAmount != null) discount = round2(Number(spec.discountAmount));
  var taxable = round2(Math.max(0, subTotal - discount));
  var settingsForTax = Object.assign({}, state.settings, {
    taxEnabled: spec.taxEnabled != null ? spec.taxEnabled : state.settings.taxEnabled,
  });
  var tax = computeSaleTax(settingsForTax, taxable);
  var total = tax.grandTotal;
  var paid = spec.paid != null ? round2(spec.paid) : (spec.payMode === "credit" ? 0 : total);
  if (spec.payMode === "partial" && spec.paid == null) paid = round2(total * 0.5);
  var balance = round2(total - paid);
  var id = spec.id || sb.nextId("sale");
  var date = spec.date || "2026-04-15";
  var paymentHistory = [];
  if (paid > 0) {
    paymentHistory.push({
      id: sb.nextId("ph"), date: date, amount: paid,
      cashMethod: spec.cashMethod || "Cash", note: spec.note || "Sale payment",
    });
  }
  var sale = {
    id: id,
    invoiceNo: spec.invoiceNo || ("INV-" + id),
    date: date,
    customerId: spec.customerId || "",
    customerName: spec.customerName || (spec.customerId ? ((state.customers.find(function (c) { return c.id === spec.customerId; }) || {}).name) : "Walk-in"),
    customerPhone: "",
    items: items,
    subTotal: taxable,
    discount: discount,
    totalTax: tax.totalTax,
    selectedTaxes: tax.selectedTaxes || [],
    taxMode: "exclusive",
    total: total,
    paid: paid,
    balance: balance,
    payStatus: balance <= 0.01 ? "Paid" : (paid > 0 ? "Partial" : "Unpaid"),
    cashMethod: spec.cashMethod || (spec.payMode === "credit" ? "Credit" : "Cash"),
    paymentHistory: paymentHistory,
    fromRepairId: spec.fromRepairId || undefined,
    createdAt: date + "T14:00:00.000Z",
  };
  state.products = stock.products;
  state.sales = (state.sales || []).concat([sale]);
  if (sale.customerId) {
    state.customers = bumpCustomer(state, sale.customerId, total, balance);
  }
  return { ok: true, sale: sale };
}

export function editSale(sb, saleId, patch) {
  var state = sb.state;
  var idx = (state.sales || []).findIndex(function (s) { return s.id === saleId; });
  if (idx < 0) return { ok: false, error: "Sale not found" };
  var sale = Object.assign({}, state.sales[idx], patch || {}, { updatedAt: new Date().toISOString(), edited: true });
  if (sale.paid != null && sale.total != null) {
    sale.balance = round2((Number(sale.total) || 0) - (Number(sale.paid) || 0));
    sale.payStatus = sale.balance <= 0.01 ? "Paid" : (sale.paid > 0 ? "Partial" : "Unpaid");
  }
  var next = state.sales.slice();
  next[idx] = sale;
  state.sales = next;
  return { ok: true, sale: sale };
}

export function voidSale(sb, saleId, reason) {
  var state = sb.state;
  var res = buildVoidSaleUpdates(state, saleId, reason || "Test / training entry", new Date().toISOString(), { confirmRefund: true });
  if (!res.ok) return res;
  state.sales = res.sales;
  state.products = res.products;
  state.customers = res.customers;
  if (res.cheques) state.cheques = res.cheques;
  return { ok: true };
}

export function voidPurchase(sb, purchaseId, reason) {
  var state = sb.state;
  var res = buildVoidPurchaseUpdates(state, purchaseId, reason || "Duplicate entry", new Date().toISOString(), { confirmRefund: true });
  if (!res.ok) return res;
  state.purchases = res.purchases;
  state.products = res.products;
  if (res.cheques) state.cheques = res.cheques;
  return { ok: true };
}

export function postSalesReturn(sb, spec) {
  var state = sb.state;
  var sale = (state.sales || []).find(function (s) { return s.id === spec.saleId; });
  if (!sale) return { ok: false, error: "Parent sale not found" };
  var line = (sale.items || []).find(function (it) { return it.id === spec.productId; }) || sale.items[0];
  if (!line) return { ok: false, error: "Sale line not found" };
  var qty = Number(spec.qty) || 1;
  if (qty > (line.qty || 0)) return { ok: false, error: "Return qty exceeds sold qty" };
  var amount = round2((line.price || 0) * qty);
  var tax = computeSaleTax(state.settings, amount);
  var ret = {
    id: sb.nextId("sr"),
    invoiceId: sale.id,
    invoiceNo: sale.invoiceNo,
    date: spec.date || "2026-04-20",
    productId: line.id,
    name: line.name,
    qty: qty,
    price: line.price,
    cost: line.cost,
    amount: tax.grandTotal,
    totalTax: tax.totalTax,
    selectedTaxes: tax.selectedTaxes,
    reason: spec.reason || "Customer return",
    refundMethod: spec.refundMethod || "Cash",
    createdAt: (spec.date || "2026-04-20") + "T15:00:00.000Z",
  };
  /* Restore stock like Returns.jsx */
  state.products = (state.products || []).map(function (p) {
    if (p.id !== line.id || String(p.type).toLowerCase() === "service") return p;
    return Object.assign({}, p, { stock: (Number(p.stock) || 0) + qty });
  });
  state.salesReturns = (state.salesReturns || []).concat([ret]);
  return { ok: true, ret: ret };
}

export function postPurchaseReturn(sb, spec) {
  var state = sb.state;
  var pur = (state.purchases || []).find(function (p) { return p.id === spec.purchaseId; });
  if (!pur) return { ok: false, error: "Parent purchase not found" };
  var line = (pur.items || []).find(function (it) { return it.id === spec.productId; }) || pur.items[0];
  if (!line) return { ok: false, error: "Purchase line not found" };
  var qty = Number(spec.qty) || 1;
  var prod = findProduct(state, line.id);
  if (state.settings.preventNegativeStock && prod && (Number(prod.stock) || 0) < qty) {
    return { ok: false, error: "Insufficient stock for purchase return" };
  }
  state.products = (state.products || []).map(function (p) {
    if (p.id !== line.id) return p;
    return Object.assign({}, p, { stock: (Number(p.stock) || 0) - qty });
  });
  var ret = {
    id: sb.nextId("pr"),
    purchaseId: pur.id,
    purchaseNo: pur.invoiceNo,
    date: spec.date || "2026-04-22",
    productId: line.id,
    name: line.name,
    qty: qty,
    cost: line.cost,
    amount: round2((line.cost || 0) * qty),
    reason: spec.reason || "Supplier return",
    createdAt: (spec.date || "2026-04-22") + "T12:00:00.000Z",
  };
  state.purchaseReturns = (state.purchaseReturns || []).concat([ret]);
  return { ok: true, ret: ret };
}

export function postExpense(sb, spec) {
  var exp = {
    id: sb.nextId("exp"),
    date: spec.date || "2026-04-18",
    category: spec.category || "Utilities",
    description: spec.description || "Runner expense",
    amount: round2(spec.amount || 5000),
    cashMethod: spec.cashMethod || "Cash",
    paymentMethod: spec.cashMethod || "Cash",
    createdAt: (spec.date || "2026-04-18") + "T11:00:00.000Z",
  };
  sb.state.expenses = (sb.state.expenses || []).concat([exp]);
  return exp;
}

export function postDamage(sb, spec) {
  var state = sb.state;
  var prod = findProduct(state, spec.productId);
  if (!prod) return { ok: false, error: "Product not found" };
  var qty = Number(spec.qty) || 1;
  if (state.settings.preventNegativeStock && (Number(prod.stock) || 0) < qty) {
    return { ok: false, error: "Insufficient stock for damage write-off" };
  }
  state.products = state.products.map(function (p) {
    if (p.id !== prod.id) return p;
    return Object.assign({}, p, { stock: (Number(p.stock) || 0) - qty, damaged: (Number(p.damaged) || 0) + qty });
  });
  var row = {
    id: sb.nextId("dmg"),
    date: spec.date || "2026-04-25",
    productId: prod.id,
    productName: prod.name,
    qty: qty,
    cost: prod.cost,
    reason: spec.reason || "Damaged in store",
    createdAt: (spec.date || "2026-04-25") + "T13:00:00.000Z",
  };
  state.damageLog = (state.damageLog || []).concat([row]);
  return { ok: true, row: row };
}

export function postAsset(sb, spec) {
  var asset = {
    id: sb.nextId("asset"),
    name: spec.name || "Workshop Bench",
    category: spec.category || "Equipment",
    date: spec.date || "2026-04-05",
    purchaseDate: spec.date || "2026-04-05",
    amount: round2(spec.amount || 85000),
    value: round2(spec.amount || 85000),
    cost: round2(spec.amount || 85000),
    cashMethod: spec.cashMethod || "Bank",
    depreciationMethod: "none",
    createdAt: (spec.date || "2026-04-05") + "T09:00:00.000Z",
  };
  sb.store.tc3_assets = (sb.store.tc3_assets || []).concat([asset]);
  return asset;
}

export function postMoneyIn(sb, spec) {
  /* Money In → manual payable with empty paymentHistory — matches MoneyInOutModal */
  var row = {
    id: sb.nextId("mi"),
    date: spec.date || "2026-04-12",
    source: spec.source || "Owner",
    person: spec.source || "Owner",
    type: spec.type || "Capital / Loan",
    amount: round2(spec.amount || 25000),
    paymentMethod: spec.cashMethod || "Cash",
    receiptKind: "in",
    paymentHistory: [],
    note: spec.note || "Money in",
    createdAt: (spec.date || "2026-04-12") + "T10:30:00.000Z",
  };
  sb.store.tc3_manualPayables = (sb.store.tc3_manualPayables || []).concat([row]);
  return row;
}

export function postMoneyOut(sb, spec) {
  /* Money Out → manual receivable with empty paymentHistory — matches MoneyInOutModal */
  var row = {
    id: sb.nextId("mo"),
    date: spec.date || "2026-04-12",
    person: spec.source || "Owner drawings",
    source: spec.source || "Owner drawings",
    type: spec.type || "Drawings",
    amount: round2(spec.amount || 10000),
    paymentMethod: spec.cashMethod || "Cash",
    receiptKind: "out",
    paymentHistory: [],
    note: spec.note || "Money out",
    createdAt: (spec.date || "2026-04-12") + "T10:45:00.000Z",
  };
  sb.store.tc3_manualReceivables = (sb.store.tc3_manualReceivables || []).concat([row]);
  return row;
}

export function addCustomerReceipt(sb, saleId, amount, method) {
  var state = sb.state;
  var sale = (state.sales || []).find(function (s) { return s.id === saleId; });
  if (!sale) return { ok: false, error: "Sale not found" };
  var amt = round2(amount);
  var guard = assertPaymentFitsSaleBalance(sale, amt);
  if (guard && guard.ok === false) return { ok: false, error: guard.message || "Payment exceeds balance" };
  var paid = round2((Number(sale.paid) || 0) + amt);
  var balance = round2((Number(sale.total) || 0) - paid);
  var ph = {
    id: sb.nextId("ph"), date: "2026-04-16", amount: amt,
    cashMethod: method || "Cash", note: "Customer receipt",
  };
  var updated = Object.assign({}, sale, {
    paid: paid,
    balance: balance,
    payStatus: balance <= 0.01 ? "Paid" : "Partial",
    paymentHistory: (sale.paymentHistory || []).concat([ph]),
  });
  state.sales = state.sales.map(function (s) { return s.id === saleId ? updated : s; });
  if (sale.customerId) {
    state.customers = state.customers.map(function (c) {
      if (c.id !== sale.customerId) return c;
      return Object.assign({}, c, { credit: round2(Math.max(0, (Number(c.credit) || 0) - amt)) });
    });
  }
  return { ok: true, sale: updated };
}

export function addSupplierPayment(sb, purchaseId, amount, method) {
  var state = sb.state;
  var pur = (state.purchases || []).find(function (p) { return p.id === purchaseId; });
  if (!pur) return { ok: false, error: "Purchase not found" };
  var amt = round2(amount);
  var guard = assertPaymentFitsPurchaseBalance(pur, amt);
  if (guard && guard.ok === false) return { ok: false, error: guard.message || "Payment exceeds balance" };
  var paid = round2((Number(pur.paidAmount) || 0) + amt);
  var balance = round2((Number(pur.total) || 0) - paid);
  var ph = {
    id: sb.nextId("ph"), date: "2026-04-16", amount: amt,
    cashMethod: method || "Bank", note: "Supplier payment",
  };
  var updated = Object.assign({}, pur, {
    paidAmount: paid,
    balance: balance,
    status: balance <= 0.01 ? "Paid" : "Partial",
    payMode: balance <= 0.01 ? "paid" : "partial",
    paymentHistory: (pur.paymentHistory || []).concat([ph]),
  });
  state.purchases = state.purchases.map(function (p) { return p.id === purchaseId ? updated : p; });
  return { ok: true, purchase: updated };
}

export function postCheque(sb, spec) {
  var ch = {
    id: sb.nextId("chq"),
    type: spec.type || "incoming",
    status: spec.status || "Pending",
    chequeNo: spec.chequeNo || String(90000 + Math.floor(Math.random() * 1000)),
    bankName: spec.bankName || "HNB",
    amount: round2(spec.amount || 0),
    dueDate: spec.dueDate || "2026-05-01",
    issuedDate: spec.issuedDate || "2026-04-15",
    createdAt: spec.issuedDate || "2026-04-15",
    customerName: spec.customerName || "",
    supplierName: spec.supplierName || "",
    saleId: spec.saleId || "",
    purchaseId: spec.purchaseId || "",
    note: spec.note || "Runner cheque",
  };
  if (spec.status === "Cleared") ch.clearedDate = spec.clearedDate || "2026-04-28";
  if (spec.status === "Bounced") ch.bouncedDate = spec.bouncedDate || "2026-04-28";
  sb.state.cheques = (sb.state.cheques || []).concat([ch]);
  return ch;
}

export function clearCheque(sb, chequeId) {
  var state = sb.state;
  var found = false;
  state.cheques = (state.cheques || []).map(function (c) {
    if (c.id !== chequeId) return c;
    found = true;
    return Object.assign({}, c, { status: "Cleared", clearedDate: "2026-04-28" });
  });
  return found ? { ok: true } : { ok: false, error: "Cheque not found" };
}

export function postRepair(sb, spec) {
  var cust = (sb.state.customers || [])[0];
  var repair = {
    id: sb.nextId("rep"),
    date: spec.date || "2026-04-14",
    dateIn: spec.date || "2026-04-14",
    customer: (cust && cust.name) || "Walk-in",
    customerId: (cust && cust.id) || "",
    phone: (cust && cust.phone) || "",
    deviceType: "Laptop",
    brand: "Dell",
    modelNo: "Latitude 5410",
    problem: spec.problem || "Screen flickering",
    description: "Certification runner repair",
    estimatedCost: 8500,
    technician: "Amjad",
    accessories: "Charger",
    devices: [{
      deviceType: "Laptop", brand: "Dell", modelNo: "Latitude 5410",
      problem: spec.problem || "Screen flickering",
      status: spec.status || "Accepted",
      thirdParty: spec.thirdParty || null,
    }],
    returnedLog: [],
    internalPartsUsed: [],
    internalPartsCost: 0,
    status: spec.status || "Accepted",
    createdAt: (spec.date || "2026-04-14") + "T09:30:00.000Z",
  };
  sb.state.repairs = (sb.state.repairs || []).concat([repair]);
  return repair;
}

export function editRepair(sb, repairId, patch) {
  var state = sb.state;
  var idx = (state.repairs || []).findIndex(function (r) { return r.id === repairId; });
  if (idx < 0) return { ok: false, error: "Repair not found" };
  var next = Object.assign({}, state.repairs[idx], patch || {}, { updatedAt: new Date().toISOString() });
  if (patch && patch.status && next.devices && next.devices[0]) {
    next.devices = next.devices.map(function (d, i) {
      return i === 0 ? Object.assign({}, d, { status: patch.status }) : d;
    });
  }
  var arr = state.repairs.slice();
  arr[idx] = next;
  state.repairs = arr;
  return { ok: true, repair: next };
}

export function postQuotation(sb, spec) {
  var state = sb.state;
  var cust = state.customers[0];
  var prod = findProduct(state, spec.productId || "cr_p_ram");
  var qty = Number(spec.qty) || 2;
  var sub = round2((prod.price || 0) * qty);
  var tax = computeSaleTax(state.settings, sub);
  var q = {
    id: sb.nextId("qt"),
    quotationNo: "QT-" + sb.nextId("n"),
    date: spec.date || "2026-04-11",
    customerId: cust.id,
    customerName: cust.name,
    items: [{
      id: prod.id, name: prod.name, qty: qty, price: prod.price, cost: prod.cost,
    }],
    subTotal: sub,
    totalTax: tax.totalTax,
    selectedTaxes: tax.selectedTaxes,
    total: tax.grandTotal,
    status: spec.status || "Sent",
    createdAt: (spec.date || "2026-04-11") + "T10:00:00.000Z",
  };
  state.quotations = (state.quotations || []).concat([q]);
  return q;
}

export function stockOf(sb, productId) {
  var p = findProduct(sb.state, productId);
  return p ? (Number(p.stock) || 0) : 0;
}

export function costOf(sb, productId) {
  var p = findProduct(sb.state, productId);
  return p ? (Number(p.cost) || 0) : 0;
}

export { near, round2, findProduct };
