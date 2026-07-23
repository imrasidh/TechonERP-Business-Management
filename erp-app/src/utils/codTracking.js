/** COD / delivery tracking — optional TechonERP module (separate from tc3_sales schema). */

export var COD_SALE_TYPES = ["Direct Sale", "Direct Delivery", "COD"];

export var COD_DELIVERY_STATUSES = ["Accepted", "Dispatched", "Delivered", "Returned"];

export var COD_LOCKED_STATUSES = ["Delivered", "Returned"];

/** Withdrawal pools — recover costs or pay profit share from delivered COD orders. */
export var COD_WITHDRAWAL_FUNDS = [
  { id: "paidItems", label: "Paid items cost", short: "Paid items" },
  { id: "freeItems", label: "Free items cost", short: "Free items" },
  { id: "courier", label: "COD / delivery cost", short: "COD cost" },
  { id: "yourProfit", label: "Shop profit", short: "Shop profit" },
  { id: "profit", label: "Partner profit share", short: "Partner profit" },
];

export function codWithdrawalFundLabel(fundId) {
  var f = COD_WITHDRAWAL_FUNDS.find(function (x) { return x.id === fundId; });
  return f ? f.label : fundId || "Profit share";
}

export function codWithdrawalFundShort(fundId) {
  var f = COD_WITHDRAWAL_FUNDS.find(function (x) { return x.id === fundId; });
  return f ? f.short : fundId || "Profit";
}

export function withdrawalFund(w) {
  var f = w && w.withdrawFrom;
  if (f === "paidItems" || f === "freeItems" || f === "courier" || f === "yourProfit" || f === "profit") return f;
  return "profit";
}

export function emptyCodTrackForm() {
  return {
    trackInCod: false,
    saleType: "Direct Sale",
    trackingNumber: "",
    altPhone: "",
    address: "",
    courierCost: "",
  };
}

export function emptyCodProfitSettings() {
  return {
    totalInvestment: 0,
    shareholders: [],
    updatedAt: "",
  };
}

export function emptyShareholder(id) {
  return {
    id: id,
    name: "",
    investmentAmount: 0,
    openingBalanceOwed: 0,
    userSharePercentage: 60,
    partnerSharePercentage: 40,
    isActive: true,
    sortOrder: 0,
  };
}

/** Resolve customer name + phone for COD validation. */
export function resolveCodCustomer(custMode, custId, newCust, customers) {
  if (custMode === "walkin") {
    return { name: "", phone: "", isWalkIn: true };
  }
  if (custMode === "existing" && custId) {
    var c = (customers || []).find(function (x) { return x.id === custId; });
    return {
      name: c ? String(c.name || "").trim() : "",
      phone: c ? String(c.phone || "").trim() : "",
      isWalkIn: false,
    };
  }
  if (custMode === "new") {
    return {
      name: String((newCust && newCust.name) || "").trim(),
      phone: String((newCust && newCust.phone) || "").trim(),
      isWalkIn: false,
    };
  }
  return { name: "", phone: "", isWalkIn: true };
}

export function isCodCustomerReady(custMode, custId, newCust, customers) {
  var c = resolveCodCustomer(custMode, custId, newCust, customers);
  if (c.isWalkIn) return false;
  return !!(c.name && c.phone);
}

export function validateCodCheckout(form, custMode, custId, newCust, customers) {
  if (!form || !form.trackInCod) return null;
  if (form.saleType !== "COD") return null;
  if (isCodCustomerReady(custMode, custId, newCust, customers)) return null;
  return "Cash on Delivery (COD) requires a customer with name and phone number.\n\nSelect Customer above, then choose an existing customer or add a new one with name and phone before saving.";
}

export function migrateLegacyPartners(oldList) {
  if (!Array.isArray(oldList) || !oldList.length) return emptyCodProfitSettings();
  return {
    totalInvestment: 100,
    shareholders: oldList.map(function (p, i) {
      return {
        id: p.id || ("cod_sh_" + i),
        name: p.name || "",
        investmentAmount: Number(p.investmentPercentage) || 0,
        openingBalanceOwed: Number(p.openingBalanceOwed) || 0,
        userSharePercentage: Number(p.userSharePercentage) || 60,
        partnerSharePercentage: Number(p.partnerSharePercentage) || 40,
        isActive: p.isActive !== false,
        sortOrder: p.sortOrder || i + 1,
      };
    }),
  };
}

export function ensureCodProfitSettings(S) {
  var stored = S.get("tc3_codProfitSettings", null);
  if (stored && typeof stored === "object" && Array.isArray(stored.shareholders)) {
    return hydrateProfitSettings(stored);
  }
  var legacy = S.get("tc3_codPartners", null);
  if (Array.isArray(legacy) && legacy.length > 0) {
    var migrated = hydrateProfitSettings(migrateLegacyPartners(legacy));
    S.set("tc3_codProfitSettings", migrated);
    return migrated;
  }
  var empty = emptyCodProfitSettings();
  S.set("tc3_codProfitSettings", empty);
  return empty;
}

/** @deprecated use ensureCodProfitSettings */
export function ensureCodPartners(S) {
  return ensureCodProfitSettings(S);
}

export function sumShareholderInvestments(shareholders) {
  return (shareholders || []).reduce(function (a, sh) {
    return a + (Number(sh.investmentAmount) || 0);
  }, 0);
}

export function shareholderInvestmentPct(sh, totalInvestment) {
  var total = Number(totalInvestment) || 0;
  if (total <= 0) return 0;
  return Math.round((Number(sh.investmentAmount) || 0) / total * 10000) / 100;
}

function codNumOr(v, fallback) {
  if (v == null || v === "") return fallback;
  var n = Number(v);
  return isNaN(n) ? fallback : n;
}

export function hydrateProfitSettings(settings) {
  var next = Object.assign({}, emptyCodProfitSettings(), settings || {});
  next.totalInvestment = codNumOr(next.totalInvestment, 0);
  next.shareholders = (next.shareholders || []).map(function (sh, i) {
    var row = sh || {};
    var id = row.id || ("cod_sh_" + i);
    var userPct = codNumOr(row.userSharePercentage, 60);
    var partnerPct = row.partnerSharePercentage != null && row.partnerSharePercentage !== ""
      ? codNumOr(row.partnerSharePercentage, Math.max(0, 100 - userPct))
      : Math.max(0, 100 - userPct);
    return Object.assign({}, emptyShareholder(id), row, {
      id: id,
      name: row.name != null ? String(row.name) : "",
      investmentAmount: codNumOr(row.investmentAmount, 0),
      openingBalanceOwed: codNumOr(row.openingBalanceOwed, 0),
      userSharePercentage: userPct,
      partnerSharePercentage: partnerPct,
      sortOrder: row.sortOrder != null ? row.sortOrder : i + 1,
      isActive: row.isActive !== false,
    });
  });
  return next;
}

export function activeShareholders(settings) {
  return (settings && settings.shareholders || [])
    .filter(function (sh) { return sh.isActive !== false; })
    .sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
}

export function codNetProfit(soldTotal, costTotal, courierCost, freeItemsCost, otherCost) {
  var v = (Number(soldTotal) || 0)
    - (Number(costTotal) || 0)
    - (Number(courierCost) || 0)
    - (Number(freeItemsCost) || 0)
    - (Number(otherCost) || 0);
  return Math.round(v * 100) / 100;
}

export function calcCartCostTotal(cart, products, getCostPerUnit) {
  var total = 0;
  (cart || []).forEach(function (line) {
    var prod = (products || []).find(function (p) { return p.id === line.id; });
    var unit = line.saleUnit || line.unit || "Pcs";
    var cost = prod && getCostPerUnit
      ? (Number(getCostPerUnit(prod, unit)) || 0)
      : (Number(line.cost) || 0);
    total += cost * (Number(line.qty) || 0);
  });
  return Math.round(total * 100) / 100;
}

export function buildItemsSummary(cart, freeCart) {
  var names = (cart || []).map(function (x) { return x.name; }).concat((freeCart || []).map(function (x) { return x.name + " (free)"; }));
  return names.filter(Boolean).join(", ") || "—";
}

export function buildCodRecordFromSale(opts) {
  var form = opts.form || {};
  var sale = opts.sale || {};
  var cart = opts.cart || [];
  var freeCart = opts.freeCart || [];
  var products = opts.products || [];
  var getCostPerUnit = opts.getCostPerUnit;
  var uid = opts.uid;
  var existing = opts.existing || null;

  var soldTotal = Number(sale.total) || 0;
  var paidCost = calcCartCostTotal(cart, products, getCostPerUnit);
  var freeItemsCost = calcCartCostTotal(freeCart, products, getCostPerUnit);
  var paidItemsCost = paidCost;
  var costTotal = Math.round((paidCost + freeItemsCost) * 100) / 100;
  var courierCost = parseFloat(form.courierCost) || 0;
  var otherCost = 0;
  var status = existing && existing.deliveryStatus ? existing.deliveryStatus : "Accepted";
  var netProfit = codNetProfit(soldTotal, paidCost, courierCost, freeItemsCost, otherCost);

  var now = new Date().toISOString();
  return {
    id: existing ? existing.id : uid(),
    saleId: sale.id,
    invoiceNo: sale.invoiceNo || "",
    saleDate: sale.date || "",
    customerName: sale.customerName || "Walk-in",
    customerPhone: sale.customerPhone || "",
    altPhone: String(form.altPhone || "").trim(),
    customerAddress: String(form.address || "").trim(),
    saleType: form.saleType || "Direct Sale",
    trackingNumber: String(form.trackingNumber || "").trim(),
    deliveryStatus: status,
    soldTotal: soldTotal,
    paidItemsCost: paidItemsCost,
    costTotal: costTotal,
    courierCost: courierCost,
    freeItemsCost: freeItemsCost,
    otherCost: otherCost,
    netProfit: netProfit,
    itemsSummary: buildItemsSummary(cart, freeCart),
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };
}

export function shouldPersistCodRecord(form) {
  return !!(form && form.trackInCod);
}

export function partnerProfitBreakdown(netProfit, settingsOrPartners) {
  var settings = settingsOrPartners && settingsOrPartners.shareholders
    ? settingsOrPartners
    : { totalInvestment: 100, shareholders: settingsOrPartners || [] };
  var totalInv = Number(settings.totalInvestment) || 0;
  var breakdown = [];
  activeShareholders(settings).forEach(function (sh) {
    var inv = shareholderInvestmentPct(sh, totalInv);
    var userPct = Number(sh.userSharePercentage) || 60;
    var partnerPct = Number(sh.partnerSharePercentage) || 40;
    var totalShare = Math.round((Number(netProfit) || 0) * inv / 100 * 100) / 100;
    var userShare = Math.round(totalShare * userPct / 100 * 100) / 100;
    var partnerShare = Math.round(totalShare * partnerPct / 100 * 100) / 100;
    breakdown.push({
      partnerId: sh.id,
      name: sh.name,
      investmentAmount: Number(sh.investmentAmount) || 0,
      investmentPercentage: inv,
      totalShare: totalShare,
      userShare: userShare,
      partnerShare: partnerShare,
    });
  });
  return breakdown;
}

export function sumDeliveredPartnerShares(records, settings) {
  var totals = {};
  activeShareholders(settings).forEach(function (sh) {
    totals[sh.id] = {
      partnerId: sh.id,
      name: sh.name,
      investmentAmount: Number(sh.investmentAmount) || 0,
      userShare: 0,
      partnerShare: 0,
      totalShare: 0,
    };
  });
  (records || []).filter(function (r) { return r.deliveryStatus === "Delivered"; }).forEach(function (r) {
    var rows = partnerProfitBreakdown(r.netProfit, settings);
    rows.forEach(function (row) {
      if (!totals[row.partnerId]) {
        totals[row.partnerId] = {
          partnerId: row.partnerId,
          name: row.name,
          investmentAmount: row.investmentAmount,
          userShare: 0,
          partnerShare: 0,
          totalShare: 0,
        };
      }
      totals[row.partnerId].userShare += row.userShare;
      totals[row.partnerId].partnerShare += row.partnerShare;
      totals[row.partnerId].totalShare += row.totalShare;
    });
  });
  return Object.keys(totals).map(function (k) { return totals[k]; });
}

/** Paid cart cost (laptop etc.) — stored on new records; derived for older rows. */
export function getPaidItemsCost(record) {
  if (!record) return 0;
  if (record.paidItemsCost != null && !isNaN(record.paidItemsCost)) {
    return Math.round((Number(record.paidItemsCost) || 0) * 100) / 100;
  }
  var total = Number(record.costTotal) || 0;
  var free = Number(record.freeItemsCost) || 0;
  return Math.round(Math.max(0, total - free) * 100) / 100;
}

export function summarizeCodCostBreakdown(records) {
  var paid = 0;
  var free = 0;
  var cod = 0;
  var other = 0;
  var sold = 0;
  var profit = 0;
  (records || []).forEach(function (r) {
    paid += getPaidItemsCost(r);
    free += Number(r.freeItemsCost) || 0;
    cod += Number(r.courierCost) || 0;
    other += Number(r.otherCost) || 0;
    sold += Number(r.soldTotal) || 0;
    profit += Number(r.netProfit) || 0;
  });
  return {
    paidItemsCost: Math.round(paid * 100) / 100,
    freeItemsCost: Math.round(free * 100) / 100,
    courierCost: Math.round(cod * 100) / 100,
    otherCost: Math.round(other * 100) / 100,
    soldTotal: Math.round(sold * 100) / 100,
    netProfit: Math.round(profit * 100) / 100,
  };
}

export function sumAllCodWithdrawals(withdrawals) {
  return Math.round((withdrawals || []).reduce(function (a, w) {
    return a + (Number(w.amount) || 0);
  }, 0) * 100) / 100;
}

export function sumWithdrawalsByFund(withdrawals, fundId) {
  return Math.round((withdrawals || []).reduce(function (a, w) {
    if (withdrawalFund(w) !== fundId) return a;
    return a + (Number(w.amount) || 0);
  }, 0) * 100) / 100;
}

export function sumProfitWithdrawalsForShareholder(withdrawals, shareholderId) {
  return Math.round((withdrawals || []).reduce(function (a, w) {
    if (w.shareholderId !== shareholderId) return a;
    if (withdrawalFund(w) !== "profit") return a;
    return a + (Number(w.amount) || 0);
  }, 0) * 100) / 100;
}

/** Your share of delivered COD profit (net profit minus partner shares). */
export function computeYourProfitTotal(records, profitSettings) {
  var delivered = summarizeCodCostBreakdown((records || []).filter(function (r) {
    return r.deliveryStatus === "Delivered";
  }));
  var partners = sumDeliveredPartnerShares(records, profitSettings);
  if (!partners.length) {
    return Math.round((delivered.netProfit || 0) * 100) / 100;
  }
  var partnerProfitOwed = partners.reduce(function (a, p) {
    return a + (Number(p.partnerShare) || 0);
  }, 0);
  return Math.round(((delivered.netProfit || 0) - partnerProfitOwed) * 100) / 100;
}

/** Per-fund totals from delivered orders, withdrawn amount, and how much more can be withdrawn. */
export function computeCodFundBalances(records, withdrawals, profitSettings) {
  var delivered = summarizeCodCostBreakdown((records || []).filter(function (r) {
    return r.deliveryStatus === "Delivered";
  }));
  var balanceRows = computeShareholderBalances(profitSettings, records, withdrawals);
  var yourProfitTotal = computeYourProfitTotal(records, profitSettings);
  var partnerPoolTotal = 0;
  if (balanceRows.length > 0) {
    balanceRows.forEach(function (row) {
      partnerPoolTotal += (Number(row.openingBalanceOwed) || 0) + (Number(row.profitOwed) || 0);
    });
  } else {
    partnerPoolTotal = 0;
  }
  partnerPoolTotal = Math.round(partnerPoolTotal * 100) / 100;

  var defs = [
    { id: "paidItems", label: "Paid items cost", total: delivered.paidItemsCost, color: "#2979ff", group: "cost" },
    { id: "freeItems", label: "Free items cost", total: delivered.freeItemsCost, color: "#7c3aed", group: "cost" },
    { id: "courier", label: "COD / delivery cost", total: delivered.courierCost, color: "#f59e0b", group: "cost" },
    { id: "yourProfit", label: "Shop profit", total: yourProfitTotal, color: "#0d9488", group: "shop" },
    { id: "profit", label: "Partner profit share", total: partnerPoolTotal, color: "#16a34a", group: "partner" },
  ];

  return defs.map(function (d) {
    var withdrawn = sumWithdrawalsByFund(withdrawals, d.id);
    var total = Math.round((Number(d.total) || 0) * 100) / 100;
    var remaining = Math.round((total - withdrawn) * 100) / 100;
    return {
      id: d.id,
      label: d.label,
      total: total,
      withdrawn: withdrawn,
      remaining: remaining,
      color: d.color,
      group: d.group,
    };
  });
}

/** Pool totals: costs, profit, withdrawn, and balance left after withdrawals. */
export function summarizeCodPoolBalance(records, withdrawals, profitSettings) {
  var all = summarizeCodCostBreakdown(records);
  var delivered = summarizeCodCostBreakdown((records || []).filter(function (r) {
    return r.deliveryStatus === "Delivered";
  }));
  var fundBalances = computeCodFundBalances(records, withdrawals, profitSettings);
  var totalProductCost = Math.round((all.paidItemsCost + all.freeItemsCost) * 100) / 100;
  var totalCosts = Math.round((totalProductCost + all.courierCost + all.otherCost) * 100) / 100;
  var balanceRows = computeShareholderBalances(profitSettings, records, withdrawals);
  var totalOpening = 0;
  var totalProfitOwed = 0;
  var totalPayeeRemaining = 0;
  balanceRows.forEach(function (row) {
    totalOpening += Number(row.openingBalanceOwed) || 0;
    totalProfitOwed += Number(row.profitOwed) || 0;
    totalPayeeRemaining += Number(row.currentBalance) || 0;
  });
  var yourProfitTotal = computeYourProfitTotal(records, profitSettings);
  var yourProfitWithdrawn = sumWithdrawalsByFund(withdrawals, "yourProfit");
  var yourProfitRemaining = Math.round((yourProfitTotal - yourProfitWithdrawn) * 100) / 100;
  return {
    paidItemsCost: all.paidItemsCost,
    freeItemsCost: all.freeItemsCost,
    courierCost: all.courierCost,
    otherCost: all.otherCost,
    totalProductCost: totalProductCost,
    totalCosts: totalCosts,
    soldTotal: all.soldTotal,
    netProfitAll: all.netProfit,
    netProfitDelivered: delivered.netProfit,
    deliveredPaidItemsCost: delivered.paidItemsCost,
    deliveredFreeItemsCost: delivered.freeItemsCost,
    deliveredCourierCost: delivered.courierCost,
    fundBalances: fundBalances,
    yourProfitTotal: yourProfitTotal,
    yourProfitWithdrawn: yourProfitWithdrawn,
    yourProfitRemaining: yourProfitRemaining,
    totalWithdrawn: sumAllCodWithdrawals(withdrawals),
    totalOpeningOwed: Math.round(totalOpening * 100) / 100,
    totalProfitOwed: Math.round(totalProfitOwed * 100) / 100,
    totalBalanceRemaining: Math.round(totalPayeeRemaining * 100) / 100,
    hasPayees: balanceRows.length > 0,
    payeeCount: balanceRows.length,
  };
}

export function recalcCodRecordProfit(record) {
  /* costTotal = all product cost (paid + complimentary); courier is separate */
  var np = Math.round(((Number(record.soldTotal) || 0)
    - (Number(record.costTotal) || 0)
    - (Number(record.courierCost) || 0)
    - (Number(record.otherCost) || 0)) * 100) / 100;
  return Object.assign({}, record, { netProfit: np, updatedAt: new Date().toISOString() });
}

export function isCodStatusLocked(status) {
  return COD_LOCKED_STATUSES.indexOf(status) >= 0;
}

export function emptyCodWithdrawal(id) {
  return {
    id: id,
    shareholderId: "",
    shareholderName: "",
    withdrawFrom: "profit",
    date: "",
    amount: 0,
    paymentMethod: "Cash",
    note: "",
    balanceAfter: 0,
    fundBalanceAfter: 0,
    createdAt: new Date().toISOString(),
  };
}

export function sumWithdrawalsForShareholder(withdrawals, shareholderId) {
  return sumProfitWithdrawalsForShareholder(withdrawals, shareholderId);
}

export function computeShareholderBalances(settings, records, withdrawals) {
  var profitTotals = sumDeliveredPartnerShares(records, settings);
  return activeShareholders(settings).map(function (sh) {
    var profitRow = profitTotals.find(function (r) { return r.partnerId === sh.id; }) || {};
    var opening = Number(sh.openingBalanceOwed) || 0;
    var profitOwed = Number(profitRow.partnerShare) || 0;
    var withdrawn = sumProfitWithdrawalsForShareholder(withdrawals, sh.id);
    var totalOwed = Math.round((opening + profitOwed) * 100) / 100;
    var currentBalance = Math.round((totalOwed - withdrawn) * 100) / 100;
    return {
      shareholderId: sh.id,
      name: sh.name,
      investmentAmount: Number(sh.investmentAmount) || 0,
      openingBalanceOwed: opening,
      profitOwed: profitOwed,
      totalOwed: totalOwed,
      profitForYou: Number(profitRow.userShare) || 0,
      totalProfitPool: Number(profitRow.totalShare) || 0,
      totalWithdrawn: Math.round(withdrawn * 100) / 100,
      currentBalance: currentBalance,
      canWithdrawMore: currentBalance,
    };
  });
}

export function withdrawalMatchesMonth(w, monthKey) {
  if (!monthKey || monthKey === "all") return true;
  var d = String(w.date || w.createdAt || "").slice(0, 7);
  return d === monthKey;
}

export function currentMonthKey(dateStr) {
  var d = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(d.getTime())) d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

/** Hide COD rows linked to voided/missing sales (main sale void removes COD on void; this catches orphans). */
export function activeCodRecords(codRecords, sales) {
  var saleById = {};
  (sales || []).forEach(function (s) {
    if (s && s.id != null) saleById[String(s.id)] = s;
  });
  return (codRecords || []).filter(function (r) {
    if (!r || r.saleId == null || r.saleId === "") return true;
    var sale = saleById[String(r.saleId)];
    if (!sale) return false;
    var st = String(sale.status || sale.payStatus || "").toLowerCase();
    return st !== "voided" && st !== "cancelled";
  });
}
