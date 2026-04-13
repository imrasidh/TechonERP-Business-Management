import React, { useState, useEffect, useRef } from "react";
import { round2 } from "../accounting/generalLedger.js";
import { validateSnapshotIntegrity } from "../accounting/financialSnapshot.js";
import { SnapshotIntegrityBadge } from "../ui/SnapshotIntegrityBadge.jsx";

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

/* ═══════════════════════════════════════════════════════════
   ACCOUNTS PAGE — Overview, Capital, Profit Distribution, Assets
   ═══════════════════════════════════════════════════════════ */
var Accounts = function (props) {
  var state = props.state;
  var setState = props.setState;
  var S = props.S;
  var today = props.today;
  var uid = props.uid;
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

  /* ── shared helpers ── */
  var getCapLedger = function () { return S.get("tc3_capLedger", []); };
  var getCapLog = function () { return S.get("tc3_capLog", []); };
  var getProfitDist = function () { return S.get("tc3_profitDist", []); };
  var ACATS = ["Shop Interior", "Advance Payment / Deposit", "Rent Deposit", "Equipment / Machinery", "Computers / Electronics", "Printer / Scanner", "Networking Equipment", "Furniture & Fixtures", "Vehicle", "Security System (CCTV)", "Electrical / UPS", "Software / Licenses", "Tools / Instruments", "Renovation / Improvements", "Other"];

  /* ── Overview tab state ── */
  var balances = getCashBalances(state);
  var totalReceivable = typeof getTotalReceivableDerived === "function"
    ? getTotalReceivableDerived(state)
    : (function () {
      var fromSales = state.sales.reduce(function (a, s) { return a + Math.max(0, s.total - (s.paid || 0)); }, 0);
      var fromManual = S.get("tc3_manualReceivables", []).reduce(function (a, mr) {
        var paid = (mr.paymentHistory || []).reduce(function (s, p) { return s + p.amount; }, 0);
        return a + Math.max(0, mr.amount - paid);
      }, 0);
      return fromSales + fromManual;
    })();
  var totalPayable = typeof getTotalPayableDerived === "function"
    ? getTotalPayableDerived(state)
    : (function () {
      var fromSupp = getTotalSupplierPayable(state.purchases); // BUG8 FIX: computed from purchases, not stale supplier.payable
      var fromManual = S.get("tc3_manualPayables", []).reduce(function (a, mp) {
        var paid = (mp.paymentHistory || []).reduce(function (s, p) { return s + p.amount; }, 0);
        return a + Math.max(0, mp.amount - paid);
      }, 0);
      return fromSupp + fromManual;
    })();
  var totalRevenue = state.sales.reduce(function (a, s) { return a + s.total; }, 0);
  var totalCOGS = getNetCOGS(state.sales, state.salesReturns); /* Bug 3 fix: net COGS after returns */
  var totalExpenses = state.expenses.reduce(function (a, e) { return a + e.amount; }, 0);
  var totalAssets = (state.assets || []).reduce(function (a, x) { return a + (x.amount || x.value || 0); }, 0);
  var netCapital = getCapLedger().reduce(function (a, e) { return a + (e.type === "invest" ? e.amount : -e.amount); }, 0);
  var totalProfitDist = getProfitDist().reduce(function (a, pd) { return a + pd.amount; }, 0);
  var grossProfit = totalRevenue - totalCOGS;
  /* BUG5 FIX: Only add repair revenue for jobs NOT converted to a POS invoice.
     Invoiced repairs (via convertToInvoice → POS) have cost:0 and their full
     charge is already captured in totalRevenue/grossProfit above.
     Adding all repair revenue here would double-count invoiced repairs. */
  var totalRepairRevenue = state.repairs.reduce(function (a, r) {
    if (r.status !== "Delivered") return a;
    /* If this repair has a corresponding sale (fromRepairId on the sale), skip it */
    var alreadyInvoiced = state.sales.some(function (s) { return s.fromRepairId === r.id; });
    return alreadyInvoiced ? a : a + (r.estimatedCost || r.cost || 0);
  }, 0);
  /* Theoretical stock reconciliation — catches direct edits, damage, deletions and WAC rounding in one formula */
  var acObSnap = S.get("tc3_openBal", null);
  var acObStockVal = (acObSnap && acObSnap.completed) ? (acObSnap.stock || []).reduce(function (a, s) { return a + s.cost * s.qty; }, 0) : 0;
  var acTotalPurchasesVal = state.purchases.reduce(function (a, p) { return a + (p.items || []).reduce(function (b, it) { return b + ((it.inputQty !== undefined ? it.inputQty : it.qty) * it.cost); }, 0); }, 0);
  var acTotalPurchaseReturnsVal = (state.purchaseReturns || []).reduce(function (a, r) { return a + (r.qty || 0) * (r.cost || 0); }, 0);
  var acTheoreticalStock = acObStockVal + acTotalPurchasesVal - totalCOGS - acTotalPurchaseReturnsVal;
  var acStockCostValue = state.products.filter(function (p) { return p.status !== "inactive"; }).reduce(function (a, p) { return a + (p.cost || 0) * (p.stock || 0); }, 0);
  var acManualStockAdj = acStockCostValue - acTheoreticalStock;
  var netProfit = grossProfit + totalRepairRevenue - totalExpenses + acManualStockAdj;
  var availableProfit = netProfit - totalProfitDist;

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
  /* Ctrl++ shortcut in Opening Balance — open Add New Product (only on stock step 4) */
  useEffect(function () {
    var handler = function (e) {
      if (e.ctrlKey && (e.key === "=" || e.key === "+" || e.keyCode === 187 || e.keyCode === 107)) {
        e.preventDefault();
        setShowObStockDrop(false);
        setObStockSearch("");
        setObStockModal(true);
        setObStockForm(function (prev) { return Object.assign({}, prev, { name: "", barcode: genBarcode(), category: "General", unit: getBusinessProfile().units[0] || "Pcs", description: "", cost: "", price: "", qty: "1" }); });
      }
    };
    window.addEventListener("keydown", handler);
    return function () { window.removeEventListener("keydown", handler); };
  }, []);
  var [obStockModal, setObStockModal] = useState(false);
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
  var obNewProd = typeof newProd !== "undefined" ? newProd : null;

  var filtObProds = (state.products || []).filter(function (p) {
    if (p.status === "inactive") return false;
    var q = obStockSearch.toLowerCase();
    if (!q) return false;
    return (p.name || "").toLowerCase().includes(q) || (p.productId || "").toLowerCase().includes(q) || (p.barcode || "").toLowerCase().includes(q);
  }).slice(0, 8);
  var [obAssetModal, setObAssetModal] = useState(false);
  var [obRecvForm, setObRecvForm] = useState({ person: "", amount: "", note: "" });
  var [obPayForm, setObPayForm] = useState({ source: "", amount: "", note: "" });
  var [obStockForm, setObStockForm] = useState({ name: "", category: "General", unit: "Pcs", bulkUnit: "", bulkConversion: "", bulkCost: "", bulkPrice: "", cost: "", price: "", qty: "" });
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
    var newRec = (draft.receivables || []).map(function (r) {
      /* Try to find an existing opening entry for the same person to preserve payment history */
      var existing = oldOpenRec.find(function (o) { return o.person === r.person && Math.abs((o.amount || 0) - r.amount) < 0.01; });
      return existing
        ? Object.assign({}, existing, { amount: r.amount, note: r.note || existing.note || "" })
        : { id: uid(), date: draft.date || today(), person: r.person, type: "Opening Receivable", amount: r.amount, paymentMethod: "Cash", reference: "Opening Balance", note: r.note || "", paymentHistory: [], _isOpening: true, createdAt: new Date().toISOString() };
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
        : { id: uid(), date: draft.date || today(), source: p.source, type: "Opening Payable", amount: p.amount, paymentMethod: "Cash", reference: "Opening Balance", note: p.note || "", paymentHistory: [], _isOpening: true, createdAt: new Date().toISOString() };
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
          existProds[idx] = Object.assign({}, existProds[idx], { stock: s.qty, _isOpening: true });
          newLog.push({ id: uid(), date: draft.date || today(), type: "Added", productId: existProds[idx].id, productName: existProds[idx].name, qty: s.qty, reason: "Opening Balance (Existing)" });
        }
      } else {
        // New product - create it
        var np = { id: uid(), productId: nextProductId(existProds.concat(newProds)), name: s.name, barcode: s.barcode || genBarcode(), category: s.category || "General", unit: s.unit || getBusinessProfile().units[0] || "Pcs", bulkEnabled: !!(s.bulkUnit && (parseFloat(s.bulkConversion) || 0) > 0), bulkUnit: s.bulkUnit || "", bulkConversion: parseFloat(s.bulkConversion) || 0, bulkCost: parseFloat(s.bulkCost) || 0, bulkPrice: parseFloat(s.bulkPrice) || 0, description: "Opening stock", cost: s.cost, price: s.price, stock: s.qty, damaged: 0, _isOpening: true };
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
  var [glDebugGroupLimit, setGlDebugGroupLimit] = useState(50);

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
    var a = { id: uid(), date: newAsset.date || today(), name: newAsset.name, category: newAsset.category || "Equipment", amount: parseFloat(newAsset.amount) || 0, note: newAsset.note || "", cashMethod: newAsset.cashMethod || "Cash" };
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

  var ATABS = [["overview", "📊 Overview"], ["capital", "💼 Capital"], ["opening", "🏁 Opening Balance"], ["ledger", "📒 Cash Ledger"], ["gledger", "⚖ GL / Trial Balance"], ["assets", "🏢 Assets"], ["profit", "💸 Profit Distribution"]];

  return (
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, borderBottom: "2px solid " + C.border }}>
        {ATABS.map(function (t) {
          return <button key={t[0]} onClick={function () { setAtab(t[0]); }} style={{ padding: "10px 18px", borderRadius: "10px 10px 0 0", border: "1.5px solid " + (atab === t[0] ? C.border : "transparent"), borderBottom: atab === t[0] ? "2px solid #fff" : "none", background: atab === t[0] ? "#fff" : "transparent", color: atab === t[0] ? C.accent : C.muted, fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: atab === t[0] ? -2 : 0 }}>{t[1]}</button>;
        })}
      </div>

      {/* ── OVERVIEW ── */}
      {atab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
            <StatCard label="Cash in Hand" value={balances.cash} accent={C.green} icon="💵" sub="Physical cash balance" />
            <StatCard label="Bank Balance" value={balances.bank} accent={C.blue} icon="🏦" sub="Bank account balance" />
            <StatCard label="Total Receivable" value={totalReceivable} accent={C.cyan} icon="📥" sub="Owed to business" />
            <StatCard label="Total Payable" value={totalPayable} accent={C.red} icon="📤" sub="Business owes others" />
            <StatCard label="Net Capital" value={netCapital} accent={C.purple} icon="💼" sub="Invested − Withdrawn" />
            <StatCard label="Net Profit (Total)" value={netProfit} accent={netProfit >= 0 ? C.green : C.red} icon="📈" sub={"Distributed: " + getCurrencySymbol() + " " + fmtNum(totalProfitDist)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Card>
              <CardTitle sub="Business financial position">Balance Summary</CardTitle>
              {[
                { label: "Total Revenue", val: totalRevenue, color: C.blue, icon: "💰" },
                { label: "Cost of Goods Sold", val: totalCOGS, color: C.orange, icon: "🛒" },
                { label: "Gross Profit", val: grossProfit, color: grossProfit >= 0 ? C.green : C.red, icon: "📊" },
                { label: "Total Expenses", val: totalExpenses, color: C.red, icon: "💸" },
                { label: "Net Profit", val: netProfit, color: netProfit >= 0 ? C.green : C.red, icon: "📈" },
                { label: "Profit Distributed", val: totalProfitDist, color: C.purple, icon: "🤝" },
                { label: "Available Profit", val: availableProfit, color: availableProfit >= 0 ? C.green : C.red, icon: "✅" },
              ].map(function (r) {
                return (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid " + C.borderLight }}>
                    <span style={{ fontSize: 13, color: C.textMd }}>{r.icon} {r.label}</span>
                    <span style={{ fontWeight: 800, fontSize: 14, color: r.color }}>{getCurrencySymbol()} {fmtNum(r.val)}</span>
                  </div>
                );
              })}
            </Card>
            <Card>
              <CardTitle sub="Cash & bank position">Liquidity Overview</CardTitle>
              {[
                { label: "Cash in Hand", val: balances.cash, color: balances.cash >= 0 ? C.green : C.red, icon: "💵" },
                { label: "Bank Balance", val: balances.bank, color: balances.bank >= 0 ? C.blue : C.red, icon: "🏦" },
                { label: "Total Liquid", val: balances.cash + balances.bank, color: (balances.cash + balances.bank) >= 0 ? C.accent : C.red, icon: "💎", bold: true },
                { label: "Total Assets (Fixed)", val: (state.assets || []).reduce(function (a, x) { return a + (x.amount || x.value || 0); }, 0), color: C.purple, icon: "🏢" },
                { label: "Net Capital Invested", val: netCapital, color: C.purple, icon: "💼" },
                { label: "Total Receivable", val: totalReceivable, color: C.cyan, icon: "📥" },
                { label: "Total Payable", val: totalPayable, color: C.red, icon: "📤" },
              ].map(function (r) {
                return (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid " + C.borderLight }}>
                    <span style={{ fontSize: 13, color: C.textMd }}>{r.icon} {r.label}</span>
                    <span style={{ fontWeight: r.bold ? 900 : 800, fontSize: r.bold ? 15 : 14, color: r.color }}>{getCurrencySymbol()} {fmtNum(r.val)}</span>
                  </div>
                );
              })}
            </Card>
          </div>
        </div>
      )}

      {/* ── LEDGER ── */}
      {atab === "ledger" && (function () {

        /* ── Build ledger entries from ALL sources ── */
        var entries = [];

        /* 0. Opening Balance seed row (if setup is complete) */
        var obSnap = S.get("tc3_openBal", null);
        if (obSnap && obSnap.completed) {
          var obDate = obSnap.date || today();
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

        /* 1. Capital investments / withdrawals */
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

        /* 2. Sales payments (from paymentHistory) */
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

        /* 3. Purchase payments (from paymentHistory) */
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

        /* 4. Expenses */
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

        /* NOTE: Repair revenue is intentionally NOT added here.
           Repairs are pure device-tracking tickets. Revenue is only recorded when
           a repair is converted to a Sales Invoice via POS — that payment then
           appears in the ledger above via state.sales[].paymentHistory.
           Adding repair entries here would cause double-counting. */

        /* 6. Asset purchases */
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

        /* 7. Manual Payables — initial borrowed/received amount (Money In)
               Opening payables: skip initial amount (already in ob.cash/bank seed), only show repayments */
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
          /* repayments made on this payable = Money Out */
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

        /* 8. Manual Receivables — initial loan given (Money Out) + repayments received (Money In)
               Opening receivables: skip initial outflow (already accounted in opening capital), only show collections */
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
          /* repayments received = Money In */
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

        /* 9. Profit Distributions */
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

        /* 10. Sales Return Refunds — cash paid back to customer */
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

        /* 11. Purchase Return Refunds — cash received back from supplier */
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

        /* ── Sort all entries oldest → newest ── */
        entries.sort(function (a, b) { return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0; });

        /* ── Compute running balance BEFORE filtering (full history) ── */
        var running = 0;
        entries.forEach(function (e) {
          running += e.moneyIn - e.moneyOut;
          e.balance = running;
        });

        /* ── Apply filters ── */
        var filtered = entries.filter(function (e) {
          if (ledgerFrom && e.date < ledgerFrom) return false;
          if (ledgerTo && e.date > ledgerTo) return false;
          if (ledgerType !== "all" && e.typeGroup !== ledgerType) return false;
          if (ledgerAcct !== "all" && (e.account || "Cash") !== ledgerAcct) return false;
          return true;
        });

        /* ── Summary totals for filtered range ── */
        var filteredIn = filtered.reduce(function (a, e) { return a + e.moneyIn; }, 0);
        var filteredOut = filtered.reduce(function (a, e) { return a + e.moneyOut; }, 0);
        var openingBal = filtered.length > 0 ? (filtered[0].balance - filtered[0].moneyIn + filtered[0].moneyOut) : 0;
        var closingBal = filtered.length > 0 ? filtered[filtered.length - 1].balance : openingBal;

        /* ── Print function ── */
        var printLedger = function () {
          var shopName = state.settings.shopName || "Techon ERP";
          var css = "body{font-family:'Plus Jakarta Sans',Arial,sans-serif;padding:20px;color:#111;font-size:12px;}h3{margin:14px 0 6px;font-size:12px;font-weight:800;color:#1a237e;text-transform:uppercase;letter-spacing:.07em;padding:5px 10px;background:#e8eeff;border-left:4px solid #2255d4;}.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d1b3e;padding-bottom:12px;margin-bottom:14px;}.shop{font-size:18px;font-weight:900;color:#0d1b3e;}.sub{font-size:11px;color:#666;margin-top:2px;}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0 14px;}.card{background:#f8faff;border-radius:6px;padding:8px 10px;border:1px solid #e0e7ff;}.clbl{font-size:9px;color:#888;text-transform:uppercase;}.cval{font-size:15px;font-weight:800;margin-top:2px;}table{width:100%;border-collapse:collapse;}th{background:#1a237e;color:#fff;padding:6px 8px;text-align:left;font-size:10px;}td{padding:5px 8px;border-bottom:1px solid #eee;font-size:10.5px;}tr:nth-child(even){background:#f8faff;}.in{color:#1b5e20;font-weight:700;}.out{color:#b71c1c;font-weight:700;}.bal{font-weight:800;}.neg{color:#b71c1c;}@media print{@page{size:A4 landscape;margin:10mm;}body{padding:0;}}";
          var h = "<div class='hdr'><div><div class='shop'>" + escapeHtml(shopName) + "</div><div class='sub'>Financial Ledger</div>" + (state.settings.address ? "<div class='sub'>" + escapeHtml(state.settings.address) + "</div>" : "") + "</div><div style='text-align:right'><div class='sub'>Period: " + ledgerFrom + " to " + ledgerTo + "</div><div class='sub'>Printed: " + new Date().toLocaleString() + "</div></div></div>";
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
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Summary stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
              <div style={{ background: "linear-gradient(135deg,#0d47a1,#1976d2)", color: "#fff", borderRadius: 14, padding: "16px 18px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Opening Balance</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{getCurrencySymbol()} {fmtNum(openingBal)}</div>
                <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>Start of period</div>
              </div>
              <div style={{ background: "linear-gradient(135deg,#1b5e20,#2e7d32)", color: "#fff", borderRadius: 14, padding: "16px 18px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Total Money In</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{getCurrencySymbol()} {fmtNum(filteredIn)}</div>
                <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>All inflows</div>
              </div>
              <div style={{ background: "linear-gradient(135deg,#b71c1c,#c62828)", color: "#fff", borderRadius: 14, padding: "16px 18px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Total Money Out</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{getCurrencySymbol()} {fmtNum(filteredOut)}</div>
                <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>All outflows</div>
              </div>
              <div style={{ background: closingBal >= 0 ? "linear-gradient(135deg,#004d40,#00695c)" : "linear-gradient(135deg,#b71c1c,#c62828)", color: "#fff", borderRadius: 14, padding: "16px 18px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Closing Balance</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{getCurrencySymbol()} {fmtNum(closingBal)}</div>
                <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>{filtered.length} transactions</div>
              </div>
            </div>

            {/* Filters */}
            <Card>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>From</div>
                  <input type="date" value={ledgerFrom} onChange={function (e) { setLedgerFrom(e.target.value); }} style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: C.text, background: "#fff", outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>To</div>
                  <input type="date" value={ledgerTo} onChange={function (e) { setLedgerTo(e.target.value); }} style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: C.text, background: "#fff", outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Type</div>
                  <select value={ledgerType} onChange={function (e) { setLedgerType(e.target.value); }} style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: C.text, background: "#fff", outline: "none", cursor: "pointer" }}>
                    {TYPE_OPTIONS.map(function (o) { return <option key={o[0]} value={o[0]}>{o[1]}</option>; })}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Account</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["all", "All"], ["Cash", "💵 Cash"], ["Bank", "🏦 Bank"]].map(function (opt) {
                      var isA = ledgerAcct === opt[0];
                      return <button key={opt[0]} onClick={function () { setLedgerAcct(opt[0]); }} style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid " + (isA ? C.accent : C.border), background: isA ? "linear-gradient(135deg,#2979ff,#5591ff)" : "#fff", color: isA ? "#fff" : C.textMd, fontWeight: 700, fontSize: 12.5, cursor: "pointer", boxShadow: isA ? "0 2px 8px rgba(41,121,255,0.25)" : "none" }}>{opt[1]}</button>;
                    })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                  <button onClick={function () { setLedgerFrom(today().slice(0, 4) + "-01-01"); setLedgerTo(today()); setLedgerType("all"); setLedgerAcct("all"); }} style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid " + C.border, background: "#fff", color: C.textMd, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>Reset</button>
                  <Btn col="blue" onClick={printLedger}>🖨 Print Ledger</Btn>
                  <WABtn title="Share Ledger via WhatsApp" onClick={function () { shareAnyReport(printLedger, "Accounts-Ledger"); }} />
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: C.muted, fontWeight: 600, background: "#f7f9ff", padding: "6px 12px", borderRadius: 8, display: "inline-block" }}>
                Showing {filtered.length} of {entries.length} transactions
              </div>
            </Card>

            {/* Ledger table */}
            <Card pad={0}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
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
                    {filtered.map(function (e, i) {
                      var isIn = e.moneyIn > 0;
                      var isOut = e.moneyOut > 0;
                      var balNeg = e.balance < 0;
                      var typeColor = typeColors[e.type] || C.textMd;
                      return (
                        <tr key={e.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8faff", borderBottom: "1px solid " + C.borderLight }}>
                          <td style={{ padding: "9px 14px", color: C.muted, fontSize: 12 }}>{i + 1}</td>
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
            </Card>

          </div>
        );
      })()}

      {/* ── GENERAL LEDGER / TRIAL BALANCE (double-entry) ── */}
      {atab === "gledger" && (function () {
        var tb = typeof getTrialBalanceSnapshot === "function" ? getTrialBalanceSnapshot() : { rows: [], totalDebit: 0, totalCredit: 0, balanced: false };
        var bs = typeof getBalanceSheetFromLedger === "function" ? getBalanceSheetFromLedger(null) : { assets: 0, liabilities: 0, equity: 0, balanced: false, difference: 0 };
        var pl = typeof getProfitAndLossFromLedger === "function" ? getProfitAndLossFromLedger(null, null) : { income: 0, expenses: 0, net: 0 };
        var glErr = S.get("tc3_gl_last_error", null);
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
        var bsDiffAmt = Math.abs(bs.difference != null ? bs.difference : 0);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Card>
              <CardTitle sub="Live mode posts on each transaction; repair mode uses scheduled/manual rebuild. Source: canonical ERP records.">Double-entry engine</CardTitle>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: C.muted }}>Engine: <strong>{glMode === "rebuild" ? "Repair (rebuild)" : "Live"}</strong></span>
                <span title="Debits equal credits across all GL accounts" style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, border: "1px solid " + (tb.balanced ? "#86efac" : "#fecaca"), background: tb.balanced ? "#f0fdf4" : "#fef2f2", color: tb.balanced ? "#166534" : "#991b1b" }}>
                  {tb.balanced ? "✓ Trial balance balanced" : "⚠ Trial balance mismatch"}
                </span>
                <span title="Assets = Liabilities + Equity" style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, border: "1px solid " + (bs.balanced ? "#86efac" : "#fdba74"), background: bs.balanced ? "#f0fdf4" : "#fffbeb", color: bs.balanced ? "#166534" : "#9a3412" }}>
                  {bs.balanced ? "✓ Ledger balanced (A = L + E)" : "⚠ Balance sheet equation off by " + getCurrencySymbol() + fmtNum(bsDiffAmt)}
                </span>
              </div>
              {glErr && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#991b1b", marginBottom: 10 }}>
                  Last journal error: {typeof glErr.message === "string" ? glErr.message : JSON.stringify(glErr)}
                </div>
              )}
              {invRec && !invRec.ok && (
                <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#92400e", marginBottom: 10 }}>
                  <strong>Inventory vs ledger:</strong> GL inventory balance {getCurrencySymbol()} {fmtNum(invRec.glInventoryBalance)} vs layer valuation {getCurrencySymbol()} {fmtNum(invRec.physicalValue)}
                  {typeof invRec.difference === "number" ? <span> — off by {getCurrencySymbol()} {fmtNum(Math.abs(invRec.difference))}</span> : null}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
                <Btn col="cyan" onClick={function () {
                  if (typeof rebuildGeneralLedger === "function") rebuildGeneralLedger();
                }}>↻ Rebuild journal now</Btn>
                <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>
                  Totals: Dr {getCurrencySymbol()} {fmtNum(tb.totalDebit)} · Cr {getCurrencySymbol()} {fmtNum(tb.totalCredit)}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginBottom: 14 }}>
                <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase" }}>P&amp;L (ledger)</div>
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>Net {getCurrencySymbol()} {fmtNum(pl.net)}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>Income {fmtNum(pl.income)} · Exp {fmtNum(pl.expenses)}</div>
                </div>
                <div style={{ background: bs.balanced ? "#fefce8" : "#fff7ed", border: "1px solid " + (bs.balanced ? "#fde047" : "#fdba74"), borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase" }}>Balance sheet (ledger)</div>
                    {bs.balanced ? (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#dcfce7", color: "#166534", border: "1px solid #86efac" }}>✓ A = L + E</span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#ffedd5", color: "#9a3412", border: "1px solid #fdba74" }}>⚠ Δ {getCurrencySymbol()}{fmtNum(bsDiffAmt)}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>Assets {getCurrencySymbol()} {fmtNum(bs.assets)}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    Liab {fmtNum(bs.liabilities)} · Equity {fmtNum(bs.equity)}
                    {!bs.balanced && <span style={{ color: "#c2410c", fontWeight: 700 }}> — Assets ≠ Liabilities + Equity</span>}
                  </div>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ background: C.th }}>
                    <TH>Code</TH><TH>Account</TH><TH>Type</TH><TH style={{ textAlign: "right" }}>Debit</TH><TH style={{ textAlign: "right" }}>Credit</TH>
                  </tr></thead>
                  <tbody>
                    {tb.rows.map(function (r, i) {
                      return (
                        <tr key={r.accountId} style={{ background: i % 2 ? "#f8fafc" : "#fff" }}>
                          <TD>{r.code}</TD><TD bold>{r.name}</TD><TD color={C.muted}>{r.type}</TD>
                          <TD style={{ textAlign: "right" }}>{r.debit > 0 ? getCurrencySymbol() + " " + fmtNum(r.debit) : "—"}</TD>
                          <TD style={{ textAlign: "right" }}>{r.credit > 0 ? getCurrencySymbol() + " " + fmtNum(r.credit) : "—"}</TD>
                        </tr>
                      );
                    })}
                    {tb.rows.length === 0 && <tr><td colSpan={5} style={{ padding: 16, textAlign: "center", color: C.muted }}>No journal lines yet — use Rebuild or post a transaction.</td></tr>}
                    <tr style={{ background: "#e8eeff", fontWeight: 800 }}>
                      <td colSpan={3} style={{ padding: 10 }}>TOTAL</td>
                      <td style={{ textAlign: "right", padding: 10 }}>{getCurrencySymbol()} {fmtNum(tb.totalDebit)}</td>
                      <td style={{ textAlign: "right", padding: 10 }}>{getCurrencySymbol()} {fmtNum(tb.totalCredit)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
            <Card>
              <CardTitle sub="Running balance by GL account — loads in pages for performance">Account activity</CardTitle>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd }}>Account </label>
                <select value={glSelAcct} onChange={function (e) { setGlSelAcct(e.target.value); }} style={{ marginLeft: 8, border: "1.5px solid " + C.border, borderRadius: 8, padding: "6px 10px", fontSize: 13 }}>
                  {acctOpts.map(function (r) {
                    return <option key={r.accountId} value={r.accountId}>{r.code} — {r.name}</option>;
                  })}
                  {acctOpts.length === 0 && ["1000", "1010", "1100", "1200", "2000", "3000", "4000", "5000", "6000"].map(function (id) {
                    return <option key={id} value={id}>{id}</option>;
                  })}
                </select>
                <span style={{ marginLeft: 10, fontSize: 11, color: C.muted }}>Showing {runRowsPage.length} of {runRows.length} lines</span>
              </div>
              <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ background: C.th }}>
                    <TH>Date</TH><TH>Ref</TH><TH>Memo</TH><TH style={{ textAlign: "right" }}>Debit</TH><TH style={{ textAlign: "right" }}>Credit</TH><TH style={{ textAlign: "right" }}>Run bal</TH>
                  </tr></thead>
                  <tbody>
                    {runRowsPage.map(function (rr, i) {
                      var ln = rr.line;
                      return (
                        <tr key={ln.id || i} style={{ background: i % 2 ? "#fff" : "#f8faff" }}>
                          <TD>{ln.date || "—"}</TD>
                          <TD><span style={{ fontSize: 10 }}>{ln.referenceType}</span></TD>
                          <TD style={{ maxWidth: 200, fontSize: 11 }}>{(ln.memo || "").slice(0, 80)}</TD>
                          <TD style={{ textAlign: "right" }}>{ln.debit > 0 ? fmtNum(ln.debit) : "—"}</TD>
                          <TD style={{ textAlign: "right" }}>{ln.credit > 0 ? fmtNum(ln.credit) : "—"}</TD>
                          <TD style={{ textAlign: "right", fontWeight: 800 }}>{fmtNum(rr.running)}</TD>
                        </tr>
                      );
                    })}
                    {runRows.length === 0 && <tr><td colSpan={6} style={{ padding: 16, textAlign: "center", color: C.muted }}>No lines for this account.</td></tr>}
                  </tbody>
                </table>
              </div>
              {runRows.length > runRowsPage.length && (
                <div style={{ marginTop: 10 }}>
                  <Btn col="gray" onClick={function () { setGlAcctLinesVisible(function (n) { return n + 80; }); }}>Load more ({runRows.length - runRowsPage.length} remaining)</Btn>
                </div>
              )}
            </Card>

            <Card>
              <CardTitle sub="Saved from Accounts or Settings — hash-sealed for integrity">Financial snapshots</CardTitle>
              {snapsRecent.length === 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 12, color: C.muted, padding: 8 }}>
                  <span>No snapshots yet. Save from Settings → Accounting; new saves appear as</span>
                  <SnapshotIntegrityBadge variant="sealed" />
                  <span>when sealed.</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
                  {snapsRecent.map(function (s) {
                    var sealed = !!(s && s.contentHash && validateSnapshotIntegrity(s));
                    var legacy = s && !s.contentHash;
                    return (
                      <div key={s.id || s.createdAt} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, border: "1px solid " + C.border, background: "#fafbff", fontSize: 12, minWidth: 0 }}>
                        <span style={{ fontWeight: 700, color: C.text }}>{fmtDateFull(s.createdAt || "").slice(0, 16) || "—"}</span>
                        <span style={{ color: C.muted, flex: "1 1 140px", minWidth: 0 }}>{s.label || s.id || ""}</span>
                        {sealed ? (
                          <SnapshotIntegrityBadge variant="sealed" liveStatus />
                        ) : legacy ? (
                          <SnapshotIntegrityBadge variant="legacy" liveStatus />
                        ) : (
                          <SnapshotIntegrityBadge variant="failed" liveStatus />
                        )}
                        {s.contentHash && <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }} title="Content hash">{String(s.contentHash).slice(0, 18)}…</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {glDeveloperTools && (
              <Card>
                <CardTitle sub="Admin / dev only — does not change data">Developer tools</CardTitle>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                    <input type="checkbox" checked={glDebugOpen} onChange={function (e) { setGlDebugOpen(e.target.checked); }} style={{ width: 16, height: 16, accentColor: C.accent }} />
                    Show journal debug (grouped by transaction)
                  </label>
                </div>
                {glDebugOpen && (
                  <div style={{ fontSize: 11, color: C.textMd, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ background: "#f8fafc", border: "1px solid " + C.border, borderRadius: 8, padding: 10 }}>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>Inventory reconciliation (stored)</div>
                      {invRec ? (
                        <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 11, fontFamily: "ui-monospace,monospace" }}>{JSON.stringify(invRec, null, 2)}</pre>
                      ) : (
                        <span style={{ color: C.muted }}>No tc3_inv_reconciliation in storage.</span>
                      )}
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>Journal entries by transactionId (first {glDebugGroupLimit} of {groupedJournal.length} groups)</div>
                      <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid " + C.border, borderRadius: 8, padding: 8 }}>
                        {groupedJournalSlice.map(function (g) {
                          var bal = round2(g.dr - g.cr);
                          return (
                            <div key={g.tid} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: "1px dashed " + C.border }}>
                              <div style={{ fontWeight: 700, fontSize: 11, color: C.accent }}>{g.tid}</div>
                              <div style={{ fontSize: 10, color: C.muted }}>Dr {fmtNum(g.dr)} · Cr {fmtNum(g.cr)} · Net Dr−Cr {fmtNum(bal)}</div>
                              <table style={{ width: "100%", fontSize: 10, marginTop: 4 }}>
                                <tbody>
                                  {g.lines.map(function (ln, li) {
                                    return (
                                      <tr key={li}>
                                        <td style={{ padding: "2px 4px" }}>{ln.accountId}</td>
                                        <td style={{ padding: "2px 4px" }}>{(ln.memo || "").slice(0, 40)}</td>
                                        <td style={{ textAlign: "right", padding: "2px 4px" }}>{ln.debit > 0 ? fmtNum(ln.debit) : "—"}</td>
                                        <td style={{ textAlign: "right", padding: "2px 4px" }}>{ln.credit > 0 ? fmtNum(ln.credit) : "—"}</td>
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

            <Card>
              <CardTitle sub="Creates, repairs, validation, and sync events">GL audit trail</CardTitle>
              <div style={{ fontSize: 11, maxHeight: 220, overflowY: "auto" }}>
                {(!glAudit || !glAudit.length) && <div style={{ color: C.muted, padding: 8 }}>No audit entries yet.</div>}
                {(glAudit || []).slice(-20).reverse().map(function (row, i) {
                  return (
                    <div key={row.id || i} style={{ borderBottom: "1px solid " + C.border, padding: "8px 0" }}>
                      <div style={{ fontWeight: 800, color: C.text }}>{row.action || "—"}</div>
                      <div style={{ color: C.muted, fontSize: 10 }}>{row.ts || ""}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))", gap: 10 }}>
              <div style={{ background: "linear-gradient(135deg,#1a237e,#283593)", borderRadius: 14, padding: "18px 20px", color: "#fff" }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Net Capital</div>
                <div style={{ fontSize: 26, fontWeight: 900 }}>{getCurrencySymbol()} {fmtNum(net)}</div>
                <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>Active capital in business</div>
              </div>
              <div style={{ background: "linear-gradient(135deg,#1b5e20,#2e7d32)", borderRadius: 14, padding: "18px 20px", color: "#fff" }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Total Invested</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{getCurrencySymbol()} {fmtNum(totalInvested)}</div>
              </div>
              <div style={{ background: "linear-gradient(135deg,#b71c1c,#c62828)", borderRadius: 14, padding: "18px 20px", color: "#fff" }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Total Withdrawn</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{getCurrencySymbol()} {fmtNum(totalWithdrawn)}</div>
              </div>
              <div style={{ background: "linear-gradient(135deg,#4a148c,#6a1b9a)", borderRadius: 14, padding: "18px 20px", color: "#fff" }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Transactions</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{ledger.length}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 14, alignItems: "start" }}>
              <Card>
                <CardTitle sub="Record a new investment or withdrawal">New Capital Entry</CardTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 6 }}>Transaction Type</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[["invest", "⬆ Invest Capital", "#1b5e20", "#e8f5e9"], ["withdraw", "⬇ Withdraw Capital", "#b71c1c", "#fde8ed"]].map(function (opt) {
                        var active = capForm.type === opt[0];
                        return <button key={opt[0]} onClick={function () { setCapForm(function (x) { return Object.assign({}, x, { type: opt[0] }); }); }} style={{ flex: 1, padding: "12px 8px", borderRadius: 10, border: "2px solid " + (active ? opt[2] : C.border), background: active ? opt[3] : "#fff", color: active ? opt[2] : C.textMd, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{opt[1]}</button>;
                      })}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Input label="Amount (Rs) *" type="number" value={capForm.amount} onChange={function (e) { setCapForm(function (x) { return Object.assign({}, x, { amount: e.target.value }); }); }} />
                    <Input label="Date *" type="date" value={capForm.date} onChange={function (e) { setCapForm(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }} />
                  </div>
                  <Input label="Reference / Source" value={capForm.ref} onChange={function (e) { setCapForm(function (x) { return Object.assign({}, x, { ref: e.target.value }); }); }} />
                  <Input label="Note / Description" value={capForm.note} onChange={function (e) { setCapForm(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 5 }}>{capForm.type === "invest" ? "Receive To" : "Withdraw From"}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[["Cash", "💵 Cash", "#1b5e20", "#f0f9f4"], ["Bank", "🏦 Bank", "#1565c0", "#e8f0fe"]].map(function (opt) {
                        var active = (capForm.cashMethod || "Cash") === opt[0];
                        return <button key={opt[0]} onClick={function () { setCapForm(function (x) { return Object.assign({}, x, { cashMethod: opt[0] }); }); }} style={{ flex: 1, padding: "9px 8px", borderRadius: 9, border: "2px solid " + (active ? opt[2] : C.border), background: active ? opt[3] : "#fff", color: active ? opt[2] : C.textMd, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{opt[1]}</button>;
                      })}
                    </div>
                  </div>
                  <Btn col={capForm.type === "invest" ? "green" : "red"} onClick={saveCapEntry}>{capForm.type === "invest" ? "Record Investment" : "Record Withdrawal"}</Btn>
                </div>
              </Card>
              <Card>
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
                              <td style={{ padding: "8px 10px" }}>
                                <div style={{ display: "flex", gap: 5 }}>
                                  <button onClick={function () { setCapEditForm(Object.assign({}, e)); setCapEditModal("edit"); setCapActionPw(""); setCapActionReason(""); setCapActionMsg(""); }} style={{ padding: "5px 10px", background: C.accentSoft, color: C.accent, border: "1.5px solid " + C.accent, borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Edit</button>
                                  <button onClick={function () { setCapDeleteTarget(Object.assign({}, e)); setCapActionPw(""); setCapActionReason(""); setCapActionMsg(""); }} style={{ padding: "5px 10px", background: C.dangerSoft, color: C.red, border: "1.5px solid " + C.red, borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Del</button>
                                </div>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))", gap: 10 }}>
              <div style={{ background: "linear-gradient(135deg,#4a148c,#7b1fa2)", borderRadius: 14, padding: "18px 20px", color: "#fff" }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Total Distributed</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{getCurrencySymbol()} {fmtNum(totalDist)}</div>
                <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>{distList.length} entries</div>
              </div>
              <div style={{ background: "linear-gradient(135deg,#1a237e,#283593)", borderRadius: 14, padding: "18px 20px", color: "#fff" }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Net Profit</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{getCurrencySymbol()} {fmtNum(netProfit)}</div>
              </div>
              <div style={{ background: "linear-gradient(135deg,#1b5e20,#2e7d32)", borderRadius: 14, padding: "18px 20px", color: "#fff" }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Available Profit</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{getCurrencySymbol()} {fmtNum(availableProfit)}</div>
                <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>After distribution</div>
              </div>
              <div style={{ background: "linear-gradient(135deg,#e65100,#ef6c00)", borderRadius: 14, padding: "18px 20px", color: "#fff" }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Partners</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{Object.keys(byPartner).length}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 14, alignItems: "start" }}>
              <Card>
                <CardTitle sub="Record profit sharing">New Distribution</CardTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <Input label="Date *" type="date" value={pdForm.date} onChange={function (e) { setPdForm(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }} />
                  <Input label="Partner / Person *" value={pdForm.partner} onChange={function (e) { setPdForm(function (x) { return Object.assign({}, x, { partner: e.target.value }); }); }} placeholder="e.g. John (Partner)" />
                  <Input label="Amount (Rs) *" type="number" value={pdForm.amount} onChange={function (e) { setPdForm(function (x) { return Object.assign({}, x, { amount: e.target.value }); }); }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 5 }}>Payment Method</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[["Cash", "💵 Cash", "#1b5e20", "#f0f9f4"], ["Bank", "🏦 Bank", "#1565c0", "#e8f0fe"]].map(function (opt) {
                        var active = (pdForm.paymentMethod || "Cash") === opt[0];
                        return <button key={opt[0]} onClick={function () { setPdForm(function (x) { return Object.assign({}, x, { paymentMethod: opt[0] }); }); }} style={{ flex: 1, padding: "9px 8px", borderRadius: 9, border: "2px solid " + (active ? opt[2] : C.border), background: active ? opt[3] : "#fff", color: active ? opt[2] : C.textMd, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{opt[1]}</button>;
                      })}
                    </div>
                  </div>
                  <Input label="Note" value={pdForm.note} onChange={function (e) { setPdForm(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} placeholder="Optional note" />
                  <div style={{ background: C.warnSoft, border: "1px solid #fcd34d", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: C.amber }}>⚠ This reduces profit balance. It does NOT affect capital.</div>
                  <Btn col="purple" onClick={saveProfitDist}>Record Distribution</Btn>
                </div>
              </Card>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {Object.keys(byPartner).length > 0 && (
                  <Card>
                    <CardTitle sub="Per-partner summary">Distribution by Partner</CardTitle>
                    {Object.keys(byPartner).map(function (p) {
                      var pct = totalDist > 0 ? Math.round(byPartner[p] / totalDist * 100) : 0;
                      return (
                        <div key={p} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid " + C.borderLight }}>
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: C.accent, flexShrink: 0 }}>{p.charAt(0).toUpperCase()}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{p}</div>
                            <div style={{ height: 5, background: C.border, borderRadius: 3, marginTop: 4 }}><div style={{ width: pct + "%", height: "100%", background: C.purple, borderRadius: 3 }}></div></div>
                          </div>
                          <div style={{ fontWeight: 800, color: C.purple, fontSize: 14 }}>{getCurrencySymbol()} {fmtNum(byPartner[p])}</div>
                          <div style={{ fontSize: 11, color: C.muted }}>{pct}%</div>
                        </div>
                      );
                    })}
                  </Card>
                )}
                <Card>
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
                              <td style={{ padding: "8px 10px" }}>
                                <div style={{ display: "flex", gap: 5 }}>
                                  <button onClick={function () { setPdEdit(Object.assign({}, e)); }} style={{ padding: "5px 10px", background: C.accentSoft, color: C.accent, border: "1.5px solid " + C.accent, borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Edit</button>
                                  <button onClick={function () { deletePd(e.id); }} style={{ padding: "5px 10px", background: C.dangerSoft, color: C.red, border: "1.5px solid " + C.red, borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Del</button>
                                </div>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))", gap: 10 }}>
              <div style={{ background: "linear-gradient(135deg,#1a237e,#283593)", borderRadius: 14, padding: "18px 20px", color: "#fff" }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Total Assets Value</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{getCurrencySymbol()} {fmtNum(totalAssetVal)}</div>
                <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>{assets.length} asset{assets.length !== 1 ? "s" : ""}</div>
              </div>
              {Object.keys(catTotals).slice(0, 3).map(function (cat) {
                return (
                  <div key={cat} style={{ background: "linear-gradient(135deg,#004d40,#00695c)", borderRadius: 14, padding: "18px 20px", color: "#fff" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{cat.length > 18 ? cat.slice(0, 18) + "…" : cat}</div>
                    <div style={{ fontSize: 22, fontWeight: 900 }}>{getCurrencySymbol()} {fmtNum(catTotals[cat])}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 14, alignItems: "start" }}>
              <Card>
                <CardTitle sub="Add a new business asset">{newAsset ? "New Asset" : "Add Asset"}</CardTitle>
                {!newAsset ? (
                  <Btn col="blue" onClick={function () { setNewAsset({ date: today(), name: "", category: "Equipment / Machinery", amount: "", note: "", cashMethod: "Cash" }); }}>+ Add New Asset</Btn>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <Input label="Asset Name *" value={newAsset.name} onChange={function (e) { setNewAsset(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} />
                    <Input label="Date *" type="date" value={newAsset.date} onChange={function (e) { setNewAsset(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }} />
                    <Sel label="Category" value={newAsset.category} onChange={function (e) { setNewAsset(function (x) { return Object.assign({}, x, { category: e.target.value }); }); }}>{AgetCats().map(function (c) { return <option key={c}>{c}</option>; })}</Sel>
                    <Input label="Amount Paid (Rs) *" type="number" value={newAsset.amount} onChange={function (e) { setNewAsset(function (x) { return Object.assign({}, x, { amount: e.target.value }); }); }} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 5 }}>Paid Via</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {[["Cash", "💵 Cash", "#1b5e20", "#f0f9f4"], ["Bank", "🏦 Bank", "#1565c0", "#e8f0fe"]].map(function (opt) {
                          var active = (newAsset.cashMethod || "Cash") === opt[0];
                          return <button key={opt[0]} onClick={function () { setNewAsset(function (x) { return Object.assign({}, x, { cashMethod: opt[0] }); }); }} style={{ flex: 1, padding: "9px 8px", borderRadius: 9, border: "2px solid " + (active ? opt[2] : C.border), background: active ? opt[3] : "#fff", color: active ? opt[2] : C.textMd, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{opt[1]}</button>;
                        })}
                      </div>
                    </div>
                    <Input label="Note" value={newAsset.note} onChange={function (e) { setNewAsset(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn col="green" onClick={saveAsset}>Save Asset</Btn>
                      <Btn col="gray" onClick={function () { setNewAsset(null); }}>Cancel</Btn>
                    </div>
                  </div>
                )}
              </Card>
              <Card>
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
                            <td style={{ padding: "8px 10px" }}>
                              <div style={{ display: "flex", gap: 5 }}>
                                <button onClick={function () { setEditAsset(Object.assign({}, a)); setAssetActionModal("edit"); setAssetPw(""); setAssetReason(""); setAssetPwMsg(""); }} style={{ padding: "5px 10px", background: C.accentSoft, color: C.accent, border: "1.5px solid " + C.accent, borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Edit</button>
                                <button onClick={function () { setEditAsset(Object.assign({}, a)); setAssetActionModal("delete"); setAssetPw(""); setAssetReason(""); setAssetPwMsg(""); }} style={{ padding: "5px 10px", background: C.dangerSoft, color: C.red, border: "1.5px solid " + C.red, borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Del</button>
                              </div>
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
                      <Sel label="Category" value={editAsset.category || ""} onChange={function (e) { setEditAsset(function (x) { return Object.assign({}, x, { category: e.target.value }); }); }}>{AgetCats().map(function (c) { return <option key={c}>{c}</option>; })}</Sel>
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
            fresh.stock = (state.products || []).filter(function (p) { return p._isOpening; }).map(function (p) { return { _srcId: p.id, name: p.name, barcode: p.barcode, category: p.category, unit: p.unit || "Pcs", bulkUnit: p.bulkUnit || "", bulkConversion: p.bulkConversion || 0, bulkCost: p.bulkCost || 0, bulkPrice: p.bulkPrice || 0, description: p.description || "", cost: p.cost, price: p.price, qty: p.stock }; });
            fresh.assets = (state.assets || []).filter(function (a) { return a._isOpening; }).map(function (a) { return { _srcId: a.id, name: a.name, category: a.category, purchaseDate: a.date || today(), value: a.amount, note: a.note || "" }; });
            setObDraft(fresh);
            setObEditMode(true);
            setObPwModal(false);
            setObPw(""); setObPwMsg(""); setObStep(1);
          });
        };

        var STEPS = [["1", "Cash & Bank"], ["2", "Receivables"], ["3", "Payables"], ["4", "Stock"], ["5", "Assets"], ["6", "Review & Save"]];

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {obPwModal && (
              <Modal title="Admin Password Required" onClose={function () { setObPwModal(false); setObPw(""); setObPwMsg(""); }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ background: "#fff8e8", borderRadius: 9, padding: "10px 14px", fontSize: 12.5, color: "#92400e", fontWeight: 600 }}>Opening Balance can only be edited by an admin. Changes will replace all existing opening entries.</div>
                  <Input label="Admin Password" type="password" value={obPw} onChange={function (e) { setObPw(e.target.value); }} onKeyDown={function (e) { if (e.key === "Enter") doUnlock(); }} />
                  {obPwMsg && <div style={{ color: C.red, fontSize: 12, fontWeight: 600 }}>{obPwMsg}</div>}
                  <Btn col="blue" onClick={doUnlock}>Unlock and Edit</Btn>
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

            {obStockModal && (function () {
              var existNonOB = (state.products || []).filter(function (p) { return !p._isOpening; });
              var obNextId = nextProductId(existNonOB);
              return (
                <Modal title={"Add New Product — ID: " + obNextId} onClose={function () { setObStockModal(false); setObStockForm({ name: "", barcode: genBarcode(), category: "General", unit: getBusinessProfile().units[0] || "Pcs", bulkUnit: "", bulkConversion: "", bulkCost: "", bulkPrice: "", description: "", cost: "", price: "", qty: "" }); }} wide>
                  <div style={{ background: C.accentSoft, borderRadius: 8, padding: "9px 14px", fontSize: 12, color: C.accent, marginBottom: 12 }}>New product will be added to your Inventory with opening stock quantity.</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <Input label="Product Name *" value={obStockForm.name} onChange={function (e) { setObStockForm(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} />
                    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Product ID</label>
                        <div style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, background: "#f3f4f6", color: C.accent, fontWeight: 800, fontFamily: "monospace", letterSpacing: "0.05em" }}>{obNextId}</div>
                      </div>
                      <Input label="Barcode" value={obStockForm.barcode || ""} onChange={function (e) { setObStockForm(function (x) { return Object.assign({}, x, { barcode: e.target.value }); }); }} />
                      <Sel label="Category" value={obStockForm.category || "General"} onChange={function (e) { setObStockForm(function (x) { return Object.assign({}, x, { category: e.target.value }); }); }}>
                        {getCats().map(function (c) { return <option key={c}>{c}</option>; })}
                      </Sel>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                      <Input label="Cost Price *" type="number" value={obStockForm.cost || ""} onChange={function (e) { setObStockForm(function (x) { return Object.assign({}, x, { cost: e.target.value }); }); }} />
                      <Input label="Sell Price *" type="number" value={obStockForm.price || ""} onChange={function (e) { setObStockForm(function (x) { return Object.assign({}, x, { price: e.target.value }); }); }} />
                      <Sel label="Base Unit" value={obStockForm.unit || getBusinessProfile().units[0] || "Pcs"} onChange={function (e) { setObStockForm(function (x) { return Object.assign({}, x, { unit: e.target.value }); }); }}>
                        {getBusinessProfile().units.map(function (u) { return <option key={u}>{u}</option>; })}
                      </Sel>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <Input label="Secondary Unit (optional)" value={obStockForm.bulkUnit || ""} onChange={function (e) { setObStockForm(function (x) { return Object.assign({}, x, { bulkUnit: e.target.value }); }); }} placeholder="Box / Tray / Carton" />
                      <Input label={"1 " + ((obStockForm.bulkUnit || "secondary")) + " = ? " + (obStockForm.unit || "Pcs")} type="number" value={obStockForm.bulkConversion || ""} onChange={function (e) { setObStockForm(function (x) { return Object.assign({}, x, { bulkConversion: e.target.value }); }); }} placeholder="e.g. 12" />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <Input label={"Secondary Cost Price (" + (obStockForm.bulkUnit || "secondary") + ")"} type="number" value={obStockForm.bulkCost || ""} onChange={function (e) { setObStockForm(function (x) { return Object.assign({}, x, { bulkCost: e.target.value }); }); }} placeholder="optional" />
                      <Input label={"Secondary Sell Price (" + (obStockForm.bulkUnit || "secondary") + ") *"} type="number" value={obStockForm.bulkPrice || ""} onChange={function (e) { setObStockForm(function (x) { return Object.assign({}, x, { bulkPrice: e.target.value }); }); }} placeholder="required if secondary used" />
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: -2 }}>Example: 1 Box = 12 Pcs. Leave secondary unit empty for simple products.</div>
                    <div style={{ fontSize: 11, color: C.textMd }}>
                      Config: Base: <strong>{obStockForm.unit || "Pcs"}</strong>
                      {obStockForm.bulkUnit ? (" | Secondary: " + obStockForm.bulkUnit + (obStockForm.bulkConversion ? (" | 1 " + obStockForm.bulkUnit + " = " + obStockForm.bulkConversion + " " + (obStockForm.unit || "Pcs")) : "")) : " | Secondary: None"}
                    </div>
                    <div style={{ background: "#e0f2fe", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#0369a1", fontWeight: 600 }}>
                      💡 Qty will be set from the opening stock grid row
                    </div>
                    {obStockForm.cost && obStockForm.price && (
                      <div style={{ background: C.accentSoft, borderRadius: 8, padding: "10px 14px", fontSize: 13, display: "flex", gap: 16 }}>
                        <span>Profit/unit: <strong style={{ color: C.green }}>{getCurrencySymbol()} {fmtNum((parseFloat(obStockForm.price) || 0) - (parseFloat(obStockForm.cost) || 0))}</strong></span>
                        <span>Margin: <strong style={{ color: C.accent }}>{(parseFloat(obStockForm.price) || 0) > 0 ? Math.round(((parseFloat(obStockForm.price) || 0) - (parseFloat(obStockForm.cost) || 0)) / (parseFloat(obStockForm.price) || 1) * 100) : 0}%</strong></span>
                      </div>
                    )}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Description / Notes (optional)</label>
                      <textarea value={obStockForm.description || ""} onChange={function (e) { setObStockForm(function (x) { return Object.assign({}, x, { description: e.target.value }); }); }} rows={2} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} placeholder="Product specs, features, notes..." />
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <Btn col="cyan" onClick={function () {
                        if (!obStockForm.name.trim()) { showAlert("Please enter a product name."); return; }
                        if (!obStockForm.cost || parseFloat(obStockForm.cost) <= 0) { showAlert("Please enter a valid cost price."); return; }
                        var obBulkUnit = (obStockForm.bulkUnit || "").trim();
                        var obBulkConv = parseFloat(obStockForm.bulkConversion) || 0;
                        var obBulkCost = parseFloat(obStockForm.bulkCost) || 0;
                        var obBulkPrice = parseFloat(obStockForm.bulkPrice) || 0;
                        if (obBulkUnit) {
                          if (obBulkUnit === (obStockForm.unit || "Pcs")) { showAlert("Secondary unit must be different from base unit."); return; }
                          if (!(obBulkConv > 0)) { showAlert("Please enter valid conversion. Example: 1 Box = 12 Pcs."); return; }
                          if (!(obBulkPrice > 0)) { showAlert("Please enter secondary unit sell price."); return; }
                        }
                        /* Use qty from the grid input row — avoids double-counting */
                        var obQtyToUse = parseInt(obStockQty, 10) || 1;
                        var bc = (obStockForm.barcode || "").trim() || genBarcode();
                        setD({ stock: (d.stock || []).concat([{ name: obStockForm.name.trim(), barcode: bc, category: obStockForm.category, unit: obStockForm.unit || getBusinessProfile().units[0] || "Pcs", bulkUnit: obBulkUnit, bulkConversion: obBulkUnit ? obBulkConv : 0, bulkCost: obBulkUnit ? obBulkCost : 0, bulkPrice: obBulkUnit ? obBulkPrice : 0, description: (obStockForm.description || "").trim(), cost: parseFloat(obStockForm.cost), price: parseFloat(obStockForm.price) || parseFloat(obStockForm.cost), qty: obQtyToUse, _isNew: true }]) });
                        setObStockModal(false); setObStockForm({ name: "", barcode: genBarcode(), category: "General", unit: getBusinessProfile().units[0] || "Pcs", bulkUnit: "", bulkConversion: "", bulkCost: "", bulkPrice: "", description: "", cost: "", price: "", qty: "" });
                        setTimeout(function () { var si = document.getElementById("ob-stock-search"); if (si) si.focus(); }, 50);
                      }} disabled={!obStockForm.name || !obStockForm.price || !obStockForm.cost}>Save Product</Btn>
                      <Btn col="gray" onClick={function () { setObStockModal(false); }}>Cancel</Btn>
                    </div>
                  </div>
                </Modal>
              );
            })()}

            {obStockExistModal && (function () {
              var alreadyAdded = (d.stock || []).map(function (s) { return s._srcProdId || s.name; });
              var available = (state.products || []).filter(function (p) {
                if (p._isOpening) return false;
                var q = obStockExistSearch.toLowerCase();
                if (!q) return true;
                return (p.name || "").toLowerCase().includes(q) || (p.productId || "").includes(q) || (p.barcode || "").toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q);
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
                                <button onClick={function () { setD({ stock: (d.stock || []).filter(function (s) { return s._srcProdId !== p.id; }) }); }} style={{ background: "#fde8ed", border: "none", borderRadius: 6, padding: "4px 8px", color: C.red, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Remove</button>
                              </div>
                            ) : (
                              <button onClick={function () {
                                var qty = window.prompt("Opening quantity for \"" + p.name + "\":");
                                if (qty === null) return;
                                var q = parseInt(qty);
                                if (!q || q <= 0) { showAlert("Please enter a valid quantity."); return; }
                                setD({ stock: (d.stock || []).concat([{ name: p.name, barcode: p.barcode, category: p.category, unit: p.unit || "Pcs", bulkUnit: p.bulkUnit || "", bulkConversion: p.bulkConversion || 0, bulkCost: p.bulkCost || 0, bulkPrice: p.bulkPrice || 0, description: p.description || "", cost: p.cost, price: p.price, qty: q, _srcProdId: p.id, _existingProduct: true }]) });
                              }} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>+ Select</button>
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
              <div style={{ background: "linear-gradient(135deg,#1b5e20,#2e7d32)", color: "#fff", borderRadius: 14, padding: "18px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Opening Balance</div>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>Setup Complete</div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>Date: {obData.date}  -  Capital: {getCurrencySymbol()} {fmtNum(obData.capital)}</div>
                </div>
                <Btn col="white" onClick={function () { setObPwModal(true); }}>Edit Opening Balance</Btn>
              </div>
            ) : (
              <div style={{ background: "linear-gradient(135deg,#e65100,#f57c00)", color: "#fff", borderRadius: 14, padding: "20px 24px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Opening Balance Setup</div>
                <div style={{ fontSize: 20, fontWeight: 900 }}>{obData.completed ? "Editing Opening Balance" : "Initial Setup"}</div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>Enter your business financial position on the day you started using this ERP.</div>
              </div>
            )}

            {obData.completed && !obEditMode && (function () {
              var ob = obData;
              var totalRecvOB  = (ob.receivables || []).reduce(function (a, r) { return a + r.amount; }, 0);
              var totalPayOB   = (ob.payables    || []).reduce(function (a, p) { return a + p.amount; }, 0);
              var totalStockOB = (ob.stock       || []).reduce(function (a, s) { return a + s.cost * s.qty; }, 0);
              var totalAstOB   = (ob.assets      || []).reduce(function (a, x) { return a + x.value; }, 0);
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
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
                        <div key={item.label} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: "1.5px solid " + C.border, boxShadow: C.shadowCard }}>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{item.label}</div>
                          <div style={{ fontSize: 17, fontWeight: 900, color: item.color }}>{getCurrencySymbol()} {fmtNum(item.val)}</div>
                        </div>
                      );
                    })}
                  </div>
                  {(ob.receivables || []).length > 0 && (
                    <Card pad={0}>
                      <div style={{ padding: "12px 16px", borderBottom: "1.5px solid " + C.border, fontWeight: 800, fontSize: 13 }}>Opening Receivables ({(ob.receivables || []).length})</div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead><tr><TH>Person</TH><TH>Phone</TH><TH>Amount</TH><TH>Due Date</TH><TH>Note</TH></tr></thead>
                          <tbody>{(ob.receivables || []).map(function (r, i) { return <TR key={i} i={i}><TD bold>{r.person}</TD><TD>{r.phone || "-"}</TD><TD color={C.green}>{getCurrencySymbol()} {fmtNum(r.amount)}</TD><TD>{r.dueDate || "-"}</TD><TD>{r.note || "-"}</TD></TR>; })}</tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                  {(ob.payables || []).length > 0 && (
                    <Card pad={0}>
                      <div style={{ padding: "12px 16px", borderBottom: "1.5px solid " + C.border, fontWeight: 800, fontSize: 13 }}>Opening Payables ({(ob.payables || []).length})</div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead><tr><TH>Supplier / Person</TH><TH>Phone</TH><TH>Amount</TH><TH>Due Date</TH><TH>Note</TH></tr></thead>
                          <tbody>{(ob.payables || []).map(function (p, i) { return <TR key={i} i={i}><TD bold>{p.source}</TD><TD>{p.phone || "-"}</TD><TD color={C.red}>{getCurrencySymbol()} {fmtNum(p.amount)}</TD><TD>{p.dueDate || "-"}</TD><TD>{p.note || "-"}</TD></TR>; })}</tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                  {(ob.stock || []).length > 0 && (
                    <Card pad={0}>
                      <div style={{ padding: "12px 16px", borderBottom: "1.5px solid " + C.border, fontWeight: 800, fontSize: 13 }}>Opening Stock ({(ob.stock || []).length} products)</div>
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
                    <Card pad={0}>
                      <div style={{ padding: "12px 16px", borderBottom: "1.5px solid " + C.border, fontWeight: 800, fontSize: 13 }}>Opening Assets ({(ob.assets || []).length})</div>
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
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", gap: 4, overflowX: "auto" }}>
                  {STEPS.map(function (st, idx) {
                    var n = idx + 1;
                    var isActive = obStep === n;
                    var isDone   = obStep > n;
                    return (
                      <button key={n} onClick={function () { setObStep(n); }} style={{ flex: 1, minWidth: 88, padding: "10px 6px", borderRadius: 10, border: "1.5px solid " + (isActive ? C.accent : isDone ? "#9ee8ce" : C.border), background: isActive ? "linear-gradient(135deg,#2979ff,#5591ff)" : isDone ? "#e8f5e9" : "#fff", color: isActive ? "#fff" : isDone ? "#1b5e20" : C.textMd, fontWeight: 700, fontSize: 11, cursor: "pointer", transition: "all .15s", textAlign: "center" }}>
                        <div style={{ fontSize: 15, fontWeight: 900 }}>{n}</div>
                        <div style={{ marginTop: 2, opacity: isActive ? 1 : 0.8, fontSize: 10.5 }}>{st[1]}</div>
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
                              <button onClick={function () { setD({ receivables: (d.receivables || []).filter(function (_, j) { return j !== i; }) }); }} style={{ background: "#fde8ed", border: "none", borderRadius: 6, padding: "4px 9px", color: C.red, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>x</button>
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
                              <button onClick={function () { setD({ payables: (d.payables || []).filter(function (_, j) { return j !== i; }) }); }} style={{ background: "#fff", border: "1px solid " + C.red, borderRadius: 6, padding: "4px 9px", color: C.red, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>x</button>
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
                                      <button onClick={function () { setD({ stock: (d.stock || []).filter(function (_, j) { return j !== i; }) }); }} style={{ background: "#fde8ed", border: "none", borderRadius: 6, padding: "4px 8px", color: C.red, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>x</button>
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
                                    setObStockModal(true);
                                    setObStockForm({ name: obStockSearch, barcode: genBarcode(), category: "General", unit: getBusinessProfile().units[0] || "Pcs", bulkUnit: "", bulkConversion: "", bulkCost: "", bulkPrice: "", description: "", cost: obStockCost, price: obStockSell, qty: obStockQty });
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
                                  var q = obStockSearch.toLowerCase();
                                  return (p.name || "").toLowerCase() === q || (p.productId || "") === q || (p.barcode || "").toLowerCase() === q;
                                });
                                if (existProd) {
                                  setD({ stock: (d.stock || []).concat([{ name: existProd.name, barcode: existProd.barcode, category: existProd.category, unit: existProd.unit || "Pcs", bulkUnit: existProd.bulkUnit || "", bulkConversion: existProd.bulkConversion || 0, bulkCost: existProd.bulkCost || 0, bulkPrice: existProd.bulkPrice || 0, description: existProd.description || "", cost: cost || existProd.cost, price: sell || existProd.price, qty: qty, _srcProdId: existProd.id, _existingProduct: true }]) });
                                } else {
                                  /* New product */
                                  var obId = "OB" + uid().slice(0, 6).toUpperCase();
                                  setD({ stock: (d.stock || []).concat([{ name: obStockSearch.trim(), barcode: genBarcode(), category: "General", description: "", cost: cost, price: sell, qty: qty }]) });
                                }
                                setObStockSearch(""); setObStockQty("1"); setObStockCost(""); setObStockSell("");
                                setTimeout(function () { var si = document.getElementById("ob-stock-search"); if (si) si.focus(); }, 50);
                              }
                            }}
                            placeholder="Sell"
                            style={{ width: "100%", border: "1.5px solid #93c5fd", borderRadius: 6, padding: "5px 6px", fontSize: 12, textAlign: "right", outline: "none", fontFamily: "inherit", background: "#fff" }} />
                          <button onClick={function () {
                            if (!obStockSearch.trim()) return;
                            var qty = parseInt(obStockQty, 10) || 1;
                            var cost = parseFloat(obStockCost) || 0;
                            var sell = parseFloat(obStockSell) || 0;
                            var existProd = filtObProds[0] || (state.products || []).find(function (p) {
                              var q = obStockSearch.toLowerCase();
                              return (p.name || "").toLowerCase() === q || (p.productId || "") === q || (p.barcode || "").toLowerCase() === q;
                            });
                            if (existProd) {
                              setD({ stock: (d.stock || []).concat([{ name: existProd.name, barcode: existProd.barcode, category: existProd.category, unit: existProd.unit || "Pcs", bulkUnit: existProd.bulkUnit || "", bulkConversion: existProd.bulkConversion || 0, bulkCost: existProd.bulkCost || 0, bulkPrice: existProd.bulkPrice || 0, description: existProd.description || "", cost: cost || existProd.cost, price: sell || existProd.price, qty: qty, _srcProdId: existProd.id, _existingProduct: true }]) });
                            } else {
                              setD({ stock: (d.stock || []).concat([{ name: obStockSearch.trim(), barcode: genBarcode(), category: "General", description: "", cost: cost, price: sell, qty: qty }]) });
                            }
                            setObStockSearch(""); setObStockQty("1"); setObStockCost(""); setObStockSell("");
                            setTimeout(function () { var si = document.getElementById("ob-stock-search"); if (si) si.focus(); }, 50);
                          }} disabled={!obStockSearch.trim()}
                            style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: obStockSearch.trim() ? "linear-gradient(135deg,#0077e6,#2255d4)" : C.border, color: "#fff", fontWeight: 800, fontSize: 16, cursor: obStockSearch.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
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
                              <button onClick={function () { setD({ assets: (d.assets || []).filter(function (_, j) { return j !== i; }) }); }} style={{ background: "#fff", border: "1px solid #6a1b9a", borderRadius: 6, padding: "4px 9px", color: "#6a1b9a", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>x</button>
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
                          <button onClick={function () { obCommit(d); showAlert("Opening Balance saved successfully!"); }} style={{ flex: 1, padding: "13px", background: "linear-gradient(135deg,#1b5e20,#2e7d32)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
                            Save Opening Balance
                          </button>
                        </div>
                        {obData.completed && (
                          <button onClick={function () { setObEditMode(false); setObDraft(null); setObStep(1); }} style={{ padding: "10px", background: "#f0f4ff", color: C.textMd, border: "1.5px solid " + C.border, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                            Cancel Edit
                          </button>
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
  );
};
export default Accounts;
