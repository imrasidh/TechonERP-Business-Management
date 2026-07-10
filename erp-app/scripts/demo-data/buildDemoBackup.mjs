/**
 * Full demo dataset for Techon Computers (tech retail / repair).
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

var BASE_DATE = new Date("2026-06-30T12:00:00.000Z");

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

function isoAt(date, h, m) {
  return date + "T" + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":00.000Z";
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

function purchaseQty(rng, prod) {
  var cost = prod.cost || 0;
  if (cost >= 100000) return rint(rng, 1, 6);
  if (cost >= 40000) return rint(rng, 2, 12);
  if (cost >= 10000) return rint(rng, 4, 25);
  return rint(rng, 8, 50);
}

var TECH_CATEGORIES = [
  "Laptops", "Desktops", "Components", "Storage", "Monitors",
  "Peripherals", "Networking", "Printers", "Accessories", "Software",
];

var PRODUCT_TEMPLATES = [
  { prefix: "HP Pavilion 15", cat: "Laptops", unit: "Pcs", cost: 118000, price: 145000 },
  { prefix: "Dell Inspiron 14", cat: "Laptops", unit: "Pcs", cost: 105000, price: 129900 },
  { prefix: "Lenovo IdeaPad 3", cat: "Laptops", unit: "Pcs", cost: 92000, price: 114500 },
  { prefix: "ASUS VivoBook", cat: "Laptops", unit: "Pcs", cost: 88000, price: 109000 },
  { prefix: "Acer Aspire 5", cat: "Laptops", unit: "Pcs", cost: 79000, price: 98500 },
  { prefix: "MacBook Air M2", cat: "Laptops", unit: "Pcs", cost: 285000, price: 339000 },
  { prefix: "HP ProDesk Mini", cat: "Desktops", unit: "Pcs", cost: 72000, price: 89900 },
  { prefix: "Dell OptiPlex", cat: "Desktops", unit: "Pcs", cost: 95000, price: 118000 },
  { prefix: "Custom Gaming PC i5", cat: "Desktops", unit: "Pcs", cost: 165000, price: 199000 },
  { prefix: "Intel Core i5-13400", cat: "Components", unit: "Pcs", cost: 42000, price: 52000 },
  { prefix: "AMD Ryzen 5 5600", cat: "Components", unit: "Pcs", cost: 28000, price: 34500 },
  { prefix: "Kingston 16GB DDR4", cat: "Components", unit: "Pcs", cost: 8500, price: 11500 },
  { prefix: "Corsair 32GB DDR5", cat: "Components", unit: "Pcs", cost: 18500, price: 24000 },
  { prefix: "MSI B550 Motherboard", cat: "Components", unit: "Pcs", cost: 22000, price: 28500 },
  { prefix: "NVIDIA GTX 1660", cat: "Components", unit: "Pcs", cost: 65000, price: 79900 },
  { prefix: "Samsung 1TB NVMe", cat: "Storage", unit: "Pcs", cost: 14500, price: 18900 },
  { prefix: "WD Blue 2TB HDD", cat: "Storage", unit: "Pcs", cost: 9800, price: 12500 },
  { prefix: "Seagate 4TB External", cat: "Storage", unit: "Pcs", cost: 16500, price: 21000 },
  { prefix: "SanDisk 128GB USB", cat: "Storage", unit: "Pcs", cost: 1800, price: 2500 },
  { prefix: "LG 24\" FHD Monitor", cat: "Monitors", unit: "Pcs", cost: 28000, price: 35500 },
  { prefix: "Dell 27\" IPS Monitor", cat: "Monitors", unit: "Pcs", cost: 52000, price: 64900 },
  { prefix: "AOC 22\" LED", cat: "Monitors", unit: "Pcs", cost: 18500, price: 23500 },
  { prefix: "Logitech MK270 Combo", cat: "Peripherals", unit: "Pcs", cost: 4200, price: 5900 },
  { prefix: "Razer DeathAdder", cat: "Peripherals", unit: "Pcs", cost: 8500, price: 11500 },
  { prefix: "Redragon K552 Keyboard", cat: "Peripherals", unit: "Pcs", cost: 6500, price: 8900 },
  { prefix: "TP-Link Archer C6", cat: "Networking", unit: "Pcs", cost: 7500, price: 9900 },
  { prefix: "D-Link 8-Port Switch", cat: "Networking", unit: "Pcs", cost: 4200, price: 5500 },
  { prefix: "Ubiquiti UniFi AP", cat: "Networking", unit: "Pcs", cost: 18500, price: 24000 },
  { prefix: "Canon PIXMA G3720", cat: "Printers", unit: "Pcs", cost: 42000, price: 52000 },
  { prefix: "HP LaserJet Pro", cat: "Printers", unit: "Pcs", cost: 68000, price: 84500 },
  { prefix: "Laptop Bag 15.6\"", cat: "Accessories", unit: "Pcs", cost: 2200, price: 3500 },
  { prefix: "USB-C Hub 7-in-1", cat: "Accessories", unit: "Pcs", cost: 3500, price: 4900 },
  { prefix: "HDMI Cable 2m", cat: "Accessories", unit: "Pcs", cost: 650, price: 1200 },
  { prefix: "Windows 11 Pro License", cat: "Software", unit: "Pcs", cost: 18500, price: 24000 },
  { prefix: "MS Office Home 2024", cat: "Software", unit: "Pcs", cost: 22000, price: 28500 },
  { prefix: "Kaspersky Internet Security", cat: "Software", unit: "Pcs", cost: 4500, price: 6500 },
];

var EXPENSE_CATS = ["Transport", "Utilities", "Salaries", "Rent", "Maintenance", "Marketing", "Office", "Courier"];

var BANKS = ["BOC", "HNB", "Sampath", "Peoples", "Commercial", "DFCC", "NDB"];

var CUSTOMER_NAMES = [
  "Rashid Ahmed", "Tech Solutions Lanka", "Colombo IT Hub", "Smart Systems Pvt Ltd",
  "Nimal Perera", "Green Valley School", "City Computers", "Digital Wave Agency",
  "Ayub Khan", "Lanka Enterprises", "Pixel Print House", "Ocean View Hotel",
  "Sunrise Academy", "Metro Trading", "Silva & Sons", "Cyber Cafe Central",
];

var SUPPLIER_NAMES = [
  "Tech Distributors Lanka", "Ingram Micro SL", "Singer PLC IT Division", "Redline Technologies",
  "Barclays Computers", "Unity Plaza Wholesale", "PC House Imports", "Global IT Supplies",
  "Colombo Components", "Mega Storage Lanka", "Network Pro SL", "Print Solutions Wholesale",
];

var REPAIR_PROBLEMS = [
  "No power / dead board", "Screen flickering", "Keyboard not working", "Slow performance / virus",
  "HDD failure", "Battery not charging", "Wi-Fi not connecting", "Overheating / fan noise",
  "Blue screen errors", "Liquid damage assessment",
];

/** Max allowed inventory vs GL drift (Rs) for bulk WAC demo data — journal must still balance exactly. */
export var DEMO_INV_GL_TOLERANCE = 8000;

/** Demo dataset scale — computer shop A–Z coverage */
var DEMO_SCALE = {
  stockProducts: 100,
  customers: 120,
  suppliers: 50,
  purchases: 78,
  sales: 220,
  salesReturns: 45,
  purchaseReturns: 28,
  manualReceivables: 40,
  manualPayables: 32,
  quotations: 60,
  expenses: 50,
  repairsTotal: 70,
  extra3pRepairs: 12,
};

export function buildDemoBackup() {
  var rng = makeRng(20260630);
  var stockLedger = {};
  var cheques = [];
  var chSeq = 0;

  function trackStock(pid, delta) {
    stockLedger[pid] = round2((stockLedger[pid] || 0) + delta);
  }

  function availStock(pid) {
    return Math.max(0, stockLedger[pid] || 0);
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

  /* ── Products (100 stock + service SKUs) ── */
  var products = [];
  var i;
  var STOCK_N = DEMO_SCALE.stockProducts;
  for (i = 0; i < STOCK_N; i++) {
    var tpl = PRODUCT_TEMPLATES[i % PRODUCT_TEMPLATES.length];
    var variant = i >= PRODUCT_TEMPLATES.length ? " v" + (Math.floor(i / PRODUCT_TEMPLATES.length) + 1) : "";
    var cost = intCost(tpl.cost * (0.92 + (i % 7) * 0.02));
    var price = intCost(tpl.price * (0.95 + (i % 5) * 0.03));
    products.push({
      id: "demo-p-" + i,
      productId: String(2000 + i),
      name: tpl.prefix + variant,
      barcode: "TC" + String(700000 + i),
      category: tpl.cat,
      type: "stock",
      unit: tpl.unit,
      cost: cost,
      price: price,
      stock: 0,
      damaged: 0,
      description: i % 6 === 0 ? "Brand new sealed unit" : "",
      require_comment: false,
      comment_label: "Comment",
      createdAt: isoAt(dateStr(rint(rng, 60, 90)), 9, rint(rng, 0, 59)),
    });
  }
  /* Service SKUs for repairs / labour */
  ["Laptop Repair Labour", "Data Recovery Service", "Virus Removal", "OS Installation", "Network Setup"].forEach(function (name, si) {
    products.push({
      id: "demo-svc-" + si,
      productId: String(9000 + si),
      name: name,
      barcode: "",
      category: "Services",
      type: "service",
      unit: "Job",
      cost: 0,
      price: intCost(2500 + si * 1500),
      stock: 0,
      damaged: 0,
      description: "Service charge",
      require_comment: true,
      comment_label: "Job details",
      createdAt: isoAt(dateStr(30), 10, 0),
    });
  });

  /* ── Customers ── */
  var customers = [];
  for (i = 0; i < DEMO_SCALE.customers; i++) {
    customers.push({
      id: "demo-c-" + i,
      name: i < CUSTOMER_NAMES.length ? CUSTOMER_NAMES[i] : "Customer " + (i + 1),
      phone: "077" + String(2000000 + i * 137).slice(0, 7),
      address: ["Colombo 03", "Kandy", "Negombo", "Gampaha", "Matara", "Kurunegala"][i % 6],
      credit: 0,
      totalSpent: 0,
      createdAt: isoAt(dateStr(rint(rng, 30, 80)), 8, rint(rng, 0, 59)),
    });
  }

  /* ── Suppliers ── */
  var suppliers = [];
  for (i = 0; i < DEMO_SCALE.suppliers; i++) {
    suppliers.push({
      id: "demo-s-" + i,
      name: i < SUPPLIER_NAMES.length ? SUPPLIER_NAMES[i] : "Supplier " + (i + 1),
      phone: "011" + String(8000000 + i * 211).slice(0, 7),
      email: i % 3 === 0 ? "orders@" + (i + 1) + "supplier.lk" : "",
      address: ["Colombo 10", "Peliyagoda", "Nugegoda", "Dehiwala"][i % 4],
      note: i % 4 === 0 ? "Net 30 terms" : "",
      payable: 0,
      createdAt: isoAt(dateStr(rint(rng, 40, 90)), 9, 0),
    });
  }

  /* ── Purchases — stock in first ── */
  var purchases = [];
  var PUR_COUNT = DEMO_SCALE.purchases;
  for (i = 0; i < PUR_COUNT; i++) {
    var sup = suppliers[i % suppliers.length];
    var lineCount = i % 4 === 0 ? rint(rng, 2, 3) : 1;
    var items = [];
    var lineVal = 0;
    var j;
    for (j = 0; j < lineCount; j++) {
      var pidx = (i + j * 7) % products.length;
      var prod = products[pidx];
      if (prod.type === "service") continue;
      var qty = purchaseQty(rng, prod);
      items.push(purLine(prod, qty));
      lineVal = round2(lineVal + prod.cost * qty);
      trackStock(prod.id, qty);
    }
    if (!items.length) {
      var fallback = products[i % 20];
      var fq = purchaseQty(rng, fallback);
      items.push(purLine(fallback, fq));
      lineVal = round2(fallback.cost * fq);
      trackStock(fallback.id, fq);
    }
    var dt = dateStr(rint(rng, 20, 85));
    var payMode = i % 10;
    var paidAmount = 0;
    var paymentHistory = [];
    var chId = null;

    if (payMode === 0) {
      paidAmount = lineVal;
      paymentHistory = [ph("demo-ph-pur-" + i + "-1", dt, lineVal, "Bank", { note: "Full bank transfer" })];
    } else if (payMode === 1) {
      paidAmount = lineVal;
      paymentHistory = [ph("demo-ph-pur-" + i + "-1", dt, lineVal, "Cash", { note: "Cash on delivery" })];
    } else if (payMode === 2 || payMode === 3) {
      paidAmount = round2(lineVal * (payMode === 2 ? 0.35 : 0.45));
      paymentHistory = [ph("demo-ph-pur-" + i + "-1", dt, paidAmount, "Bank", { note: "Partial advance" })];
    } else if (payMode === 4 || payMode === 5) {
      paidAmount = round2(lineVal * (payMode === 4 ? 0.25 : 0.3));
      chId = "demo-ch-out-" + (++chSeq);
      var chAmt = round2(lineVal - paidAmount);
      paymentHistory = [
        ph("demo-ph-pur-" + i + "-1", dt, paidAmount, "Bank", { note: "Advance paid" }),
        ph("demo-ph-pur-" + i + "-2", dt, 0, "Cheque", { chequeId: chId, note: "Balance by cheque" }),
      ];
      cheques.push({
        id: chId, type: "outgoing", status: payMode === 4 ? "Pending" : "Cleared",
        chequeNo: String(45000 + chSeq), bankName: pick(rng, BANKS), amount: chAmt,
        dueDate: dateStr(-rint(rng, 3, 25)), issuedDate: dt, createdAt: dt,
        clearedDate: payMode === 4 ? undefined : dateStr(rint(rng, 0, 15)),
        supplierName: sup.name, purchaseId: "demo-pur-" + i,
        purchaseNo: "PUR-2026" + String(1000 + i),
        note: "Supplier payment cheque",
      });
      if (payMode === 5) {
        paidAmount = round2(paidAmount + chAmt);
        paymentHistory.push(ph("demo-ph-pur-" + i + "-3", dateStr(rint(rng, 0, 12)), chAmt, "Bank", { chequeId: chId, note: "Cheque cleared" }));
      }
    } else {
      paidAmount = 0;
    }

    purchases.push({
      id: "demo-pur-" + i,
      supplier: sup.name,
      invoiceNo: "PUR-2026" + String(1000 + i),
      date: dt,
      payMode: paidAmount >= lineVal ? "paid" : (paidAmount > 0 ? "partial" : "credit"),
      items: items,
      total: lineVal,
      paidAmount: paidAmount,
      balance: round2(lineVal - paidAmount),
      status: paidAmount >= lineVal ? "Paid" : (paidAmount > 0 ? "Partial" : "Unpaid"),
      paymentHistory: paymentHistory,
      createdAt: isoAt(dt, rint(rng, 8, 17), rint(rng, 0, 59)),
    });
  }

  /* ── Sales ── */
  var sales = [];
  var SALE_COUNT = DEMO_SCALE.sales;
  for (i = 0; i < SALE_COUNT; i++) {
    var cust = i % 5 === 0 ? null : customers[rint(rng, 0, customers.length - 1)];
    var lineCountS = i % 3 === 0 ? rint(rng, 2, 4) : 1;
    var saleItems = [];
    var subTotal = 0;
    var j2;
    for (j2 = 0; j2 < lineCountS; j2++) {
      var sprod = products[rint(rng, 0, products.length - 6)];
      if (sprod.type === "service") continue;
      var maxQty = Math.max(1, Math.min(15, Math.floor(availStock(sprod.id))));
      if (maxQty < 1) {
        sprod = products[(i + j2) % 30];
        maxQty = Math.max(1, Math.min(8, Math.floor(availStock(sprod.id))));
      }
      var sqty = rint(rng, 1, Math.max(1, maxQty));
      trackStock(sprod.id, -sqty);
      saleItems.push(saleLine(sprod, sqty));
      subTotal = round2(subTotal + sprod.price * sqty);
    }
    if (!saleItems.length) {
      var fb = products[i % 15];
      var fbq = 1;
      trackStock(fb.id, -fbq);
      saleItems.push(saleLine(fb, fbq));
      subTotal = fb.price;
    }
    var discount = i % 8 === 0 ? round2(subTotal * 0.05) : 0;
    var total = round2(subTotal - discount);
    var dt = dateStr(rint(rng, 0, 55));
    var invNo = "INV-2026" + String(2000 + i);
    var saleId = "demo-sale-" + i;
    var mode = i % 9;
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
    } else if (mode === 2) {
      paid = round2(total * pick(rng, [0.35, 0.45, 0.5])); balance = round2(total - paid); payStatus = "Partial"; cashMethod = "Cash";
      paymentHistory = [ph("demo-ph-sale-" + i + "-1", dt, paid, "Cash", { note: "Advance payment" })];
    } else if (mode === 3) {
      paid = 0; balance = total; payStatus = "Unpaid"; cashMethod = "Credit";
    } else if (mode === 4) {
      var c1 = round2(total * 0.6);
      var c2 = round2(total - c1);
      paid = total; balance = 0; payStatus = "Paid"; cashMethod = "Cash";
      paymentHistory = [
        ph("demo-ph-sale-" + i + "-1", dt, c1, "Cash", { note: "Split — cash" }),
        ph("demo-ph-sale-" + i + "-2", dt, c2, "Bank", { note: "Split — bank" }),
      ];
    } else if (mode === 5) {
      var chIn = "demo-ch-in-" + (++chSeq);
      paid = 0; balance = total; payStatus = "Unpaid"; cashMethod = "Cheque";
      paymentHistory = [ph("demo-ph-sale-" + i + "-1", dt, 0, "Cheque", { chequeId: chIn, note: "Cheque received — pending" })];
      cheques.push({
        id: chIn, type: "incoming", status: "Pending",
        chequeNo: String(98000 + chSeq), bankName: pick(rng, BANKS), amount: total,
        dueDate: dateStr(-rint(rng, 2, 20)), issuedDate: dt, createdAt: dt,
        customerId: cust ? cust.id : "", customerName: cust ? cust.name : "Walk-in",
        saleId: saleId, invoiceNo: invNo, note: "Customer cheque — pending clearance",
      });
    } else if (mode === 6) {
      var chClr = "demo-ch-in-" + (++chSeq);
      paid = total; balance = 0; payStatus = "Paid"; cashMethod = "Bank";
      paymentHistory = [ph("demo-ph-sale-" + i + "-1", dt, total, "Bank", { chequeId: chClr, note: "Cheque cleared" })];
      cheques.push({
        id: chClr, type: "incoming", status: "Cleared",
        chequeNo: String(87000 + chSeq), bankName: pick(rng, BANKS), amount: total,
        dueDate: dt, issuedDate: dateStr(rint(rng, 1, 12)), createdAt: dateStr(rint(rng, 1, 12)),
        clearedDate: dt, customerId: cust ? cust.id : "", customerName: cust ? cust.name : "Walk-in",
        saleId: saleId, invoiceNo: invNo, note: "Cleared incoming cheque",
      });
    } else if (mode === 7) {
      paid = round2(total * 0.3);
      var later = round2(total * 0.4);
      balance = round2(total - paid - later);
      payStatus = balance <= 0.01 ? "Paid" : "Partial";
      paid = round2(paid + later);
      balance = round2(total - paid);
      if (balance <= 0.01) { balance = 0; payStatus = "Paid"; }
      cashMethod = "Bank";
      paymentHistory = [
        ph("demo-ph-sale-" + i + "-1", dt, round2(total * 0.3), "Cash", { note: "Deposit" }),
        ph("demo-ph-sale-" + i + "-2", dateStr(Math.max(0, rint(rng, 0, 12))), later, "Bank", { note: "Follow-up payment" }),
      ];
    } else {
      paid = round2(total * 0.2); balance = round2(total - paid); payStatus = "Partial"; cashMethod = "Bank";
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
      items: saleItems,
      subTotal: subTotal,
      discount: discount,
      total: total,
      paid: paid,
      balance: balance,
      payStatus: payStatus,
      cashMethod: cashMethod,
      paymentHistory: paymentHistory,
      includeWarranty: i % 5 === 0,
      createdAt: isoAt(dt, rint(rng, 9, 18), rint(rng, 0, 59)),
    });
  }

  /* Bounced cheque */
  cheques.push({
    id: "demo-ch-bounced-1", type: "incoming", status: "Bounced",
    chequeNo: "88142", bankName: "Peoples", amount: 28500,
    dueDate: "2026-06-22", issuedDate: "2026-06-18", createdAt: "2026-06-18",
    bouncedDate: dateStr(3), customerId: customers[2].id, customerName: customers[2].name,
    saleId: "", invoiceNo: "", note: "Bounced — customer to reissue",
  });

  /* ── Sales returns — mix partial qty returns ── */
  var salesReturns = [];
  for (i = 0; i < DEMO_SCALE.salesReturns; i++) {
    var src = sales[rint(rng, 5, sales.length - 1)];
    var item = src.items[rint(rng, 0, src.items.length - 1)];
    var maxRet = Math.max(1, item.qty - 1);
    var rqty = i % 3 === 0 ? Math.max(1, Math.floor(item.qty / 2)) : (maxRet >= 1 ? rint(rng, 1, maxRet) : 1);
    rqty = Math.min(rqty, item.qty);
    var ramt = round2(item.price * rqty);
    var isRefund = i % 4 !== 3;
    salesReturns.push({
      id: "demo-sr-" + i,
      returnId: "SR-2026" + String(100 + i),
      invoiceId: src.id,
      invoiceNo: src.invoiceNo,
      productId: item.id,
      productName: item.name,
      qty: rqty,
      amount: ramt,
      cost: item.cost,
      date: dateStr(rint(rng, 0, 25)),
      customer: src.customerName,
      customerId: src.customerId,
      reason: pick(rng, ["Defective unit", "Wrong model supplied", "Customer changed mind", "Warranty claim", "DOA — dead on arrival"]),
      isRefund: isRefund,
      refundMethod: isRefund ? (i % 3 === 0 ? "Bank" : "Cash") : null,
      refundAmount: isRefund ? ramt : 0,
      createdAt: isoAt(dateStr(rint(rng, 0, 25)), 11, rint(rng, 0, 59)),
    });
    trackStock(item.id, rqty);
  }

  /* ── Purchase returns ── */
  var purchaseReturns = [];
  for (i = 0; i < DEMO_SCALE.purchaseReturns; i++) {
    var pur = purchases[rint(rng, 0, purchases.length - 1)];
    var pitem = pur.items[rint(rng, 0, pur.items.length - 1)];
    var prmax = Math.max(1, Math.floor(pitem.qty / 3));
    var prqty = i % 2 === 0 ? prmax : Math.max(1, rint(rng, 1, prmax));
    prqty = Math.min(prqty, pitem.qty);
    purchaseReturns.push({
      id: "demo-pr-" + i,
      returnId: "PR-2026" + String(100 + i),
      purchaseId: pur.id,
      purchaseNo: pur.invoiceNo,
      purchaseLineId: pitem.id,
      productId: pitem.id,
      productName: pitem.name,
      qty: prqty,
      amount: round2(pitem.cost * prqty),
      date: dateStr(rint(rng, 10, 50)),
      supplier: pur.supplier,
      cost: pitem.cost,
      reason: pick(rng, ["Damaged in transit", "Wrong spec received", "Supplier RMA", "Excess stock return"]),
      isRefund: i % 3 !== 2,
      refundMethod: i % 3 !== 2 ? (i % 2 === 0 ? "Bank" : "Cash") : null,
      refundAmount: i % 3 !== 2 ? round2(pitem.cost * prqty) : 0,
      createdAt: isoAt(dateStr(rint(rng, 10, 50)), 10, 30),
    });
    trackStock(pitem.id, -prqty);
  }

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

  /* ── Manual receivables ── */
  var manualReceivables = [];
  for (i = 0; i < DEMO_SCALE.manualReceivables; i++) {
    var mramt = round2(rint(rng, 8000, 120000));
    var mrPaid = round2(mramt * (rint(rng, 0, 75) / 100));
    var mrHist = [];
    if (mrPaid > 0) {
      mrHist.push(ph("demo-ph-mr-" + i, dateStr(rint(rng, 0, 30)), mrPaid, pick(rng, ["Cash", "Bank"]), { note: "Partial collection" }));
    }
    manualReceivables.push({
      id: "demo-mr-" + i,
      date: dateStr(rint(rng, 15, 70)),
      person: customers[i % customers.length].name,
      type: pick(rng, ["Loan Given", "Advance", "Other Receivable"]),
      amount: mramt,
      paymentMethod: "Bank",
      reference: "MR-2026-" + (i + 1),
      note: "IT equipment advance — demo",
      paymentHistory: mrHist,
      createdAt: isoAt(dateStr(rint(rng, 15, 70)), 9, 0),
    });
  }

  /* ── Manual payables ── */
  var manualPayables = [];
  for (i = 0; i < DEMO_SCALE.manualPayables; i++) {
    var mpamt = round2(rint(rng, 5000, 90000));
    var mpPaid = round2(mpamt * (rint(rng, 0, 65) / 100));
    var mpHist = [];
    if (mpPaid > 0) {
      mpHist.push(ph("demo-ph-mp-" + i, dateStr(rint(rng, 0, 25)), mpPaid, pick(rng, ["Cash", "Bank"]), { note: "Partial settlement" }));
    }
    manualPayables.push({
      id: "demo-mp-" + i,
      date: dateStr(rint(rng, 10, 65)),
      source: suppliers[i % suppliers.length].name,
      type: pick(rng, ["Borrowed Money", "Credit Purchase", "Other Payable"]),
      amount: mpamt,
      paymentMethod: "Bank",
      reference: "MP-2026-" + (i + 1),
      note: "Supplier credit line — demo",
      paymentHistory: mpHist,
      createdAt: isoAt(dateStr(rint(rng, 10, 65)), 14, 0),
    });
  }

  /* ── Quotations ── */
  var quotations = [];
  for (i = 0; i < DEMO_SCALE.quotations; i++) {
    var qLines = [];
    var qsub = 0;
    var qlc = i % 3 === 0 ? rint(rng, 2, 5) : 1;
    for (var qi = 0; qi < qlc; qi++) {
      var qprod = products[rint(rng, 0, products.length - 6)];
      var qqty = rint(rng, 1, 12);
      qLines.push({
        id: qprod.id, name: qprod.name, barcode: qprod.barcode, unit: qprod.unit,
        saleUnit: qprod.unit, qty: qqty, price: qprod.price,
        description: "", comment: "", commentLabel: "", customPrice: false,
      });
      qsub = round2(qsub + qprod.price * qqty);
    }
    var qdisc = i % 5 === 0 ? round2(qsub * 0.04) : 0;
    var qcust = customers[rint(rng, 0, customers.length - 1)];
    quotations.push({
      id: "demo-q-" + i,
      quotationNo: "QT-2026" + String(300 + i),
      customer: qcust.name,
      customerId: qcust.id,
      customerPhone: qcust.phone,
      items: qLines,
      notes: i % 3 === 0 ? "Valid 14 days. Prices subject to stock availability." : (i % 4 === 0 ? "Bulk order quote for office setup." : ""),
      status: pick(rng, ["Draft", "Sent", "Accepted", "Expired"]),
      date: dateStr(rint(rng, 0, 40)),
      createdAt: isoAt(dateStr(rint(rng, 0, 40)), 10, rint(rng, 0, 59)),
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

  /* ── Repairs (computer shop — multi-device, 3rd party, delivered, returned) ── */
  var repairs = [];
  var repairSaleSeq = 0;
  var DEVICE_TYPES = ["Laptop", "Desktop", "Printer", "Monitor", "Phone", "Tablet"];
  var BRANDS = ["HP", "Dell", "Lenovo", "ASUS", "Acer", "Canon", "Apple", "Samsung"];
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

  function create3pProduct(repairId, deviceIndex, repair, device, cost, sell) {
    var pid = "demo-3p-prod-" + repairId + "-d" + deviceIndex;
    var name = "3P Repair - " + repair.customer + " - " + device.deviceType + " " + device.brand + " " + device.modelNo + " - Bill#" + repairId.slice(-8).toUpperCase() + " - D" + (deviceIndex + 1);
    var prod = {
      id: pid,
      productId: "RP3P-" + repairId.slice(-8).toUpperCase() + "-" + (deviceIndex + 1),
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

  function add3pPayable(repairId, deviceIndex, repair, device, supplier, cost, sell, recvDate, paySpec) {
    var prod = create3pProduct(repairId, deviceIndex, repair, device, cost, sell);
    var payableId = "demo-3p-mp-" + (++mpSeq);
    var paymentHistory = paySpec.paymentHistory || [];
    var paidAmount = paySpec.paidAmount || 0;
    var payMode = paySpec.payMode || "unpaid";
    var cashMethod = paySpec.cashMethod || "Credit";
  var payable = {
      id: payableId,
      date: recvDate,
      source: supplier.name,
      type: "3rd Party Repair Cost",
      productId: prod.id,
      qty: 1,
      amount: round2(cost),
      paymentMethod: payMode === "unpaid" ? "Credit" : cashMethod,
      reference: repairId.slice(-8).toUpperCase(),
      note: prod.name,
      paymentHistory: paymentHistory,
      createdAt: isoAt(recvDate, 11, 0),
      thirdPartyRepairId: repairId,
      thirdPartyDeviceIndex: deviceIndex,
      supplierId: supplier.id,
      supplierPhone: supplier.phone || "",
    };
    manualPayables.push(payable);
    return {
      product: prod,
      payable: payable,
      thirdParty: {
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierPhone: supplier.phone || "",
        productName: prod.name,
        productId: prod.id,
        amount: round2(cost),
        sellAmount: round2(sell),
        payMode: payMode,
        cashMethod: cashMethod,
        paidAmount: round2(paidAmount),
        paid: paidAmount >= cost - 0.01,
        payableId: payableId,
        note: paySpec.note || "",
        receivedAt: recvDate,
        splitRows: paySpec.splitRows || [],
      },
    };
  }

  function addRepairSale(repair, deviceIndexes, lines, saleDate, paySpec) {
    var total = round2(lines.reduce(function (a, ln) { return a + (ln.price || 0) * (ln.qty || 1); }, 0));
    var paid = paySpec.paid != null ? round2(paySpec.paid) : total;
    var balance = round2(total - paid);
    var saleId = "demo-rep-sale-" + (++repairSaleSeq);
    var invNo = "INV-REP-" + String(5000 + repairSaleSeq);
    lines.forEach(function (ln) {
      if (ln.id && products.find(function (p) { return p.id === ln.id && p.type !== "service"; })) {
        trackStock(ln.id, -(ln.qty || 1));
      }
    });
    var sale = {
      id: saleId,
      invoiceNo: invNo,
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
      paymentHistory: paySpec.paymentHistory || (paid > 0 ? [ph("demo-ph-rs-" + repairSaleSeq, saleDate, paid, paySpec.cashMethod || "Cash", { note: "Repair invoice payment" })] : []),
      fromRepairId: repair.id,
      fromRepairDeviceIndexes: deviceIndexes,
      createdAt: isoAt(saleDate, 15, 30),
    };
    sales.push(sale);
    return sale;
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
      description: "Workshop repair ticket — demo data",
      estimatedCost: round2(rint(rng, 3500, 28000)),
      technician: pick(rng, ["Rashid", "Amjad", "Fazil", "Tech Team"]),
      accessories: "Charger",
      devices: devices,
      returnedLog: [],
      internalPartsUsed: [],
      internalPartsCost: 0,
      status: deriveRepairBillStatus(devices),
      createdAt: isoAt(dateIn, 9, rint(rng, 0, 59)),
    }, extra || {});
  }

  var extSupplier = suppliers.find(function (s) { return s.name.indexOf("Redline") >= 0; }) || suppliers[2];
  var chipSupplier = suppliers.find(function (s) { return s.name.indexOf("Components") >= 0; }) || suppliers[8];

  /* Active multi-device bill */
  repairs.push(buildRepairBill("demo-rep-0", customers[0], dateStr(42), [
    repairDevice("Laptop", "Dell", "5490", "Screen flickering", "Accepted"),
    repairDevice("Laptop", "HP", "15-dw3033", "Battery not charging", "Ready"),
    repairDevice("Desktop", "HP", "ProDesk 400", "No display output", "Accepted"),
  ]));

  /* Mixed delivered + returned on same bill */
  repairs.push(buildRepairBill("demo-rep-1", customers[1], dateStr(38), [
    repairDevice("Laptop", "Lenovo", "ThinkPad E14", "Keyboard keys stuck", "Delivered"),
    repairDevice("Phone", "Samsung", "A54", "Charging port loose", "Returned"),
    repairDevice("Tablet", "Apple", "iPad 9", "Cracked glass", "Accepted"),
  ], {
    returnedLog: [{
      id: "demo-retlog-1", date: dateStr(20), deviceIndex: 1,
      device: repairDevice("Phone", "Samsung", "A54", "Charging port loose", "Returned"),
    }],
  }));

  /* 3rd party — still at external center */
  repairs.push(buildRepairBill("demo-rep-2", customers[2], dateStr(30), [
    repairDevice("Laptop", "ASUS", "VivoBook 15", "Motherboard repair", "Third Party", {
      thirdParty: { sentAt: dateStr(28), note: "Sent to Redline for board-level repair" },
    }),
  ]));

  /* 3rd party received — cash paid, ready */
  (function () {
    var cust = customers[3];
    var dateIn = dateStr(35);
    var recvDate = dateStr(18);
    var dev = repairDevice("Laptop", "Dell", "Latitude 3420", "Liquid damage cleanup", "Third Party");
    var tp = add3pPayable("demo-rep-3", 0, { customer: cust.name }, dev, extSupplier, 15000, 25000, recvDate, {
      payMode: "paid", cashMethod: "Cash", paidAmount: 15000,
      paymentHistory: [ph("demo-ph-3p-1", recvDate, 15000, "Cash", { note: "3P repair cash paid" })],
      note: "Received from Redline",
    });
    dev.status = "Ready";
    dev.thirdParty = tp.thirdParty;
    repairs.push(buildRepairBill("demo-rep-3", cust, dateIn, [dev]));
  })();

  /* 3rd party received — partial bank */
  (function () {
    var cust = customers[4];
    var recvDate = dateStr(22);
    var dev = repairDevice("Printer", "Canon", "G3720", "Print head replacement", "Third Party");
    var tp = add3pPayable("demo-rep-4", 0, { customer: cust.name }, dev, chipSupplier, 8500, 14500, recvDate, {
      payMode: "partial", cashMethod: "Bank", paidAmount: 5000,
      paymentHistory: [ph("demo-ph-3p-2", recvDate, 5000, "Bank", { note: "3P partial bank payment" })],
      splitRows: [{ method: "Bank", amount: 5000, note: "Advance to chip supplier" }],
    });
    dev.status = "Ready";
    dev.thirdParty = tp.thirdParty;
    repairs.push(buildRepairBill("demo-rep-4", cust, dateStr(28), [dev]));
  })();

  /* 3rd party received — cheque pending */
  (function () {
    var cust = customers[5];
    var recvDate = dateStr(15);
    var ch3p = "demo-ch-3p-" + (++chSeq);
    var dev = repairDevice("Monitor", "LG", "24MK430", "Panel repair", "Third Party");
    var tp = add3pPayable("demo-rep-5", 0, { customer: cust.name }, dev, extSupplier, 12000, 19500, recvDate, {
      payMode: "partial", cashMethod: "Cheque", paidAmount: 0,
      paymentHistory: [ph("demo-ph-3p-3", recvDate, 0, "Cheque", { chequeId: ch3p, note: "3P repair cheque pending" })],
      splitRows: [{ method: "Cheque", amount: 12000, chequeNo: "CH3P-4421", chequeBankName: "Sampath", chequeDueDate: dateStr(-5) }],
      note: "Cheque issued to 3P center",
    });
    cheques.push({
      id: ch3p, type: "outgoing", status: "Pending",
      chequeNo: "CH3P-4421", bankName: "Sampath", amount: 12000,
      dueDate: dateStr(-5), issuedDate: recvDate, createdAt: recvDate,
      supplierName: extSupplier.name, note: "3rd party repair payment",
      manualPayableId: tp.payable.id,
      thirdPartyRepairId: "demo-rep-5", thirdPartyDeviceIndex: 0,
    });
    dev.status = "Ready";
    dev.thirdParty = tp.thirdParty;
    repairs.push(buildRepairBill("demo-rep-5", cust, dateStr(25), [dev]));
  })();

  /* 3rd party delivered — full flow with repair invoice */
  (function () {
    var cust = customers[6];
    var dateIn = dateStr(40);
    var recvDate = dateStr(24);
    var saleDate = dateStr(10);
    var dev = repairDevice("Laptop", "HP", "2460", "No power after rain", "Third Party");
    var tp = add3pPayable("demo-rep-6", 0, { customer: cust.name }, dev, extSupplier, 15000, 25000, recvDate, {
      payMode: "paid", cashMethod: "Bank", paidAmount: 15000,
      paymentHistory: [ph("demo-ph-3p-4", recvDate, 15000, "Bank", { note: "3P board repair paid" })],
    });
    dev.status = "Delivered";
    dev.thirdParty = tp.thirdParty;
    var bill = buildRepairBill("demo-rep-6", cust, dateIn, [dev], { dateOut: saleDate });
    repairs.push(bill);
    addRepairSale(bill, [0], [{
      id: tp.product.id, name: "HP 2460 Board Repair", qty: 1, price: 25000, cost: 15000,
      barcode: tp.product.barcode, fromRepairId: bill.id,
    }], saleDate, {
      paid: 25000, cashMethod: "Cash",
      paymentHistory: [ph("demo-ph-rs-6", saleDate, 25000, "Cash", { note: "3P repair delivered invoice" })],
    });
  })();

  /* In-house ready + internal parts used */
  (function () {
    var cust = customers[7];
    var partProd = products.find(function (p) { return p.name.indexOf("Samsung 1TB") >= 0; }) || products[15];
    var usedQty = 1;
    /* Internal parts tracked on repair record only — stock movement handled in live app flow */
    repairs.push(buildRepairBill("demo-rep-7", cust, dateStr(20), [
      repairDevice("Laptop", "Acer", "Aspire 5", "Slow / HDD failure", "Ready"),
    ], {
      internalPartsUsed: [{
        productId: partProd.id, name: partProd.name, qty: usedQty, unit: partProd.unit,
        unitCost: partProd.cost, totalCost: round2(partProd.cost * usedQty),
      }],
      internalPartsCost: round2(partProd.cost * usedQty),
    }));
  })();

  /* Service-only repair delivered (labour invoice) */
  (function () {
    var cust = customers[8];
    var svc = products.find(function (p) { return p.type === "service"; }) || products[80];
    var saleDate = dateStr(8);
    var bill = buildRepairBill("demo-rep-8", cust, dateStr(18), [
      repairDevice("Laptop", "Lenovo", "IdeaPad", "Virus removal", "Delivered"),
    ], { dateOut: saleDate });
    repairs.push(bill);
    addRepairSale(bill, [0], [{
      id: svc.id, name: svc.name, qty: 1, price: svc.price, cost: 0,
      barcode: "", fromRepairId: bill.id,
    }], saleDate, { paid: svc.price, cashMethod: "Bank" });
  })();

  /* Multi-device partial invoice — only ready device invoiced */
  (function () {
    var cust = customers[9];
    var saleDate = dateStr(12);
    var bill = buildRepairBill("demo-rep-9", cust, dateStr(32), [
      repairDevice("Laptop", "Dell", "3500", "Fan noise", "Delivered"),
      repairDevice("Laptop", "Dell", "3520", "Wi-Fi issue", "Ready"),
      repairDevice("Desktop", "Dell", "OptiPlex", "PSU failure", "Accepted"),
    ], { dateOut: saleDate });
    repairs.push(bill);
    var svc = products.find(function (p) { return p.name === "Laptop Repair Labour"; }) || products[80];
    addRepairSale(bill, [0], [{
      id: svc.id, name: "Dell 3500 Fan Service", qty: 1, price: 6500, cost: 0,
      barcode: "", fromRepairId: bill.id,
    }], saleDate, {
      paid: 3500, cashMethod: "Cash",
      paymentHistory: [ph("demo-ph-rs-9", saleDate, 3500, "Cash", { note: "Partial on repair invoice" })],
    });
  })();

  /* More active / returned / 3P / delivered variety */
  for (i = 10; i < DEMO_SCALE.repairsTotal; i++) {
    var rc = customers[i % customers.length];
    var rdateIn = dateStr(rint(rng, 5, 55));
    var stPick = i % 7;
    var devs = [];
    if (stPick === 0) {
      devs = [repairDevice(pick(rng, DEVICE_TYPES), pick(rng, BRANDS), "MOD-" + rint(rng, 1000, 9999), pick(rng, REPAIR_PROBLEMS), "Accepted")];
    } else if (stPick === 1) {
      devs = [
        repairDevice("Laptop", pick(rng, BRANDS), "MOD-A" + i, pick(rng, REPAIR_PROBLEMS), "Ready"),
        repairDevice("Printer", "Canon", "PIXMA-" + i, "Paper jam", "Accepted"),
      ];
    } else if (stPick === 2) {
      devs = [repairDevice("Phone", "Samsung", "Galaxy-" + i, "Screen replacement", "Returned")];
    } else if (stPick === 3) {
      devs = [repairDevice("Laptop", "Apple", "MacBook-" + i, "Board level repair", "Third Party", {
        thirdParty: { sentAt: rdateIn, note: "At external service center" },
      })];
    } else if (stPick === 4) {
      devs = [
        repairDevice("Monitor", "Dell", "P-" + i, "Backlight issue", "Delivered"),
        repairDevice("Desktop", "HP", "Elite-" + i, "Boot loop", "Accepted"),
      ];
    } else if (stPick === 5) {
      devs = [
        repairDevice("Laptop", "Lenovo", "Yoga-" + i, "Hinge broken", "Ready"),
        repairDevice("Tablet", "Samsung", "Tab-" + i, "Touch issue", "Returned"),
        repairDevice("Phone", "Apple", "iPhone-" + i, "Battery swell", "Accepted"),
      ];
    } else {
      devs = [
        repairDevice("Desktop", "ASUS", "ROG-" + i, "GPU issue", "Third Party", {
          thirdParty: { sentAt: rdateIn, note: "GPU rework at chip supplier" },
        }),
        repairDevice("Laptop", "HP", "Envy-" + i, "SSD upgrade", "Ready"),
      ];
    }
    var extraR = {};
    if (devs.some(function (d) { return d.status === "Returned"; })) {
      extraR.returnedLog = devs.map(function (d, idx) {
        if (d.status !== "Returned") return null;
        return { id: "demo-retlog-" + i + "-" + idx, date: dateStr(rint(rng, 0, 15)), deviceIndex: idx, device: Object.assign({}, d) };
      }).filter(Boolean);
    }
    var bill = buildRepairBill("demo-rep-" + i, rc, rdateIn, devs, extraR);

    /* Every 8th bill: 3P received (cash) → ready */
    if (i % 8 === 0) {
      var tpDev = devs[0];
      if (tpDev && (tpDev.status === "Third Party" || i % 16 === 0)) {
        var recvDt = dateStr(rint(rng, 8, 20));
        var supPick = suppliers[rint(rng, 0, suppliers.length - 1)];
        var cost3p = round2(rint(rng, 6000, 22000));
        var sell3p = round2(cost3p * pick(rng, [1.35, 1.45, 1.55, 1.65]));
        var tp = add3pPayable("demo-rep-" + i, 0, bill, tpDev, supPick, cost3p, sell3p, recvDt, {
          payMode: i % 16 === 0 ? "partial" : "paid",
          cashMethod: i % 16 === 0 ? "Bank" : "Cash",
          paidAmount: i % 16 === 0 ? round2(cost3p * 0.4) : cost3p,
          paymentHistory: [ph("demo-ph-3pb-" + i, recvDt, i % 16 === 0 ? round2(cost3p * 0.4) : cost3p, i % 16 === 0 ? "Bank" : "Cash", { note: "3P bulk receive" })],
        });
        tpDev.status = "Ready";
        tpDev.thirdParty = tp.thirdParty;
      }
    }

    /* Every 11th bill: convert ready/delivered device to invoice */
    if (i % 11 === 0) {
      var saleDt = dateStr(rint(rng, 2, 12));
      var invDevIdx = devs.findIndex(function (d) { return d.status === "Ready" || d.status === "Delivered"; });
      if (invDevIdx < 0) invDevIdx = 0;
      var invDev = devs[invDevIdx];
      invDev.status = "Delivered";
      bill.dateOut = saleDt;
      var svcProd = products.find(function (p) { return p.type === "service"; });
      var lines = [];
      if (invDev.thirdParty && invDev.thirdParty.productId) {
        var tpProd = products.find(function (p) { return p.id === invDev.thirdParty.productId; });
        if (tpProd) {
          lines.push({
            id: tpProd.id, name: tpProd.name, qty: 1, price: invDev.thirdParty.sellAmount || tpProd.price,
            cost: invDev.thirdParty.amount || tpProd.cost, barcode: tpProd.barcode, fromRepairId: bill.id,
          });
        }
      } else if (svcProd) {
        lines.push({
          id: svcProd.id, name: "Repair — " + invDev.brand + " " + invDev.modelNo, qty: 1,
          price: round2(rint(rng, 4500, 18000)), cost: 0,
          barcode: "", fromRepairId: bill.id,
        });
      }
      if (lines.length) {
        var invPaid = i % 22 === 0 ? round2(lines[0].price * 0.35) : lines[0].price;
        addRepairSale(bill, [invDevIdx], lines, saleDt, {
          paid: invPaid,
          cashMethod: i % 3 === 0 ? "Bank" : "Cash",
          paymentHistory: invPaid > 0 ? [ph("demo-ph-3pr-" + i, saleDt, invPaid, i % 3 === 0 ? "Bank" : "Cash", { note: "Repair invoice bulk" })] : [],
        });
      }
    }

    repairs.push(bill);
  }

  /* Extra 3rd-party repair flows for full A–Z coverage */
  for (i = 0; i < 12; i++) {
    var c3 = customers[(70 + i) % customers.length];
    var dIn = dateStr(rint(rng, 10, 45));
    var d3 = repairDevice(pick(rng, DEVICE_TYPES), pick(rng, BRANDS), "3PX-" + i, pick(rng, REPAIR_PROBLEMS), "Third Party");
    var bill3 = buildRepairBill("demo-rep-3px-" + i, c3, dIn, [d3]);
    var recv3 = dateStr(rint(rng, 5, 18));
    var sup3 = suppliers[(i + 3) % suppliers.length];
    var cst = round2(rint(rng, 7000, 28000));
    var sel = round2(cst * pick(rng, [1.4, 1.5, 1.6]));
    var paySpec3 = { payMode: "paid", cashMethod: "Cash", paidAmount: cst, paymentHistory: [ph("demo-ph-3px-" + i, recv3, cst, "Cash")] };
    if (i % 3 === 0) {
      paySpec3 = { payMode: "partial", cashMethod: "Bank", paidAmount: round2(cst * 0.5), paymentHistory: [ph("demo-ph-3px-" + i, recv3, round2(cst * 0.5), "Bank")] };
    } else if (i % 3 === 1) {
      var chx = "demo-ch-3px-" + (++chSeq);
      paySpec3 = {
        payMode: "partial", cashMethod: "Cheque", paidAmount: 0,
        paymentHistory: [ph("demo-ph-3px-ch-" + i, recv3, 0, "Cheque", { chequeId: chx })],
        splitRows: [{ method: "Cheque", amount: cst, chequeNo: "3PX-" + (5000 + i), chequeBankName: pick(rng, BANKS), chequeDueDate: dateStr(-rint(rng, 3, 20)) }],
        _chequeDraft: {
          id: chx, type: "outgoing", status: i % 2 === 0 ? "Pending" : "Cleared",
          chequeNo: "3PX-" + (5000 + i), bankName: pick(rng, BANKS), amount: cst,
          dueDate: dateStr(-rint(rng, 3, 20)), issuedDate: recv3, createdAt: recv3,
          supplierName: sup3.name, thirdPartyRepairId: bill3.id, thirdPartyDeviceIndex: 0,
          note: "3P repair centre cheque",
        },
      };
    }
    var tp3 = add3pPayable(bill3.id, 0, bill3, d3, sup3, cst, sel, recv3, paySpec3);
    if (paySpec3._chequeDraft) {
      cheques.push(Object.assign({}, paySpec3._chequeDraft, { manualPayableId: tp3.payable.id }));
    }
    d3.status = i % 4 === 0 ? "Delivered" : "Ready";
    d3.thirdParty = tp3.thirdParty;
    if (d3.status === "Delivered") {
      bill3.dateOut = dateStr(rint(rng, 1, 8));
      addRepairSale(bill3, [0], [{
        id: tp3.product.id, name: tp3.product.name, qty: 1, price: sel, cost: cst,
        barcode: tp3.product.barcode, fromRepairId: bill3.id,
      }], bill3.dateOut, {
        paid: i % 2 === 0 ? sel : round2(sel * 0.4),
        cashMethod: i % 2 === 0 ? "Bank" : "Cash",
        paymentHistory: [ph("demo-ph-3px-inv-" + i, bill3.dateOut, i % 2 === 0 ? sel : round2(sel * 0.4), i % 2 === 0 ? "Bank" : "Cash")],
      });
    }
    repairs.push(bill3);
  }

  /* ── Expenses ── */
  var expenses = [];
  for (i = 0; i < DEMO_SCALE.expenses; i++) {
    expenses.push({
      id: "demo-exp-" + i,
      date: dateStr(rint(rng, 0, 60)),
      category: pick(rng, EXPENSE_CATS),
      description: pick(rng, EXPENSE_CATS) + " — " + pick(rng, ["Showroom", "Workshop", "Delivery", "Admin"]) + " (" + (i + 1) + ")",
      amount: round2(rint(rng, 2000, 45000)),
      paymentMethod: i % 4 === 0 ? "Cash" : "Bank",
      createdAt: isoAt(dateStr(rint(rng, 0, 60)), 12, 0),
    });
  }

  /* Sync product.stock from ledger */
  products.forEach(function (p) {
    if (p.type === "service") return;
    p.stock = Math.max(0, Math.round(stockLedger[p.id] || 0));
  });

  var settings = {
    shopName: "Techon Computers",
    address: "No. 45, Main Street, Colombo 03",
    phone: "0112345678",
    phone2: "0112987654",
    whatsapp: "0771234567",
    email: "info@techon.lk",
    website: "www.techon.lk",
    brn: "PV00234567",
    footer: "Thank you for your business!",
    currency: "Rs",
    taxEnabled: false,
    taxMode: "exclusive",
    selectedTaxes: [],
    warrantyEnabled: true,
    warrantyText: "1 Year Manufacturer Warranty on eligible items.",
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
    glInventoryReconcileTolerance: DEMO_INV_GL_TOLERANCE,
  };

  var data = {
    tc3_businessType: "tech",
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
    tc3_repairs: repairs,
    tc3_expenses: expenses,
    tc3_assets: [],
    tc3_damageLog: [],
    tc3_productLog: [],
    tc3_auditLog: [],
    tc3_openBal: {
      completed: true,
      date: "2026-05-01",
      cash: 12000000,
      bank: 35000000,
      note: "Techon Computers opening balances — working capital for IT retail",
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
    repairs: data.tc3_repairs || [],
    manualPayables: data.tc3_manualPayables || [],
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
