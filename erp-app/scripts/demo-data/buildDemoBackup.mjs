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
export var DEMO_INV_GL_TOLERANCE = 2500;

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

  /* ── Products (80) ── */
  var products = [];
  var i;
  for (i = 0; i < 80; i++) {
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

  /* ── Customers (55) ── */
  var customers = [];
  for (i = 0; i < 55; i++) {
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

  /* ── Suppliers (35) ── */
  var suppliers = [];
  for (i = 0; i < 35; i++) {
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

  /* ── Purchases (65) — stock in first ── */
  var purchases = [];
  var PUR_COUNT = 65;
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

  /* ── Sales (65) ── */
  var sales = [];
  var SALE_COUNT = 65;
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

  /* ── Sales returns (18) — mix partial qty returns ── */
  var salesReturns = [];
  for (i = 0; i < 18; i++) {
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

  /* ── Purchase returns (12) ── */
  var purchaseReturns = [];
  for (i = 0; i < 12; i++) {
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

  /* ── Manual receivables (15) ── */
  var manualReceivables = [];
  for (i = 0; i < 15; i++) {
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

  /* ── Manual payables (15) ── */
  var manualPayables = [];
  for (i = 0; i < 15; i++) {
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

  /* ── Quotations (28) ── */
  var quotations = [];
  for (i = 0; i < 28; i++) {
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

  /* ── Repairs (18) ── */
  var repairs = [];
  var REPAIR_STATUSES = ["Pending", "Repairing", "Ready", "Delivered", "Delivered", "Repairing", "Pending", "Ready"];
  var DEVICE_TYPES = ["Laptop", "Desktop", "Printer", "Monitor", "Phone", "Tablet"];
  var BRANDS = ["HP", "Dell", "Lenovo", "ASUS", "Acer", "Canon", "Apple", "Samsung"];
  for (i = 0; i < 18; i++) {
    var rc = customers[rint(rng, 0, customers.length - 1)];
    var rstatus = REPAIR_STATUSES[i % REPAIR_STATUSES.length];
    var rdateIn = dateStr(rint(rng, 0, 45));
    repairs.push({
      id: "demo-rep-" + i,
      date: rdateIn,
      dateIn: rdateIn,
      dateOut: rstatus === "Delivered" ? dateStr(Math.max(0, rint(rng, 0, 10))) : "",
      customer: rc.name,
      customerId: rc.id,
      phone: rc.phone,
      deviceType: pick(rng, DEVICE_TYPES),
      brand: pick(rng, BRANDS),
      modelNo: "MOD-" + rint(rng, 1000, 9999),
      problem: pick(rng, REPAIR_PROBLEMS),
      description: "Customer reported issue. Diagnostic in progress.",
      estimatedCost: round2(rint(rng, 2500, 35000)),
      technician: pick(rng, ["Rashid", "Amjad", "Fazil", "Tech Team"]),
      accessories: i % 3 === 0 ? "Charger included" : (i % 4 === 0 ? "Laptop bag" : ""),
      status: rstatus,
      createdAt: isoAt(rdateIn, 9, rint(rng, 0, 59)),
    });
  }

  /* ── Expenses (25) ── */
  var expenses = [];
  for (i = 0; i < 25; i++) {
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
    glInventoryReconcileTolerance: 2500,
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
