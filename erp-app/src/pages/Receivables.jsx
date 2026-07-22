import React, { useEffect, useState } from "react";
import { saleReturnUiStatus } from "../utils/returnDisplay.js";
import { isVoidedTxn } from "../utils/voidInvoice.js";
import ReturnDetailsPanel from "../components/ReturnDetailsPanel.jsx";
import { ActBtn, ActBtnGroup, actBtnCellStyle } from "../components/ActBtn.jsx";
import { LIST_PAGE_SIZE } from "../utils/listPage.js";
import { stampUpdatedAt, stampCustomerBalance, stampTransactionIsoDateTime } from "../utils/stampUpdatedAt.js";
import {
  buildInvoiceEditLockIdentity,
  checkForeignInvoiceEditLock,
  findActiveInvoiceEditLock,
  formatInvoiceEditLockMessage,
  readInvoiceEditLocks,
} from "../utils/invoiceEditLocks.js";
import {
  assertPaymentFitsSaleBalance,
  loadFreshSaleForPayment,
  pushKeysNow,
} from "../utils/concurrencyGuards.js";
import { MoneyInOutModal } from "../components/MoneyInOutModal.jsx";
import PrintFormatChooser from "../components/PrintFormatChooser.jsx";
import { resolveThermalFormat } from "../utils/printFormat.js";
import { MoneyReceiptDoc } from "../components/MoneyReceiptDoc.jsx";

/* ═══════════════════════════════════════════════════════════
   ENHANCED RECEIVABLES — Sales invoices + Manual (Loan Given, Other)
   ═══════════════════════════════════════════════════════════ */
var EnhancedReceivables = function (props) {
  var state = props.state;
  var setState = props.setState;
  var S = props.S;
  var today = props.today;
  var uid = props.uid;
  var tcTrialGuard = props.tcTrialGuard;
  var showAlert = props.showAlert;
  var showConfirm = props.showConfirm;
  var addAudit = props.addAudit;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var C = props.C;
  var StatCard = props.StatCard;
  var Card = props.Card;
  var Btn = props.Btn;
  var Modal = props.Modal;
  var Input = props.Input;
  var Sel = props.Sel;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var fmtDateFull = props.fmtDateFull;
  var SplitPaymentModal = props.SplitPaymentModal;
  var usePager = props.usePager;
  var Pager = props.Pager;
  var resolvePaymentCreditTargetIds = props.resolvePaymentCreditTargetIds;
  var warnPaymentCustomerMatchSafety = props.warnPaymentCustomerMatchSafety;
  var maybeShowPaymentMatchToasts = props.maybeShowPaymentMatchToasts;
  var showPaymentDupPick = props.showPaymentDupPick;
  var toastAfterCustomerPaymentApplied = props.toastAfterCustomerPaymentApplied;

  var [rtab, setRtab] = useState("all");
  var [search, setSearch] = useState("");
  var [addModal, setAddModal] = useState(false);
  var [payModal, setPayModal] = useState(null);
  var [splitPayModal, setSplitPayModal] = useState(null);
  var [payAmt, setPayAmt] = useState("");
  var [payMethod, setPayMethod] = useState("Cash");
  var [payNote, setPayNote] = useState("");
  var [chequeList, setChequeList] = useState([]);   /* multi-cheque: [{no,bank,amount,due}] */
  var [chqForm, setChqForm] = useState({ no: "", bank: "", amount: "", due: today() });
  var [viewItem, setViewItem] = useState(null);
  var [editItem, setEditItem] = useState(null);
  var [docView, setDocView] = useState(null); /* sale object for View & Print */
  var [receiptView, setReceiptView] = useState(null); /* manual money-out receipt */
  var [docFmt, setDocFmt] = useState(function () { return (state.settings && state.settings.invoiceDefaultSize) || "a4"; });
  var [docWarranty, setDocWarranty] = useState(false);
  var [printFmtOpen, setPrintFmtOpen] = useState(false);
  var [pendingPrintFmt, setPendingPrintFmt] = useState(null);
  var [printTarget, setPrintTarget] = useState(null); /* "sale" | "receipt" */

  var InvoiceA4 = props.InvoiceA4;
  var InvoiceThermal = props.InvoiceThermal;
  var PaymentBreakdown = props.PaymentBreakdown;
  var Badge = props.Badge;
  var WABtn = props.WABtn;
  var fmtStock = props.fmtStock || function (q) { return q; };
  var fmtDate = props.fmtDate || fmtDateFull;
  var PRINT_FONT_LINK = props.PRINT_FONT_LINK || "";
  var escapeHtml = props.escapeHtml || function (s) { return String(s == null ? "" : s); };
  var shareViaWhatsApp = props.shareViaWhatsApp;

  var invThermalFmt = resolveThermalFormat(state.settings || {});
  var invPrintFmtOptions = [
    ["a4", "A4"],
    ["a5", "A5"],
    [invThermalFmt, invThermalFmt === "thermal58" ? "58mm" : "80mm"],
  ];

  var printInvoiceDoc = function (sale, fmt) {
    var el = document.getElementById("arap-inv-preview-" + sale.id);
    if (!el) return;
    var isA5 = fmt === "a5";
    var isThermal = fmt === "thermal" || fmt === "thermal58" || fmt === "thermal80";
    var thermalBodyW = fmt === "thermal58" ? "218px" : "302px";
    var pageSize = fmt === "thermal58" ? "58mm auto" : (fmt === "thermal80" || fmt === "thermal") ? "80mm auto" : isA5 ? "A5" : "A4";
    var margin = isThermal ? "3mm" : "8mm";
    var bodyW = isThermal ? "body{background:#fff;font-family:'Courier New',monospace;width:" + thermalBodyW + ";}" : "body{background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;}";
    var css = "<style>*{box-sizing:border-box;margin:0;padding:0;}html,body{height:auto;}" + bodyW + "@page{size:" + pageSize + " portrait;margin:" + margin + ";}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>";
    var w = window.open("", "_blank", "width=900,height=760");
    if (!w) return;
    w.document.write("<!DOCTYPE html><html><head>" + PRINT_FONT_LINK + "<title>Invoice " + escapeHtml(sale.invoiceNo || "") + "</title>" + css + "</head><body>" + el.innerHTML + "</body></html>");
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 500);
  };

  var whatsappInvoiceDoc = function (sale, fmt) {
    var el = document.getElementById("arap-inv-preview-" + sale.id);
    if (!el) { showAlert("Invoice preview not ready. Please try again."); return; }
    if (typeof shareViaWhatsApp !== "function") { showAlert("WhatsApp share is not available."); return; }
    var isA5 = fmt === "a5";
    var isThermal = fmt === "thermal" || fmt === "thermal58" || fmt === "thermal80";
    var thermalBodyW = fmt === "thermal58" ? "218px" : "302px";
    var pageSize = fmt === "thermal58" ? "58mm auto" : (fmt === "thermal80" || fmt === "thermal") ? "80mm auto" : isA5 ? "A5" : "A4";
    var margin = isThermal ? "3mm" : "8mm";
    var bodyW = isThermal ? "body{background:#fff;font-family:'Courier New',monospace;width:" + thermalBodyW + ";}" : "body{background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;}";
    var css = "<style>*{box-sizing:border-box;margin:0;padding:0;}html,body{height:auto;}" + bodyW + "@page{size:" + pageSize + (isThermal ? "" : " portrait") + ";margin:" + margin + ";}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>";
    var pageFormat = isThermal ? (fmt === "thermal58" ? "thermal58" : "thermal80") : (isA5 ? "a5" : "a4");
    var filename = "Invoice-" + (sale.invoiceNo || sale.id.slice(0, 8));
    shareViaWhatsApp(el.innerHTML, filename, sale.customerPhone || "", { headStyles: css, pageFormat: pageFormat });
  };

  var whatsappReceiptDoc = function (rcp, fmt) {
    var el = document.getElementById("arap-rcp-preview-" + rcp.id);
    if (!el) { showAlert("Receipt preview not ready. Please try again."); return; }
    if (typeof shareViaWhatsApp !== "function") { showAlert("WhatsApp share is not available."); return; }
    var isA5 = fmt === "a5";
    var isThermal = fmt === "thermal" || fmt === "thermal58" || fmt === "thermal80";
    var pageSize = fmt === "thermal58" ? "58mm auto" : (fmt === "thermal80" || fmt === "thermal") ? "80mm auto" : isA5 ? "A5" : "A4";
    var margin = isThermal ? "3mm" : "8mm";
    var css = "<style>*{box-sizing:border-box;margin:0;padding:0;}html,body{height:auto;}body{background:#fff;font-family:'Segoe UI',Arial,sans-serif;}@page{size:" + pageSize + (isThermal ? "" : " portrait") + ";margin:" + margin + ";}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>";
    var pageFormat = isThermal ? (fmt === "thermal58" ? "thermal58" : "thermal80") : (isA5 ? "a5" : "a4");
    var filename = "Receipt-" + (rcp.receiptNo || rcp.id.slice(0, 8));
    shareViaWhatsApp(el.innerHTML, filename, "", { headStyles: css, pageFormat: pageFormat });
  };

  var printReceiptDoc = function (rcp, fmt) {
    var el = document.getElementById("arap-rcp-preview-" + rcp.id);
    if (!el) return;
    var isA5 = fmt === "a5";
    var isThermal = fmt === "thermal" || fmt === "thermal58" || fmt === "thermal80";
    var pageSize = fmt === "thermal58" ? "58mm auto" : (fmt === "thermal80" || fmt === "thermal") ? "80mm auto" : isA5 ? "A5" : "A4";
    var margin = isThermal ? "3mm" : "8mm";
    var css = "<style>*{box-sizing:border-box;margin:0;padding:0;}html,body{height:auto;}body{background:#fff;font-family:'Segoe UI',Arial,sans-serif;}@page{size:" + pageSize + " portrait;margin:" + margin + ";}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>";
    var w = window.open("", "_blank", "width=900,height=760");
    if (!w) return;
    w.document.write("<!DOCTYPE html><html><head>" + PRINT_FONT_LINK + "<title>Receipt " + escapeHtml(rcp.receiptNo || "") + "</title>" + css + "</head><body>" + el.innerHTML + "</body></html>");
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 500);
  };

  useEffect(function () {
    if (!pendingPrintFmt) return undefined;
    var fmt = pendingPrintFmt;
    var t = setTimeout(function () {
      if (printTarget === "receipt" && receiptView) {
        printReceiptDoc(receiptView, fmt);
      } else if (docView) {
        printInvoiceDoc(Object.assign({}, docView, { includeWarranty: docWarranty }), fmt);
      }
      setPendingPrintFmt(null);
      setPrintTarget(null);
    }, 120);
    return function () { clearTimeout(t); };
  }, [pendingPrintFmt, docFmt, docView, docWarranty, receiptView, printTarget]);

  var manualRecs = S.get("tc3_manualReceivables", []);
  var lockIdentity = buildInvoiceEditLockIdentity({
    currentUser: props.currentUser || null,
    clientMachineLabel: String(props.clientMachineLabel || "").trim(),
  });
  var assertSaleUnlockedForPayment = function (saleId) {
    var lock = findActiveInvoiceEditLock(readInvoiceEditLocks(S), saleId);
    if (lock && String(lock.deviceId || "") !== String(lockIdentity.deviceId || "")) {
      showAlert(formatInvoiceEditLockMessage(lock) + " Cannot record payment until they finish.");
      return false;
    }
    return true;
  };

  /* ── processSplitSale: handles split/multi-method payments on sales invoices ── */
  var processSplitSale = function (saleId, splits, __forcedId, __legacyAll) {
    var runSplit = function (sale, salesBase) {
    if (!sale) return;
    if (isVoidedTxn(sale)) { showAlert("Cannot record payment on a voided invoice."); return; }
    if (!assertSaleUnlockedForPayment(saleId)) return;
    var newPh = (sale.paymentHistory || []).slice();
    var newCheques = (state.cheques || []).slice();
    var totalAdded = 0;
    var totalNonCheque = 0;
    splits.forEach(function (row) {
      var amt = parseFloat(row.amount) || 0;
      if (amt <= 0) return;
      totalAdded += amt;
      if (row.method === "Cheque") {
        var chTs = new Date().toISOString();
        var newChq = stampTransactionIsoDateTime({ id: uid(), type: "incoming", status: "Pending", chequeNo: (row.chequeNo || "").trim(), bankName: (row.chequeBankName || "").trim(), amount: amt, dueDate: row.chequeDueDate || today(), issuedDate: today(), customerId: sale.customerId || "", customerName: sale.customerName || "", saleId: saleId, invoiceNo: sale.invoiceNo || "", note: row.note || "", createdAt: chTs, updatedAt: chTs }, chTs);
        newCheques.push(newChq);
        newPh.push({ id: uid(), date: today(), amount: 0, cashMethod: "Cheque", note: "Cheque #" + (row.chequeNo || "") + " " + getCurrencySymbol() + " " + fmtNum(amt) + " (Pending — due " + (row.chequeDueDate || today()) + ")" + (row.note ? " | " + row.note : ""), chequeId: newChq.id });
      } else {
        var cm = (row.method === "Bank" || row.method === "Online" || row.method === "Card") ? "Bank" : "Cash";
        totalNonCheque += amt;
        newPh.push({ id: uid(), date: today(), amount: amt, cashMethod: cm, note: (row.method || "Cash") + (row.note ? ": " + row.note : "") });
      }
    });
    var fit = assertPaymentFitsSaleBalance(sale, totalNonCheque);
    if (!fit.ok) { showAlert(fit.message); return; }
    var newPaid = (sale.paid || 0) + totalNonCheque;
    var newBal = sale.total - newPaid;
    var newStatus = newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
    var updSale = stampUpdatedAt(Object.assign({}, sale, { paid: newPaid, balance: newBal, payStatus: newStatus, paymentHistory: newPh }));
    var res = resolvePaymentCreditTargetIds(state.customers, sale, { forcedCustomerId: __forcedId, legacyApplyAllNameMatches: __legacyAll });
    if (res.needPicker && res.candidates.length) {
      maybeShowPaymentMatchToasts(sale, res);
      showPaymentDupPick({
        candidates: res.candidates,
        onSelect: function (id) { processSplitSale(saleId, splits, id, false); },
        onSkip: function () { processSplitSale(saleId, splits, null, true); }
      });
      return;
    }
    warnPaymentCustomerMatchSafety(state.customers, sale, "EnhancedReceivables.processSplitSale");
    maybeShowPaymentMatchToasts(sale, res);
    var nc = state.customers.map(function (c) { return res.ids.indexOf(c.id) >= 0 ? stampCustomerBalance(Object.assign({}, c, { credit: Math.max(0, (c.credit || 0) - totalNonCheque) }), null, c) : c; });
    var ns = (salesBase || state.sales).map(function (s) { return s.id === saleId ? updSale : s; });
    S.set("tc3_sales", ns); S.set("tc3_customers", nc); S.set("tc3_cheques", newCheques);
    try { pushKeysNow([["tc3_sales", ns], ["tc3_customers", nc], ["tc3_cheques", newCheques]]); } catch (_e) { /* ignore */ }
    setState(function (st) { return Object.assign({}, st, { sales: ns, customers: nc, cheques: newCheques }); });
    setSplitPayModal(null);
    addAudit("Payment " + getCurrencySymbol() + " " + fmtNum(totalAdded), sale.invoiceNo || saleId.slice(0, 8));
    toastAfterCustomerPaymentApplied(state.customers, res);
    };

    loadFreshSaleForPayment(S, saleId)
      .then(function (fresh) {
        var sale = fresh.sale || state.sales.find(function (s) { return s.id === saleId; });
        if (!sale) { showAlert("Invoice not found. Refresh and try again."); return; }
        if (fresh.sales) setState(function (st) { return Object.assign({}, st, { sales: fresh.sales }); });
        return checkForeignInvoiceEditLock(S, saleId, lockIdentity).then(function (fl) {
          if (fl) {
            showAlert(formatInvoiceEditLockMessage(fl) + " Cannot record payment until they finish.");
            return;
          }
          runSplit(sale, fresh.sales || state.sales);
        });
      })
      .catch(function () {
        runSplit(state.sales.find(function (s) { return s.id === saleId; }), state.sales);
      });
  };

  /* ── Build unified list ── */
  var salesEntries = (state.sales || []).filter(function (s) { return !isVoidedTxn(s); }).map(function (s) {
    var bal = Math.max(0, s.total - (s.paid || 0));
    var retMeta = saleReturnUiStatus(s, state.salesReturns);
    return { id: s.id, _type: "sale", date: s.date, source: s.customerName || "Walk-in", type: "Sales Invoice", amount: s.total, paid: s.paid || 0, balance: bal, reference: s.invoiceNo || s.id.slice(0, 8), note: "", paymentHistory: s.paymentHistory || [], _saleObj: s, _returnMeta: retMeta };
  });
  var manualEntries = manualRecs.map(function (mr) {
    var paid = (mr.paymentHistory || []).reduce(function (a, p) { return a + p.amount; }, 0);
    var bal = Math.max(0, mr.amount - paid);
    return { id: mr.id, _type: "manual", date: mr.date, source: mr.person, type: mr.type, amount: mr.amount, paid: paid, balance: bal, reference: mr.receiptNo || mr.reference || "", note: mr.note || "", receiptNo: mr.receiptNo || "", paymentHistory: mr.paymentHistory || [], _manualObj: mr };
  });
  var allEntries = salesEntries.concat(manualEntries).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });

  var filtered = allEntries.filter(function (e) {
    var q = search.toLowerCase();
    var matchQ = !q || e.source.toLowerCase().includes(q) || (e.reference || "").toLowerCase().includes(q);
    var matchTab = rtab === "all" || (rtab === "outstanding" && e.balance > 0) || (rtab === "cleared" && e.balance <= 0) || (rtab === "manual" && e._type === "manual") || (rtab === "sales" && e._type === "sale");
    return matchQ && matchTab;
  });
  var recPager = usePager(filtered, LIST_PAGE_SIZE);

  var totalReceivable = allEntries.reduce(function (a, e) { return a + e.balance; }, 0);
  var totalManual = manualEntries.reduce(function (a, e) { return a + e.balance; }, 0);
  var totalSales = salesEntries.reduce(function (a, e) { return a + e.balance; }, 0);

  var applyErSaleCashPayment = function (item, amt, forcedId, legacyAll) {
    var apply = function (sale, salesBase) {
      if (!sale) return true;
      if (isVoidedTxn(sale)) { showAlert("Cannot record payment on a voided invoice."); return false; }
      if (!assertSaleUnlockedForPayment(item.id)) return false;
      var fit = assertPaymentFitsSaleBalance(sale, amt);
      if (!fit.ok) { showAlert(fit.message); return false; }
      var res = resolvePaymentCreditTargetIds(state.customers, sale, { forcedCustomerId: forcedId, legacyApplyAllNameMatches: legacyAll });
      if (res.needPicker && res.candidates.length) {
        maybeShowPaymentMatchToasts(sale, res);
        showPaymentDupPick({
          candidates: res.candidates,
          onSelect: function (id) { applyErSaleCashPayment(item, amt, id, false); },
          onSkip: function () { applyErSaleCashPayment(item, amt, null, true); }
        });
        return false;
      }
      var newPaid = (sale.paid || 0) + amt;
      var newBal = sale.total - newPaid;
      var newStatus = newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
      var ph = (sale.paymentHistory || []).concat([{ id: uid(), date: today(), amount: amt, cashMethod: payMethod, note: payNote || "Payment received" }]);
      var updSale = stampUpdatedAt(Object.assign({}, sale, { paid: newPaid, balance: newBal, payStatus: newStatus, paymentHistory: ph }));
      warnPaymentCustomerMatchSafety(state.customers, sale, "EnhancedReceivables.recordPayment");
      maybeShowPaymentMatchToasts(sale, res);
      var nc = state.customers.map(function (c) { return res.ids.indexOf(c.id) >= 0 ? stampCustomerBalance(Object.assign({}, c, { credit: Math.max(0, (c.credit || 0) - amt) }), null, c) : c; });
      var ns = (salesBase || state.sales).map(function (s) { return s.id === item.id ? updSale : s; });
      S.set("tc3_sales", ns); S.set("tc3_customers", nc);
      try { pushKeysNow([["tc3_sales", ns], ["tc3_customers", nc]]); } catch (_e) { /* ignore */ }
      addAudit("Receivable Payment: Rs " + amt, item.reference || (sale.invoiceNo || sale.id.slice(0, 8)));
      setState(function (st) { return Object.assign({}, st, { sales: ns, customers: nc }); });
      toastAfterCustomerPaymentApplied(state.customers, res);
      return true;
    };

    /* Async refresh — caller treats false as "wait / aborted"; true as done.
       When network refresh is in flight we return false and complete in then(). */
    var localSale = state.sales.find(function (s) { return s.id === item.id; });
    if (!localSale) return true;
    var pending = { done: false, ok: true };
    loadFreshSaleForPayment(S, item.id)
      .then(function (fresh) {
        var sale = fresh.sale || localSale;
        if (fresh.sales) setState(function (st) { return Object.assign({}, st, { sales: fresh.sales }); });
        return checkForeignInvoiceEditLock(S, item.id, lockIdentity).then(function (fl) {
          if (fl) {
            showAlert(formatInvoiceEditLockMessage(fl) + " Cannot record payment until they finish.");
            pending.ok = false;
            return;
          }
          pending.ok = apply(sale, fresh.sales || state.sales);
          if (pending.ok) {
            setPayModal(null); setPayAmt(""); setPayMethod("Cash"); setPayNote("");
          }
        });
      })
      .catch(function () {
        pending.ok = apply(localSale, state.sales);
        if (pending.ok) {
          setPayModal(null); setPayAmt(""); setPayMethod("Cash"); setPayNote("");
        }
      });
    /* Defer modal close to async path for sale cash payments */
    return false;
  };

  var recordPayment = function () {
    var amt = parseFloat(payAmt);
    if (!amt || amt <= 0) { showAlert("Enter a valid payment amount."); return; }
    var item = payModal;
    /* ── Cheque: save ALL cheques in chequeList ── */
    if (payMethod === "Cheque") {
      if (chequeList.length === 0) { showAlert("Add at least one cheque using the + Add Cheque button."); return; }
      if (item._type === "sale" && !assertSaleUnlockedForPayment(item.id)) return;
      var chqTotal = chequeList.reduce(function (a, c) { return a + (parseFloat(c.amount) || 0); }, 0);
      if (chqTotal <= 0) { showAlert("Total cheque amount must be greater than zero."); return; }
      var nch = (state.cheques || []).slice();
      var phEntries = [];
      chequeList.forEach(function (chq) {
        var chqAmt = parseFloat(chq.amount) || 0;
        if (chqAmt <= 0 || !chq.no.trim()) return;
        var chTs = new Date().toISOString();
        var newCheque = stampTransactionIsoDateTime({
          id: uid(), type: "incoming", status: "Pending",
          chequeNo: chq.no.trim(), bankName: (chq.bank || "").trim(),
          amount: chqAmt, dueDate: chq.due || today(), issuedDate: today(),
          customerId: item._saleObj ? (item._saleObj.customerId || "") : "",
          customerName: item.source || "",
          saleId: item._type === "sale" ? item.id : "",
          invoiceNo: item.reference || "",
          manualReceivableId: item._type === "manual" ? item.id : "",
          note: payNote || "", createdAt: chTs, updatedAt: chTs
        }, chTs);
        nch.push(newCheque);
        phEntries.push({ id: uid(), date: today(), amount: 0, cashMethod: "Cheque",
          note: "Cheque #" + chq.no.trim() + " " + getCurrencySymbol() + " " + fmtNum(chqAmt) + " (Pending — due " + chq.due + ")" + (payNote ? " | " + payNote : ""),
          chequeId: newCheque.id });
      });
      if (item._type === "sale") {
        var sale = state.sales.find(function (s) { return s.id === item.id; });
        if (sale) {
          var updSale = stampUpdatedAt(Object.assign({}, sale, { paymentHistory: (sale.paymentHistory || []).concat(phEntries) }));
          var ns = state.sales.map(function (s) { return s.id === item.id ? updSale : s; });
          S.set("tc3_sales", ns); S.set("tc3_cheques", nch);
          addAudit(chequeList.length + " Cheque(s) Received " + getCurrencySymbol() + " " + fmtNum(chqTotal), item.reference || "");
          setState(function (st) { return Object.assign({}, st, { sales: ns, cheques: nch }); });
        }
      } else {
        var list0 = S.get("tc3_manualReceivables", []);
        var upd0 = list0.map(function (mr) {
          return mr.id !== item.id ? mr : stampUpdatedAt(Object.assign({}, mr, { paymentHistory: (mr.paymentHistory || []).concat(phEntries) }));
        });
        S.set("tc3_manualReceivables", upd0); S.set("tc3_cheques", nch);
        addAudit(chequeList.length + " Cheque(s) Received " + getCurrencySymbol() + " " + fmtNum(chqTotal), item.source || "");
        setState(function (st) { return Object.assign({}, st, { cheques: nch, _recTs: Date.now() }); });
      }
      setPayModal(null); setPayAmt(""); setPayMethod("Cash"); setPayNote(""); setChequeList([]); setChqForm({ no: "", bank: "", amount: "", due: today() });
      showAlert("✅ " + chequeList.length + " cheque(s) recorded (total " + getCurrencySymbol() + " " + fmtNum(chqTotal) + "). Go to Cheque Register to mark cleared when received.");
      return;
    }
    if (item._type === "sale") {
      if (applyErSaleCashPayment(item, amt) === false) return;
    } else {
      var list = S.get("tc3_manualReceivables", []);
      var updated = list.map(function (mr) {
        if (mr.id !== item.id) return mr;
        var ph2 = (mr.paymentHistory || []).concat([{ id: uid(), date: today(), amount: amt, cashMethod: payMethod, note: payNote || "Payment received" }]);
        return stampUpdatedAt(Object.assign({}, mr, { paymentHistory: ph2 }));
      });
      S.set("tc3_manualReceivables", updated);
      addAudit("Manual Receivable Payment: Rs " + amt, item.source || item.reference || "");
      setState(function (st) { return Object.assign({}, st, { _recTs: Date.now() }); });
    }
    setPayModal(null); setPayAmt(""); setPayMethod("Cash"); setPayNote("");
  };

  var deleteManual = function (id) {
    var entry = S.get("tc3_manualReceivables", []).find(function (e) { return e.id === id; });
    /* FIX: Block deletion if payments have been recorded — would silently erase cash history */
    if (entry && (entry.paymentHistory || []).length > 0) {
      showAlert("Cannot delete: this receivable has payment history recorded.\nEdit the amount to Rs 0 or mark it as fully collected instead.");
      return;
    }
    showConfirm("Delete this receivable entry?", function () {
      var list = S.get("tc3_manualReceivables", []).filter(function (e) { return e.id !== id; });
      /* FIX Bug 2: Void any pending cheques linked to this receivable */
      var nch = (state.cheques || []).map(function (ch) {
        if (ch.manualReceivableId === id && ch.status === "Pending") {
          return Object.assign({}, ch, { status: "Voided", voidedDate: today(), voidReason: "Linked receivable deleted" });
        }
        return ch;
      });
      S.set("tc3_manualReceivables", list); S.set("tc3_cheques", nch);
      setState(function (st) { return Object.assign({}, st, { cheques: nch, _recTs: Date.now() }); });
      if (viewItem && viewItem.id === id) setViewItem(null);
    });
  };

  var outCount = allEntries.filter(function (e) { return e.balance > 0; }).length;
  var clearedCount = allEntries.filter(function (e) { return e.balance <= 0; }).length;
  var totalBilled = allEntries.reduce(function (a, e) { return a + e.amount; }, 0);
  var totalCollected = allEntries.reduce(function (a, e) { return a + e.paid; }, 0);
  var collectPct = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;
  var RTABS = [
    ["all", "All", allEntries.length],
    ["outstanding", "Outstanding", outCount],
    ["cleared", "Cleared", clearedCount],
    ["sales", "Sales", salesEntries.length],
    ["manual", "Manual", manualEntries.length],
  ];
  var filtTotal = filtered.reduce(function (a, e) { return a + e.amount; }, 0);
  var filtPaid = filtered.reduce(function (a, e) { return a + e.paid; }, 0);
  var filtBal = filtered.reduce(function (a, e) { return a + e.balance; }, 0);

  return (
    <div className="erp-page erp-arap-modern is-recv">
      <div className="erp-arap-chrome">
        <div className="erp-arap-topbar">
          <div className="erp-arap-topbar-brand">
            <div className="erp-arap-brand-ico" aria-hidden="true">MR</div>
            <div>
              <h1 className="erp-arap-header-title">Receivables</h1>
              <p className="erp-arap-header-sub">Money to collect · sales &amp; loans</p>
            </div>
          </div>
          <div className="erp-arap-kpi-row" aria-label="Receivable totals">
            <div className="erp-arap-kpi is-red">
              <span className="erp-arap-kpi-lbl">Outstanding</span>
              <span className="erp-arap-kpi-val">{getCurrencySymbol()} {fmtNum(totalReceivable)}</span>
              <span className="erp-arap-kpi-sub">{outCount} pending</span>
            </div>
            <div className="erp-arap-kpi is-blue">
              <span className="erp-arap-kpi-lbl">From sales</span>
              <span className="erp-arap-kpi-val">{getCurrencySymbol()} {fmtNum(totalSales)}</span>
              <span className="erp-arap-kpi-sub">{salesEntries.length} invoices</span>
            </div>
            <div className="erp-arap-kpi is-purple">
              <span className="erp-arap-kpi-lbl">Manual</span>
              <span className="erp-arap-kpi-val">{getCurrencySymbol()} {fmtNum(totalManual)}</span>
              <span className="erp-arap-kpi-sub">{manualEntries.filter(function (e) { return e.balance > 0; }).length} pending</span>
            </div>
            <div className="erp-arap-kpi is-green">
              <span className="erp-arap-kpi-lbl">Collected</span>
              <span className="erp-arap-kpi-val">{collectPct}%</span>
              <div className="erp-arap-mini-bar"><i style={{ width: Math.min(100, Math.max(0, collectPct)) + "%" }} /></div>
              <span className="erp-arap-kpi-sub">{getCurrencySymbol()} {fmtNum(totalCollected)}</span>
            </div>
          </div>
          <button type="button" className="erp-arap-add is-out" onClick={function () { setAddModal(true); }}>
            <span className="erp-arap-add-ico">↓</span> Money Out
          </button>
        </div>
        <div className="erp-arap-tabs" role="tablist" aria-label="Receivable filters">
          {RTABS.map(function (t) {
            var active = rtab === t[0];
            return (
              <button
                key={t[0]}
                type="button"
                role="tab"
                aria-selected={active}
                className={"erp-arap-tab" + (active ? " is-active" : "")}
                onClick={function () { setRtab(t[0]); }}
              >
                <span>{t[1]}</span>
                <span className="erp-arap-tab-count">{t[2]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="erp-arap-body">
        <div className="erp-arap-panel">
          <div className="erp-arap-toolbar">
            <div className="erp-arap-search-wrap">
              <input
                className="erp-arap-field"
                value={search}
                onChange={function (e) { setSearch(e.target.value); }}
                placeholder="Search source, reference…"
                aria-label="Search receivables"
              />
            </div>
            {search ? (
              <button type="button" className="erp-arap-btn-clear" onClick={function () { setSearch(""); }}>Clear</button>
            ) : null}
            <span className="erp-arap-filter-meta">{filtered.length} shown · {allEntries.length} total</span>
          </div>
          <div className="erp-arap-table-wrap">
            <table className="erp-arap-table">
              <thead>
                <tr>
                  <th style={{ width: "9%" }}>Date</th>
                  <th style={{ width: "18%" }}>Source</th>
                  <th style={{ width: "15%" }}>Type</th>
                  <th style={{ width: "12%" }}>Total</th>
                  <th style={{ width: "11%" }}>Paid</th>
                  <th style={{ width: "12%" }}>Balance</th>
                  <th style={{ width: "11%" }}>Reference</th>
                  <th style={{ width: "12%" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="erp-arap-empty">No receivables found</td></tr>
                )}
                {recPager.slice.map(function (e) {
                  var isOut = e.balance > 0;
                  var saleRet = e._type === "sale" && e._returnMeta ? e._returnMeta : { hasReturns: false };
                  var hasPendChq = isOut && (state.cheques || []).some(function (ch) {
                    return ch.saleId === (e._saleObj && e._saleObj.id) && ch.status === "Pending";
                  });
                  return (
                    <tr
                      key={e.id}
                      className={"table-row-hover" + (saleRet.hasReturns ? " is-return" : "")}
                      title={saleRet.hasReturns ? "This invoice has return activity" : undefined}
                    >
                      <td>{fmtDateFull(e.date)}</td>
                      <td className="erp-arap-src" title={e.source}>{e.source}</td>
                      <td>
                        <div className="erp-arap-type">
                          <span className={"erp-arap-badge" + (e._type === "sale" ? " is-sale" : " is-manual")}>{e.type}</span>
                          {saleRet.hasReturns ? <span className="erp-arap-ret" title="Has returns">↩</span> : null}
                        </div>
                      </td>
                      <td className="erp-arap-amt">{getCurrencySymbol()} {fmtNum(e.amount)}</td>
                      <td className="erp-arap-amt is-paid">{getCurrencySymbol()} {fmtNum(e.paid)}</td>
                      <td>
                        {isOut
                          ? <span className="erp-arap-bal is-out">{getCurrencySymbol()} {fmtNum(e.balance)}</span>
                          : <span className="erp-arap-bal is-ok">Cleared</span>}
                      </td>
                      <td className="erp-arap-ref" title={e.reference || ""}>{e.reference || "—"}</td>
                      <td style={actBtnCellStyle}>
                        <ActBtnGroup>
                          <ActBtn tone="cyan" title="View details" onClick={function () { setViewItem(e); }} />
                          {hasPendChq ? <span className="erp-arap-pend" title="Has pending cheque(s)">🕐</span> : null}
                          {isOut ? <ActBtn tone="green" icon="pay" title="Record payment" wide onClick={function () { setSplitPayModal(e); }}>Pay</ActBtn> : null}
                          {e._type === "manual" ? <ActBtn tone="red" title="Delete entry" onClick={function () { deleteManual(e.id); }} /> : null}
                        </ActBtnGroup>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="erp-arap-foot">
            {filtered.length > 0 ? (
              <div className="erp-arap-sums">
                <span>Total <b className="is-blue">{getCurrencySymbol()} {fmtNum(filtTotal)}</b></span>
                <span>Collected <b className="is-green">{getCurrencySymbol()} {fmtNum(filtPaid)}</b></span>
                <span>Outstanding <b className="is-red">{getCurrencySymbol()} {fmtNum(filtBal)}</b></span>
              </div>
            ) : null}
            <div className="erp-arap-pager-wrap">
              <Pager pager={recPager} />
            </div>
          </div>
        </div>
      </div>

      {/* Add via shared Money Out modal */}
      {addModal && (
        <MoneyInOutModal
          mode="out"
          S={S}
          today={today}
          uid={uid}
          tcTrialGuard={tcTrialGuard}
          showAlert={showAlert}
          addAudit={addAudit}
          setState={setState}
          onClose={function () { setAddModal(false); }}
          Modal={Modal}
          Input={Input}
          Sel={Sel}
          Btn={Btn}
          C={C}
          getCurrencySymbol={getCurrencySymbol}
          customers={state.customers || []}
          suppliers={state.suppliers || []}
          others={state.others || []}
        />
      )}

      {/* Payment Modal */}
      {payModal && (
        <Modal title={"Record Payment — " + payModal.source} onClose={function () { setPayModal(null); }} medium>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "#f0f9f4", borderRadius: 9, padding: "12px 16px", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700 }}>Outstanding Balance</span>
              <span style={{ fontWeight: 900, color: C.red, fontSize: 16 }}>{getCurrencySymbol()} {fmtNum(payModal.balance)}</span>
            </div>
            <Input label="Payment Amount (Rs) *" type="number" value={payAmt} onChange={function (e) { setPayAmt(e.target.value); }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 5 }}>Received Via</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {[["Cash", "💵 Cash", "#1b5e20", "#f0f9f4"], ["Bank", "🏦 Bank", "#1565c0", "#e8f0fe"], ["Cheque", "🏷 Cheque", "#7c3aed", "#f5f3ff"]].map(function (opt) {
                  var active = (payMethod || "Cash") === opt[0];
                  return <button key={opt[0]} onClick={function () { setPayMethod(opt[0]); }} style={{ flex: 1, padding: "9px 8px", borderRadius: 9, border: "2px solid " + (active ? opt[2] : C.border), background: active ? opt[3] : "#fff", color: active ? opt[2] : C.textMd, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{opt[1]}</button>;
                })}
              </div>
            </div>
            {payMethod === "Cheque" && (
              <div style={{ background: "#f5f3ff", borderRadius: 10, padding: "14px", border: "1px solid #ddd6fe" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#7c3aed", marginBottom: 10 }}>🏷 Cheques Received (add one or more)</div>
                {/* Add cheque row */}
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 1fr 1fr auto", gap: 10, alignItems: "flex-end", marginBottom: 8 }}>
                  <Input label="Cheque No *" value={chqForm.no} onChange={function (e) { setChqForm(function (x) { return Object.assign({}, x, { no: e.target.value }); }); }} placeholder="e.g. 001234" />
                  <Input label="Bank Name" value={chqForm.bank} onChange={function (e) { setChqForm(function (x) { return Object.assign({}, x, { bank: e.target.value }); }); }} placeholder="e.g. HNB" />
                  <Input label="Amount (Rs) *" type="number" value={chqForm.amount} onChange={function (e) { setChqForm(function (x) { return Object.assign({}, x, { amount: e.target.value }); }); }} placeholder="0" />
                  <Input label="Due Date *" type="date" value={chqForm.due} onChange={function (e) { setChqForm(function (x) { return Object.assign({}, x, { due: e.target.value }); }); }} />
                  <button onClick={function () {
                    if (!chqForm.no.trim() || !parseFloat(chqForm.amount)) { showAlert("Enter cheque number and amount."); return; }
                    setChequeList(function (l) { return l.concat([Object.assign({}, chqForm, { id: uid() })]); });
                    setChqForm({ no: "", bank: "", amount: "", due: today() });
                  }} style={{ padding: "10px 18px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>+ Add</button>
                </div>
                {/* Cheque list */}
                {chequeList.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8 }}>
                    {chequeList.map(function (c, i) {
                      return (
                        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", borderRadius: 8, padding: "8px 12px", border: "1px solid #ddd6fe" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed" }}>#{c.no}</span>
                          {c.bank && <span style={{ fontSize: 12, color: C.muted }}>{c.bank}</span>}
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.green, marginLeft: "auto" }}>{getCurrencySymbol()} {fmtNum(parseFloat(c.amount) || 0)}</span>
                          <span style={{ fontSize: 12, color: C.muted }}>Due: {c.due}</span>
                          <button onClick={function () { setChequeList(function (l) { return l.filter(function (_, j) { return j !== i; }); }); }} style={{ background: "#fde8ed", color: C.red, border: "none", borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>✕</button>
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", background: "#ede9fe", borderRadius: 8, fontWeight: 800, fontSize: 13 }}>
                      <span style={{ color: "#7c3aed" }}>{chequeList.length} cheque(s) total</span>
                      <span style={{ color: "#7c3aed" }}>{getCurrencySymbol()} {fmtNum(chequeList.reduce(function (a, c) { return a + (parseFloat(c.amount) || 0); }, 0))}</span>
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 600 }}>⚠ Balance updates only when each cheque is cleared in Cheque Register</div>
              </div>
            )}
            <Input label="Note" value={payNote} onChange={function (e) { setPayNote(e.target.value); }} placeholder="Optional note" />
            <Btn col="green" onClick={recordPayment}>Record Payment</Btn>
            {payModal.paymentHistory && payModal.paymentHistory.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>Payment History</div>
                {payModal.paymentHistory.map(function (ph, i) {
                  var isNegative = (ph.amount || 0) < 0;
                  var isReversal = ph.note && ph.note.toLowerCase().includes("reversed");
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid " + C.borderLight, fontSize: 13 }}>
                      <div>
                        <span style={{ color: isNegative ? C.red : C.text }}>{fmtDateFull(ph.date)} — {ph.cashMethod || "Cash"}</span>
                        {ph.note && <div style={{ fontSize: 11, color: C.muted }}>{ph.note}</div>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, color: isNegative ? C.red : C.green }}>{getCurrencySymbol()} {fmtNum(ph.amount)}</span>
                        {(ph.amount || 0) > 0 && !isReversal && (
                          <button onClick={function () {
                            showConfirm("Reverse this payment of " + getCurrencySymbol() + " " + fmtNum(ph.amount) + "?\n\nA correction entry will be added to cancel it out.", function () {
                              var manRecs = S.get("tc3_manualReceivables", []);
                              var updated = manRecs.map(function (r) {
                                if (r.id !== payModal.id) return r;
                                var reversalEntry = { id: uid(), date: today(), amount: -ph.amount, cashMethod: ph.cashMethod || "Cash", note: "Reversed: " + (ph.note || fmtDateFull(ph.date)) };
                                var newPh = (r.paymentHistory || []).concat([reversalEntry]);
                                var newPaid = newPh.reduce(function (a, e) { return a + (e.amount || 0); }, 0);
                                var newBal = Math.max(0, r.amount - newPaid);
                                return Object.assign({}, r, { paymentHistory: newPh });
                              });
                              S.set("tc3_manualReceivables", updated);
                              setState(function (st) { return Object.assign({}, st); });
                              setSplitPayModal(null); setPayModal(null);
                              showAlert("✅ Payment reversed. A correction entry has been added.");
                            });
                          }} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, border: "1px solid " + C.border, background: "#fff", color: C.red, cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>↩ Reverse</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* View Modal — wide compact receivable detail */}
      {viewItem && (function () {
        var isSale = viewItem._type === "sale";
        var sale = viewItem._saleObj || null;
        var invNo = (sale && sale.invoiceNo) || viewItem.reference || (viewItem.id || "").slice(0, 8);
        var isOut = viewItem.balance > 0;
        var retMeta = isSale && viewItem._returnMeta ? viewItem._returnMeta : { hasReturns: false };
        var items = isSale && sale ? (sale.items || []) : [];
        return (
          <Modal
            className="erp-arap-view-modal is-recv"
            title={isSale ? ("Invoice · " + invNo) : ("Receivable · " + (viewItem.source || "Manual"))}
            subtitle={isSale ? ((viewItem.source || "Walk-in") + " · " + fmtDateFull(viewItem.date)) : (viewItem.type + " · " + fmtDateFull(viewItem.date))}
            onClose={function () { setViewItem(null); }}
            wide
            closeRound
          >
            <div className="erp-arap-view">
              {isOut ? (
                <div className="erp-arap-view-alert is-due">
                  <div>
                    <strong>{isSale ? "Payment due on this invoice" : "Amount still receivable"}</strong>
                    <span>Outstanding balance needs to be collected</span>
                  </div>
                  <b>{getCurrencySymbol()} {fmtNum(viewItem.balance)}</b>
                </div>
              ) : (
                <div className="erp-arap-view-alert is-ok">
                  <div>
                    <strong>Fully cleared</strong>
                    <span>No outstanding balance</span>
                  </div>
                </div>
              )}

              <div className="erp-arap-view-grid">
                <div className="erp-arap-view-card">
                  <div className="erp-arap-view-card-title">{isSale ? "Customer" : "Party"}</div>
                  <div className="erp-arap-view-name">{viewItem.source || "—"}</div>
                  {isSale && sale && sale.customerPhone ? <div className="erp-arap-view-muted">{sale.customerPhone}</div> : null}
                  <div className="erp-arap-view-muted">{fmtDateFull(viewItem.date)}</div>
                  <div className="erp-arap-view-chips">
                    <span className={"erp-arap-badge" + (isSale ? " is-sale" : " is-manual")}>{viewItem.type}</span>
                    {retMeta.hasReturns ? <span className="erp-arap-ret">↩ Returns</span> : null}
                  </div>
                </div>
                <div className="erp-arap-view-card is-money">
                  <div className="erp-arap-view-money-row"><span>Total</span><b className="is-blue">{getCurrencySymbol()} {fmtNum(viewItem.amount)}</b></div>
                  <div className="erp-arap-view-money-row"><span>Collected</span><b className="is-green">{getCurrencySymbol()} {fmtNum(viewItem.paid)}</b></div>
                  <div className="erp-arap-view-money-row is-strong"><span>Balance</span><b className={isOut ? "is-red" : "is-green"}>{isOut ? (getCurrencySymbol() + " " + fmtNum(viewItem.balance)) : "Cleared"}</b></div>
                </div>
              </div>

              {isSale ? (
                <div className="erp-arap-view-doclink">
                  <div>
                    <div className="erp-arap-view-card-title">Sales invoice</div>
                    <button
                      type="button"
                      className="erp-arap-inv-link"
                      onClick={function () {
                        if (!sale) { showAlert("Invoice record not found."); return; }
                        setDocFmt((state.settings && state.settings.invoiceDefaultSize) || "a4");
                        setDocWarranty(false);
                        setDocView(sale);
                      }}
                      title="Open actual invoice"
                    >
                      {invNo}
                    </button>
                    <div className="erp-arap-view-muted">Click invoice number to open the actual invoice</div>
                  </div>
                  <button
                    type="button"
                    className="erp-arap-doc-btn"
                    onClick={function () {
                      if (!sale) { showAlert("Invoice record not found."); return; }
                      setDocFmt((state.settings && state.settings.invoiceDefaultSize) || "a4");
                      setDocWarranty(false);
                      setDocView(sale);
                    }}
                  >
                    Open invoice
                  </button>
                </div>
              ) : (function () {
                var rcpNo = (viewItem._manualObj && viewItem._manualObj.receiptNo) || viewItem.receiptNo || viewItem.reference || "";
                var hasRcp = !!(viewItem._manualObj && (viewItem._manualObj.receiptNo || viewItem._manualObj.id));
                return (
                  <div className="erp-arap-view-doclink">
                    <div>
                      <div className="erp-arap-view-card-title">Money Out receipt</div>
                      {hasRcp ? (
                        <button
                          type="button"
                          className="erp-arap-inv-link"
                          onClick={function () {
                            setDocFmt((state.settings && state.settings.invoiceDefaultSize) || "a4");
                            setReceiptView(viewItem._manualObj || viewItem);
                          }}
                          title="Open receipt"
                        >
                          {rcpNo || "Receipt"}
                        </button>
                      ) : (
                        <b style={{ fontSize: 14 }}>{viewItem.reference || "—"}</b>
                      )}
                      <div className="erp-arap-view-muted">{hasRcp ? "Click receipt number to open the saved receipt" : (viewItem.note || "No receipt on older entries")}</div>
                    </div>
                    {hasRcp ? (
                      <button type="button" className="erp-arap-doc-btn" onClick={function () {
                        setDocFmt((state.settings && state.settings.invoiceDefaultSize) || "a4");
                        setReceiptView(viewItem._manualObj || viewItem);
                      }}>
                        Open receipt
                      </button>
                    ) : null}
                  </div>
                );
              })()}

              {PaymentBreakdown && isSale && sale ? (
                <div className="erp-arap-view-paybreak">
                  <PaymentBreakdown invoice={sale} cheques={state.cheques || []} isSale={true} />
                </div>
              ) : null}

              {items.length > 0 ? (
                <div className="erp-arap-view-items">
                  <div className="erp-arap-view-card-title">Line items</div>
                  <div className="erp-arap-view-table-wrap">
                    <table className="erp-arap-view-table">
                      <thead>
                        <tr><th>#</th><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
                      </thead>
                      <tbody>
                        {items.map(function (it, i) {
                          return (
                            <tr key={i}>
                              <td>{i + 1}</td>
                              <td>{it.name || "Item"}</td>
                              <td>{fmtStock(it.qty, it.unit)}</td>
                              <td>{getCurrencySymbol()} {fmtNum(it.price)}</td>
                              <td>{getCurrencySymbol()} {fmtNum((it.qty || 0) * (it.price || 0))}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {retMeta.hasReturns ? (
                <ReturnDetailsPanel
                  mode="sale"
                  rows={retMeta.rows}
                  originalId={sale ? sale.id : viewItem.id}
                  C={C}
                  getCurrencySymbol={getCurrencySymbol}
                  fmtNum={fmtNum}
                  fmtDateFull={fmtDateFull}
                />
              ) : null}

              {viewItem.paymentHistory && viewItem.paymentHistory.length > 0 ? (
                <div className="erp-arap-view-hist">
                  <div className="erp-arap-view-card-title">Payment history</div>
                  {viewItem.paymentHistory.map(function (ph, i) {
                    var isNegative = (ph.amount || 0) < 0;
                    var isReversal = ph.note && ph.note.toLowerCase().includes("reversed");
                    return (
                      <div key={i} className={"erp-arap-view-hist-row" + (isNegative ? " is-neg" : "")}>
                        <div>
                          <b>{fmtDateFull(ph.date)} · {ph.cashMethod || "Cash"}</b>
                          {ph.note ? <span>{ph.note}</span> : null}
                        </div>
                        <div className="erp-arap-view-hist-amt">
                          <strong className={isNegative ? "is-red" : "is-green"}>{getCurrencySymbol()} {fmtNum(ph.amount)}</strong>
                          {(ph.amount || 0) > 0 && !isReversal && viewItem._type === "manual" ? (
                            <button
                              type="button"
                              className="erp-arap-rev-btn"
                              onClick={function () {
                                showConfirm("Reverse this payment of " + getCurrencySymbol() + " " + fmtNum(ph.amount) + "?\n\nA correction entry will be added to cancel it out.", function () {
                                  var manRecs = S.get("tc3_manualReceivables", []);
                                  var updated = manRecs.map(function (r) {
                                    if (r.id !== viewItem.id) return r;
                                    var reversalEntry = { id: uid(), date: today(), amount: -ph.amount, cashMethod: ph.cashMethod || "Cash", note: "Reversed: " + (ph.note || fmtDateFull(ph.date)) };
                                    return Object.assign({}, r, { paymentHistory: (r.paymentHistory || []).concat([reversalEntry]) });
                                  });
                                  S.set("tc3_manualReceivables", updated);
                                  setState(function (st) { return Object.assign({}, st); });
                                  setViewItem(null);
                                  showAlert("Payment reversed. A correction entry has been added.");
                                });
                              }}
                            >↩ Reverse</button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div className="erp-arap-view-actions">
                {isSale && sale ? (
                  <button type="button" className="erp-arap-doc-btn is-ghost" onClick={function () {
                    setDocFmt((state.settings && state.settings.invoiceDefaultSize) || "a4");
                    setDocWarranty(false);
                    setDocView(sale);
                  }}>
                    View actual invoice
                  </button>
                ) : null}
                {isOut ? (
                  <button type="button" className="erp-arap-doc-btn is-pay" onClick={function () { setViewItem(null); setSplitPayModal(viewItem); }}>
                    Record payment
                  </button>
                ) : null}
                <button type="button" className="erp-arap-doc-btn is-ghost" onClick={function () { setViewItem(null); }}>Close</button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* View & Print — same chrome as Invoices */}
      {docView && InvoiceA4 && (
        <div className="erp-si-fv" role="dialog" aria-modal="true" aria-label="View and print invoice">
          <div className="erp-si-fv-bar">
            <div className="erp-si-fv-bar-left">
              <span className="erp-si-fv-badge" aria-hidden="true">VP</span>
              <div className="erp-si-fv-meta">
                <span className="erp-si-fv-kicker">View &amp; Print</span>
                <div className="erp-si-fv-meta-main">
                  <span className="erp-si-fv-inv">{docView.invoiceNo || docView.id.slice(0, 8)}</span>
                  <span className="erp-si-fv-sub">{docView.customerName || "Walk-in"} · {fmtDate(docView.date)}</span>
                </div>
              </div>
            </div>

            <div className="erp-si-fv-tools">
              <span className="erp-si-fv-tool-label">Format</span>
              <div className="erp-si-fv-formats" role="group" aria-label="Print format">
                {invPrintFmtOptions.map(function (item) {
                  var v = item[0]; var lbl = item[1];
                  var active = docFmt === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      className={"erp-si-fv-fmt" + (active ? " is-active" : "")}
                      onClick={function () { setDocFmt(v); }}
                    >{lbl}</button>
                  );
                })}
              </div>
              <label className="erp-si-fv-warranty">
                <input type="checkbox" checked={docWarranty} onChange={function (e) { setDocWarranty(e.target.checked); }} />
                <span>Warranty</span>
              </label>
            </div>

            <div className="erp-si-fv-actions">
              <button
                type="button"
                className="erp-si-fv-btn is-print"
                onClick={function () { setPrintTarget("sale"); setPrintFmtOpen(true); }}
              >Print</button>
              {WABtn ? (
                <WABtn
                  title="Share as PDF via WhatsApp"
                  onClick={function () {
                    whatsappInvoiceDoc(Object.assign({}, docView, { includeWarranty: docWarranty }), docFmt);
                  }}
                />
              ) : null}
              <button
                type="button"
                className="erp-si-fv-btn is-close"
                onClick={function () { setDocView(null); setDocWarranty(false); }}
                aria-label="Close"
              >✕</button>
            </div>
          </div>

          {saleReturnUiStatus(docView, state.salesReturns).hasReturns ? (
            <div className="erp-si-fv-return">
              <span title="This invoice has return activity">↩ Returns linked to this invoice</span>
            </div>
          ) : null}

          <div className="erp-si-fv-stage">
            <div
              id={"arap-inv-preview-" + docView.id}
              className={"erp-si-fv-sheet" + ((docFmt === "thermal58" || docFmt === "thermal80") ? " is-thermal" : " is-paper")}
            >
              {(docFmt === "thermal58" || docFmt === "thermal80") && InvoiceThermal
                ? <InvoiceThermal
                    inv={Object.assign({}, docView, { includeWarranty: docWarranty })}
                    settings={state.settings}
                    invoiceLang="en"
                    width={docFmt === "thermal58" ? 218 : 302}
                  />
                : <InvoiceA4
                    inv={Object.assign({}, docView, { includeWarranty: docWarranty })}
                    settings={state.settings}
                    invoiceLang="en"
                    size={(docFmt === "thermal58" || docFmt === "thermal80") ? "a4" : docFmt}
                  />
              }
            </div>
          </div>
        </div>
      )}

      <PrintFormatChooser
        open={printFmtOpen}
        settings={state.settings}
        thermalId={invThermalFmt}
        title={printTarget === "receipt" ? "Print receipt" : "Print invoice"}
        hint="Choose A4, A5, or Thermal for your printer."
        onClose={function () { setPrintFmtOpen(false); setPrintTarget(null); }}
        onSelect={function (fmt) {
          setPrintFmtOpen(false);
          setDocFmt(fmt);
          setPendingPrintFmt(fmt);
        }}
        zIndex={13000}
      />

      {/* Money Out receipt — universal View & Print */}
      {receiptView && (function () {
        var rcp = receiptView;
        var rcpNo = rcp.receiptNo || rcp.reference || (rcp.id || "").slice(0, 8);
        var sheetSize = (docFmt === "thermal58" || docFmt === "thermal80") ? "a4" : docFmt;
        return (
          <div className="erp-si-fv is-receipt" role="dialog" aria-modal="true" aria-label="View and print money out receipt">
            <div className="erp-si-fv-bar">
              <div className="erp-si-fv-bar-left">
                <span className="erp-si-fv-badge" aria-hidden="true">VP</span>
                <div className="erp-si-fv-meta">
                  <span className="erp-si-fv-kicker">View &amp; Print</span>
                  <div className="erp-si-fv-meta-main">
                    <span className="erp-si-fv-inv">{rcpNo}</span>
                    <span className="erp-si-fv-sub">Money Out · {rcp.person || "Party"} · {fmtDateFull(rcp.date)}</span>
                  </div>
                </div>
              </div>
              <div className="erp-si-fv-tools">
                <span className="erp-si-fv-tool-label">Format</span>
                <div className="erp-si-fv-formats" role="group" aria-label="Print format">
                  {invPrintFmtOptions.map(function (item) {
                    var v = item[0]; var lbl = item[1];
                    var active = docFmt === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        className={"erp-si-fv-fmt" + (active ? " is-active" : "")}
                        onClick={function () { setDocFmt(v); }}
                      >{lbl}</button>
                    );
                  })}
                </div>
              </div>
              <div className="erp-si-fv-actions">
                <button
                  type="button"
                  className="erp-si-fv-btn is-print"
                  onClick={function () { setPrintTarget("receipt"); setPrintFmtOpen(true); }}
                >Print</button>
                {WABtn ? (
                  <WABtn
                    title="Share as PDF via WhatsApp"
                    onClick={function () { whatsappReceiptDoc(rcp, docFmt); }}
                  />
                ) : null}
                <button type="button" className="erp-si-fv-btn is-close" onClick={function () { setReceiptView(null); }} aria-label="Close">✕</button>
              </div>
            </div>
            <div className="erp-si-fv-stage">
              <div
                id={"arap-rcp-preview-" + rcp.id}
                className={"erp-si-fv-sheet" + ((docFmt === "thermal58" || docFmt === "thermal80") ? " is-thermal" : " is-paper")}
              >
                <MoneyReceiptDoc
                  receipt={rcp}
                  mode="out"
                  size={sheetSize}
                  settings={state.settings}
                  fmtDateFull={fmtDateFull}
                  fmtNum={fmtNum}
                  getCurrencySymbol={getCurrencySymbol}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {splitPayModal && (
        <SplitPaymentModal
          title={"Record Payment — " + (splitPayModal.reference || splitPayModal.invoiceNo || splitPayModal.id.slice(0, 8)) + (splitPayModal.source ? " · " + splitPayModal.source : "")}
          invoiceTotal={splitPayModal.amount}
          alreadyPaid={splitPayModal.paid || 0}
          isSale={true}
          onSave={function (splits) {
            if (splitPayModal._type === "sale") {
              processSplitSale(splitPayModal._saleObj.id, splits);
            } else {
              /* manual receivable */
              var manRecs = S.get("tc3_manualReceivables", []);
              var newCheques = (state.cheques || []).slice();
              var totalAdded = 0;
              var newPh = [];
              splits.forEach(function (row) {
                var amt = parseFloat(row.amount) || 0; if (amt <= 0) return;
                totalAdded += amt;
                if (row.method === "Cheque") {
                  var chTs = new Date().toISOString();
                  var nc = stampTransactionIsoDateTime({ id: uid(), type: "incoming", status: "Pending", chequeNo: (row.chequeNo || "").trim(), bankName: (row.chequeBankName || "").trim(), amount: amt, dueDate: row.chequeDueDate || today(), issuedDate: today(), manualReceivableId: splitPayModal.id, note: row.note || "", createdAt: chTs, updatedAt: chTs }, chTs);
                  newCheques.push(nc);
                  newPh.push({ id: uid(), date: today(), amount: 0, cashMethod: "Cheque", note: "Cheque #" + (row.chequeNo || "") + " " + getCurrencySymbol() + " " + fmtNum(amt) + " (Pending — due " + (row.chequeDueDate || today()) + ")", chequeId: nc.id });
                } else {
                  var cm = (row.method === "Bank" || row.method === "Online" || row.method === "Card") ? "Bank" : "Cash";
                  newPh.push({ id: uid(), date: today(), amount: amt, cashMethod: cm, note: (row.method || "Cash") + (row.note ? ": " + row.note : "") });
                }
              });
              var updMan = manRecs.map(function (mr) { return mr.id === splitPayModal.id ? stampUpdatedAt(Object.assign({}, mr, { paymentHistory: (mr.paymentHistory || []).concat(newPh) })) : mr; });
              S.set("tc3_manualReceivables", updMan); S.set("tc3_cheques", newCheques);
              setState(function (st) { return Object.assign({}, st, { cheques: newCheques }); });
              setSplitPayModal(null);
            }
          }}
          onClose={function () { setSplitPayModal(null); }}
        />
      )}
    </div>
  );
};

var Receivables = EnhancedReceivables;
export default Receivables;
