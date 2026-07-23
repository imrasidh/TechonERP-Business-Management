import React, { useState, useEffect, useRef, useMemo, startTransition } from "react";
import { LIST_PAGE_SIZE } from "../utils/listPage.js";
import { round2 } from "../accounting/generalLedger.js";
import { validateSnapshotIntegrity } from "../accounting/financialSnapshot.js";
import { buildReconciliationReport } from "../accounting/reconciliationReport.js";
import { validateJournalBalanced, DEFAULT_GL_CHART } from "../accounting/generalLedger.js";
import { deriveInventoryEconomics, reconcileInventoryToLedger, isInventoryReconcileOk } from "../accounting/inventoryEngine.js";
import { SnapshotIntegrityBadge } from "../ui/SnapshotIntegrityBadge.jsx";
import { validateExtraUnits, buildUnitsPersistFields } from "../units/productUnits.js";
import { diffTrialBalanceSnapshotVsLive } from "../accounting/snapshotTbDiff.js";
import { deriveLineStockValue } from "../utils/purchaseValuation.js";
import { productMatchesSearch, productMatchesSearchExact } from "../utils/productSearch.js";
import { DEFAULT_PRODUCT_COMMENT_LABEL } from "../productionConfig.js";
import { stampProductStock, stampUpdatedAt, stampTransactionIsoDateTime } from "../utils/stampUpdatedAt.js";
import GlassSheetInfo from "../components/GlassSheetInfo.jsx";
import {
  isGlassStockProductForm,
  validateGlassProductForm,
  glassCostPriceLabels,
  glassFieldsFromProductForm,
  glassPersistFieldsFromRow,
  glassFormFieldsOnUnitChange,
  isGlassSheetProductForm,
} from "../utils/glassProduct.js";
import { ActBtn, ActBtnGroup, actBtnCellStyle } from "../components/ActBtn.jsx";
import { buildDocPrintHeaderHtml } from "../components/DocPrintHeader.jsx";
import { evaluateProductNameMatch, checkProductName } from "../utils/productNameMatch.js";
import ProductNameDuplicateHint, { useProductNameHintControls } from "../components/ProductNameDuplicateHint.jsx";
import AddNewProductModal, { blankNewProductForm } from "../components/AddNewProductModal.jsx";
import { activeSales, activePurchases, activePurchaseReturns } from "../utils/voidInvoice.js";
import CategorySelect from "../components/CategorySelect.jsx";
import { getUnitsForSubCategory, hydrateShopSettings, getDefaultProductCategory, getDefaultProductUnit } from "../utils/categoryGroups.js";

function isMeaningfulGlLastError(err) {
  if (err == null) return false;
  if (Array.isArray(err)) return err.length > 0;
  if (typeof err === "string") return err.trim().length > 0;
  if (typeof err !== "object") return !!err;
  if (typeof err.message === "string" && err.message.trim()) return true;
  if (err.type === "missing_license_secret") return true;
  if (err.type === "inventory_vs_gl") return true;
  if (Array.isArray(err.imbalances) && err.imbalances.length > 0) return true;
  return false;
}

function formatGlLastError(err) {
  if (!isMeaningfulGlLastError(err)) return "";
  if (typeof err === "string") return err;
  if (Array.isArray(err)) return err.join("; ");
  if (typeof err.message === "string" && err.message.trim()) return err.message;
  if (err.type === "missing_license_secret") return "License secret not configured on this install.";
  if (err.type === "inventory_vs_gl") {
    return "Inventory vs GL mismatch blocked save."
      + (err.detail && err.detail.difference != null ? " Difference: " + err.detail.difference : "");
  }
  if (Array.isArray(err.imbalances) && err.imbalances.length) {
    return (err.type || "Journal error") + ": " + err.imbalances.map(function (x) {
      return typeof x === "string" ? x : JSON.stringify(x);
    }).join("; ");
  }
  try { return JSON.stringify(err); } catch (_e) { return String(err); }
}

/** Group GL lines by transactionId / entryGroupId for developer debug view only */
function tcGroupJournalByTransaction(lines) {
  var m = {};
  (lines || []).forEach(function (ln) {
    var tid = String(ln.transactionId || ln.entryGroupId || ln.id || "row");
    if (!m[tid]) m[tid] = { tid: tid, lines: [], dr: 0, cr: 0 };
    m[tid].lines.push(ln);
    m[tid].dr = round2(m[tid].dr + round2(ln.debit || 0));
    m[tid].cr = round2(m[tid].cr + round2(ln.credit || 0));
  });
  return Object.keys(m).sort().map(function (k) { return m[k]; });
}

var EMPTY_CASH_BOOK = [];
var CASH_BOOK_PAGE_SIZE = Math.max(LIST_PAGE_SIZE, 50);

/** Build cash/bank movement rows for the Cash Book tab (pure; no React). */
function buildCashBookEntries(opts) {
  var state = opts.state || {};
  var S = opts.S;
  var getCurrencySymbol = opts.getCurrencySymbol;
  var fmtNum = opts.fmtNum;
  var todayFn = opts.today;
  var entries = [];

  var obSnap = S.get("tc3_openBal", null);
  if (obSnap && obSnap.completed) {
    var obDate = obSnap.date || todayFn();
    var obTotal = (obSnap.cash || 0) + (obSnap.bank || 0);
    if (obTotal !== 0) {
      entries.push({
        id: "ob_seed", date: obDate, sortKey: obDate + "_000_ob",
        type: "Opening Balance",
        typeGroup: "opening",
        description: "Opening Balance — Cash: " + getCurrencySymbol() + " " + fmtNum(obSnap.cash || 0) + " | Bank: " + getCurrencySymbol() + " " + fmtNum(obSnap.bank || 0),
        account: "All",
        moneyIn: obTotal,
        moneyOut: 0,
      });
    }
  }

  S.get("tc3_capLedger", []).forEach(function (e) {
    if (e._isOpening || e.cashMethod === "Opening") return;
    entries.push({
      id: "cap_" + e.id, date: e.date, sortKey: e.date + "_cap_" + e.id,
      type: e.type === "invest" ? "Capital Investment" : "Capital Withdrawal",
      typeGroup: "capital",
      description: e.note || e.ref || (e.type === "invest" ? "Capital invested" : "Capital withdrawn"),
      account: e.cashMethod || "Cash",
      moneyIn: e.type === "invest" ? e.amount : 0,
      moneyOut: e.type === "withdraw" ? e.amount : 0,
    });
  });

  (state.sales || []).forEach(function (s) {
    (s.paymentHistory || []).forEach(function (ph) {
      entries.push({
        id: "sale_" + ph.id, date: ph.date || s.date, sortKey: (ph.date || s.date) + "_sale_" + ph.id,
        type: "Sale Payment",
        typeGroup: "sales",
        description: "Invoice " + (s.invoiceNo || s.id.slice(0, 8)) + " — " + (s.customerName || "Walk-in"),
        account: ph.cashMethod || "Cash",
        moneyIn: ph.amount,
        moneyOut: 0,
      });
    });
  });

  (state.purchases || []).forEach(function (p) {
    (p.paymentHistory || []).forEach(function (ph) {
      entries.push({
        id: "purch_" + ph.id, date: ph.date || p.date || "", sortKey: (ph.date || p.date || "") + "_purch_" + ph.id,
        type: "Purchase Payment",
        typeGroup: "purchases",
        description: "PO " + (p.invoiceNo || p.id.slice(0, 8)) + " — " + (p.supplierName || "Supplier"),
        account: ph.cashMethod || "Cash",
        moneyIn: 0,
        moneyOut: ph.amount,
      });
    });
  });

  (state.expenses || []).forEach(function (e) {
    var acct = e.cashMethod || (e.payMode === "Bank Transfer" || e.payMode === "Online" || e.payMode === "Cheque" ? "Bank" : "Cash");
    entries.push({
      id: "exp_" + e.id, date: e.date, sortKey: e.date + "_exp_" + e.id,
      type: "Expense",
      typeGroup: "expenses",
      description: (e.category || "Expense") + (e.description ? " — " + e.description : ""),
      account: acct,
      moneyIn: 0,
      moneyOut: e.amount,
    });
  });

  (state.assets || []).forEach(function (a) {
    if (a._isOpening || a.cashMethod === "Opening") return;
    entries.push({
      id: "ast_" + a.id, date: a.date || "", sortKey: (a.date || "") + "_ast_" + a.id,
      type: "Asset Purchase",
      typeGroup: "assets",
      description: (a.category || "Asset") + " — " + a.name,
      account: a.cashMethod || "Cash",
      moneyIn: 0,
      moneyOut: a.amount,
    });
  });

  S.get("tc3_manualPayables", []).forEach(function (mp) {
    if (!mp._isOpening) {
      entries.push({
        id: "mpay_" + mp.id, date: mp.date, sortKey: mp.date + "_mpay_" + mp.id,
        type: mp.type || "Borrowed Money",
        typeGroup: "borrowed",
        description: (mp.source || mp.type || "Borrowed") + (mp.note ? " — " + mp.note : ""),
        account: mp.paymentMethod || "Cash",
        moneyIn: mp.amount,
        moneyOut: 0,
      });
    }
    (mp.paymentHistory || []).forEach(function (ph) {
      entries.push({
        id: "mpay_rep_" + ph.id, date: ph.date || mp.date, sortKey: (ph.date || mp.date) + "_mpayrep_" + ph.id,
        type: "Payable Repayment",
        typeGroup: "repayment",
        description: "Repayment — " + (mp.source || mp.type || ""),
        account: ph.cashMethod || "Cash",
        moneyIn: 0,
        moneyOut: ph.amount,
      });
    });
  });

  S.get("tc3_manualReceivables", []).forEach(function (mr) {
    if (!mr._isOpening) {
      entries.push({
        id: "mrec_" + mr.id, date: mr.date, sortKey: mr.date + "_mrec_" + mr.id,
        type: mr.type || "Loan Given",
        typeGroup: "loanout",
        description: (mr.person || mr.type || "Loan given") + (mr.note ? " — " + mr.note : ""),
        account: mr.paymentMethod || "Cash",
        moneyIn: 0,
        moneyOut: mr.amount,
      });
    }
    (mr.paymentHistory || []).forEach(function (ph) {
      entries.push({
        id: "mrec_rep_" + ph.id, date: ph.date || mr.date, sortKey: (ph.date || mr.date) + "_mrecrep_" + ph.id,
        type: "Receivable Collection",
        typeGroup: "received",
        description: "Collection — " + (mr.person || mr.type || ""),
        account: ph.cashMethod || "Cash",
        moneyIn: ph.amount,
        moneyOut: 0,
      });
    });
  });

  S.get("tc3_profitDist", []).forEach(function (pd) {
    entries.push({
      id: "pd_" + pd.id, date: pd.date, sortKey: pd.date + "_pd_" + pd.id,
      type: "Profit Distribution",
      typeGroup: "profdist",
      description: "Distributed to " + (pd.partner || pd.name || "Partner"),
      account: pd.paymentMethod || "Cash",
      moneyIn: 0,
      moneyOut: pd.amount,
    });
  });

  (state.salesReturns || []).forEach(function (r) {
    if (!r.isRefund || !r.refundAmount) return;
    entries.push({
      id: "sret_" + r.id, date: r.date, sortKey: r.date + "_sret_" + r.id,
      type: "Sales Return Refund",
      typeGroup: "returns",
      description: "Refund to customer — " + (r.customer || "Walk-in") + " | " + (r.invoiceNo || "") + " | " + (r.productName || "") + (r.reason ? " (" + r.reason + ")" : ""),
      account: r.refundMethod || "Cash",
      moneyIn: 0,
      moneyOut: r.refundAmount,
    });
  });

  (state.purchaseReturns || []).forEach(function (r) {
    if (!r.isRefund || !r.refundAmount) return;
    entries.push({
      id: "pret_" + r.id, date: r.date, sortKey: r.date + "_pret_" + r.id,
      type: "Purchase Return Refund",
      typeGroup: "returns",
      description: "Refund from supplier — " + (r.supplier || "") + " | " + (r.purchaseNo || "") + " | " + (r.productName || "") + (r.reason ? " (" + r.reason + ")" : ""),
      account: r.refundMethod || "Cash",
      moneyIn: r.refundAmount,
      moneyOut: 0,
    });
  });

  entries.sort(function (a, b) { return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0; });

  var running = 0;
  for (var i = 0; i < entries.length; i++) {
    running += entries[i].moneyIn - entries[i].moneyOut;
    entries[i].balance = running;
  }
  return entries;
}

/* ═══════════════════════════════════════════════════════════
   ACCOUNTS PAGE — Overview, Capital, Profit Distribution, Assets
   ═══════════════════════════════════════════════════════════ */
var Accounts = function (props) {
  var state = props.state;
  var setState = props.setState;
  var S = props.S;
  var shopSettings = hydrateShopSettings(state.settings, S.get("tc3_businessType", null));
  var blankObStockForm = function (extra) {
    return blankNewProductForm(shopSettings, genBarcode, Object.assign({ type: "stock" }, extra || {}));
  };
  var today = props.today;
  var uid = props.uid;
  var tcTrialGuard = props.tcTrialGuard;
  var showAlert = props.showAlert;
  var showConfirm = props.showConfirm;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var fmtDate = props.fmtDate;
  var fmtDateFull = props.fmtDateFull;
  var C = props.C;
  var Btn = props.Btn;
  var Modal = props.Modal;
  var Input = props.Input;
  var Sel = props.Sel;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var StatCard = props.StatCard;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var WABtn = props.WABtn;
  var PRINT_FONT_LINK = props.PRINT_FONT_LINK;
  var escapeHtml = props.escapeHtml;
  var shareViaWhatsApp = props.shareViaWhatsApp;
  var getCashBalances = props.getCashBalances;
  var usePager = props.usePager;
  var Pager = props.Pager;
  var getNetCOGS = props.getNetCOGS;
  var getTotalSupplierPayable = props.getTotalSupplierPayable;
  var getTotalReceivableDerived = props.getTotalReceivableDerived;
  var getTotalPayableDerived = props.getTotalPayableDerived;
  var getTrialBalanceSnapshot = props.getTrialBalanceSnapshot;
  var getBalanceSheetFromLedger = props.getBalanceSheetFromLedger;
  var getProfitAndLossFromLedger = props.getProfitAndLossFromLedger;
  var rebuildGeneralLedger = props.rebuildGeneralLedger;
  var getGlAccountRunning = props.getGlAccountRunning;
  var getBusinessProfile = props.getBusinessProfile;
  var glDeveloperTools = props.glDeveloperTools === true;
  var genBarcode = props.genBarcode;
  var nextProductId = props.nextProductId;
  var pwMatchesAsync = props.pwMatchesAsync;
  var hashPw = props.hashPw;
  var fmtStock = props.fmtStock;
  var getCats = props.getCats;
  var shareAnyReport = function (printFn, filename) {
    var captured = "";
    var origOpen = window.open;
    window.open = function () {
      return {
        document: { write: function (s) { captured += s; }, close: function () {} },
        focus: function () {}, print: function () {}
      };
    };
    try { printFn(); } catch (e) {}
    window.open = origOpen;
    if (!captured) { showAlert("Nothing to share. Please generate the report first."); return; }
    var body = captured.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
    shareViaWhatsApp(body || captured, filename || "TechonReport", "");
  };
  var [atab, setAtab] = useState("overview");
  var [snapTbDiffIdx, setSnapTbDiffIdx] = useState(0);
  var [snapTbDiffRes, setSnapTbDiffRes] = useState(null);

  /* ── shared helpers ── */
  var getCapLedger = function () { return S.get("tc3_capLedger", []); };
  var getCapLog = function () { return S.get("tc3_capLog", []); };
  var getProfitDist = function () { return S.get("tc3_profitDist", []); };
  var ACATS = ["Shop Interior", "Advance Payment / Deposit", "Rent Deposit", "Equipment / Machinery", "Computers / Electronics", "Printer / Scanner", "Networking Equipment", "Furniture & Fixtures", "Vehicle", "Security System (CCTV)", "Electrical / UPS", "Software / Licenses", "Tools / Instruments", "Renovation / Improvements", "Other"];

  /* ── Overview metrics (skip when not on Overview/Profit — expensive on large data) ── */
  var balances = getCashBalances(state);
  var acObSnap = S.get("tc3_openBal", null);
  var ovMetrics = useMemo(function () {
    if (atab !== "overview" && atab !== "profit") {
      return {
        totalReceivable: 0,
        totalPayable: 0,
        totalRevenue: 0,
        totalCOGS: 0,
        totalExpenses: 0,
        totalAssets: 0,
        netCapital: 0,
        totalProfitDist: 0,
        grossProfit: 0,
        totalRepairRevenue: 0,
        netProfit: 0,
        availableProfit: 0,
        acStockCostValue: 0,
        acManualStockAdj: 0,
      };
    }
    var liveSalesAc = activeSales(state.sales);
    var livePurchasesAc = activePurchases(state.purchases);
    var totalReceivable = typeof getTotalReceivableDerived === "function"
      ? getTotalReceivableDerived(state)
      : (function () {
        var fromSales = liveSalesAc.reduce(function (a, s) { return a + Math.max(0, s.total - (s.paid || 0)); }, 0);
        var fromManual = S.get("tc3_manualReceivables", []).reduce(function (a, mr) {
          var paid = (mr.paymentHistory || []).reduce(function (s, p) { return s + p.amount; }, 0);
          return a + Math.max(0, mr.amount - paid);
        }, 0);
        return fromSales + fromManual;
      })();
    var totalPayable = typeof getTotalPayableDerived === "function"
      ? getTotalPayableDerived(state)
      : (function () {
        var fromSupp = getTotalSupplierPayable(state.purchases);
        var fromManual = S.get("tc3_manualPayables", []).reduce(function (a, mp) {
          var paid = (mp.paymentHistory || []).reduce(function (s, p) { return s + p.amount; }, 0);
          return a + Math.max(0, mp.amount - paid);
        }, 0);
        return fromSupp + fromManual;
      })();
    var totalRevenue = liveSalesAc.reduce(function (a, s) { return a + Math.max(0, (s.total || 0) - (s.totalTax || 0)); }, 0);
    var totalCOGS = getNetCOGS(liveSalesAc, state.salesReturns);
    var totalExpenses = (state.expenses || []).reduce(function (a, e) { return a + e.amount; }, 0);
    var totalAssets = (state.assets || []).reduce(function (a, x) { return a + (x.amount || x.value || 0); }, 0);
    var netCapital = getCapLedger().reduce(function (a, e) { return a + (e.type === "invest" ? e.amount : -e.amount); }, 0);
    var totalProfitDist = getProfitDist().reduce(function (a, pd) { return a + pd.amount; }, 0);
    var grossProfit = totalRevenue - totalCOGS;
    var totalRepairRevenue = (state.repairs || []).reduce(function (a, r) {
      if (r.status !== "Delivered") return a;
      var alreadyInvoiced = liveSalesAc.some(function (s) {
        if (s.fromRepairId === r.id) return true;
        return (s.items || []).some(function (it) { return it && it.fromRepairId === r.id; });
      });
      return alreadyInvoiced ? a : a + (r.estimatedCost || r.cost || 0);
    }, 0);
    var acObStockVal = (acObSnap && acObSnap.completed) ? (acObSnap.stock || []).reduce(function (a, s) { return a + s.cost * s.qty; }, 0) : 0;
    var acTotalPurchasesVal = livePurchasesAc.reduce(function (a, p) { return a + (p.items || []).reduce(function (b, it) { return b + deriveLineStockValue(it); }, 0); }, 0);
    var acTotalPurchaseReturnsVal = activePurchaseReturns(state.purchases, state.purchaseReturns).reduce(function (a, r) { return a + (r.qty || 0) * (r.cost || 0); }, 0);
    var acTotalDamageVal = (state.damageLog || []).reduce(function (a, d) {
      var prod = (state.products || []).find(function (p) { return p.id === d.productId; });
      var uc = (d.cost != null ? d.cost : (prod && prod.cost)) || 0;
      return a + (Number(d.qty) || 0) * (Number(uc) || 0);
    }, 0);
    var acTheoreticalStock = acObStockVal + acTotalPurchasesVal - totalCOGS - acTotalPurchaseReturnsVal - acTotalDamageVal;
    var acStockCostValue = (state.products || []).filter(function (p) { return p.status !== "inactive"; }).reduce(function (a, p) { return a + (p.cost || 0) * (p.stock || 0); }, 0);
    var acManualStockAdj = acStockCostValue - acTheoreticalStock;
    var netProfit = grossProfit + totalRepairRevenue - totalExpenses + acManualStockAdj;
    var availableProfit = netProfit - totalProfitDist;
    return {
      totalReceivable: totalReceivable,
      totalPayable: totalPayable,
      totalRevenue: totalRevenue,
      totalCOGS: totalCOGS,
      totalExpenses: totalExpenses,
      totalAssets: totalAssets,
      netCapital: netCapital,
      totalProfitDist: totalProfitDist,
      grossProfit: grossProfit,
      totalRepairRevenue: totalRepairRevenue,
      netProfit: netProfit,
      availableProfit: availableProfit,
      acStockCostValue: acStockCostValue,
      acManualStockAdj: acManualStockAdj,
    };
  }, [
    atab,
    state.sales,
    state.purchases,
    state.expenses,
    state.assets,
    state.salesReturns,
    state.purchaseReturns,
    state.repairs,
    state.products,
    state.damageLog,
    acObSnap,
  ]);
  var totalReceivable = ovMetrics.totalReceivable;
  var totalPayable = ovMetrics.totalPayable;
  var totalRevenue = ovMetrics.totalRevenue;
  var totalCOGS = ovMetrics.totalCOGS;
  var totalExpenses = ovMetrics.totalExpenses;
  var totalAssets = ovMetrics.totalAssets;
  var netCapital = ovMetrics.netCapital;
  var totalProfitDist = ovMetrics.totalProfitDist;
  var grossProfit = ovMetrics.grossProfit;
  var totalRepairRevenue = ovMetrics.totalRepairRevenue;
  var netProfit = ovMetrics.netProfit;
  var availableProfit = ovMetrics.availableProfit;
  var acStockCostValue = ovMetrics.acStockCostValue;
  var acManualStockAdj = ovMetrics.acManualStockAdj;

  /* ── Opening Balance tab state ── */
  var loadOB = function () { return S.get("tc3_openBal", { completed: false, date: today(), cash: 0, bank: 0, receivables: [], payables: [], stock: [], assets: [], capital: 0 }); };
  var [obData, setObData] = useState(loadOB);
  var [obEditMode, setObEditMode] = useState(false);
  var [obPwModal, setObPwModal] = useState(false);
  var [obPw, setObPw] = useState("");
  var [obPwMsg, setObPwMsg] = useState("");
  var [obStep, setObStep] = useState(1); /* 1=cash, 2=recv, 3=payables, 4=stock, 5=assets, 6=review */
  /* Working draft — only committed on final save */
  var [obDraft, setObDraft] = useState(null);
  /* Sub-item modals */
  var [obRecvModal, setObRecvModal] = useState(false);
  var [obPayModal, setObPayModal] = useState(false);
  /* Ctrl++ / F12 (via App) in Opening Balance — open Add New Product (only on stock step 4) */
  useEffect(function () {
    var openObNewProduct = function () {
      if (obStep !== 4) return;
      setShowObStockDrop(false);
      setObStockSearch("");
      setObNewProdKey(function (k) { return k + 1; });
      setObStockModal(true);
      setObStockForm(blankObStockForm({ qty: "1" }));
    };
    var onAddProduct = function () { openObNewProduct(); };
    var handler = function (e) {
      if (e.ctrlKey && (e.key === "=" || e.key === "+" || e.keyCode === 187 || e.keyCode === 107)) {
        e.preventDefault();
        openObNewProduct();
      }
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("tc3-add-product", onAddProduct);
    return function () {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("tc3-add-product", onAddProduct);
    };
  }, [obStep]);
  var [obStockModal, setObStockModal] = useState(false);
  var [obNewProdKey, setObNewProdKey] = useState(0);
  var [obStockExistModal, setObStockExistModal] = useState(false);
  var [obStockExistSearch, setObStockExistSearch] = useState("");
  /* Excel-style opening stock grid */
  var [obStockSearch, setObStockSearch] = useState("");
  var [obStockSearchIdx, setObStockSearchIdx] = useState(-1);
  var [showObStockDrop, setShowObStockDrop] = useState(false);
  var [obStockQty, setObStockQty] = useState("1");
  var [obStockCost, setObStockCost] = useState("");
  var [obStockSell, setObStockSell] = useState("");
  var obStockSearchRef = useRef(null);

  var filtObProds = (state.products || []).filter(function (p) {
    if (p.status === "inactive") return false;
    var q = obStockSearch.toLowerCase();
    if (!q) return false;
    return productMatchesSearch(p, q);
  }).slice(0, 8);
  var [obAssetModal, setObAssetModal] = useState(false);
  var [obRecvForm, setObRecvForm] = useState({ person: "", amount: "", note: "" });
  var [obPayForm, setObPayForm] = useState({ source: "", amount: "", note: "" });
  var [obStockForm, setObStockForm] = useState(function () {
    return { name: "", category: "General", unit: "Pcs", type: "stock", extraUnits: [], cost: "", price: "", qty: "", require_comment: false, comment_label: DEFAULT_PRODUCT_COMMENT_LABEL };
  });

  var saveObNewProduct = function (form) {
    if (!form) return;
    var nameStr = String(form.name || "").trim();
    if (!nameStr) return;
    var unitFieldsOb = buildUnitsPersistFields({
      unit: form.unit,
      cost: form.cost,
      price: form.price,
      extraUnits: form.extraUnits || [],
    });
    var obQtyToUse = isGlassSheetProductForm(form, shopSettings)
      ? (parseFloat(obStockQty) || 1)
      : (parseInt(obStockQty, 10) || 1);
    var bc = (form.barcode || "").trim() || genBarcode();
    var glassRowFields = glassFieldsFromProductForm(form);
    var row = Object.assign({
      name: nameStr,
      barcode: bc,
      category: form.category,
      description: (form.description || "").trim(),
      cost: parseFloat(form.cost),
      price: parseFloat(form.price) || parseFloat(form.cost),
      qty: obQtyToUse,
      _isNew: true,
      require_comment: false,
      comment_label: String(form.comment_label || "").trim() || DEFAULT_PRODUCT_COMMENT_LABEL,
    }, unitFieldsOb, glassRowFields);
    setObDraft(function (prev) {
      var base = Object.assign({}, prev || obData || {});
      return Object.assign({}, base, { stock: (base.stock || []).concat([row]) });
    });
    setObStockModal(false);
    setObStockForm(blankObStockForm());
    setTimeout(function () { var si = document.getElementById("ob-stock-search"); if (si) si.focus(); }, 50);
  };

  var [obAssetForm, setObAssetForm] = useState({ name: "", category: "Equipment / Machinery", value: "", note: "" });

  var obCalcCapital = function (d) {
    var totalRecv = (d.receivables || []).reduce(function (a, r) { return a + r.amount; }, 0);
    var totalPay = (d.payables || []).reduce(function (a, p) { return a + p.amount; }, 0);
    var totalStock = (d.stock || []).reduce(function (a, s) { return a + s.cost * s.qty; }, 0);
    var totalAst = (d.assets || []).reduce(function (a, x) { return a + x.value; }, 0);
    return (d.cash || 0) + (d.bank || 0) + totalRecv + totalStock + totalAst - totalPay;
  };

  var obCommit = function (draft) {
    var capital = obCalcCapital(draft);
    var final = Object.assign({}, draft, { capital: capital, completed: true, completedAt: new Date().toISOString() });
    S.set("tc3_openBal", final);

    /* Write opening receivables to tc3_manualReceivables
       FIX: preserve paymentHistory from existing opening entries so partial payments
       made against the opening balance are NOT wiped on re-edit */
    var existRec = S.get("tc3_manualReceivables", []).filter(function (r) { return !r._isOpening; });
    var oldOpenRec = S.get("tc3_manualReceivables", []).filter(function (r) { return r._isOpening; });
    var obTs = new Date().toISOString();
    var newRec = (draft.receivables || []).map(function (r) {
      /* Try to find an existing opening entry for the same person to preserve payment history */
      var existing = oldOpenRec.find(function (o) { return o.person === r.person && Math.abs((o.amount || 0) - r.amount) < 0.01; });
      return existing
        ? Object.assign({}, existing, { amount: r.amount, note: r.note || existing.note || "" })
        : stampTransactionIsoDateTime({ id: uid(), date: draft.date || today(), person: r.person, type: "Opening Receivable", amount: r.amount, paymentMethod: "Cash", reference: "Opening Balance", note: r.note || "", paymentHistory: [], _isOpening: true, createdAt: obTs, updatedAt: obTs }, obTs);
    });
    S.set("tc3_manualReceivables", existRec.concat(newRec));

    /* Write opening payables to tc3_manualPayables
       FIX: preserve paymentHistory from existing opening entries */
    var existPay = S.get("tc3_manualPayables", []).filter(function (p) { return !p._isOpening; });
    var oldOpenPay = S.get("tc3_manualPayables", []).filter(function (p) { return p._isOpening; });
    var newPay = (draft.payables || []).map(function (p) {
      var existing = oldOpenPay.find(function (o) { return o.source === p.source && Math.abs((o.amount || 0) - p.amount) < 0.01; });
      return existing
        ? Object.assign({}, existing, { amount: p.amount, note: p.note || existing.note || "" })
        : stampTransactionIsoDateTime({ id: uid(), date: draft.date || today(), source: p.source, type: "Opening Payable", amount: p.amount, paymentMethod: "Cash", reference: "Opening Balance", note: p.note || "", paymentHistory: [], _isOpening: true, createdAt: obTs, updatedAt: obTs }, obTs);
    });
    S.set("tc3_manualPayables", existPay.concat(newPay));

    /* Write opening stock to tc3_products */
    var existProds = state.products.filter(function (p) { return !p._isOpening; });
    var newProds = [];
    var newLog = [];
    (draft.stock || []).forEach(function (s) {
      if (s._existingProduct && s._srcProdId) {
        // Existing product - update stock quantity only
        var idx = existProds.findIndex(function(p) { return p.id === s._srcProdId; });
        if (idx >= 0) {
          var prevOb = existProds[idx];
          existProds[idx] = stampProductStock(Object.assign({}, prevOb, { stock: s.qty, _isOpening: true }), null, prevOb);
          newLog.push({ id: uid(), date: draft.date || today(), type: "Added", productId: existProds[idx].id, productName: existProds[idx].name, qty: s.qty, reason: "Opening Balance (Existing)" });
        }
      } else {
        // New product - create it
        var npBase = { id: uid(), productId: nextProductId(existProds.concat(newProds)), name: s.name, barcode: s.barcode || genBarcode(), category: s.category || "General", description: "Opening stock", cost: s.cost, price: s.price, stock: s.qty, damaged: 0, _isOpening: true, require_comment: false, comment_label: String(s.comment_label || "").trim() || DEFAULT_PRODUCT_COMMENT_LABEL };
        var np = Array.isArray(s.units) && s.units.length > 0
          ? Object.assign(npBase, { unit: s.unit || getBusinessProfile().units[0] || "Pcs", units: s.units, bulkEnabled: false, bulkUnit: "", bulkConversion: 0, bulkPrice: 0, bulkCost: 0 })
          : Object.assign(npBase, { unit: s.unit || getBusinessProfile().units[0] || "Pcs", bulkEnabled: !!(s.bulkUnit && (parseFloat(s.bulkConversion) || 0) > 0), bulkUnit: s.bulkUnit || "", bulkConversion: parseFloat(s.bulkConversion) || 0, bulkCost: parseFloat(s.bulkCost) || 0, bulkPrice: parseFloat(s.bulkPrice) || 0 });
        np = stampUpdatedAt(Object.assign(np, glassPersistFieldsFromRow(s)));
        newProds.push(np);
        newLog.push({ id: uid(), date: draft.date || today(), type: "Added", productId: np.id, productName: np.name, qty: np.stock, reason: "Opening Balance (New)" });
      }
    });
    var allProds = existProds.concat(newProds);
    S.set("tc3_products", allProds);
    var prodLog = (state.productLog || []).concat(newLog);
    S.set("tc3_productLog", prodLog);

    /* Write opening assets to tc3_assets (cashMethod:"Opening" = no cash deduction) */
    var existAssets = (state.assets || []).filter(function (a) { return !a._isOpening; });
    var newAssets = (draft.assets || []).map(function (a) {
      return { id: uid(), date: draft.date || today(), name: a.name, category: a.category || "Equipment / Machinery", amount: a.value, note: a.note || "", cashMethod: "Opening", _isOpening: true };
    });
    var allAssets = existAssets.concat(newAssets);
    S.set("tc3_assets", allAssets);

    /* Write opening capital entry (cashMethod:"Opening" = no cash impact) */
    var existCap = S.get("tc3_capLedger", []).filter(function (e) { return !e._isOpening; });
    var capEntry = { id: uid(), type: "invest", amount: capital, date: draft.date || today(), note: "Opening Balance — auto calculated", ref: "Opening Balance", cashMethod: "Opening", _isOpening: true, createdAt: new Date().toISOString() };
    var newCap = existCap.concat([capEntry]);
    S.set("tc3_capLedger", newCap);
    var capTotal = newCap.reduce(function (a, e) { return a + (e.type === "invest" ? e.amount : -e.amount); }, 0);
    var ns = Object.assign({}, state.settings, { capitalInvested: capTotal });
    S.set("tc3_settings", ns);

    /* Update React state */
    setState(function (st) { return Object.assign({}, st, { products: allProds, assets: allAssets, productLog: prodLog, settings: ns }); });
    setObData(final);
    setObEditMode(false);
    setObDraft(null);
    setObStep(1);
  };

  /* ── Ledger tab state ── */
  var [ledgerFrom, setLedgerFrom] = useState(today().slice(0, 4) + "-01-01");
  var [ledgerTo, setLedgerTo] = useState(today());
  var [ledgerType, setLedgerType] = useState("all");
  var [ledgerAcct, setLedgerAcct] = useState("all");
  var [glSelAcct, setGlSelAcct] = useState("1100");
  var [glAcctLinesVisible, setGlAcctLinesVisible] = useState(80);
  var [glDebugOpen, setGlDebugOpen] = useState(false);
  var [glReconOpen, setGlReconOpen] = useState(true);
  var [glActivityOpen, setGlActivityOpen] = useState(false);
  var [glSnapshotsOpen, setGlSnapshotsOpen] = useState(false);
  var [glAuditOpen, setGlAuditOpen] = useState(false);
  var [glDebugGroupLimit, setGlDebugGroupLimit] = useState(50);

  /* Cash Book: build only while the tab is open; paginate so DOM stays light */
  var cashBookEntries = useMemo(function () {
    if (atab !== "ledger") return EMPTY_CASH_BOOK;
    return buildCashBookEntries({
      state: state,
      S: S,
      getCurrencySymbol: getCurrencySymbol,
      fmtNum: fmtNum,
      today: today,
    });
  }, [
    atab,
    state.sales,
    state.purchases,
    state.expenses,
    state.assets,
    state.salesReturns,
    state.purchaseReturns,
    state.settings,
  ]);

  var cashBookFiltered = useMemo(function () {
    if (atab !== "ledger") return EMPTY_CASH_BOOK;
    return cashBookEntries.filter(function (e) {
      if (ledgerFrom && e.date < ledgerFrom) return false;
      if (ledgerTo && e.date > ledgerTo) return false;
      if (ledgerType !== "all" && e.typeGroup !== ledgerType) return false;
      if (ledgerAcct !== "all" && (e.account || "Cash") !== ledgerAcct) return false;
      return true;
    });
  }, [atab, cashBookEntries, ledgerFrom, ledgerTo, ledgerType, ledgerAcct]);

  var cashBookPager = usePager(cashBookFiltered, CASH_BOOK_PAGE_SIZE);

  useEffect(function () {
    if (cashBookPager && typeof cashBookPager.reset === "function") cashBookPager.reset();
  }, [ledgerFrom, ledgerTo, ledgerType, ledgerAcct, atab]);

  useEffect(function () {
    setGlAcctLinesVisible(80);
  }, [glSelAcct, atab]);

  /* ── Capital tab state ── */
  var [capForm, setCapForm] = useState({ type: "invest", amount: "", date: today(), note: "", ref: "", cashMethod: "Cash" });
  var [capEditModal, setCapEditModal] = useState(null);
  var [capEditForm, setCapEditForm] = useState(null);
  var [capActionPw, setCapActionPw] = useState("");
  var [capActionReason, setCapActionReason] = useState("");
  var [capActionMsg, setCapActionMsg] = useState("");
  var [capDeleteTarget, setCapDeleteTarget] = useState(null);

  var saveCapEntry = function () {
    if (!capForm.amount || parseFloat(capForm.amount) <= 0) { showAlert("Please enter a valid amount."); return; }
    if (!capForm.date) { showAlert("Please select a date."); return; }
    var entry = { id: uid(), type: capForm.type, amount: parseFloat(capForm.amount), date: capForm.date, note: capForm.note || "", ref: capForm.ref || "", cashMethod: capForm.cashMethod || "Cash", createdAt: new Date().toISOString() };
    var ledger = getCapLedger().concat([entry]);
    S.set("tc3_capLedger", ledger);
    var total = ledger.reduce(function (a, e) { return a + (e.type === "invest" ? e.amount : -e.amount); }, 0);
    var ns = Object.assign({}, state.settings, { capitalInvested: total });
    S.set("tc3_settings", ns);
    setState(function (st) { return Object.assign({}, st, { settings: ns }); });
    setCapForm({ type: "invest", amount: "", date: today(), note: "", ref: "", cashMethod: "Cash" });
    showAlert("Capital entry saved!");
  };
  var doCapEdit = function () {
    var storedPw = S.get("tc3_apppass", "");
    if (!capActionPw) { setCapActionMsg("Password required."); return; }
    if (!capActionReason || capActionReason.trim().length < 3) { setCapActionMsg("Reason required (min 3 chars)."); return; }
    pwMatchesAsync(capActionPw, storedPw).then(function (ok) {
      if (!ok) { setCapActionMsg("Incorrect password."); return; }
      var ledger = getCapLedger().map(function (e) { return e.id === capEditForm.id ? Object.assign({}, capEditForm) : e; });
      S.set("tc3_capLedger", ledger);
      var total = ledger.reduce(function (a, e) { return a + (e.type === "invest" ? e.amount : -e.amount); }, 0);
      var ns = Object.assign({}, state.settings, { capitalInvested: total });
      S.set("tc3_settings", ns); setState(function (st) { return Object.assign({}, st, { settings: ns }); });
      S.set("tc3_capLog", getCapLog().concat([{ id: uid(), action: "Edited", entryId: capEditForm.id, type: capEditForm.type, amount: capEditForm.amount, date: capEditForm.date, reason: capActionReason, at: new Date().toISOString() }]));
      setCapEditModal(null); setCapEditForm(null); setCapActionPw(""); setCapActionReason(""); setCapActionMsg("");
    });
  };
  var doCapDelete = function () {
    var storedPw = S.get("tc3_apppass", "");
    if (!capActionPw) { setCapActionMsg("Password required."); return; }
    if (!capActionReason || capActionReason.trim().length < 3) { setCapActionMsg("Reason required (min 3 chars)."); return; }
    pwMatchesAsync(capActionPw, storedPw).then(function (ok) {
      if (!ok) { setCapActionMsg("Incorrect password."); return; }
      var ledger = getCapLedger().filter(function (e) { return e.id !== capDeleteTarget.id; });
      S.set("tc3_capLedger", ledger);
      var total = ledger.reduce(function (a, e) { return a + (e.type === "invest" ? e.amount : -e.amount); }, 0);
      var ns = Object.assign({}, state.settings, { capitalInvested: total });
      S.set("tc3_settings", ns); setState(function (st) { return Object.assign({}, st, { settings: ns }); });
      S.set("tc3_capLog", getCapLog().concat([{ id: uid(), action: "Deleted", entryId: capDeleteTarget.id, type: capDeleteTarget.type, amount: capDeleteTarget.amount, date: capDeleteTarget.date, reason: capActionReason, at: new Date().toISOString() }]));
      setCapDeleteTarget(null); setCapActionPw(""); setCapActionReason(""); setCapActionMsg("");
    });
  };

  /* ── Profit Distribution tab state ── */
  var [pdForm, setPdForm] = useState({ date: today(), partner: "", amount: "", paymentMethod: "Cash", note: "" });
  var [pdEdit, setPdEdit] = useState(null);
  var [pdDeleteTarget, setPdDeleteTarget] = useState(null);
  var saveProfitDist = function () {
    if (!pdForm.partner || !pdForm.partner.trim()) { showAlert("Please enter partner / person name."); return; }
    if (!pdForm.amount || parseFloat(pdForm.amount) <= 0) { showAlert("Please enter a valid amount."); return; }
    var entry = { id: uid(), date: pdForm.date, partner: pdForm.partner.trim(), amount: parseFloat(pdForm.amount), paymentMethod: pdForm.paymentMethod || "Cash", note: pdForm.note || "", createdAt: new Date().toISOString() };
    var list = getProfitDist().concat([entry]);
    S.set("tc3_profitDist", list);
    setPdForm({ date: today(), partner: "", amount: "", paymentMethod: "Cash", note: "" });
    showAlert("Profit distribution recorded!");
  };
  var savePdEdit = function () {
    if (!pdEdit) return;
    var list = getProfitDist().map(function (e) { return e.id === pdEdit.id ? Object.assign({}, pdEdit) : e; });
    S.set("tc3_profitDist", list);
    setPdEdit(null);
  };
  var deletePd = function (id) {
    showConfirm("Delete this profit distribution entry?", function () {
      var list = getProfitDist().filter(function (e) { return e.id !== id; });
      S.set("tc3_profitDist", list);
      setPdDeleteTarget(null);
    });
  };

  /* ── Assets tab state ── */
  var [newAsset, setNewAsset] = useState(null);
  var [editAsset, setEditAsset] = useState(null);
  var [assetActionModal, setAssetActionModal] = useState(null);
  var [assetPw, setAssetPw] = useState("");
  var [assetReason, setAssetReason] = useState("");
  var [assetPwMsg, setAssetPwMsg] = useState("");
  var saveAsset = function () {
    if (!newAsset || !newAsset.name || !newAsset.amount) return;
    if (!tcTrialGuard(state.assets || [], "assets")) return;
    var astTs = new Date().toISOString();
    var a = stampTransactionIsoDateTime({ id: uid(), date: newAsset.date || today(), name: newAsset.name, category: newAsset.category || "Equipment", amount: parseFloat(newAsset.amount) || 0, note: newAsset.note || "", cashMethod: newAsset.cashMethod || "Cash", createdAt: astTs, updatedAt: astTs }, astTs);
    var na = (state.assets || []).concat([a]);
    S.set("tc3_assets", na);
    setState(function (st) { return Object.assign({}, st, { assets: na }); });
    setNewAsset(null);
  };
  var doAssetAction = function () {
    var storedPw = S.get("tc3_apppass", "");
    if (!assetPw) { setAssetPwMsg("Password required."); return; }
    if (!assetReason || assetReason.trim().length < 3) { setAssetPwMsg("Please enter a reason (min 3 chars)."); return; }
    pwMatchesAsync(assetPw, storedPw).then(function (ok) {
      if (!ok) { setAssetPwMsg("Incorrect password."); return; }
      var action = assetActionModal;
      if (action === "delete" && editAsset) {
        var filtered = (state.assets || []).filter(function (a) { return a.id !== editAsset.id; });
        S.set("tc3_assets", filtered); setState(function (st) { return Object.assign({}, st, { assets: filtered }); });
        var log = S.get("tc3_assetLog", []).concat([{ id: uid(), date: today(), action: "Deleted", assetId: editAsset.id, assetName: editAsset.name, category: editAsset.category, amount: editAsset.amount, reason: assetReason.trim() }]);
        S.set("tc3_assetLog", log);
      } else if (action === "edit" && editAsset) {
        var updated = (state.assets || []).map(function (a) { return a.id === editAsset.id ? Object.assign({}, editAsset) : a; });
        S.set("tc3_assets", updated); setState(function (st) { return Object.assign({}, st, { assets: updated }); });
        var log2 = S.get("tc3_assetLog", []).concat([{ id: uid(), date: today(), action: "Edited", assetId: editAsset.id, assetName: editAsset.name, category: editAsset.category, amount: editAsset.amount, reason: assetReason.trim(), oldData: editAsset }]);
        S.set("tc3_assetLog", log2);
      }
      setAssetActionModal(null); setEditAsset(null); setAssetPw(""); setAssetReason(""); setAssetPwMsg("");
    });
  };

  var ATAB_GROUPS = [
    { label: "", tabs: [["overview", "Overview", "Business snapshot & health"]] },
    { label: "Setup", tabs: [
      ["opening", "Opening", "Opening balance wizard"],
      ["capital", "Capital", "Owner investments & withdrawals"],
      ["assets", "Assets", "Fixed assets register"],
      ["profit", "Profit", "Partner profit distribution"],
    ]},
    { label: "Books", tabs: [
      ["ledger", "Cash Book", "Cash & bank movement ledger"],
      ["gledger", "GL / Trial", "General ledger, trial balance & reconciliation"],
    ]},
  ];

  var totalLiquid = balances.cash + balances.bank;
  var totalFixedAssets = (state.assets || []).reduce(function (a, x) { return a + (x.amount || x.value || 0); }, 0);
  var obDone = !!(acObSnap && acObSnap.completed);
  /* Trial balance is expensive — only compute on Overview (header) / GL tab does its own */
  var tbOverview = (atab === "overview" && typeof getTrialBalanceSnapshot === "function")
    ? getTrialBalanceSnapshot()
    : { balanced: true };
  var glErrOverview = isMeaningfulGlLastError(S.get("tc3_gl_last_error", null));

  /* Keep Acc* helpers as stable component types (useRef) so AccFold bodies
     do not remount on every Accounts keystroke / state update. */
  var accUiDepsRef = useRef({ Card: Card });
  accUiDepsRef.current = { Card: Card };
  var accUiRef = useRef(null);
  if (!accUiRef.current) {
    accUiRef.current = {
      AccTabHead: function AccTabHead(headProps) {
        var hp = headProps;
        return (
          <div className={"erp-acc-tab-head tone-" + (hp.tone || "blue")}>
            <span className="erp-acc-tab-head-icon" aria-hidden="true">{hp.icon}</span>
            <div className="erp-acc-tab-head-text">
              <div className="erp-acc-tab-head-title">{hp.title}</div>
              {hp.sub ? <div className="erp-acc-tab-head-sub">{hp.sub}</div> : null}
            </div>
            {hp.extra ? <div className="erp-acc-tab-head-extra">{hp.extra}</div> : null}
          </div>
        );
      },
      AccChoiceRow: function AccChoiceRow(choiceProps) {
        var cp = choiceProps;
        return (
          <div>
            {cp.label ? <div className="erp-acc-field-label">{cp.label}</div> : null}
            <div className="erp-acc-choice-row">
              {(cp.options || []).map(function (opt) {
                var id = opt[0];
                var label = opt[1];
                var tone = opt[2] || "blue";
                var active = cp.value === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className={"erp-acc-choice-btn tone-" + tone + (active ? " is-active" : "")}
                    onClick={function () { cp.onChange(id); }}
                  >{label}</button>
                );
              })}
            </div>
          </div>
        );
      },
      AccFold: function AccFold(foldProps) {
        var fp = foldProps;
        var FoldCard = accUiDepsRef.current.Card;
        return (
          <FoldCard pad={0} className={"erp-acc-fold-card" + (fp.tone ? " tone-" + fp.tone : "")}>
            <button type="button" className="erp-acc-fold-head" onClick={fp.onToggle} aria-expanded={!!fp.open}>
              <div className="erp-acc-fold-text">
                <div className="erp-acc-fold-title">{fp.title}</div>
                {fp.sub ? <div className="erp-acc-fold-sub">{fp.sub}</div> : null}
              </div>
              <div className="erp-acc-fold-meta">
                {fp.badge || null}
                <span className={"erp-acc-fold-chevron" + (fp.open ? " is-open" : "")} aria-hidden="true">›</span>
              </div>
            </button>
            {fp.open ? <div className="erp-acc-fold-body">{fp.children}</div> : null}
          </FoldCard>
        );
      }
    };
  }
  var AccTabHead = accUiRef.current.AccTabHead;
  var AccChoiceRow = accUiRef.current.AccChoiceRow;
  var AccFold = accUiRef.current.AccFold;

  var glAccountTypeClass = function (type) {
    var t = String(type || "").toLowerCase();
    if (t.indexOf("asset") >= 0) return "is-asset";
    if (t.indexOf("liab") >= 0) return "is-liab";
    if (t.indexOf("equity") >= 0) return "is-equity";
    if (t.indexOf("income") >= 0 || t.indexOf("revenue") >= 0) return "is-income";
    if (t.indexOf("expense") >= 0 || t.indexOf("cogs") >= 0) return "is-expense";
    return "is-neutral";
  };

  return (
    <div className="erp-page erp-accounts-scope erp-acc-modern">
      <div className="erp-acc-chrome">
        <div className="erp-acc-topbar erp-acc-topbar-pro">
          <div className="erp-acc-topbar-brand">
            <div className="erp-acc-head-title">Accounts</div>
            <div className="erp-acc-head-sub">{getCurrencySymbol()} {fmtNum(totalLiquid)} liquid · {obDone ? "Opening set" : "Opening pending"}</div>
          </div>
          <div className="erp-acc-health">
            <span className={"erp-acc-health-pill" + (obDone ? " is-ok" : " is-warn")} title="Opening balance setup">
              {obDone ? "✓ Opening" : "⚠ Opening"}
            </span>
            <span className={"erp-acc-health-pill" + (tbOverview.balanced && !glErrOverview ? " is-ok" : " is-warn")} title="Trial balance status">
              {tbOverview.balanced && !glErrOverview ? "✓ Balanced" : "⚠ GL"}
            </span>
          </div>
        </div>
        <div className="erp-acc-tabbar" role="tablist" aria-label="Accounts sections">
          {ATAB_GROUPS.map(function (grp, gi) {
            return (
              <React.Fragment key={grp.label || "overview-grp"}>
                {gi > 0 ? <span className="erp-acc-tab-divider" aria-hidden="true" /> : null}
                {grp.label ? <span className="erp-acc-tab-grp-label">{grp.label}</span> : null}
                {grp.tabs.map(function (t) {
                  return (
                    <button
                      key={t[0]}
                      type="button"
                      role="tab"
                      aria-selected={atab === t[0]}
                      title={t[2]}
                      className={"erp-acc-tab" + (atab === t[0] ? " is-active" : "")}
                      onClick={function () {
                        startTransition(function () { setAtab(t[0]); });
                      }}
                    >{t[1]}</button>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="erp-acc-body">
      {/* ── OVERVIEW ── */}
      {atab === "overview" && (function () {
        var marginPct = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0;
        var distPct = netProfit > 0 ? Math.min(100, Math.round((totalProfitDist / netProfit) * 1000) / 10) : 0;
        var ovKpis = [
          { id: "liquid", label: "Liquid", tone: "blue", icon: "💧", val: totalLiquid, sub: "Cash " + fmtNum(balances.cash) + " · Bank " + fmtNum(balances.bank) },
          { id: "recv", label: "Receivable", tone: "cyan", icon: "📥", val: totalReceivable, sub: "Owed to you" },
          { id: "pay", label: "Payable", tone: "orange", icon: "📤", val: totalPayable, sub: "You owe suppliers & loans" },
          { id: "profit", label: "Available Profit", tone: availableProfit >= 0 ? "green" : "red", icon: availableProfit >= 0 ? "📈" : "📉", val: availableProfit, sub: "After " + getCurrencySymbol() + " " + fmtNum(totalProfitDist) + " distributed" },
        ];
        var pnlRows = [
          { label: "Revenue", val: totalRevenue, tone: "blue", bar: totalRevenue },
          { label: "Cost of Goods Sold", val: totalCOGS, tone: "orange", bar: totalRevenue },
          { label: "Gross Profit", val: grossProfit, tone: grossProfit >= 0 ? "green" : "red", bar: totalRevenue, pct: marginPct },
          { label: "Operating Expenses", val: totalExpenses, tone: "red", bar: totalRevenue },
          { label: "Net Profit", val: netProfit, tone: netProfit >= 0 ? "green" : "red", total: true, bar: totalRevenue },
        ];
        var posRows = [
          { label: "Cash in Hand", val: balances.cash, tone: "green" },
          { label: "Bank Balance", val: balances.bank, tone: "blue" },
          { label: "Fixed Assets", val: totalFixedAssets, tone: "purple" },
          { label: "Net Capital", val: netCapital, tone: "navy" },
          { label: "Receivable", val: totalReceivable, tone: "cyan" },
          { label: "Payable", val: totalPayable, tone: "red", total: true },
        ];
        return (
        <div className="erp-tab-content erp-acc-overview-fill erp-acc-ov-modern erp-acc-tab-pro erp-acc-tab-pro--overview">
          <div className={"erp-acc-ov-hero" + (netProfit >= 0 ? " is-profit" : " is-loss")}>
            <div className="erp-acc-ov-hero-glow" aria-hidden="true" />
            <div className="erp-acc-ov-hero-main">
              <div className="erp-acc-ov-hero-eyebrow">Financial snapshot</div>
              <div className="erp-acc-ov-hero-title">Net profit</div>
              <div className="erp-acc-ov-hero-val">{getCurrencySymbol()} {fmtNum(netProfit)}</div>
              <div className="erp-acc-ov-hero-sub">
                Gross margin {marginPct}% · Liquid {getCurrencySymbol()} {fmtNum(totalLiquid)}
              </div>
            </div>
            <div className="erp-acc-ov-hero-chips">
              <span className={"erp-acc-ov-chip" + (obDone ? " is-ok" : " is-warn")}>{obDone ? "✓ Opening set" : "⚠ Opening pending"}</span>
              <span className={"erp-acc-ov-chip" + (tbOverview.balanced && !glErrOverview ? " is-ok" : " is-warn")}>
                {tbOverview.balanced && !glErrOverview ? "✓ Books balanced" : "⚠ Check GL"}
              </span>
              <span className="erp-acc-ov-chip is-neutral">Dist. {distPct}% of profit</span>
            </div>
          </div>

          <div className="erp-acc-ov-kpi-strip erp-acc-stat-row">
            {ovKpis.map(function (k) {
              var accent = k.tone === "green" ? C.green
                : k.tone === "red" ? C.red
                : k.tone === "orange" ? C.orange
                : k.tone === "purple" || k.tone === "indigo" ? C.purple
                : k.tone === "cyan" || k.tone === "teal" ? C.cyan
                : C.blue;
              return (
                <StatCard
                  key={k.id}
                  label={k.label}
                  value={k.val}
                  accent={accent}
                  valueColor={accent}
                  icon={k.icon}
                  sub={k.sub}
                />
              );
            })}
          </div>

          <div className="erp-acc-panels erp-acc-panels--fill erp-acc-ov-panels">
            <div className="erp-acc-panel">
              <div className="erp-acc-ov-panel erp-acc-ov-panel--pnl">
                <div className="erp-acc-ov-panel-head">
                  <span className="erp-acc-ov-panel-icon" aria-hidden="true">📊</span>
                  <div>
                    <div className="erp-acc-ov-panel-title">P&amp;L Summary</div>
                    <div className="erp-acc-ov-panel-sub">All-time sales, purchases &amp; expenses</div>
                  </div>
                </div>
                <div className="erp-acc-ov-panel-body">
                  {pnlRows.map(function (r) {
                    var barW = r.bar > 0 ? Math.min(100, Math.round((Math.abs(r.val) / r.bar) * 100)) : 0;
                    return (
                      <div key={r.label} className={"erp-acc-ov-row tone-" + r.tone + (r.total ? " is-total" : "")}>
                        <div className="erp-acc-ov-row-main">
                          <span className="erp-acc-ov-row-dot" aria-hidden="true" />
                          <span className="erp-acc-ov-row-label">{r.label}</span>
                          <span className="erp-acc-ov-row-val">{getCurrencySymbol()} {fmtNum(r.val)}</span>
                        </div>
                        {!r.total && r.bar > 0 ? (
                          <div className="erp-acc-ov-row-bar"><span style={{ width: barW + "%" }} /></div>
                        ) : null}
                        {r.pct != null ? <div className="erp-acc-ov-row-hint">{r.pct}% of revenue</div> : null}
                      </div>
                    );
                  })}
                  <div className="erp-acc-ov-row tone-purple">
                    <div className="erp-acc-ov-row-main">
                      <span className="erp-acc-ov-row-dot" aria-hidden="true" />
                      <span className="erp-acc-ov-row-label">Profit distributed</span>
                      <span className="erp-acc-ov-row-val">{getCurrencySymbol()} {fmtNum(totalProfitDist)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="erp-acc-panel">
              <div className="erp-acc-ov-panel erp-acc-ov-panel--pos">
                <div className="erp-acc-ov-panel-head">
                  <span className="erp-acc-ov-panel-icon" aria-hidden="true">🏦</span>
                  <div>
                    <div className="erp-acc-ov-panel-title">Position</div>
                    <div className="erp-acc-ov-panel-sub">Cash, assets, capital &amp; balances</div>
                  </div>
                </div>
                <div className="erp-acc-ov-panel-body">
                  {posRows.map(function (r) {
                    return (
                      <div key={r.label} className={"erp-acc-ov-row tone-" + r.tone + (r.total ? " is-total" : "")}>
                        <div className="erp-acc-ov-row-main">
                          <span className="erp-acc-ov-row-dot" aria-hidden="true" />
                          <span className="erp-acc-ov-row-label">{r.label}</span>
                          <span className="erp-acc-ov-row-val">{getCurrencySymbol()} {fmtNum(r.val)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── LEDGER ── */}
      {atab === "ledger" && (function () {
        var entries = cashBookEntries;
        var filtered = cashBookFiltered;
        var pageRows = cashBookPager.slice || filtered;

        /* ── Summary totals for filtered range ── */
        var filteredIn = filtered.reduce(function (a, e) { return a + e.moneyIn; }, 0);
        var filteredOut = filtered.reduce(function (a, e) { return a + e.moneyOut; }, 0);
        var openingBal = filtered.length > 0 ? (filtered[0].balance - filtered[0].moneyIn + filtered[0].moneyOut) : 0;
        var closingBal = filtered.length > 0 ? filtered[filtered.length - 1].balance : openingBal;

        /* ── Print function ── */
        var printLedger = function () {
          var css = "body{font-family:'Plus Jakarta Sans',Arial,sans-serif;padding:20px;color:#111;font-size:12px;}h3{margin:14px 0 6px;font-size:12px;font-weight:800;color:#1a237e;text-transform:uppercase;letter-spacing:.07em;padding:5px 10px;background:#e8eeff;border-left:4px solid #2255d4;}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0 14px;}.card{background:#f8faff;border-radius:6px;padding:8px 10px;border:1px solid #e0e7ff;}.clbl{font-size:9px;color:#888;text-transform:uppercase;}.cval{font-size:15px;font-weight:800;margin-top:2px;}table{width:100%;border-collapse:collapse;}th{background:#1a237e;color:#fff;padding:6px 8px;text-align:left;font-size:10px;}td{padding:5px 8px;border-bottom:1px solid #eee;font-size:10.5px;}tr:nth-child(even){background:#f8faff;}.in{color:#1b5e20;font-weight:700;}.out{color:#b71c1c;font-weight:700;}.bal{font-weight:800;}.neg{color:#b71c1c;}@media print{@page{size:A4 landscape;margin:10mm;}body{padding:0;}}";
          var h = buildDocPrintHeaderHtml({
            settings: state.settings || {},
            title: "Financial Ledger",
            escapeHtml: escapeHtml,
            showTopbar: true,
            showLogo: false,
            metaRows: [{ label: "Period:", value: ledgerFrom + " to " + ledgerTo }],
          });
          h += "<div class='cards'>";
          h += "<div class='card'><div class='clbl'>Opening Balance</div><div class='cval'>" + getCurrencySymbol() + " " + Number(openingBal).toLocaleString() + "</div></div>";
          h += "<div class='card'><div class='clbl'>Total Money In</div><div class='cval' style='color:#1b5e20'>" + getCurrencySymbol() + " " + Number(filteredIn).toLocaleString() + "</div></div>";
          h += "<div class='card'><div class='clbl'>Total Money Out</div><div class='cval' style='color:#b71c1c'>" + getCurrencySymbol() + " " + Number(filteredOut).toLocaleString() + "</div></div>";
          h += "<div class='card'><div class='clbl'>Closing Balance</div><div class='cval' style='color:" + (closingBal >= 0 ? "#1b5e20" : "#b71c1c") + "'>" + getCurrencySymbol() + " " + Number(closingBal).toLocaleString() + "</div></div>";
          h += "</div>";
          h += "<table><thead><tr><th>#</th><th>Date</th><th>Type</th><th>Description</th><th>Account</th><th style='text-align:right'>Money In</th><th style='text-align:right'>Money Out</th><th style='text-align:right'>Balance</th></tr></thead><tbody>";
          filtered.forEach(function (e, i) {
            var balColor = e.balance < 0 ? "color:#b71c1c" : "";
            h += "<tr><td>" + (i + 1) + "</td><td style='white-space:nowrap'>" + escapeHtml(e.date) + "</td><td>" + escapeHtml(e.type) + "</td><td>" + escapeHtml(e.description) + "</td><td>" + escapeHtml(e.account || "Cash") + "</td>";
            h += "<td style='text-align:right' class='" + (e.moneyIn > 0 ? "in" : "") + "'>" + (e.moneyIn > 0 ? getCurrencySymbol() + " " + Number(e.moneyIn).toLocaleString() : "-") + "</td>";
            h += "<td style='text-align:right' class='" + (e.moneyOut > 0 ? "out" : "") + "'>" + (e.moneyOut > 0 ? getCurrencySymbol() + " " + Number(e.moneyOut).toLocaleString() : "-") + "</td>";
            h += "<td style='text-align:right;font-weight:800;" + balColor + "'>" + getCurrencySymbol() + " " + Number(e.balance).toLocaleString() + "</td></tr>";
          });
          h += "<tr style='background:#e8eeff;font-weight:800'><td colspan='5'>TOTALS</td><td style='text-align:right;color:#1b5e20'>" + getCurrencySymbol() + " " + Number(filteredIn).toLocaleString() + "</td><td style='text-align:right;color:#b71c1c'>" + getCurrencySymbol() + " " + Number(filteredOut).toLocaleString() + "</td><td style='text-align:right'>" + getCurrencySymbol() + " " + Number(closingBal).toLocaleString() + "</td></tr>";
          h += "</tbody></table>";
          var w = window.open("", "_blank", "width=1100,height=750");
          w.document.write("<!DOCTYPE html><html><head>" + PRINT_FONT_LINK + "<title>Financial Ledger</title><style>" + css + "</style></head><body>" + h + "</body></html>");
          w.document.close(); setTimeout(function () { w.print(); }, 400);
        };

        var TYPE_OPTIONS = [
          ["all", "All Types"],
          ["opening", "Opening Balance"],
          ["capital", "Capital"],
          ["sales", "Sale Payments"],
          ["purchases", "Purchase Payments"],
          ["expenses", "Expenses"],
          ["assets", "Asset Purchases"],
          ["borrowed", "Borrowed / Received"],
          ["repayment", "Payable Repayments"],
          ["loanout", "Loans Given"],
          ["received", "Receivable Collections"],
          ["profdist", "Profit Distribution"],
        ];

        var typeColors = {
          "Opening Balance": "#37474f",
          "Capital Investment": "#1a237e", "Capital Withdrawal": "#4a148c", "Sale Payment": "#1b5e20",
          "Purchase Payment": "#b71c1c", "Expense": "#e65100", "Repair Revenue": "#006064",
          "Asset Purchase": "#37474f", "Profit Distribution": "#6a1b9a",
          "Payable Repayment": "#880e4f", "Receivable Collection": "#1b5e20", "Loan Given": "#b71c1c",
          "Borrowed Money": "#1565c0", "Bank Loan": "#1565c0", "Family / Friend Loan": "#1565c0",
        };

        var ledgerThNum = { textAlign: "right", padding: "10px 14px", fontWeight: 700, color: C.th, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "2px solid " + C.border, whiteSpace: "nowrap", background: "#f7f9ff" };

        return (
          <div className="erp-tab-content erp-acc-tab-pro erp-acc-tab-pro--ledger erp-acc-ledger-layout">
            <AccTabHead icon="💵" tone="blue" title="Cash Book" sub="Cash & bank movement ledger — filter, print & share" />
            <div className="erp-acc-stat-row">
              <StatCard label="Opening Balance" value={openingBal} accent={C.blue} valueColor={C.blue} icon="🏁" sub="Start of period" />
              <StatCard label="Total Money In" value={filteredIn} accent={C.green} valueColor={C.green} icon="📥" />
              <StatCard label="Total Money Out" value={filteredOut} accent={C.red} valueColor={C.red} icon="📤" />
              <StatCard label="Closing Balance" value={closingBal} accent={closingBal >= 0 ? C.green : C.red} valueColor={closingBal >= 0 ? C.green : C.red} icon="📒" sub={filtered.length + " transactions"} />
            </div>

            <Card pad={10} className="erp-acc-toolbar-card">
              <div className="erp-acc-toolbar">
                <div className="erp-acc-toolbar-field">
                  <label>From</label>
                  <input type="date" value={ledgerFrom} onChange={function (e) { setLedgerFrom(e.target.value); }} />
                </div>
                <div className="erp-acc-toolbar-field">
                  <label>To</label>
                  <input type="date" value={ledgerTo} onChange={function (e) { setLedgerTo(e.target.value); }} />
                </div>
                <div className="erp-acc-toolbar-field">
                  <label>Type</label>
                  <select value={ledgerType} onChange={function (e) { setLedgerType(e.target.value); }}>
                    {TYPE_OPTIONS.map(function (o) { return <option key={o[0]} value={o[0]}>{o[1]}</option>; })}
                  </select>
                </div>
                <div className="erp-acc-toolbar-field">
                  <label>Account</label>
                  <div className="erp-acc-pill-group">
                    {[["all", "All"], ["Cash", "Cash"], ["Bank", "Bank"]].map(function (opt) {
                      var isA = ledgerAcct === opt[0];
                      return <button key={opt[0]} type="button" className={"erp-acc-pill" + (isA ? " is-active" : "")} onClick={function () { setLedgerAcct(opt[0]); }}>{opt[1]}</button>;
                    })}
                  </div>
                </div>
                <div className="erp-acc-toolbar-actions">
                  <button type="button" className="erp-acc-pill" onClick={function () { setLedgerFrom(today().slice(0, 4) + "-01-01"); setLedgerTo(today()); setLedgerType("all"); setLedgerAcct("all"); }}>Reset</button>
                  <Btn col="blue" onClick={printLedger}>Print</Btn>
                  <WABtn title="Share Ledger via WhatsApp" onClick={function () { shareAnyReport(printLedger, "Accounts-Ledger"); }} />
                </div>
              </div>
              <div className="erp-acc-count-badge">Showing {filtered.length} of {entries.length} transactions</div>
            </Card>

            <div className="erp-acc-table-fill">
            <Card pad={0} className="erp-acc-data-card">
              <div className="erp-acc-table-scroll">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "48px" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "12%" }} />
                    <col />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "11%" }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: C.th }}>
                      <TH>#</TH>
                      <TH>Date</TH>
                      <TH>Type</TH>
                      <TH>Description</TH>
                      <TH>Account</TH>
                      <th style={ledgerThNum}>Money In</th>
                      <th style={ledgerThNum}>Money Out</th>
                      <th style={ledgerThNum}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr><td colSpan={8} style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 13 }}>No transactions found for selected filters.</td></tr>
                    )}
                    {pageRows.map(function (e, i) {
                      var isIn = e.moneyIn > 0;
                      var isOut = e.moneyOut > 0;
                      var balNeg = e.balance < 0;
                      var typeColor = typeColors[e.type] || C.textMd;
                      var rowNum = (cashBookPager.start || 1) + i;
                      return (
                        <tr key={e.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8faff", borderBottom: "1px solid " + C.borderLight }}>
                          <td style={{ padding: "9px 14px", color: C.muted, fontSize: 12 }}>{rowNum}</td>
                          <td style={{ padding: "9px 14px", fontWeight: 600, whiteSpace: "nowrap", fontSize: 12.5 }}>{e.date}</td>
                          <td style={{ padding: "9px 14px" }}>
                            <span style={{ background: typeColor + "18", color: typeColor, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{e.type}</span>
                          </td>
                          <td style={{ padding: "9px 14px", color: C.textMd, fontSize: 12.5, maxWidth: 260 }}>{e.description}</td>
                          <td style={{ padding: "9px 14px" }}>
                            <span style={{ background: e.account === "Bank" ? "#e8f0fe" : "#f0faf4", color: e.account === "Bank" ? "#1565c0" : "#1b5e20", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{e.account === "Bank" ? "🏦 Bank" : "💵 Cash"}</span>
                          </td>
                          <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: isIn ? 800 : 400, color: isIn ? C.green : C.muted, fontSize: 13 }}>
                            {isIn ? getCurrencySymbol() + " " + fmtNum(e.moneyIn) : "—"}
                          </td>
                          <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: isOut ? 800 : 400, color: isOut ? C.red : C.muted, fontSize: 13 }}>
                            {isOut ? getCurrencySymbol() + " " + fmtNum(e.moneyOut) : "—"}
                          </td>
                          <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 900, fontSize: 14, color: balNeg ? C.red : C.text, borderLeft: "2px solid " + C.border }}>
                            {getCurrencySymbol()} {fmtNum(e.balance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {filtered.length > 0 && (
                    <tfoot>
                      <tr style={{ background: "#e8eeff", borderTop: "2px solid " + C.accent }}>
                        <td colSpan={5} style={{ padding: "10px 14px", fontWeight: 800, fontSize: 13 }}>PERIOD TOTALS</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 900, fontSize: 14, color: C.green }}>{getCurrencySymbol()} {fmtNum(filteredIn)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 900, fontSize: 14, color: C.red }}>{getCurrencySymbol()} {fmtNum(filteredOut)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 900, fontSize: 14, color: closingBal < 0 ? C.red : C.text, borderLeft: "2px solid " + C.accent }}>{getCurrencySymbol()} {fmtNum(closingBal)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {Pager ? (
                <div className="erp-acc-ledger-pager" style={{ padding: "0 12px 8px" }}>
                  <Pager pager={cashBookPager} />
                </div>
              ) : null}
            </Card>
            </div>

          </div>
        );
      })()}

      {/* ── GENERAL LEDGER / TRIAL BALANCE (double-entry) ── */}
      {atab === "gledger" && (function () {
        var tb = typeof getTrialBalanceSnapshot === "function" ? getTrialBalanceSnapshot() : { rows: [], totalDebit: 0, totalCredit: 0, balanced: false };
        var bs = typeof getBalanceSheetFromLedger === "function" ? getBalanceSheetFromLedger(null) : {
          assets: 0,
          liabilities: 0,
          equity: 0,
          balanced: false,
          difference: 0,
          balancedWithEarnings: false,
          differenceWithEarnings: 0,
        };
        var pl = typeof getProfitAndLossFromLedger === "function" ? getProfitAndLossFromLedger(null, null) : { income: 0, expenses: 0, net: 0 };
        var glErrRaw = S.get("tc3_gl_last_error", null);
        var glErr = isMeaningfulGlLastError(glErrRaw) ? glErrRaw : null;
        if (!glErr && glErrRaw != null && typeof S.set === "function") {
          try { S.set("tc3_gl_last_error", null); } catch (_clr) { /* ignore */ }
        }
        var glErrText = glErr ? formatGlLastError(glErr) : "";
        var glAudit = S.get("tc3_gl_audit", []);
        var glMode = S.get("tc3_gl_mode", "live");
        var invRec = S.get("tc3_inv_reconciliation", null);
        var runRows = typeof getGlAccountRunning === "function" ? getGlAccountRunning(glSelAcct) : [];
        var runRowsPage = runRows.slice(0, glAcctLinesVisible);
        var journalLinesAll = S.get("tc3_journal_lines", []);
        var groupedJournal = tcGroupJournalByTransaction(journalLinesAll);
        var groupedJournalSlice = groupedJournal.slice(0, glDebugGroupLimit);
        var snapListRaw = S.get("tc3_financial_snapshots", []);
        var snapsRecent = Array.isArray(snapListRaw) ? snapListRaw.slice(-15).reverse() : [];
        var acctOpts = tb.rows && tb.rows.length ? tb.rows : [];
        var bsEqBal = bs.balancedWithEarnings !== undefined ? bs.balancedWithEarnings : bs.balanced;
        var bsEqDiffAmt = Math.abs(bs.differenceWithEarnings != null ? bs.differenceWithEarnings : bs.difference != null ? bs.difference : 0);
        var invDerRecon = deriveInventoryEconomics(state, S);
        invDerRecon.reconciliation = reconcileInventoryToLedger(journalLinesAll, invDerRecon, S.get("tc3_gl_accounts", DEFAULT_GL_CHART));
        var reconRep = buildReconciliationReport({
          lines: journalLinesAll,
          chart: S.get("tc3_gl_accounts", DEFAULT_GL_CHART),
          invDer: invDerRecon,
          validateJournalBalanced: validateJournalBalanced,
          settings: state.settings || {},
        });
        var glHealthy = tb.balanced && bsEqBal && reconRep.summaryOk && !glErrText;
        return (
          <div className="erp-tab-content erp-acc-tab-pro erp-acc-tab-pro--gledger erp-acc-gledger-layout">
            <AccTabHead icon="📒" tone="navy" title="GL / Trial Balance" sub="General ledger health, trial balance & reconciliation" />

            <div className={"erp-acc-gl-hero" + (glHealthy ? " is-ok" : " is-warn")}>
              <div className="erp-acc-gl-hero-glow" aria-hidden="true" />
              <div className="erp-acc-gl-hero-main">
                <div className="erp-acc-gl-hero-eyebrow">Ledger snapshot</div>
                <div className="erp-acc-gl-hero-title">Trial balance totals</div>
                <div className="erp-acc-gl-hero-val">
                  Dr {getCurrencySymbol()} {fmtNum(tb.totalDebit)} · Cr {getCurrencySymbol()} {fmtNum(tb.totalCredit)}
                </div>
                <div className="erp-acc-gl-hero-sub">
                  {tb.rows.length} accounts · Engine {glMode === "rebuild" ? "Repair" : "Live"} · {journalLinesAll.length} journal lines
                </div>
              </div>
              <div className="erp-acc-gl-hero-chips">
                <span className={"erp-acc-ov-chip" + (tb.balanced ? " is-ok" : " is-warn")}>
                  {tb.balanced ? "✓ Trial balanced" : "⚠ Trial mismatch"}
                </span>
                <span className={"erp-acc-ov-chip" + (bsEqBal ? " is-ok" : " is-warn")}>
                  {bsEqBal ? "✓ A = L + E + NI" : "⚠ BS off " + getCurrencySymbol() + fmtNum(bsEqDiffAmt)}
                </span>
                <span className={"erp-acc-ov-chip" + (reconRep.summaryOk ? " is-ok" : " is-warn")}>
                  {reconRep.summaryOk ? "✓ Recon OK" : "⚠ Recon review"}
                </span>
              </div>
            </div>

            <div className="erp-acc-stat-row erp-acc-gl-stat-row">
              <StatCard
                label="Net P&L"
                value={pl.net}
                accent={pl.net >= 0 ? C.green : C.red}
                valueColor={pl.net >= 0 ? C.green : C.red}
                icon={pl.net >= 0 ? "📈" : "📉"}
                sub="From ledger accounts"
              />
              <StatCard
                label="Income"
                value={pl.income}
                accent={C.blue}
                valueColor={C.blue}
                icon="💰"
                sub="Revenue accounts"
              />
              <StatCard
                label="Expenses"
                value={pl.expenses}
                accent={C.orange}
                valueColor={C.orange}
                icon="💸"
                sub="Cost & operating"
              />
              <StatCard
                label="Balance sheet"
                value={bs.assets}
                accent={bsEqBal ? C.green : C.red}
                valueColor={bsEqBal ? C.green : C.red}
                icon="📒"
                sub={"Liab " + fmtNum(bs.liabilities) + " · Eq " + fmtNum(bs.equity) + " · NI " + fmtNum(bs.currentEarnings != null ? bs.currentEarnings : 0)}
              />
            </div>

            {glErrText ? (
              <div className="erp-acc-alert is-error">{glErrText}</div>
            ) : null}
            {invRec && !isInventoryReconcileOk(invRec, state.settings || {}) ? (
              <div className="erp-acc-alert is-warn">
                <strong>Inventory vs ledger:</strong> GL {getCurrencySymbol()} {fmtNum(invRec.glInventoryBalance)} vs layers {getCurrencySymbol()} {fmtNum(invRec.physicalValue)}
                {typeof invRec.difference === "number" ? <span> — Δ {getCurrencySymbol()} {fmtNum(Math.abs(invRec.difference))}</span> : null}
              </div>
            ) : null}

            <div className="erp-acc-gl-primary">
            <Card pad={0} className="erp-acc-gl-main-card erp-acc-data-card">
              <div className="erp-acc-gl-tb-head">
                <div className="erp-acc-gl-tb-head-text">
                  <div className="erp-acc-gl-tb-title">Trial balance</div>
                  <div className="erp-acc-gl-tb-sub">{tb.rows.length} accounts · Dr/Cr must match for a balanced book</div>
                </div>
                <div className="erp-acc-gl-tb-actions">
                  <span className="erp-acc-gl-totals">
                    Δ {getCurrencySymbol()} {fmtNum(Math.abs((tb.totalDebit || 0) - (tb.totalCredit || 0)))}
                  </span>
                  <Btn col="cyan" onClick={function () {
                    if (typeof rebuildGeneralLedger === "function") rebuildGeneralLedger();
                  }}>↻ Rebuild journal</Btn>
                </div>
              </div>
              <div className="erp-acc-table-scroll erp-acc-table-scroll--tb">
                <table className="erp-acc-gl-table">
                  <thead>
                    <tr>
                      <TH>Code</TH>
                      <TH>Account</TH>
                      <TH>Type</TH>
                      <TH className="is-num">Debit</TH>
                      <TH className="is-num">Credit</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {tb.rows.map(function (r) {
                      return (
                        <tr key={r.accountId}>
                          <TD><span className="erp-acc-gl-code">{r.code}</span></TD>
                          <TD bold>{r.name}</TD>
                          <TD><span className={"erp-acc-gl-type " + glAccountTypeClass(r.type)}>{r.type}</span></TD>
                          <TD className="is-num is-debit">{r.debit > 0 ? getCurrencySymbol() + " " + fmtNum(r.debit) : "—"}</TD>
                          <TD className="is-num is-credit">{r.credit > 0 ? getCurrencySymbol() + " " + fmtNum(r.credit) : "—"}</TD>
                        </tr>
                      );
                    })}
                    {tb.rows.length === 0 && (
                      <tr><td colSpan={5} className="erp-acc-gl-empty">No journal lines yet — use Rebuild or post a transaction.</td></tr>
                    )}
                    <tr className="erp-acc-gl-total-row">
                      <td colSpan={3}>TOTAL</td>
                      <td className="is-num">{getCurrencySymbol()} {fmtNum(tb.totalDebit)}</td>
                      <td className="is-num">{getCurrencySymbol()} {fmtNum(tb.totalCredit)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
            </div>

            <AccFold
              tone="green"
              title="Reconciliation checks"
              sub="GL vs inventory · AR/AP · journal balance"
              open={glReconOpen}
              onToggle={function () { setGlReconOpen(function (v) { return !v; }); }}
              badge={
                <span className={"erp-acc-health-pill" + (reconRep.summaryOk ? " is-ok" : " is-warn")}>
                  {reconRep.summaryOk ? "OK" : "Review"}
                </span>
              }
            >
              <div className="erp-acc-recon-list">
                {reconRep.rows.map(function (row) {
                  var cls = row.ok === false ? " is-bad" : row.ok === null ? " is-neutral" : " is-ok";
                  return (
                    <div key={row.id} className={"erp-acc-recon-row" + cls}>
                      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 6, width: "100%" }}>
                        <span className="erp-acc-recon-row-label">{row.label}</span>
                        <span className="erp-acc-recon-row-detail">{row.detail}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </AccFold>

            <AccFold
              tone="blue"
              title="Account activity"
              sub={runRows.length + " lines · " + (acctOpts[0] ? acctOpts.length + " accounts" : "select account")}
              open={glActivityOpen}
              onToggle={function () { setGlActivityOpen(function (v) { return !v; }); }}
            >
              <div className="erp-acc-gl-activity-toolbar">
                <div className="erp-acc-toolbar-field erp-acc-gl-acct-field">
                  <label>Account</label>
                  <select value={glSelAcct} onChange={function (e) { setGlSelAcct(e.target.value); }}>
                    {acctOpts.map(function (r) {
                      return <option key={r.accountId} value={r.accountId}>{r.code} — {r.name}</option>;
                    })}
                    {acctOpts.length === 0 && ["1000", "1010", "1100", "1200", "2000", "3000", "4000", "5000", "6000"].map(function (id) {
                      return <option key={id} value={id}>{id}</option>;
                    })}
                  </select>
                </div>
                <span className="erp-acc-count-badge">{runRowsPage.length} of {runRows.length} lines shown</span>
              </div>
              <div className="erp-acc-table-scroll erp-acc-table-scroll--activity">
                <table className="erp-acc-gl-table erp-acc-gl-activity-table">
                  <thead>
                    <tr>
                      <TH>Date</TH>
                      <TH>Ref</TH>
                      <TH>Memo</TH>
                      <TH className="is-num">Debit</TH>
                      <TH className="is-num">Credit</TH>
                      <TH className="is-num">Run bal</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {runRowsPage.map(function (rr, i) {
                      var ln = rr.line;
                      return (
                        <tr key={ln.id || i}>
                          <TD>{ln.date || "—"}</TD>
                          <TD><span className="erp-acc-gl-ref">{ln.referenceType}</span></TD>
                          <TD className="erp-acc-gl-memo">{(ln.memo || "").slice(0, 80)}</TD>
                          <TD className="is-num is-debit">{ln.debit > 0 ? fmtNum(ln.debit) : "—"}</TD>
                          <TD className="is-num is-credit">{ln.credit > 0 ? fmtNum(ln.credit) : "—"}</TD>
                          <TD className="is-num is-runbal">{fmtNum(rr.running)}</TD>
                        </tr>
                      );
                    })}
                    {runRows.length === 0 && (
                      <tr><td colSpan={6} className="erp-acc-gl-empty">No lines for this account.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {runRows.length > runRowsPage.length ? (
                <div className="erp-acc-gl-load-more">
                  <Btn col="gray" onClick={function () { setGlAcctLinesVisible(function (n) { return n + 80; }); }}>Load more ({runRows.length - runRowsPage.length})</Btn>
                </div>
              ) : null}
            </AccFold>

            <AccFold
              tone="purple"
              title="Financial snapshots"
              sub="Hash-sealed integrity records from Settings"
              open={glSnapshotsOpen}
              onToggle={function () { setGlSnapshotsOpen(function (v) { return !v; }); }}
              badge={<span className="erp-acc-health-pill is-neutral">{snapsRecent.length} saved</span>}
            >
              {snapsRecent.length === 0 ? (
                <div className="erp-acc-gl-snap-empty">
                  <span>No snapshots yet. Save from Settings → Accounting; new saves appear as</span>
                  <SnapshotIntegrityBadge variant="sealed" />
                  <span>when sealed.</span>
                </div>
              ) : (
                <div className="erp-acc-gl-snap-list">
                  {snapsRecent.map(function (s) {
                    var tampered = !!(s && s.tampered);
                    var sealed = !tampered && !!(s && s.contentHash && validateSnapshotIntegrity(s));
                    var legacy = s && !s.contentHash;
                    return (
                      <div key={s.id || s.createdAt} className={"erp-acc-gl-snap-row" + (tampered ? " is-bad" : sealed ? " is-ok" : "")}>
                        <span className="erp-acc-gl-snap-date">{fmtDateFull(s.createdAt || "").slice(0, 16) || "—"}</span>
                        <span className="erp-acc-gl-snap-label">{s.label || s.id || ""}</span>
                        {tampered ? (
                          <SnapshotIntegrityBadge variant="failed" liveStatus />
                        ) : sealed ? (
                          <SnapshotIntegrityBadge variant="sealed" liveStatus />
                        ) : legacy ? (
                          <SnapshotIntegrityBadge variant="legacy" liveStatus />
                        ) : (
                          <SnapshotIntegrityBadge variant="failed" liveStatus />
                        )}
                        {s.contentHash ? <span className="erp-acc-gl-snap-hash" title="Content hash">{String(s.contentHash).slice(0, 18)}…</span> : null}
                      </div>
                    );
                  })}
                </div>
              )}
              {glDeveloperTools && snapsRecent.length > 0 && typeof getTrialBalanceSnapshot === "function" && (
                <div className="erp-acc-gl-dev-block">
                  <div className="erp-acc-gl-dev-title">Trial balance vs live (support)</div>
                  <div className="erp-acc-gl-dev-tools">
                    <select
                      className="erp-acc-gl-dev-select"
                      value={Math.min(snapTbDiffIdx, snapsRecent.length - 1)}
                      onChange={function (e) { setSnapTbDiffIdx(parseInt(e.target.value, 10) || 0); setSnapTbDiffRes(null); }}
                    >
                      {snapsRecent.map(function (s, i) {
                        return (
                          <option key={(s.id || "") + "_" + i} value={i}>
                            {(s.createdAt || "").slice(0, 16)} — {(s.label || s.id || "").slice(0, 42)}
                          </option>
                        );
                      })}
                    </select>
                    <Btn
                      sm
                      col="gray"
                      onClick={function () {
                        var ii = Math.min(snapTbDiffIdx, snapsRecent.length - 1);
                        var pick = snapsRecent[ii];
                        var tbLive = getTrialBalanceSnapshot();
                        var chart = S.get("tc3_gl_accounts", DEFAULT_GL_CHART);
                        setSnapTbDiffRes(diffTrialBalanceSnapshotVsLive(chart, pick, tbLive, 25));
                      }}
                    >
                      Show top deltas
                    </Btn>
                  </div>
                  {snapTbDiffRes && snapTbDiffRes.message ? (
                    <div className="erp-acc-gl-dev-msg">{snapTbDiffRes.message}</div>
                  ) : null}
                  {snapTbDiffRes && snapTbDiffRes.rows && snapTbDiffRes.rows.length > 0 ? (
                    <div className="erp-acc-table-scroll erp-acc-table-scroll--mini">
                      <table className="erp-acc-gl-table">
                        <thead>
                          <tr>
                            <TH>Account</TH>
                            <TH className="is-num">Δ signed</TH>
                          </tr>
                        </thead>
                        <tbody>
                          {snapTbDiffRes.rows.map(function (rw, ri) {
                            return (
                              <TR key={(rw.accountId || "") + "_" + ri} i={ri}>
                                <TD>{rw.code} — {rw.name}</TD>
                                <TD className="is-num is-runbal">{fmtNum(rw.deltaSigned)}</TD>
                              </TR>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : snapTbDiffRes && !snapTbDiffRes.legacy ? (
                    <div className="erp-acc-gl-dev-ok">No material per-account drift vs live TB.</div>
                  ) : null}
                </div>
              )}
            </AccFold>

            {glDeveloperTools && (
              <Card className="erp-acc-gl-dev-card">
                <CardTitle sub="Admin / dev only — does not change data">Developer tools</CardTitle>
                <div className="erp-acc-gl-dev-toggle">
                  <label className="erp-acc-gl-dev-check">
                    <input type="checkbox" checked={glDebugOpen} onChange={function (e) { setGlDebugOpen(e.target.checked); }} />
                    Show journal debug (grouped by transaction)
                  </label>
                </div>
                {glDebugOpen && (
                  <div className="erp-acc-gl-dev-panel">
                    <div className="erp-acc-gl-dev-box">
                      <div className="erp-acc-gl-dev-box-title">Inventory reconciliation (stored)</div>
                      {invRec ? (
                        <pre className="erp-acc-gl-dev-pre">{JSON.stringify(invRec, null, 2)}</pre>
                      ) : (
                        <span className="erp-acc-gl-dev-muted">No tc3_inv_reconciliation in storage.</span>
                      )}
                    </div>
                    <div>
                      <div className="erp-acc-gl-dev-box-title">Journal entries by transactionId (first {glDebugGroupLimit} of {groupedJournal.length} groups)</div>
                      <div className="erp-acc-gl-dev-groups">
                        {groupedJournalSlice.map(function (g) {
                          var bal = round2(g.dr - g.cr);
                          return (
                            <div key={g.tid} className="erp-acc-gl-dev-group">
                              <div className="erp-acc-gl-dev-group-id">{g.tid}</div>
                              <div className="erp-acc-gl-dev-group-meta">Dr {fmtNum(g.dr)} · Cr {fmtNum(g.cr)} · Net Dr−Cr {fmtNum(bal)}</div>
                              <table className="erp-acc-gl-dev-group-table">
                                <tbody>
                                  {g.lines.map(function (ln, li) {
                                    return (
                                      <tr key={li}>
                                        <td>{ln.accountId}</td>
                                        <td>{(ln.memo || "").slice(0, 40)}</td>
                                        <td className="is-num">{ln.debit > 0 ? fmtNum(ln.debit) : "—"}</td>
                                        <td className="is-num">{ln.credit > 0 ? fmtNum(ln.credit) : "—"}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          );
                        })}
                      </div>
                      {groupedJournal.length > glDebugGroupLimit && (
                        <Btn col="gray" onClick={function () { setGlDebugGroupLimit(function (n) { return n + 50; }); }} style={{ marginTop: 8 }}>Load more groups</Btn>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            )}

            <AccFold
              tone="slate"
              title="GL audit trail"
              sub="Journal rebuilds, validation &amp; sync events"
              open={glAuditOpen}
              onToggle={function () { setGlAuditOpen(function (v) { return !v; }); }}
              badge={<span className="erp-acc-health-pill is-neutral">{(glAudit || []).length} entries</span>}
            >
              <div className="erp-acc-gl-audit-list">
                {(!glAudit || !glAudit.length) && <div className="erp-acc-gl-audit-empty">No audit entries yet.</div>}
                {(glAudit || []).slice(-20).reverse().map(function (row, i) {
                  return (
                    <div key={row.id || i} className="erp-acc-gl-audit-row">
                      <div className="erp-acc-gl-audit-action">{row.action || "—"}</div>
                      <div className="erp-acc-gl-audit-ts">{row.ts || ""}</div>
                    </div>
                  );
                })}
              </div>
            </AccFold>
          </div>
        );
      })()}

      {/* ── CAPITAL ── */}
      {atab === "capital" && (function () {
        var ledger = getCapLedger().slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
        var totalInvested = ledger.filter(function (e) { return e.type === "invest"; }).reduce(function (a, e) { return a + e.amount; }, 0);
        var totalWithdrawn = ledger.filter(function (e) { return e.type === "withdraw"; }).reduce(function (a, e) { return a + e.amount; }, 0);
        var net = totalInvested - totalWithdrawn;
        return (
          <div className="erp-tab-content erp-acc-tab-pro erp-acc-tab-pro--capital erp-acc-split-layout">
            <AccTabHead icon="💼" tone="green" title="Capital" sub="Owner investments, withdrawals & running balance" />
            <div className="erp-acc-stat-row">
              <StatCard label="Net Capital" value={net} accent={C.blue} valueColor={C.blue} icon="💼" sub="Active in business" />
              <StatCard label="Total Invested" value={totalInvested} accent={C.green} valueColor={C.green} icon="⬆" />
              <StatCard label="Total Withdrawn" value={totalWithdrawn} accent={C.red} valueColor={C.red} icon="⬇" />
              <StatCard money={false} label="Transactions" value={ledger.length} accent={C.purple} valueColor={C.purple} icon="📋" />
            </div>
            <div className="erp-acc-split erp-acc-split--fill">
              <Card pad={10} className="erp-acc-form-card">
                <CardTitle sub="Record a new investment or withdrawal">New Entry</CardTitle>
                <div className="erp-acc-form-stack">
                  <AccChoiceRow
                    label="Transaction Type"
                    value={capForm.type}
                    onChange={function (v) { setCapForm(function (x) { return Object.assign({}, x, { type: v }); }); }}
                    options={[["invest", "⬆ Invest Capital", "green"], ["withdraw", "⬇ Withdraw Capital", "red"]]}
                  />
                  <div className="erp-acc-form-grid-2">
                    <Input label="Amount (Rs) *" type="number" value={capForm.amount} onChange={function (e) { setCapForm(function (x) { return Object.assign({}, x, { amount: e.target.value }); }); }} />
                    <Input label="Date *" type="date" value={capForm.date} onChange={function (e) { setCapForm(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }} />
                  </div>
                  <Input label="Reference / Source" value={capForm.ref} onChange={function (e) { setCapForm(function (x) { return Object.assign({}, x, { ref: e.target.value }); }); }} />
                  <Input label="Note / Description" value={capForm.note} onChange={function (e) { setCapForm(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} />
                  <AccChoiceRow
                    label={capForm.type === "invest" ? "Receive To" : "Withdraw From"}
                    value={capForm.cashMethod || "Cash"}
                    onChange={function (v) { setCapForm(function (x) { return Object.assign({}, x, { cashMethod: v }); }); }}
                    options={[["Cash", "💵 Cash", "green"], ["Bank", "🏦 Bank", "blue"]]}
                  />
                  <Btn col={capForm.type === "invest" ? "green" : "red"} onClick={saveCapEntry}>{capForm.type === "invest" ? "Record Investment" : "Record Withdrawal"}</Btn>
                </div>
              </Card>
              <Card className="erp-acc-data-card">
                <CardTitle sub={ledger.length + " capital transactions"}>Capital Ledger</CardTitle>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><TH>#</TH><TH>Date</TH><TH>Type</TH><TH>Amount</TH><TH>Method</TH><TH>Reference</TH><TH>Note</TH><TH>Running Balance</TH><TH>Actions</TH></tr></thead>
                    <tbody>
                      {ledger.length === 0 && <tr><td colSpan={9} style={{ padding: 24, textAlign: "center", color: C.muted }}>No capital entries yet.</td></tr>}
                      {(function () {
                        var sorted = getCapLedger().slice().sort(function (a, b) { return a.date > b.date ? 1 : -1; });
                        var running = 0; var rows = sorted.map(function (e, i) { running += (e.type === "invest" ? e.amount : -e.amount); return { e: e, i: i, run: running }; });
                        return rows.slice().reverse().map(function (row) {
                          var e = row.e; var isI = e.type === "invest";
                          return (
                            <TR key={e.id} i={row.i}>
                              <TD color={C.muted}>{row.i + 1}</TD>
                              <TD>{fmtDateFull(e.date)}</TD>
                              <td style={{ padding: "10px 12px" }}><span style={{ background: isI ? "#e8f5e9" : "#fde8ed", color: isI ? "#1b5e20" : "#b71c1c", borderRadius: 6, padding: "4px 11px", fontSize: 12, fontWeight: 800 }}>{isI ? "⬆ Invest" : "⬇ Withdraw"}</span></td>
                              <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: 14, color: isI ? "#1b5e20" : "#b71c1c" }}>{isI ? "+" : "-"}{getCurrencySymbol()} {fmtNum(e.amount)}</td>
                              <TD color={C.muted}>{e.cashMethod || "Cash"}</TD>
                              <TD color={C.muted}>{e.ref || "—"}</TD>
                              <TD>{e.note || "—"}</TD>
                              <td style={{ padding: "10px 12px", fontWeight: 700, color: row.run >= 0 ? C.blue : C.red }}>{getCurrencySymbol()} {fmtNum(row.run)}</td>
                              <td style={actBtnCellStyle}>
                                <ActBtnGroup>
                                  <ActBtn tone="blue" title="Edit capital entry" onClick={function () { setCapEditForm(Object.assign({}, e)); setCapEditModal("edit"); setCapActionPw(""); setCapActionReason(""); setCapActionMsg(""); }} />
                                  <ActBtn tone="red" title="Delete capital entry" onClick={function () { setCapDeleteTarget(Object.assign({}, e)); setCapActionPw(""); setCapActionReason(""); setCapActionMsg(""); }} />
                                </ActBtnGroup>
                              </td>
                            </TR>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
            {/* Capital edit/delete modals */}
            {capEditModal && capEditForm && (
              <Modal title="Edit Capital Entry" onClose={function () { setCapEditModal(null); setCapEditForm(null); setCapActionPw(""); setCapActionReason(""); setCapActionMsg(""); }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Input label="Amount" type="number" value={capEditForm.amount} onChange={function (e) { setCapEditForm(function (x) { return Object.assign({}, x, { amount: parseFloat(e.target.value) || 0 }); }); }} />
                    <Input label="Date" type="date" value={capEditForm.date} onChange={function (e) { setCapEditForm(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }} />
                  </div>
                  <Input label="Reference" value={capEditForm.ref || ""} onChange={function (e) { setCapEditForm(function (x) { return Object.assign({}, x, { ref: e.target.value }); }); }} />
                  <Input label="Note" value={capEditForm.note || ""} onChange={function (e) { setCapEditForm(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} />
                  <Input label="Password (required)" type="password" value={capActionPw} onChange={function (e) { setCapActionPw(e.target.value); }} />
                  <Input label="Reason for edit (min 3 chars)" value={capActionReason} onChange={function (e) { setCapActionReason(e.target.value); }} />
                  {capActionMsg && <div style={{ color: C.red, fontSize: 12 }}>{capActionMsg}</div>}
                  <Btn col="blue" onClick={doCapEdit}>Save Changes</Btn>
                </div>
              </Modal>
            )}
            {capDeleteTarget && (
              <Modal title="Delete Capital Entry" onClose={function () { setCapDeleteTarget(null); setCapActionPw(""); setCapActionReason(""); setCapActionMsg(""); }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ background: C.dangerSoft, borderRadius: 9, padding: "12px 16px", fontSize: 13, color: C.red }}>Delete {capDeleteTarget.type} of {getCurrencySymbol()} {fmtNum(capDeleteTarget.amount)} on {fmtDateFull(capDeleteTarget.date)}?</div>
                  <Input label="Password (required)" type="password" value={capActionPw} onChange={function (e) { setCapActionPw(e.target.value); }} />
                  <Input label="Reason for deletion (min 3 chars)" value={capActionReason} onChange={function (e) { setCapActionReason(e.target.value); }} />
                  {capActionMsg && <div style={{ color: C.red, fontSize: 12 }}>{capActionMsg}</div>}
                  <Btn col="red" onClick={doCapDelete}>Confirm Delete</Btn>
                </div>
              </Modal>
            )}
          </div>
        );
      })()}

      {/* ── PROFIT DISTRIBUTION ── */}
      {atab === "profit" && (function () {
        var distList = getProfitDist().slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
        var totalDist = distList.reduce(function (a, e) { return a + e.amount; }, 0);
        var byPartner = {};
        distList.forEach(function (e) { byPartner[e.partner] = (byPartner[e.partner] || 0) + e.amount; });
        return (
          <div className="erp-tab-content erp-acc-tab-pro erp-acc-tab-pro--profit erp-acc-split-layout">
            <AccTabHead icon="🤝" tone="purple" title="Profit Distribution" sub="Partner profit sharing — does not affect capital" />
            <div className="erp-acc-stat-row">
              <StatCard label="Total Distributed" value={totalDist} accent={C.purple} valueColor={C.purple} icon="🤝" sub={distList.length + " entries"} />
              <StatCard label="Net Profit" value={netProfit} accent={netProfit >= 0 ? C.green : C.red} valueColor={netProfit >= 0 ? C.green : C.red} icon="📈" />
              <StatCard label="Available Profit" value={availableProfit} accent={C.blue} valueColor={C.blue} icon="💰" sub="After distribution" />
              <StatCard money={false} label="Partners" value={Object.keys(byPartner).length} accent={C.orange} valueColor={C.orange} icon="👥" />
            </div>
            <div className="erp-acc-split erp-acc-split--fill">
              <Card pad={10} className="erp-acc-form-card">
                <CardTitle sub="Record profit sharing">New Distribution</CardTitle>
                <div className="erp-acc-form-stack">
                  <Input label="Date *" type="date" value={pdForm.date} onChange={function (e) { setPdForm(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }} />
                  <Input label="Partner / Person *" value={pdForm.partner} onChange={function (e) { setPdForm(function (x) { return Object.assign({}, x, { partner: e.target.value }); }); }} placeholder="e.g. John (Partner)" />
                  <Input label="Amount (Rs) *" type="number" value={pdForm.amount} onChange={function (e) { setPdForm(function (x) { return Object.assign({}, x, { amount: e.target.value }); }); }} />
                  <AccChoiceRow
                    label="Payment Method"
                    value={pdForm.paymentMethod || "Cash"}
                    onChange={function (v) { setPdForm(function (x) { return Object.assign({}, x, { paymentMethod: v }); }); }}
                    options={[["Cash", "💵 Cash", "green"], ["Bank", "🏦 Bank", "blue"]]}
                  />
                  <Input label="Note" value={pdForm.note} onChange={function (e) { setPdForm(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} placeholder="Optional note" />
                  <div className="erp-acc-hint erp-acc-hint--warn">⚠ This reduces profit balance. It does NOT affect capital.</div>
                  <Btn col="purple" onClick={saveProfitDist}>Record Distribution</Btn>
                </div>
              </Card>
              <div className="erp-acc-split-col">
                {Object.keys(byPartner).length > 0 && (
                  <Card pad={10} className="erp-acc-partner-card">
                    <CardTitle sub="Per-partner summary">By Partner</CardTitle>
                    {Object.keys(byPartner).map(function (p) {
                      var pct = totalDist > 0 ? Math.round(byPartner[p] / totalDist * 100) : 0;
                      return (
                        <div key={p} className="erp-acc-partner-row">
                          <div className="erp-acc-partner-avatar">{p.charAt(0).toUpperCase()}</div>
                          <div className="erp-acc-partner-main">
                            <div className="erp-acc-partner-name">{p}</div>
                            <div className="erp-acc-partner-bar"><span style={{ width: pct + "%" }} /></div>
                          </div>
                          <div className="erp-acc-partner-amt">{getCurrencySymbol()} {fmtNum(byPartner[p])}</div>
                          <div className="erp-acc-partner-pct">{pct}%</div>
                        </div>
                      );
                    })}
                  </Card>
                )}
                <Card className="erp-acc-data-card">
                  <CardTitle sub={distList.length + " entries"}>Distribution History</CardTitle>
                  {distList.length === 0 && <div style={{ textAlign: "center", padding: "20px 0", color: C.muted }}>No distributions recorded yet.</div>}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr><TH>Date</TH><TH>Partner</TH><TH>Amount</TH><TH>Method</TH><TH>Note</TH><TH>Actions</TH></tr></thead>
                      <tbody>
                        {distList.map(function (e, i) {
                          return (
                            <TR key={e.id} i={i}>
                              <TD>{fmtDateFull(e.date)}</TD>
                              <TD bold>{e.partner}</TD>
                              <TD bold color={C.purple}>{getCurrencySymbol()} {fmtNum(e.amount)}</TD>
                              <TD color={C.muted}>{e.paymentMethod || "Cash"}</TD>
                              <TD>{e.note || "—"}</TD>
                              <td style={actBtnCellStyle}>
                                <ActBtnGroup>
                                  <ActBtn tone="blue" title="Edit distribution" onClick={function () { setPdEdit(Object.assign({}, e)); }} />
                                  <ActBtn tone="red" title="Delete distribution" onClick={function () { deletePd(e.id); }} />
                                </ActBtnGroup>
                              </td>
                            </TR>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </div>
            {pdEdit && (
              <Modal title="Edit Distribution" onClose={function () { setPdEdit(null); }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <Input label="Date" type="date" value={pdEdit.date} onChange={function (e) { setPdEdit(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }} />
                  <Input label="Partner" value={pdEdit.partner} onChange={function (e) { setPdEdit(function (x) { return Object.assign({}, x, { partner: e.target.value }); }); }} />
                  <Input label="Amount" type="number" value={pdEdit.amount} onChange={function (e) { setPdEdit(function (x) { return Object.assign({}, x, { amount: parseFloat(e.target.value) || 0 }); }); }} />
                  <Sel label="Payment Method" value={pdEdit.paymentMethod || "Cash"} onChange={function (e) { setPdEdit(function (x) { return Object.assign({}, x, { paymentMethod: e.target.value }); }); }}><option>Cash</option><option>Bank</option></Sel>
                  <Input label="Note" value={pdEdit.note || ""} onChange={function (e) { setPdEdit(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} />
                  <Btn col="blue" onClick={savePdEdit}>Save Changes</Btn>
                </div>
              </Modal>
            )}
          </div>
        );
      })()}

      {/* ── ASSETS ── */}
      {atab === "assets" && (function () {
        var assets = state.assets || [];
        var totalAssetVal = assets.reduce(function (a, x) { return a + x.amount; }, 0);
        var catTotals = {};
        assets.forEach(function (a) { catTotals[a.category] = (catTotals[a.category] || 0) + a.amount; });
        return (
          <div className="erp-tab-content erp-acc-tab-pro erp-acc-tab-pro--assets erp-acc-split-layout">
            <AccTabHead icon="🏢" tone="teal" title="Fixed Assets" sub="Business asset register — equipment, vehicles & property" />
            <div className="erp-acc-stat-row">
              <StatCard label="Total Assets" value={totalAssetVal} accent={C.blue} valueColor={C.blue} icon="🏢" sub={assets.length + " asset" + (assets.length !== 1 ? "s" : "")} />
              {Object.keys(catTotals).slice(0, 3).map(function (cat, idx) {
                var accents = [C.green, C.cyan, C.orange];
                var accent = accents[idx] || C.purple;
                return (
                  <StatCard
                    key={cat}
                    label={cat.length > 20 ? cat.slice(0, 20) + "…" : cat}
                    value={catTotals[cat]}
                    accent={accent}
                    valueColor={accent}
                    icon="📦"
                  />
                );
              })}
            </div>
            <div className="erp-acc-split erp-acc-split--fill">
              <Card pad={10} className="erp-acc-form-card">
                <CardTitle sub="Add a new business asset">{newAsset ? "New Asset" : "Add Asset"}</CardTitle>
                {!newAsset ? (
                  <Btn col="blue" onClick={function () { setNewAsset({ date: today(), name: "", category: "Equipment / Machinery", amount: "", note: "", cashMethod: "Cash" }); }}>+ Add New Asset</Btn>
                ) : (
                  <div className="erp-acc-form-stack">
                    <Input label="Asset Name *" value={newAsset.name} onChange={function (e) { setNewAsset(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} />
                    <Input label="Date *" type="date" value={newAsset.date} onChange={function (e) { setNewAsset(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }} />
                    <Sel label="Category" value={newAsset.category} onChange={function (e) { setNewAsset(function (x) { return Object.assign({}, x, { category: e.target.value }); }); }}>{ACATS.map(function (c) { return <option key={c}>{c}</option>; })}</Sel>
                    <Input label="Amount Paid (Rs) *" type="number" value={newAsset.amount} onChange={function (e) { setNewAsset(function (x) { return Object.assign({}, x, { amount: e.target.value }); }); }} />
                    <AccChoiceRow
                      label="Paid Via"
                      value={newAsset.cashMethod || "Cash"}
                      onChange={function (v) { setNewAsset(function (x) { return Object.assign({}, x, { cashMethod: v }); }); }}
                      options={[["Cash", "💵 Cash", "green"], ["Bank", "🏦 Bank", "blue"]]}
                    />
                    <Input label="Note" value={newAsset.note} onChange={function (e) { setNewAsset(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} />
                    <div className="erp-acc-form-actions">
                      <Btn col="green" onClick={saveAsset}>Save Asset</Btn>
                      <Btn col="gray" onClick={function () { setNewAsset(null); }}>Cancel</Btn>
                    </div>
                  </div>
                )}
              </Card>
              <Card className="erp-acc-data-card">
                <CardTitle sub={assets.length + " assets"}>Assets Register</CardTitle>
                {assets.length === 0 && <div style={{ textAlign: "center", padding: "24px 0", color: C.muted }}>No assets recorded yet.</div>}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><TH>Date</TH><TH>Asset Name</TH><TH>Category</TH><TH>Amount</TH><TH>Paid Via</TH><TH>Note</TH><TH>Actions</TH></tr></thead>
                    <tbody>
                      {assets.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(function (a, i) {
                        return (
                          <TR key={a.id} i={i}>
                            <TD>{fmtDateFull(a.date)}</TD>
                            <TD bold>{a.name}</TD>
                            <td style={{ padding: "10px 12px" }}><span style={{ background: C.accentSoft, color: C.accent, padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{a.category}</span></td>
                            <TD bold color={C.purple}>{getCurrencySymbol()} {fmtNum(a.amount)}</TD>
                            <TD color={C.muted}>{a.cashMethod || "Cash"}</TD>
                            <TD>{a.note || "—"}</TD>
                            <td style={actBtnCellStyle}>
                              <ActBtnGroup>
                                <ActBtn tone="blue" title="Edit asset" onClick={function () { setEditAsset(Object.assign({}, a)); setAssetActionModal("edit"); setAssetPw(""); setAssetReason(""); setAssetPwMsg(""); }} />
                                <ActBtn tone="red" title="Delete asset" onClick={function () { setEditAsset(Object.assign({}, a)); setAssetActionModal("delete"); setAssetPw(""); setAssetReason(""); setAssetPwMsg(""); }} />
                              </ActBtnGroup>
                            </td>
                          </TR>
                        );
                      })}
                      {assets.length > 0 && <tr style={{ background: "#f0f4ff" }}><td colSpan={3} style={{ padding: "10px 14px", fontWeight: 800 }}>TOTAL</td><td style={{ padding: "10px 14px", fontWeight: 900, color: C.purple, fontSize: 15 }}>{getCurrencySymbol()} {fmtNum(totalAssetVal)}</td><td colSpan={3}></td></tr>}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
            {assetActionModal && editAsset && (
              <Modal title={assetActionModal === "delete" ? "Delete Asset" : "Edit Asset"} onClose={function () { setAssetActionModal(null); setEditAsset(null); setAssetPw(""); setAssetReason(""); setAssetPwMsg(""); }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {assetActionModal === "edit" && (
                    <React.Fragment>
                      <Input label="Asset Name" value={editAsset.name} onChange={function (e) { setEditAsset(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} />
                      <Input label="Amount" type="number" value={editAsset.amount} onChange={function (e) { setEditAsset(function (x) { return Object.assign({}, x, { amount: parseFloat(e.target.value) || 0 }); }); }} />
                      <Sel label="Category" value={editAsset.category || ""} onChange={function (e) { setEditAsset(function (x) { return Object.assign({}, x, { category: e.target.value }); }); }}>{ACATS.map(function (c) { return <option key={c}>{c}</option>; })}</Sel>
                      <Input label="Note" value={editAsset.note || ""} onChange={function (e) { setEditAsset(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} />
                    </React.Fragment>
                  )}
                  {assetActionModal === "delete" && <div style={{ background: C.dangerSoft, borderRadius: 9, padding: "12px 16px", color: C.red, fontSize: 13 }}>Delete asset "{editAsset.name}" ({getCurrencySymbol()} {fmtNum(editAsset.amount)})?</div>}
                  <Input label="Password (required)" type="password" value={assetPw} onChange={function (e) { setAssetPw(e.target.value); }} />
                  <Input label="Reason (min 3 chars)" value={assetReason} onChange={function (e) { setAssetReason(e.target.value); }} />
                  {assetPwMsg && <div style={{ color: C.red, fontSize: 12 }}>{assetPwMsg}</div>}
                  <Btn col={assetActionModal === "delete" ? "red" : "blue"} onClick={doAssetAction}>{assetActionModal === "delete" ? "Confirm Delete" : "Save Changes"}</Btn>
                </div>
              </Modal>
            )}
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════
          OPENING BALANCE TAB
          ══════════════════════════════════════════════════════ */}
      {atab === "opening" && (function () {
        var d = obDraft || obData;
        var capital = obCalcCapital(d);
        var isSetup = !obData.completed;
        var isEditing = obEditMode || isSetup;
        var setD = function (patch) { setObDraft(function (prev) { return Object.assign({}, prev || obData, patch); }); };
        var ASSET_CATS = ["Equipment / Machinery", "Computers / Electronics", "Furniture & Fixtures", "Vehicle", "Shop Interior", "Printer / Scanner", "Networking Equipment", "Security System (CCTV)", "Electrical / UPS", "Software / Licenses", "Tools / Instruments", "Renovation / Improvements", "Other"];
        var PROD_CATS = ["Laptops", "Desktops", "Accessories", "Components", "Peripherals", "Networking", "Printers", "Storage", "Software", "General", "Other"];

        var doUnlock = function () {
          var stored = S.get("tc3_apppass", "");
          if (!obPw) { setObPwMsg("Password required."); return; }
          pwMatchesAsync(obPw, stored).then(function (ok) {
            if (!ok) { setObPwMsg("Incorrect password."); return; }
            var fresh = Object.assign({}, S.get("tc3_openBal", {}));
            fresh.receivables = S.get("tc3_manualReceivables", []).filter(function (r) { return r._isOpening; }).map(function (r) { return { _srcId: r.id, person: r.person, phone: r.phone || "", amount: r.amount, dueDate: r.dueDate || "", note: r.note || "" }; });
            fresh.payables = S.get("tc3_manualPayables", []).filter(function (p) { return p._isOpening; }).map(function (p) { return { _srcId: p.id, source: p.source, phone: p.phone || "", amount: p.amount, dueDate: p.dueDate || "", note: p.note || "" }; });
            fresh.stock = (state.products || []).filter(function (p) { return p._isOpening; }).map(function (p) {
              var row = { _srcId: p.id, name: p.name, barcode: p.barcode, category: p.category, unit: p.unit || "Pcs", bulkUnit: p.bulkUnit || "", bulkConversion: p.bulkConversion || 0, bulkCost: p.bulkCost || 0, bulkPrice: p.bulkPrice || 0, description: p.description || "", cost: p.cost, price: p.price, qty: p.stock };
              if (Array.isArray(p.units) && p.units.length > 0) row.units = p.units;
              return row;
            });
            fresh.assets = (state.assets || []).filter(function (a) { return a._isOpening; }).map(function (a) { return { _srcId: a.id, name: a.name, category: a.category, purchaseDate: a.date || today(), value: a.amount, note: a.note || "" }; });
            setObDraft(fresh);
            setObEditMode(true);
            setObPwModal(false);
            setObPw(""); setObPwMsg(""); setObStep(1);
          });
        };

        var STEPS = [["1", "Cash & Bank"], ["2", "Receivables"], ["3", "Payables"], ["4", "Stock"], ["5", "Assets"], ["6", "Review & Save"]];

        return (
          <div className="erp-tab-content erp-acc-tab-pro erp-acc-tab-pro--opening erp-acc-scroll-pane">
            <AccTabHead
              icon="🚀"
              tone="amber"
              title="Opening Balance"
              sub={obData.completed ? "Financial position on ERP start date" : "Initial setup — enter your business position before go-live"}
              extra={obData.completed && !obEditMode ? <Btn col="white" onClick={function () { setObPwModal(true); }}>Edit</Btn> : null}
            />
            {obPwModal && (
              <Modal title="Admin Password Required" onClose={function () { setObPwModal(false); setObPw(""); setObPwMsg(""); }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ background: "#fff8e8", borderRadius: 9, padding: "10px 14px", fontSize: 12.5, color: "#92400e", fontWeight: 600 }}>Opening Balance can only be edited by an admin. Changes will replace all existing opening entries.</div>
                  <Input label="Admin Password" type="password" value={obPw} onChange={function (e) { setObPw(e.target.value); }} onKeyDown={function (e) { if (e.key === "Enter") doUnlock(); if (e.key === "Escape") { setObPwModal(false); setObPw(""); setObPwMsg(""); } }} />
                  {obPwMsg && <div style={{ color: C.red, fontSize: 12, fontWeight: 600 }}>{obPwMsg}</div>}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Btn col="gray" onClick={function () { setObPwModal(false); setObPw(""); setObPwMsg(""); }}>Cancel</Btn>
                    <Btn col="blue" onClick={doUnlock}>Unlock and Edit</Btn>
                  </div>
                </div>
              </Modal>
            )}

            {obRecvModal && (
              <Modal title="Add Opening Receivable" onClose={function () { setObRecvModal(false); setObRecvForm({ person: "", phone: "", amount: "", dueDate: "", note: "" }); }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ background: "#e8f0fe", borderRadius: 9, padding: "10px 14px", fontSize: 12.5, color: "#1565c0", fontWeight: 600 }}>Money owed TO your business before ERP setup. Will appear in Receivables section.</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Input label="Person / Customer Name *" value={obRecvForm.person} onChange={function (e) { setObRecvForm(function (x) { return Object.assign({}, x, { person: e.target.value }); }); }} placeholder="e.g. John Silva" />
                    <Input label="Phone / Contact" value={obRecvForm.phone} onChange={function (e) { setObRecvForm(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); }} placeholder="e.g. 071 234 5678" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Input label="Amount (Rs) *" type="number" value={obRecvForm.amount} onChange={function (e) { setObRecvForm(function (x) { return Object.assign({}, x, { amount: e.target.value }); }); }} placeholder="0.00" />
                    <Input label="Due Date (optional)" type="date" value={obRecvForm.dueDate} onChange={function (e) { setObRecvForm(function (x) { return Object.assign({}, x, { dueDate: e.target.value }); }); }} />
                  </div>
                  <Input label="Reason / Note" value={obRecvForm.note} onChange={function (e) { setObRecvForm(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} placeholder="e.g. Laptop credit balance" />
                  <Btn col="blue" onClick={function () {
                    if (!obRecvForm.person.trim() || !obRecvForm.amount || parseFloat(obRecvForm.amount) <= 0) { showAlert("Please enter person name and a valid amount."); return; }
                    setD({ receivables: (d.receivables || []).concat([{ person: obRecvForm.person.trim(), phone: (obRecvForm.phone || "").trim(), amount: parseFloat(obRecvForm.amount), dueDate: obRecvForm.dueDate || "", note: (obRecvForm.note || "").trim() }]) });
                    setObRecvModal(false); setObRecvForm({ person: "", phone: "", amount: "", dueDate: "", note: "" });
                  }}>+ Add Receivable</Btn>
                </div>
              </Modal>
            )}

            {obPayModal && (
              <Modal title="Add Opening Payable" onClose={function () { setObPayModal(false); setObPayForm({ source: "", phone: "", amount: "", dueDate: "", note: "" }); }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ background: "#fde8ed", borderRadius: 9, padding: "10px 14px", fontSize: 12.5, color: "#b71c1c", fontWeight: 600 }}>Money your business OWES to others before ERP setup. Will appear in Payables section.</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Input label="Person / Supplier Name *" value={obPayForm.source} onChange={function (e) { setObPayForm(function (x) { return Object.assign({}, x, { source: e.target.value }); }); }} placeholder="e.g. Dell Supplier" />
                    <Input label="Phone / Contact" value={obPayForm.phone} onChange={function (e) { setObPayForm(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); }} placeholder="e.g. 011 234 5678" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Input label="Amount (Rs) *" type="number" value={obPayForm.amount} onChange={function (e) { setObPayForm(function (x) { return Object.assign({}, x, { amount: e.target.value }); }); }} placeholder="0.00" />
                    <Input label="Due Date (optional)" type="date" value={obPayForm.dueDate} onChange={function (e) { setObPayForm(function (x) { return Object.assign({}, x, { dueDate: e.target.value }); }); }} />
                  </div>
                  <Input label="Reason / Note" value={obPayForm.note} onChange={function (e) { setObPayForm(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} placeholder="e.g. Stock advance, borrowed cash..." />
                  <Btn col="red" onClick={function () {
                    if (!obPayForm.source.trim() || !obPayForm.amount || parseFloat(obPayForm.amount) <= 0) { showAlert("Please enter supplier name and a valid amount."); return; }
                    setD({ payables: (d.payables || []).concat([{ source: obPayForm.source.trim(), phone: (obPayForm.phone || "").trim(), amount: parseFloat(obPayForm.amount), dueDate: obPayForm.dueDate || "", note: (obPayForm.note || "").trim() }]) });
                    setObPayModal(false); setObPayForm({ source: "", phone: "", amount: "", dueDate: "", note: "" });
                  }}>+ Add Payable</Btn>
                </div>
              </Modal>
            )}

            {obStockModal && (
              <AddNewProductModal
                mode="opening"
                remountKey={obNewProdKey}
                initial={obStockForm}
                productIdLabel={nextProductId((state.products || []).filter(function (p) { return !p._isOpening; }))}
                shopSettings={shopSettings}
                products={state.products}
                Modal={Modal}
                Input={Input}
                Sel={Sel}
                Btn={Btn}
                C={C}
                genBarcode={genBarcode}
                getBusinessProfile={getBusinessProfile}
                getCurrencySymbol={getCurrencySymbol}
                fmtNum={fmtNum}
                showAlert={showAlert}
                showConfirm={showConfirm}
                checkProductName={checkProductName}
                tipBanner="Qty will be set from the opening stock grid row"
                onClose={function () { setObStockModal(false); setObStockForm(blankObStockForm()); }}
                onSubmit={function (form) { saveObNewProduct(form); }}
              />
            )}

            {obStockExistModal && (function () {
              var alreadyAdded = (d.stock || []).map(function (s) { return s._srcProdId || s.name; });
              var available = (state.products || []).filter(function (p) {
                if (p._isOpening) return false;
                var q = obStockExistSearch.toLowerCase();
                if (!q) return true;
                return productMatchesSearch(p, q);
              });
              return (
                <Modal title="Add Existing Product to Opening Stock" onClose={function () { setObStockExistModal(false); setObStockExistSearch(""); }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ background: "#e8f0fe", borderRadius: 9, padding: "10px 14px", fontSize: 12.5, color: "#1565c0", fontWeight: 600 }}>Select a product already in your Inventory and set its opening stock quantity.</div>
                    <Input label="Search by name, ID or barcode" value={obStockExistSearch} onChange={function (e) { setObStockExistSearch(e.target.value); }} placeholder="Type to filter..." />
                    {available.length === 0 && (
                      <div style={{ textAlign: "center", padding: "16px 0", color: C.muted, fontSize: 13 }}>No matching products found.</div>
                    )}
                    <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                      {available.map(function (p) {
                        var already = (d.stock || []).find(function (s) { return s._srcProdId === p.id; });
                        return (
                          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: already ? "#f0faf4" : "#fafafa", borderRadius: 10, padding: "10px 14px", border: "1.5px solid " + (already ? "#9ee8ce" : C.border) }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name} <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>ID: {p.productId}</span></div>
                              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{p.category} &nbsp;|&nbsp; Cost: {getCurrencySymbol()} {fmtNum(p.cost)} &nbsp;|&nbsp; Price: {getCurrencySymbol()} {fmtNum(p.price)} &nbsp;|&nbsp; <span style={{ fontFamily: "monospace" }}>{p.barcode}</span></div>
                            </div>
                            {already ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>Added (qty {already.qty})</span>
                                <button type="button" className="erp-acc-ob-remove" onClick={function () { setD({ stock: (d.stock || []).filter(function (s) { return s._srcProdId !== p.id; }) }); }}>Remove</button>
                              </div>
                            ) : (
                              <button type="button" className="erp-acc-ob-select" onClick={function () {
                                var qty = window.prompt("Opening quantity for \"" + p.name + "\":");
                                if (qty === null) return;
                                var q = parseInt(qty);
                                if (!q || q <= 0) { showAlert("Please enter a valid quantity."); return; }
                                var obRow = { name: p.name, barcode: p.barcode, category: p.category, unit: p.unit || "Pcs", bulkUnit: p.bulkUnit || "", bulkConversion: p.bulkConversion || 0, bulkCost: p.bulkCost || 0, bulkPrice: p.bulkPrice || 0, description: p.description || "", cost: p.cost, price: p.price, qty: q, _srcProdId: p.id, _existingProduct: true };
                                if (Array.isArray(p.units) && p.units.length > 0) obRow.units = p.units;
                                setD({ stock: (d.stock || []).concat([obRow]) });
                              }}>+ Select</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <Btn col="blue" onClick={function () { setObStockExistModal(false); setObStockExistSearch(""); }}>Done</Btn>
                  </div>
                </Modal>
              );
            })()}

            {obAssetModal && (
              <Modal title="Add Opening Asset" onClose={function () { setObAssetModal(false); setObAssetForm({ name: "", category: "Equipment / Machinery", purchaseDate: today(), value: "", note: "" }); }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ background: "#f3e5f5", borderRadius: 9, padding: "10px 14px", fontSize: 12.5, color: "#6a1b9a", fontWeight: 600 }}>Business assets owned before ERP setup. Will appear in Assets register.</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Input label="Asset Name *" value={obAssetForm.name} onChange={function (e) { setObAssetForm(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} placeholder="e.g. Dell Laptop, Office Chair" />
                    <Sel label="Category" value={obAssetForm.category} onChange={function (e) { setObAssetForm(function (x) { return Object.assign({}, x, { category: e.target.value }); }); }}>
                      {ASSET_getCats().map(function (c) { return <option key={c}>{c}</option>; })}
                    </Sel>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Input label="Value / Purchase Price (Rs) *" type="number" value={obAssetForm.value} onChange={function (e) { setObAssetForm(function (x) { return Object.assign({}, x, { value: e.target.value }); }); }} placeholder="0.00" />
                    <Input label="Purchase Date" type="date" value={obAssetForm.purchaseDate} onChange={function (e) { setObAssetForm(function (x) { return Object.assign({}, x, { purchaseDate: e.target.value }); }); }} />
                  </div>
                  <Input label="Note / Description" value={obAssetForm.note} onChange={function (e) { setObAssetForm(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} placeholder="e.g. Used for billing, shop display unit..." />
                  <Btn col="purple" onClick={function () {
                    if (!obAssetForm.name.trim()) { showAlert("Please enter an asset name."); return; }
                    if (!obAssetForm.value || parseFloat(obAssetForm.value) <= 0) { showAlert("Please enter a valid asset value."); return; }
                    setD({ assets: (d.assets || []).concat([{ name: obAssetForm.name.trim(), category: obAssetForm.category, purchaseDate: obAssetForm.purchaseDate, value: parseFloat(obAssetForm.value), note: (obAssetForm.note || "").trim() }]) });
                    setObAssetModal(false); setObAssetForm({ name: "", category: "Equipment / Machinery", purchaseDate: today(), value: "", note: "" });
                  }}>+ Add Asset</Btn>
                </div>
              </Modal>
            )}

            {obData.completed && !obEditMode ? (
              <div className="erp-acc-ob-banner is-done">
                <div>
                  <div className="erp-acc-cap-kpi-label">Opening Balance</div>
                  <div className="erp-acc-ob-banner-title">Setup Complete</div>
                  <div className="erp-acc-cap-kpi-sub">Date: {obData.date} · Capital: {getCurrencySymbol()} {fmtNum(obData.capital)}</div>
                </div>
              </div>
            ) : (
              <div className="erp-acc-ob-banner is-setup">
                <div className="erp-acc-cap-kpi-label">Opening Balance Setup</div>
                <div className="erp-acc-ob-banner-title">{obData.completed ? "Editing Opening Balance" : "Initial Setup"}</div>
                <div className="erp-acc-cap-kpi-sub">Enter your business financial position on the day you started using this ERP.</div>
              </div>
            )}

            {obData.completed && !obEditMode && (function () {
              var ob = obData;
              var totalRecvOB  = (ob.receivables || []).reduce(function (a, r) { return a + r.amount; }, 0);
              var totalPayOB   = (ob.payables    || []).reduce(function (a, p) { return a + p.amount; }, 0);
              var totalStockOB = (ob.stock       || []).reduce(function (a, s) { return a + s.cost * s.qty; }, 0);
              var totalAstOB   = (ob.assets      || []).reduce(function (a, x) { return a + x.value; }, 0);
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="erp-acc-kpi-strip">
                    {[
                      { label: "Cash in Hand",   val: ob.cash || 0,   color: C.green   },
                      { label: "Bank Balance",    val: ob.bank || 0,   color: C.blue    },
                      { label: "Receivables",     val: totalRecvOB,    color: C.cyan    },
                      { label: "Payables",        val: totalPayOB,     color: C.red     },
                      { label: "Stock Value",     val: totalStockOB,   color: C.orange  },
                      { label: "Assets Value",    val: totalAstOB,     color: "#6a1b9a" },
                      { label: "Opening Capital", val: ob.capital||0,  color: C.accent  },
                    ].map(function (item) {
                      return (
                        <div key={item.label} className="erp-acc-kpi" style={{ borderLeftColor: item.color }}>
                          <div className="erp-acc-kpi-label">{item.label}</div>
                          <div className="erp-acc-kpi-val" style={{ color: item.color }}>{getCurrencySymbol()} {fmtNum(item.val)}</div>
                        </div>
                      );
                    })}
                  </div>
                  {(ob.receivables || []).length > 0 && (
                    <Card pad={0} className="erp-acc-data-card">
                      <div className="erp-acc-section-title">Opening Receivables ({(ob.receivables || []).length})</div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead><tr><TH>Person</TH><TH>Phone</TH><TH>Amount</TH><TH>Due Date</TH><TH>Note</TH></tr></thead>
                          <tbody>{(ob.receivables || []).map(function (r, i) { return <TR key={i} i={i}><TD bold>{r.person}</TD><TD>{r.phone || "-"}</TD><TD color={C.green}>{getCurrencySymbol()} {fmtNum(r.amount)}</TD><TD>{r.dueDate || "-"}</TD><TD>{r.note || "-"}</TD></TR>; })}</tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                  {(ob.payables || []).length > 0 && (
                    <Card pad={0} className="erp-acc-data-card">
                      <div className="erp-acc-section-title">Opening Payables ({(ob.payables || []).length})</div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead><tr><TH>Supplier / Person</TH><TH>Phone</TH><TH>Amount</TH><TH>Due Date</TH><TH>Note</TH></tr></thead>
                          <tbody>{(ob.payables || []).map(function (p, i) { return <TR key={i} i={i}><TD bold>{p.source}</TD><TD>{p.phone || "-"}</TD><TD color={C.red}>{getCurrencySymbol()} {fmtNum(p.amount)}</TD><TD>{p.dueDate || "-"}</TD><TD>{p.note || "-"}</TD></TR>; })}</tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                  {(ob.stock || []).length > 0 && (
                    <Card pad={0} className="erp-acc-data-card">
                      <div className="erp-acc-section-title">Opening Stock ({(ob.stock || []).length} products)</div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                          <thead><tr><TH>#</TH><TH>Product Name</TH><TH>Product ID</TH><TH>Barcode</TH><TH>Category</TH><TH>Qty</TH><TH>Cost</TH><TH>Price</TH><TH>Value</TH></tr></thead>
                          <tbody>{(ob.stock || []).map(function (s, i) {
                            var pid = (state.products || []).find(function (p) { return p._isOpening && p.name === s.name && p.barcode === s.barcode; });
                            return (
                              <TR key={i} i={i}>
                                <TD>{i + 1}</TD>
                                <TD bold>{s.name}{s.description ? <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 400 }}>{s.description}</div> : null}</TD>
                                <TD>{pid ? pid.productId : "-"}</TD>
                                <TD style={{ fontFamily: "monospace", fontSize: 11 }}>{s.barcode || "-"}</TD>
                                <TD>{s.category}</TD>
                                <TD>{s.qty}</TD>
                                <TD>{getCurrencySymbol()} {fmtNum(s.cost)}</TD>
                                <TD>{getCurrencySymbol()} {fmtNum(s.price)}</TD>
                                <TD color={C.orange}>{getCurrencySymbol()} {fmtNum(s.cost * s.qty)}</TD>
                              </TR>
                            );
                          })}</tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                  {(ob.assets || []).length > 0 && (
                    <Card pad={0} className="erp-acc-data-card">
                      <div className="erp-acc-section-title">Opening Assets ({(ob.assets || []).length})</div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead><tr><TH>Asset Name</TH><TH>Category</TH><TH>Purchase Date</TH><TH>Value</TH><TH>Note</TH></tr></thead>
                          <tbody>{(ob.assets || []).map(function (a, i) { return <TR key={i} i={i}><TD bold>{a.name}</TD><TD>{a.category}</TD><TD>{a.purchaseDate || "-"}</TD><TD color={"#6a1b9a"}>{getCurrencySymbol()} {fmtNum(a.value)}</TD><TD>{a.note || "-"}</TD></TR>; })}</tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                </div>
              );
            })()}

            {isEditing && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="erp-acc-steps">
                  {STEPS.map(function (st, idx) {
                    var n = idx + 1;
                    var isActive = obStep === n;
                    var isDone   = obStep > n;
                    return (
                      <button key={n} type="button" className={"erp-acc-step" + (isActive ? " is-active" : isDone ? " is-done" : "")} onClick={function () { setObStep(n); }}>
                        <div className="erp-acc-step-num">{n}</div>
                        <div>{st[1]}</div>
                      </button>
                    );
                  })}
                </div>

                {obStep === 1 && (
                  <Card>
                    <CardTitle sub="Enter the exact cash and bank balances on the day you started using this ERP">Step 1 - Cash in Hand and Bank Balance</CardTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <Input label="Setup Date (as-of date)" type="date" value={d.date || today()} onChange={function (e) { setD({ date: e.target.value }); }} />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <div style={{ background: "#f0faf4", borderRadius: 12, padding: "16px", border: "1.5px solid #c8efd8" }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#1b5e20", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Cash in Hand (Rs)</div>
                          <input
                            type="number"
                            value={d.cash === 0 ? "0" : (d.cash || "")}
                            onChange={function (e) { setD({ cash: parseFloat(e.target.value) || 0 }); }}
                            placeholder="0.00"
                            style={{ width: "100%", border: "2px solid #c8efd8", borderRadius: 9, padding: "12px 14px", fontSize: 22, fontWeight: 800, outline: "none", color: C.green, background: "#fff", boxSizing: "border-box" }}
                          />
                          <div style={{ fontSize: 11, color: "#1b5e20", marginTop: 6, fontWeight: 600 }}>Physical notes and coins available in the shop.</div>
                        </div>
                        <div style={{ background: "#e8f0fe", borderRadius: 12, padding: "16px", border: "1.5px solid #90b4f5" }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#1565c0", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Bank Balance (Rs)</div>
                          <input
                            type="number"
                            value={d.bank === 0 ? "0" : (d.bank || "")}
                            onChange={function (e) { setD({ bank: parseFloat(e.target.value) || 0 }); }}
                            placeholder="0.00"
                            style={{ width: "100%", border: "2px solid #90b4f5", borderRadius: 9, padding: "12px 14px", fontSize: 22, fontWeight: 800, outline: "none", color: C.blue, background: "#fff", boxSizing: "border-box" }}
                          />
                          <div style={{ fontSize: 11, color: "#1565c0", marginTop: 6, fontWeight: 600 }}>Balance in your business bank account.</div>
                        </div>
                      </div>
                      <div style={{ background: "#f7f9ff", borderRadius: 10, padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1.5px solid " + C.border }}>
                        <span style={{ fontWeight: 700, color: C.textMd, fontSize: 13 }}>Total Cash + Bank</span>
                        <span style={{ fontWeight: 900, fontSize: 20, color: C.accent }}>{getCurrencySymbol()} {fmtNum((d.cash || 0) + (d.bank || 0))}</span>
                      </div>
                      <div style={{ background: "#fff8e8", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: "#92400e", fontWeight: 600 }}>
                        Enter only physical cash on hand and the bank account balance. Do NOT include receivables, stock value or asset values here - those go in later steps.
                      </div>
                      <Btn col="blue" onClick={function () { setObStep(2); }}>Next - Receivables</Btn>
                    </div>
                  </Card>
                )}

                {obStep === 2 && (
                  <Card>
                    <CardTitle sub="People or companies that owe money TO your business before ERP setup">Step 2 - Opening Receivables</CardTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {(d.receivables || []).length === 0 && (
                        <div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontSize: 13 }}>No receivables added yet. Skip this step if none.</div>
                      )}
                      {(d.receivables || []).map(function (r, i) {
                        return (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f0faf4", borderRadius: 10, padding: "10px 14px", border: "1px solid #c8efd8" }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>{r.person}{r.phone ? "  -  " + r.phone : ""}</div>
                              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{r.note || ""}{r.dueDate ? "  |  Due: " + r.dueDate : ""}</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontWeight: 800, color: C.green, fontSize: 14 }}>{getCurrencySymbol()} {fmtNum(r.amount)}</span>
                              <button type="button" className="erp-acc-ob-remove" onClick={function () { setD({ receivables: (d.receivables || []).filter(function (_, j) { return j !== i; }) }); }}>x</button>
                            </div>
                          </div>
                        );
                      })}
                      <Btn col="cyan" onClick={function () { setObRecvModal(true); }}>+ Add Receivable</Btn>
                      {(d.receivables || []).length > 0 && (
                        <div style={{ background: "#f0faf4", borderRadius: 9, padding: "10px 14px", display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontWeight: 700 }}>Total Opening Receivable</span>
                          <span style={{ fontWeight: 900, color: C.green }}>{getCurrencySymbol()} {fmtNum((d.receivables || []).reduce(function (a, r) { return a + r.amount; }, 0))}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <Btn col="gray" onClick={function () { setObStep(1); }}>Back</Btn>
                        <Btn col="blue" onClick={function () { setObStep(3); }}>Next - Payables</Btn>
                      </div>
                    </div>
                  </Card>
                )}

                {obStep === 3 && (
                  <Card>
                    <CardTitle sub="Money your business owes to others before ERP setup">Step 3 - Opening Payables</CardTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {(d.payables || []).length === 0 && (
                        <div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontSize: 13 }}>No payables added yet. Skip this step if none.</div>
                      )}
                      {(d.payables || []).map(function (p, i) {
                        return (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fde8ed", borderRadius: 10, padding: "10px 14px", border: "1px solid #f9a8ba" }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>{p.source}{p.phone ? "  -  " + p.phone : ""}</div>
                              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{p.note || ""}{p.dueDate ? "  |  Due: " + p.dueDate : ""}</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontWeight: 800, color: C.red, fontSize: 14 }}>{getCurrencySymbol()} {fmtNum(p.amount)}</span>
                              <button type="button" className="erp-acc-ob-remove is-outline" onClick={function () { setD({ payables: (d.payables || []).filter(function (_, j) { return j !== i; }) }); }}>x</button>
                            </div>
                          </div>
                        );
                      })}
                      <Btn col="red" onClick={function () { setObPayModal(true); }}>+ Add Payable</Btn>
                      {(d.payables || []).length > 0 && (
                        <div style={{ background: "#fde8ed", borderRadius: 9, padding: "10px 14px", display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontWeight: 700 }}>Total Opening Payable</span>
                          <span style={{ fontWeight: 900, color: C.red }}>{getCurrencySymbol()} {fmtNum((d.payables || []).reduce(function (a, p) { return a + p.amount; }, 0))}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <Btn col="gray" onClick={function () { setObStep(2); }}>Back</Btn>
                        <Btn col="blue" onClick={function () { setObStep(4); }}>Next - Stock</Btn>
                      </div>
                    </div>
                  </Card>
                )}

                {obStep === 4 && (
                  <Card>
                    <CardTitle sub="Products already in inventory before ERP setup">Step 4 - Opening Stock</CardTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {(d.stock || []).length === 0 && (
                        <div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontSize: 13 }}>No stock items added yet. Skip this step if none.</div>
                      )}
                      {(d.stock || []).length > 0 && (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                            <thead><tr><TH>#</TH><TH>Product Name</TH><TH>Type</TH><TH>Barcode</TH><TH>Category</TH><TH>Qty</TH><TH>Cost</TH><TH>Price</TH><TH>Value</TH><TH></TH></tr></thead>
                            <tbody>
                              {(d.stock || []).map(function (s, i) {
                                return (
                                  <TR key={i} i={i}>
                                    <TD>{i + 1}</TD>
                                    <TD bold>
                                      {s.name}
                                      {s.description ? <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 400 }}>{s.description}</div> : null}
                                    </TD>
                                    <TD>
                                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: s._existingProduct ? "#e8f0fe" : "#e8f5e9", color: s._existingProduct ? C.blue : C.green }}>
                                        {s._existingProduct ? "Existing" : "New"}
                                      </span>
                                    </TD>
                                    <TD style={{ fontFamily: "monospace", fontSize: 11 }}>{s.barcode}</TD>
                                    <TD>{s.category}</TD>
                                    <TD>{s.qty}</TD>
                                    <TD>{getCurrencySymbol()} {fmtNum(s.cost)}</TD>
                                    <TD>{getCurrencySymbol()} {fmtNum(s.price)}</TD>
                                    <TD color={C.orange}>{getCurrencySymbol()} {fmtNum(s.cost * s.qty)}</TD>
                                    <td style={{ padding: "8px 10px" }}>
                                      <button type="button" className="erp-acc-ob-remove" onClick={function () { setD({ stock: (d.stock || []).filter(function (_, j) { return j !== i; }) }); }}>x</button>
                                    </td>
                                  </TR>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {(d.stock || []).length > 0 && (
                        <div style={{ background: "#fff8e8", borderRadius: 9, padding: "10px 14px", display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontWeight: 700 }}>Total Opening Stock Value (at cost)</span>
                          <span style={{ fontWeight: 900, color: C.orange }}>{getCurrencySymbol()} {fmtNum((d.stock || []).reduce(function (a, s) { return a + s.cost * s.qty; }, 0))}</span>
                        </div>
                      )}
                      {/* Excel-style inline product entry */}
                      <div style={{ border: "1.5px solid " + C.border, borderRadius: 10, overflow: "visible" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 100px 100px 36px", background: "#f1f5f9", padding: "7px 10px", gap: 6, borderRadius: "8px 8px 0 0" }}>
                          {["PRODUCT", "QTY", "COST", "SELL", ""].map(function (h, i) {
                            return <div key={i} style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</div>;
                          })}
                        </div>
                        {/* Input row */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 100px 100px 36px", padding: "7px 10px", gap: 6, alignItems: "center", background: "#f0f9ff" }}>
                          <div style={{ position: "relative" }} ref={obStockSearchRef}>
                            <input id="ob-stock-search" value={obStockSearch}
                              onChange={function (e) { setObStockSearch(e.target.value); setShowObStockDrop(true); setObStockSearchIdx(-1); }}
                              onFocus={function () { setShowObStockDrop(true); }}
                              onKeyDown={function (e) {
                                if (e.key === "ArrowDown") { e.preventDefault(); setObStockSearchIdx(function (i) { return Math.min(i + 1, filtObProds.length - 1); }); return; }
                                if (e.key === "ArrowUp") { e.preventDefault(); setObStockSearchIdx(function (i) { return Math.max(i - 1, -1); }); return; }
                                if ((e.key === "Enter" || e.key === "Tab") && filtObProds.length > 0) {
                                  var pick = obStockSearchIdx >= 0 ? filtObProds[obStockSearchIdx] : filtObProds[0];
                                  if (pick) {
                                    e.preventDefault();
                                    setObStockSearch(pick.name);
                                    setObStockCost(String(pick.cost));
                                    setObStockSell(String(pick.price));
                                    setShowObStockDrop(false); setObStockSearchIdx(-1);
                                    setTimeout(function () { var qi = document.getElementById("ob-stock-qty"); if (qi) qi.focus(); }, 50);
                                  }
                                  return;
                                }
                                if (e.key === "Escape") { setShowObStockDrop(false); setObStockSearchIdx(-1); }
                              }}
                              placeholder="Search product..."
                              style={{ width: "100%", border: "1.5px solid #93c5fd", borderRadius: 6, padding: "5px 8px", fontSize: 12, outline: "none", fontFamily: "inherit", background: "#fff" }} />
                            {showObStockDrop && filtObProds.length > 0 && (
                              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1.5px solid " + C.border, borderRadius: 8, zIndex: 9999, maxHeight: 220, overflowY: "auto", boxShadow: "0 8px 24px rgba(13,27,62,0.15)" }}>
                                {filtObProds.map(function (p, pidx) {
                                  return (
                                    <div key={p.id}
                                      onClick={function () {
                                        setObStockSearch(p.name); setObStockCost(String(p.cost)); setObStockSell(String(p.price));
                                        setShowObStockDrop(false); setObStockSearchIdx(-1);
                                        setTimeout(function () { var qi = document.getElementById("ob-stock-qty"); if (qi) qi.focus(); }, 50);
                                      }}
                                      onMouseEnter={function () { setObStockSearchIdx(pidx); }}
                                      style={{ padding: "9px 12px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", background: obStockSearchIdx === pidx ? C.accentSoft : "#fff" }}>
                                      <div>
                                        <div style={{ fontWeight: 700, color: C.text }}>{p.name}</div>
                                        <div style={{ fontSize: 11, color: C.muted }}>ID: {p.productId} · {fmtStock(p.stock, p.unit)}</div>
                                      </div>
                                      <div style={{ fontSize: 11, color: C.blue, fontWeight: 700 }}>{getCurrencySymbol()} {fmtNum(p.price)}</div>
                                    </div>
                                  );
                                })}
                                {obStockSearch.trim() && (
                                  <div onClick={function () {
                                    setObNewProdKey(function (k) { return k + 1; });
                                    setObStockModal(true);
                                    setObStockForm(blankObStockForm({ name: obStockSearch, cost: obStockCost, price: obStockSell, qty: obStockQty }));
                                    setShowObStockDrop(false);
                                  }} style={{ padding: "9px 12px", cursor: "pointer", fontSize: 12, color: C.green, fontWeight: 700, borderTop: "1.5px dashed " + C.border, display: "flex", alignItems: "center", gap: 6 }}>
                                    + Create "{obStockSearch}" as new product
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <input id="ob-stock-qty" type="number" min="1" value={obStockQty}
                            onChange={function (e) { setObStockQty(e.target.value); }}
                            onKeyDown={function (e) { if (e.key === "Tab") { e.preventDefault(); var ci = document.getElementById("ob-stock-cost"); if (ci) ci.focus(); } }}
                            style={{ width: "100%", border: "1.5px solid #93c5fd", borderRadius: 6, padding: "5px 6px", fontSize: 12, textAlign: "center", outline: "none", fontFamily: "inherit", background: "#fff" }} />
                          <input id="ob-stock-cost" type="number" value={obStockCost}
                            onChange={function (e) { setObStockCost(e.target.value); }}
                            onKeyDown={function (e) { if (e.key === "Tab") { e.preventDefault(); var si = document.getElementById("ob-stock-sell"); if (si) si.focus(); } }}
                            placeholder="Cost"
                            style={{ width: "100%", border: "1.5px solid #93c5fd", borderRadius: 6, padding: "5px 6px", fontSize: 12, textAlign: "right", outline: "none", fontFamily: "inherit", background: "#fff" }} />
                          <input id="ob-stock-sell" type="number" value={obStockSell}
                            onChange={function (e) { setObStockSell(e.target.value); }}
                            onKeyDown={function (e) {
                              if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
                                e.preventDefault();
                                if (!obStockSearch.trim()) return;
                                var qty = parseInt(obStockQty, 10) || 1;
                                var cost = parseFloat(obStockCost) || 0;
                                var sell = parseFloat(obStockSell) || 0;
                                /* Find existing product */
                                var existProd = filtObProds[0] || (state.products || []).find(function (p) {
                                  return productMatchesSearchExact(p, obStockSearch);
                                });
                                if (existProd) {
                                  var obRow2 = { name: existProd.name, barcode: existProd.barcode, category: existProd.category, unit: existProd.unit || "Pcs", bulkUnit: existProd.bulkUnit || "", bulkConversion: existProd.bulkConversion || 0, bulkCost: existProd.bulkCost || 0, bulkPrice: existProd.bulkPrice || 0, description: existProd.description || "", cost: cost || existProd.cost, price: sell || existProd.price, qty: qty, _srcProdId: existProd.id, _existingProduct: true };
                                  if (Array.isArray(existProd.units) && existProd.units.length > 0) obRow2.units = existProd.units;
                                  setD({ stock: (d.stock || []).concat([obRow2]) });
                                } else {
                                  setD({ stock: (d.stock || []).concat([{ name: obStockSearch.trim(), barcode: genBarcode(), category: "General", description: "", cost: cost, price: sell, qty: qty, require_comment: false, comment_label: DEFAULT_PRODUCT_COMMENT_LABEL }]) });
                                }
                                setObStockSearch(""); setObStockQty("1"); setObStockCost(""); setObStockSell("");
                                setTimeout(function () { var si = document.getElementById("ob-stock-search"); if (si) si.focus(); }, 50);
                              }
                            }}
                            placeholder="Sell"
                            style={{ width: "100%", border: "1.5px solid #93c5fd", borderRadius: 6, padding: "5px 6px", fontSize: 12, textAlign: "right", outline: "none", fontFamily: "inherit", background: "#fff" }} />
                          <button type="button" className="erp-acc-ob-plus" onClick={function () {
                            if (!obStockSearch.trim()) return;
                            var qty = parseInt(obStockQty, 10) || 1;
                            var cost = parseFloat(obStockCost) || 0;
                            var sell = parseFloat(obStockSell) || 0;
                            var existProd = filtObProds[0] || (state.products || []).find(function (p) {
                              return productMatchesSearchExact(p, obStockSearch);
                            });
                            if (existProd) {
                              var obRow3 = { name: existProd.name, barcode: existProd.barcode, category: existProd.category, unit: existProd.unit || "Pcs", bulkUnit: existProd.bulkUnit || "", bulkConversion: existProd.bulkConversion || 0, bulkCost: existProd.bulkCost || 0, bulkPrice: existProd.bulkPrice || 0, description: existProd.description || "", cost: cost || existProd.cost, price: sell || existProd.price, qty: qty, _srcProdId: existProd.id, _existingProduct: true };
                              if (Array.isArray(existProd.units) && existProd.units.length > 0) obRow3.units = existProd.units;
                              setD({ stock: (d.stock || []).concat([obRow3]) });
                            } else {
                              setD({ stock: (d.stock || []).concat([{ name: obStockSearch.trim(), barcode: genBarcode(), category: "General", description: "", cost: cost, price: sell, qty: qty, require_comment: false, comment_label: DEFAULT_PRODUCT_COMMENT_LABEL }]) });
                            }
                            setObStockSearch(""); setObStockQty("1"); setObStockCost(""); setObStockSell("");
                            setTimeout(function () { var si = document.getElementById("ob-stock-search"); if (si) si.focus(); }, 50);
                          }} disabled={!obStockSearch.trim()}>+</button>
                        </div>
                      </div>
                      <div style={{ fontSize: 11.5, color: C.muted }}>💡 Tip: Search existing product or type a new name. Tab through Qty → Cost → Sell → Enter to add.</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Btn col="gray" onClick={function () { setObStep(3); }}>Back</Btn>
                        <Btn col="blue" onClick={function () { setObStep(5); }}>Next - Assets</Btn>
                      </div>
                    </div>
                  </Card>
                )}

                {obStep === 5 && (
                  <Card>
                    <CardTitle sub="Physical assets your business owned before ERP setup">Step 5 - Opening Assets</CardTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {(d.assets || []).length === 0 && (
                        <div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontSize: 13 }}>No assets added yet. Skip this step if none.</div>
                      )}
                      {(d.assets || []).map(function (a, i) {
                        return (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f3e5f5", borderRadius: 10, padding: "10px 14px", border: "1px solid #ce93d8" }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>{a.name} - {a.category}</div>
                              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{a.purchaseDate ? "Purchased: " + a.purchaseDate : ""}{a.note ? "  |  " + a.note : ""}</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontWeight: 800, color: "#6a1b9a", fontSize: 14 }}>{getCurrencySymbol()} {fmtNum(a.value)}</span>
                              <button type="button" className="erp-acc-ob-remove is-purple" onClick={function () { setD({ assets: (d.assets || []).filter(function (_, j) { return j !== i; }) }); }}>x</button>
                            </div>
                          </div>
                        );
                      })}
                      <Btn col="purple" onClick={function () { setObAssetModal(true); }}>+ Add Asset</Btn>
                      {(d.assets || []).length > 0 && (
                        <div style={{ background: "#f3e5f5", borderRadius: 9, padding: "10px 14px", display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontWeight: 700 }}>Total Opening Assets Value</span>
                          <span style={{ fontWeight: 900, color: "#6a1b9a" }}>{getCurrencySymbol()} {fmtNum((d.assets || []).reduce(function (a, x) { return a + x.value; }, 0))}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <Btn col="gray" onClick={function () { setObStep(4); }}>Back</Btn>
                        <Btn col="blue" onClick={function () { setObStep(6); }}>Next - Review and Save</Btn>
                      </div>
                    </div>
                  </Card>
                )}

                {obStep === 6 && (function () {
                  var totalRecv  = (d.receivables || []).reduce(function (a, r) { return a + r.amount; }, 0);
                  var totalPay   = (d.payables    || []).reduce(function (a, p) { return a + p.amount; }, 0);
                  var totalStock = (d.stock       || []).reduce(function (a, s) { return a + s.cost * s.qty; }, 0);
                  var totalAst   = (d.assets      || []).reduce(function (a, x) { return a + x.value; }, 0);
                  var totalAssets = (d.cash || 0) + (d.bank || 0) + totalRecv + totalStock + totalAst;
                  var calcCap    = totalAssets - totalPay;
                  return (
                    <Card>
                      <CardTitle sub="Review your opening balance before saving">Step 6 - Review and Save</CardTitle>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ background: "#f7f9ff", borderRadius: 12, padding: "16px 18px", border: "1.5px solid " + C.border }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Balance Sheet Summary</div>
                          {[
                            { label: "Cash in Hand",         val: d.cash || 0,    color: C.green   },
                            { label: "Bank Balance",         val: d.bank || 0,    color: C.blue    },
                            { label: "Accounts Receivable",  val: totalRecv,      color: C.cyan    },
                            { label: "Opening Stock",        val: totalStock,     color: C.orange  },
                            { label: "Business Assets",      val: totalAst,       color: "#6a1b9a" },
                            { label: "TOTAL ASSETS",         val: totalAssets,    color: C.text,   bold: true, divTop: true },
                            { label: "(-) Accounts Payable", val: totalPay,       color: C.red     },
                            { label: "OPENING CAPITAL",      val: calcCap,        color: calcCap >= 0 ? C.green : C.red, bold: true, large: true, divTop: true },
                          ].map(function (row, i) {
                            return (
                              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: row.large ? "10px 12px" : "6px 0", borderTop: row.divTop ? "2px solid " + C.border : "1px solid " + C.borderLight, marginTop: row.divTop ? 6 : 0, background: row.large ? (calcCap >= 0 ? "#e8f5e9" : "#fde8ed") : undefined, borderRadius: row.large ? 8 : 0 }}>
                                <span style={{ fontSize: row.large ? 14 : 12.5, fontWeight: row.bold ? 800 : 500, color: C.textMd }}>{row.label}</span>
                                <span style={{ fontSize: row.large ? 18 : 13, fontWeight: row.large ? 900 : row.bold ? 800 : 600, color: row.color }}>{getCurrencySymbol()} {fmtNum(row.val)}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ background: "#fff8e8", borderRadius: 10, padding: "12px 16px", fontSize: 12.5, color: "#92400e", fontWeight: 600, lineHeight: 1.7 }}>
                          Cash {getCurrencySymbol()} {fmtNum(d.cash || 0)} and Bank {getCurrencySymbol()} {fmtNum(d.bank || 0)} set as starting balances. {(d.receivables || []).length} receivable(s), {(d.payables || []).length} payable(s), {(d.stock || []).length} product(s) and {(d.assets || []).length} asset(s) will be recorded.
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Btn col="gray" onClick={function () { setObStep(5); }}>Back</Btn>
                          <Btn col="green" full onClick={function () { obCommit(d); showAlert("Opening Balance saved successfully!"); }}>
                            Save Opening Balance
                          </Btn>
                        </div>
                        {obData.completed && (
                          <Btn col="gray" full onClick={function () { setObEditMode(false); setObDraft(null); setObStep(1); }}>
                            Cancel Edit
                          </Btn>
                        )}
                      </div>
                    </Card>
                  );
                })()}

              </div>
            )}
          </div>
        );
      })()}

      </div>
    </div>
  );
};
export default Accounts;
