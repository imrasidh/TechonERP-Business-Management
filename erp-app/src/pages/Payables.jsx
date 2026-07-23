import React, { useEffect, useState } from "react";
import { purchaseReturnUiStatus } from "../utils/returnDisplay.js";
import { isVoidedTxn } from "../utils/voidInvoice.js";
import ReturnDetailsPanel from "../components/ReturnDetailsPanel.jsx";
import { ActBtn, ActBtnGroup, actBtnCellStyle } from "../components/ActBtn.jsx";
import { LIST_PAGE_SIZE } from "../utils/listPage.js";
import { stampUpdatedAt, stampTransactionIsoDateTime } from "../utils/stampUpdatedAt.js";
import {
  assertPaymentFitsPurchaseBalance,
  loadFreshPurchaseForPayment,
  pushKeysNow,
} from "../utils/concurrencyGuards.js";
import {
  buildInvoiceEditLockIdentity,
  checkForeignInvoiceEditLock,
  findActiveInvoiceEditLock,
  formatInvoiceEditLockMessage,
  readInvoiceEditLocks,
} from "../utils/invoiceEditLocks.js";
import { MoneyInOutModal } from "../components/MoneyInOutModal.jsx";
import { PurchaseInvoiceDoc } from "../components/PurchaseInvoiceDoc.jsx";
import { MoneyReceiptDoc } from "../components/MoneyReceiptDoc.jsx";
import PrintFormatChooser from "../components/PrintFormatChooser.jsx";
import { resolveThermalFormat } from "../utils/printFormat.js";

/* ═══════════════════════════════════════════════════════════
   ENHANCED PAYABLES — Purchase invoices + Manual (Borrowed, Other)
   ═══════════════════════════════════════════════════════════ */
var EnhancedPayables = function (props) {
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

  var lockIdentity = buildInvoiceEditLockIdentity({
    currentUser: props.currentUser || null,
    clientMachineLabel: String(props.clientMachineLabel || "").trim(),
  });
  var assertPurchaseUnlockedForPayment = function (purchaseId) {
    var lock = findActiveInvoiceEditLock(readInvoiceEditLocks(S), purchaseId);
    if (lock && String(lock.deviceId || "") !== String(lockIdentity.deviceId || "")) {
      showAlert(formatInvoiceEditLockMessage(lock) + " Cannot record payment until they finish.");
      return false;
    }
    return true;
  };

  var openEditMoneyInReceipt = function (row) {
    var rcp = (row && row._manualObj) ? row._manualObj : row;
    if (!rcp || !rcp.id) {
      showAlert("Receipt not found.");
      return;
    }
    if (rcp._isOpening) {
      showAlert("Opening balance entries are edited from Accounts → Opening Balance.");
      return;
    }
    if (rcp.thirdPartyRepairId) {
      showAlert("This receipt is linked to a 3rd party repair. Edit it from Repairs.");
      return;
    }
    setViewItem(null);
    setReceiptView(null);
    setEditReceipt(rcp);
  };

  var [ptab, setPtab] = useState("all");
  var [search, setSearch] = useState("");
  var [addModal, setAddModal] = useState(false);
  var [payModal, setPayModal] = useState(null);
  var [splitPayModal, setSplitPayModal] = useState(null);
  var [payAmt, setPayAmt] = useState("");
  var [payMethod, setPayMethod] = useState("Cash");
  var [payNote, setPayNote] = useState("");
  var [chequeList, setChequeList] = useState([]);
  var [chqForm, setChqForm] = useState({ no: "", bank: "", amount: "", due: today() });
  var [viewItem, setViewItem] = useState(null);
  var [docView, setDocView] = useState(null); /* purchase object for purchase invoice */
  var [receiptView, setReceiptView] = useState(null); /* manual money-in receipt */
  var [editReceipt, setEditReceipt] = useState(null); /* manual money-in for MoneyInOutModal edit */
  var [docFmt, setDocFmt] = useState(function () { return (state.settings && state.settings.invoiceDefaultSize) || "a4"; });
  var [printFmtOpen, setPrintFmtOpen] = useState(false);
  var [pendingPrintFmt, setPendingPrintFmt] = useState(null);
  var [printTarget, setPrintTarget] = useState(null); /* "purchase" | "receipt" */

  var PaymentBreakdown = props.PaymentBreakdown;
  var Badge = props.Badge;
  var WABtn = props.WABtn;
  var fmtStock = props.fmtStock || function (q) { return q; };
  var PRINT_FONT_LINK = props.PRINT_FONT_LINK || "";
  var escapeHtml = props.escapeHtml || function (s) { return String(s == null ? "" : s); };
  var shareViaWhatsApp = props.shareViaWhatsApp;

  var invThermalFmt = resolveThermalFormat(state.settings || {});
  var invPrintFmtOptions = [
    ["a4", "A4"],
    ["a5", "A5"],
    [invThermalFmt, invThermalFmt === "thermal58" ? "58mm" : "80mm"],
  ];

  var printDocById = function (elId, title, fmt) {
    var el = document.getElementById(elId);
    if (!el) return;
    var isA5 = fmt === "a5";
    var isThermal = fmt === "thermal" || fmt === "thermal58" || fmt === "thermal80";
    var pageSize = fmt === "thermal58" ? "58mm auto" : (fmt === "thermal80" || fmt === "thermal") ? "80mm auto" : isA5 ? "A5" : "A4";
    var margin = isThermal ? "3mm" : "8mm";
    var css = "<style>*{box-sizing:border-box;margin:0;padding:0;}html,body{height:auto;}body{background:#fff;font-family:'Segoe UI',Arial,sans-serif;}@page{size:" + pageSize + " portrait;margin:" + margin + ";}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>";
    var w = window.open("", "_blank", "width=900,height=760");
    if (!w) return;
    w.document.write("<!DOCTYPE html><html><head>" + PRINT_FONT_LINK + "<title>" + escapeHtml(title || "Document") + "</title>" + css + "</head><body>" + el.innerHTML + "</body></html>");
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 500);
  };

  var whatsappDocById = function (elId, filename, phone, fmt) {
    var el = document.getElementById(elId);
    if (!el) { showAlert("Document preview not ready. Please try again."); return; }
    if (typeof shareViaWhatsApp !== "function") { showAlert("WhatsApp share is not available."); return; }
    var isA5 = fmt === "a5";
    var isThermal = fmt === "thermal" || fmt === "thermal58" || fmt === "thermal80";
    var pageSize = fmt === "thermal58" ? "58mm auto" : (fmt === "thermal80" || fmt === "thermal") ? "80mm auto" : isA5 ? "A5" : "A4";
    var margin = isThermal ? "3mm" : "8mm";
    var css = "<style>*{box-sizing:border-box;margin:0;padding:0;}html,body{height:auto;}body{background:#fff;font-family:'Segoe UI',Arial,sans-serif;}@page{size:" + pageSize + (isThermal ? "" : " portrait") + ";margin:" + margin + ";}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>";
    var pageFormat = isThermal ? (fmt === "thermal58" ? "thermal58" : "thermal80") : (isA5 ? "a5" : "a4");
    shareViaWhatsApp(el.innerHTML, filename, phone || "", { headStyles: css, pageFormat: pageFormat });
  };

  useEffect(function () {
    if (!pendingPrintFmt || !printTarget) return undefined;
    var fmt = pendingPrintFmt;
    var t = setTimeout(function () {
      if (printTarget === "purchase" && docView) {
        printDocById("arap-pur-preview-" + docView.id, "Purchase " + (docView.invoiceNo || ""), fmt);
      } else if (printTarget === "receipt" && receiptView) {
        printDocById("arap-rcp-preview-" + receiptView.id, "Receipt " + (receiptView.receiptNo || ""), fmt);
      }
      setPendingPrintFmt(null);
      setPrintTarget(null);
    }, 120);
    return function () { clearTimeout(t); };
  }, [pendingPrintFmt, docFmt, docView, receiptView, printTarget]);

  var manualPays = S.get("tc3_manualPayables", []);

  /* ── Build unified list ── */
  var purchaseEntries = (state.purchases || []).filter(function (p) { return !isVoidedTxn(p); }).map(function (p) {
    var bal = Math.max(0, p.total - (p.paidAmount || 0));
    var retMeta = purchaseReturnUiStatus(p, state.purchaseReturns);
    return { id: p.id, _type: "purchase", date: p.date, source: p.supplier || "", type: "Purchase Invoice", amount: p.total, paid: p.paidAmount || 0, balance: bal, reference: p.invoiceNo || p.id.slice(0, 8), note: "", paymentHistory: p.paymentHistory || [], _purObj: p, _returnMeta: retMeta };
  });
  var manualEntries = manualPays.map(function (mp) {
    var paid = (mp.paymentHistory || []).reduce(function (a, ph) { return a + ph.amount; }, 0);
    var bal = Math.max(0, mp.amount - paid);
    return { id: mp.id, _type: "manual", date: mp.date, source: mp.source, type: mp.type, amount: mp.amount, paid: paid, balance: bal, reference: mp.receiptNo || mp.reference || "", note: mp.note || "", receiptNo: mp.receiptNo || "", paymentHistory: mp.paymentHistory || [], _manualObj: mp };
  });
  var allEntries = purchaseEntries.concat(manualEntries).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });

  var filtered = allEntries.filter(function (e) {
    var q = search.toLowerCase();
    var matchQ = !q || e.source.toLowerCase().includes(q) || (e.reference || "").toLowerCase().includes(q);
    var matchTab = ptab === "all" || (ptab === "outstanding" && e.balance > 0) || (ptab === "cleared" && e.balance <= 0) || (ptab === "manual" && e._type === "manual") || (ptab === "purchases" && e._type === "purchase");
    return matchQ && matchTab;
  });
  var payPager = usePager(filtered, LIST_PAGE_SIZE);

  var totalPayable = allEntries.reduce(function (a, e) { return a + e.balance; }, 0);
  var totalManual = manualEntries.reduce(function (a, e) { return a + e.balance; }, 0);
  var totalPurchases = purchaseEntries.reduce(function (a, e) { return a + e.balance; }, 0);

  var recordPayment = function () {
    var amt = parseFloat(payAmt);
    if (!amt || amt <= 0) { showAlert("Enter a valid payment amount."); return; }
    var item = payModal;
    if (item && item._type === "purchase" && item._purObj && isVoidedTxn(item._purObj)) {
      showAlert("Cannot record payment on a voided purchase.");
      return;
    }
    /* ── Cheque: save ALL cheques in chequeList ── */
    if (payMethod === "Cheque") {
      if (chequeList.length === 0) { showAlert("Add at least one cheque using the + Add Cheque button."); return; }
      if (item._type === "purchase" && !assertPurchaseUnlockedForPayment(item.id)) return;
      var chqTotal = chequeList.reduce(function (a, c) { return a + (parseFloat(c.amount) || 0); }, 0);
      if (chqTotal <= 0) { showAlert("Total cheque amount must be greater than zero."); return; }
      var nch = (state.cheques || []).slice();
      var phEntries = [];
      chequeList.forEach(function (chq) {
        var chqAmt = parseFloat(chq.amount) || 0;
        if (chqAmt <= 0 || !chq.no.trim()) return;
        var chTs = new Date().toISOString();
        var newCheque = stampTransactionIsoDateTime({
          id: uid(), type: "outgoing", status: "Pending",
          chequeNo: chq.no.trim(), bankName: (chq.bank || "").trim(),
          amount: chqAmt, dueDate: chq.due || today(), issuedDate: today(),
          supplierName: item.source || "",
          purchaseId: item._type === "purchase" ? item.id : "",
          purchaseNo: item.reference || "",
          manualPayableId: item._type === "manual" ? item.id : "",
          note: payNote || "", createdAt: chTs, updatedAt: chTs
        }, chTs);
        nch.push(newCheque);
        phEntries.push({ id: uid(), date: today(), amount: 0, cashMethod: "Cheque",
          note: "Cheque #" + chq.no.trim() + " " + getCurrencySymbol() + " " + fmtNum(chqAmt) + " (Pending — due " + chq.due + ")" + (payNote ? " | " + payNote : ""),
          chequeId: newCheque.id });
      });
      if (item._type === "purchase") {
        var pur = state.purchases.find(function (p) { return p.id === item.id; });
        if (pur) {
          var updPur = stampUpdatedAt(Object.assign({}, pur, { paymentHistory: (pur.paymentHistory || []).concat(phEntries) }));
          var np0 = state.purchases.map(function (p) { return p.id === item.id ? updPur : p; });
          S.set("tc3_purchases", np0); S.set("tc3_cheques", nch);
          addAudit(chequeList.length + " Cheque(s) Issued " + getCurrencySymbol() + " " + fmtNum(chqTotal), item.reference || "");
          setState(function (st) { return Object.assign({}, st, { purchases: np0, cheques: nch }); });
        }
      } else {
        var list0 = S.get("tc3_manualPayables", []);
        var upd0 = list0.map(function (mp) {
          return mp.id !== item.id ? mp : stampUpdatedAt(Object.assign({}, mp, { paymentHistory: (mp.paymentHistory || []).concat(phEntries) }));
        });
        S.set("tc3_manualPayables", upd0); S.set("tc3_cheques", nch);
        addAudit(chequeList.length + " Cheque(s) Issued " + getCurrencySymbol() + " " + fmtNum(chqTotal), item.source || "");
        setState(function (st) { return Object.assign({}, st, { cheques: nch, _payTs: Date.now() }); });
      }
      setPayModal(null); setPayAmt(""); setPayMethod("Cash"); setPayNote(""); setChequeList([]); setChqForm({ no: "", bank: "", amount: "", due: today() });
      showAlert("✅ " + chequeList.length + " cheque(s) recorded (total " + getCurrencySymbol() + " " + fmtNum(chqTotal) + "). Go to Cheque Register to mark cleared when paid.");
      return;
    }
    if (item._type === "purchase") {
      loadFreshPurchaseForPayment(S, item.id)
        .then(function (fresh) {
          return checkForeignInvoiceEditLock(S, item.id, lockIdentity).then(function (fl) {
            if (fl) {
              showAlert(formatInvoiceEditLockMessage(fl) + " Cannot record payment until they finish.");
              return;
            }
            var pur = fresh.purchase || state.purchases.find(function (p) { return p.id === item.id; });
            if (!pur) return;
            if (isVoidedTxn(pur)) { showAlert("Cannot record payment on a voided purchase."); return; }
            var fit = assertPaymentFitsPurchaseBalance(pur, amt);
            if (!fit.ok) { showAlert(fit.message); return; }
            var newPaid = (pur.paidAmount || 0) + amt;
            var newBal = pur.total - newPaid;
            var newStatus = newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
            var ph = (pur.paymentHistory || []).concat([{ id: uid(), date: today(), amount: amt, cashMethod: payMethod, note: (payMethod || "Cash") + (payNote ? ": " + payNote : "") }]);
            var updPur = stampUpdatedAt(Object.assign({}, pur, { paidAmount: newPaid, balance: newBal, status: newStatus, paymentHistory: ph }));
            var np = (fresh.purchases || state.purchases).map(function (p) { return p.id === item.id ? updPur : p; });
            S.set("tc3_purchases", np);
            try { pushKeysNow([["tc3_purchases", np]]); } catch (_e) { /* ignore */ }
            addAudit("Purchase Payment: Rs " + amt, pur.invoiceNo || pur.id.slice(0, 8));
            setState(function (st) { return Object.assign({}, st, { purchases: np }); });
            setPayModal(null); setPayAmt(""); setPayMethod("Cash"); setPayNote("");
          });
        })
        .catch(function () {
          if (!assertPurchaseUnlockedForPayment(item.id)) return;
          var pur = state.purchases.find(function (p) { return p.id === item.id; });
          if (!pur) return;
          var fit = assertPaymentFitsPurchaseBalance(pur, amt);
          if (!fit.ok) { showAlert(fit.message); return; }
          var newPaid = (pur.paidAmount || 0) + amt;
          var newBal = pur.total - newPaid;
          var newStatus = newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
          var ph = (pur.paymentHistory || []).concat([{ id: uid(), date: today(), amount: amt, cashMethod: payMethod, note: (payMethod || "Cash") + (payNote ? ": " + payNote : "") }]);
          var updPur = stampUpdatedAt(Object.assign({}, pur, { paidAmount: newPaid, balance: newBal, status: newStatus, paymentHistory: ph }));
          var np = state.purchases.map(function (p) { return p.id === item.id ? updPur : p; });
          S.set("tc3_purchases", np);
          try { pushKeysNow([["tc3_purchases", np]]); } catch (_e) { /* ignore */ }
          addAudit("Purchase Payment: Rs " + amt, pur.invoiceNo || pur.id.slice(0, 8));
          setState(function (st) { return Object.assign({}, st, { purchases: np }); });
          setPayModal(null); setPayAmt(""); setPayMethod("Cash"); setPayNote("");
        });
      return;
    } else {
      var list = S.get("tc3_manualPayables", []);
      var updated = list.map(function (mp) {
        if (mp.id !== item.id) return mp;
        var ph2 = (mp.paymentHistory || []).concat([{ id: uid(), date: today(), amount: amt, cashMethod: payMethod, note: payNote || "" }]);
        return stampUpdatedAt(Object.assign({}, mp, { paymentHistory: ph2 }));
      });
      S.set("tc3_manualPayables", updated);
      addAudit("Manual Payable Payment: Rs " + amt, item.source || item.reference || "");
      setState(function (st) { return Object.assign({}, st, { _payTs: Date.now() }); });
    }
    setPayModal(null); setPayAmt(""); setPayMethod("Cash"); setPayNote("");
  };

  var processSplitEntry = function (entry, splits) {
    var totalAdded = 0;
    var totalNonCheque = 0;
    var newCheques = (state.cheques || []).slice();
    splits.forEach(function (row) { var amt = parseFloat(row.amount) || 0; if (amt > 0) { totalAdded += amt; if (row.method !== "Cheque") totalNonCheque += amt; } });
    if (entry._type === "purchase") {
      var applyPurSplit = function (pur, purchasesBase) {
        if (!pur) return;
        var fit = assertPaymentFitsPurchaseBalance(pur, totalNonCheque);
        if (!fit.ok) { showAlert(fit.message); return; }
        var newPh = (pur.paymentHistory || []).slice();
        splits.forEach(function (row) {
          var amt = parseFloat(row.amount) || 0; if (amt <= 0) return;
          if (row.method === "Cheque") {
            var chTs = new Date().toISOString();
            var nc = stampTransactionIsoDateTime({ id: uid(), type: "outgoing", status: "Pending", chequeNo: (row.chequeNo || "").trim(), bankName: (row.chequeBankName || "").trim(), amount: amt, dueDate: row.chequeDueDate || today(), issuedDate: today(), supplierName: pur.supplier || "", purchaseId: pur.id, purchaseNo: pur.invoiceNo || "", note: row.note || "", createdAt: chTs, updatedAt: chTs }, chTs);
            newCheques.push(nc);
            newPh.push({ id: uid(), date: today(), amount: 0, cashMethod: "Cheque", note: "Cheque #" + (row.chequeNo || "") + " " + getCurrencySymbol() + " " + fmtNum(amt) + " (Pending — due " + (row.chequeDueDate || today()) + ")" + (row.note ? " | " + row.note : ""), chequeId: nc.id });
          } else {
            var cm = (row.method === "Bank" || row.method === "Online" || row.method === "Card") ? "Bank" : "Cash";
            newPh.push({ id: uid(), date: today(), amount: amt, cashMethod: cm, note: (row.method || "Cash") + (row.note ? ": " + row.note : "") });
          }
        });
        var newPaid = (pur.paidAmount || 0) + totalNonCheque; var newBal = pur.total - newPaid;
        var updPur = stampUpdatedAt(Object.assign({}, pur, { paidAmount: newPaid, balance: newBal, status: newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid", paymentHistory: newPh }));
        var np = (purchasesBase || state.purchases).map(function (p) { return p.id === pur.id ? updPur : p; });
        S.set("tc3_purchases", np); S.set("tc3_cheques", newCheques);
        try { pushKeysNow([["tc3_purchases", np], ["tc3_cheques", newCheques]]); } catch (_e) { /* ignore */ }
        setState(function (st) { return Object.assign({}, st, { purchases: np, cheques: newCheques }); });
        setSplitPayModal(null);
        addAudit("Payment " + getCurrencySymbol() + " " + fmtNum(totalAdded), entry.reference || entry.id.slice(0, 8));
      };
      loadFreshPurchaseForPayment(S, entry.id)
        .then(function (fresh) {
          return checkForeignInvoiceEditLock(S, entry.id, lockIdentity).then(function (fl) {
            if (fl) {
              showAlert(formatInvoiceEditLockMessage(fl) + " Cannot record payment until they finish.");
              return;
            }
            applyPurSplit(fresh.purchase || entry._purObj, fresh.purchases || state.purchases);
          });
        })
        .catch(function () {
          if (!assertPurchaseUnlockedForPayment(entry.id)) return;
          applyPurSplit(entry._purObj, state.purchases);
        });
      return;
    } else {
      var manPays = S.get("tc3_manualPayables", []);
      var newPh2 = [];
      splits.forEach(function (row) {
        var amt = parseFloat(row.amount) || 0; if (amt <= 0) return;
        if (row.method === "Cheque") {
          var chTs2 = new Date().toISOString();
          var nc2 = stampTransactionIsoDateTime({ id: uid(), type: "outgoing", status: "Pending", chequeNo: (row.chequeNo || "").trim(), bankName: (row.chequeBankName || "").trim(), amount: amt, dueDate: row.chequeDueDate || today(), issuedDate: today(), manualPayableId: entry.id, note: row.note || "", createdAt: chTs2, updatedAt: chTs2 }, chTs2);
          newCheques.push(nc2);
          newPh2.push({ id: uid(), date: today(), amount: 0, cashMethod: "Cheque", note: "Cheque #" + (row.chequeNo || "") + " " + getCurrencySymbol() + " " + fmtNum(amt) + " (Pending — due " + (row.chequeDueDate || today()) + ")", chequeId: nc2.id });
        } else {
          var cm2 = (row.method === "Bank" || row.method === "Online" || row.method === "Card") ? "Bank" : "Cash";
          newPh2.push({ id: uid(), date: today(), amount: amt, cashMethod: cm2, note: (row.method || "Cash") + (row.note ? ": " + row.note : "") });
        }
      });
      var updMan = manPays.map(function (mp) { return mp.id === entry.id ? stampUpdatedAt(Object.assign({}, mp, { paymentHistory: (mp.paymentHistory || []).concat(newPh2) })) : mp; });
      S.set("tc3_manualPayables", updMan); S.set("tc3_cheques", newCheques);
      setState(function (st) { return Object.assign({}, st, { cheques: newCheques }); });
    }
    setSplitPayModal(null);
    addAudit("Payment " + getCurrencySymbol() + " " + fmtNum(totalAdded), entry.reference || entry.id.slice(0, 8));
  };

  var deleteManual = function (id) {
    var entry = S.get("tc3_manualPayables", []).find(function (e) { return e.id === id; });
    /* FIX: Block deletion if payments have been recorded — would silently erase cash history */
    if (entry && (entry.paymentHistory || []).length > 0) {
      showAlert("Cannot delete: this payable has payment history recorded.\nEdit the amount to Rs 0 or mark it as fully paid instead.");
      return;
    }
    showConfirm("Delete this payable entry?", function () {
      var list = S.get("tc3_manualPayables", []).filter(function (e) { return e.id !== id; });
      /* FIX Bug 2: Void any pending cheques linked to this payable */
      var nch = (state.cheques || []).map(function (ch) {
        if (ch.manualPayableId === id && ch.status === "Pending") {
          return Object.assign({}, ch, { status: "Voided", voidedDate: today(), voidReason: "Linked payable deleted" });
        }
        return ch;
      });
      S.set("tc3_manualPayables", list); S.set("tc3_cheques", nch);
      setState(function (st) { return Object.assign({}, st, { cheques: nch, _payTs: Date.now() }); });
      if (viewItem && viewItem.id === id) setViewItem(null);
    });
  };

  var outCount = allEntries.filter(function (e) { return e.balance > 0; }).length;
  var clearedCount = allEntries.filter(function (e) { return e.balance <= 0; }).length;
  var totalBilled = allEntries.reduce(function (a, e) { return a + e.amount; }, 0);
  var totalPaidAll = allEntries.reduce(function (a, e) { return a + e.paid; }, 0);
  var paidPct = totalBilled > 0 ? Math.round((totalPaidAll / totalBilled) * 100) : 0;
  var PTABS = [
    ["all", "All", allEntries.length],
    ["outstanding", "Outstanding", outCount],
    ["cleared", "Cleared", clearedCount],
    ["purchases", "Purchases", purchaseEntries.length],
    ["manual", "Manual", manualEntries.length],
  ];
  var filtTotal = filtered.reduce(function (a, e) { return a + e.amount; }, 0);
  var filtPaid = filtered.reduce(function (a, e) { return a + e.paid; }, 0);
  var filtBal = filtered.reduce(function (a, e) { return a + e.balance; }, 0);

  return (
    <div className="erp-page erp-arap-modern is-pay">
      <div className="erp-arap-chrome">
        <div className="erp-arap-topbar">
          <div className="erp-arap-topbar-brand">
            <div className="erp-arap-brand-ico" aria-hidden="true">MP</div>
            <div>
              <h1 className="erp-arap-header-title">Payables</h1>
              <p className="erp-arap-header-sub">Money to pay · purchases &amp; loans</p>
            </div>
          </div>
          <div className="erp-arap-kpi-row" aria-label="Payable totals">
            <div className="erp-arap-kpi is-red">
              <span className="erp-arap-kpi-lbl">Outstanding</span>
              <span className="erp-arap-kpi-val">{getCurrencySymbol()} {fmtNum(totalPayable)}</span>
              <span className="erp-arap-kpi-sub">{outCount} pending</span>
            </div>
            <div className="erp-arap-kpi is-orange">
              <span className="erp-arap-kpi-lbl">Purchases</span>
              <span className="erp-arap-kpi-val">{getCurrencySymbol()} {fmtNum(totalPurchases)}</span>
              <span className="erp-arap-kpi-sub">{purchaseEntries.length} orders</span>
            </div>
            <div className="erp-arap-kpi is-purple">
              <span className="erp-arap-kpi-lbl">Manual</span>
              <span className="erp-arap-kpi-val">{getCurrencySymbol()} {fmtNum(totalManual)}</span>
              <span className="erp-arap-kpi-sub">{manualEntries.filter(function (e) { return e.balance > 0; }).length} pending</span>
            </div>
            <div className="erp-arap-kpi is-green">
              <span className="erp-arap-kpi-lbl">Paid rate</span>
              <span className="erp-arap-kpi-val">{paidPct}%</span>
              <div className="erp-arap-mini-bar is-orange"><i style={{ width: Math.min(100, Math.max(0, paidPct)) + "%" }} /></div>
              <span className="erp-arap-kpi-sub">{getCurrencySymbol()} {fmtNum(totalPaidAll)}</span>
            </div>
          </div>
          <button type="button" className="erp-arap-add is-in" onClick={function () { setAddModal(true); }}>
            <span className="erp-arap-add-ico" aria-hidden="true">↑</span>
            <span>Money In</span>
          </button>
        </div>
        <div className="erp-arap-tabs" role="tablist" aria-label="Payable filters">
          {PTABS.map(function (t) {
            var active = ptab === t[0];
            return (
              <button
                key={t[0]}
                type="button"
                role="tab"
                aria-selected={active}
                className={"erp-arap-tab" + (active ? " is-active" : "")}
                onClick={function () { setPtab(t[0]); }}
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
                aria-label="Search payables"
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
                  <tr><td colSpan={8} className="erp-arap-empty">No payables found</td></tr>
                )}
                {payPager.slice.map(function (e) {
                  var isOut = e.balance > 0;
                  var purRet = e._type === "purchase" && e._returnMeta ? e._returnMeta : { hasReturns: false };
                  var hasPendChq = isOut && (state.cheques || []).some(function (ch) {
                    return ch.purchaseId === e.id && ch.status === "Pending";
                  });
                  return (
                    <tr
                      key={e.id}
                      className={"table-row-hover" + (purRet.hasReturns ? " is-return" : "")}
                      title={purRet.hasReturns ? "This invoice has return activity" : undefined}
                    >
                      <td>{fmtDateFull(e.date)}</td>
                      <td className="erp-arap-src" title={e.source}>{e.source}</td>
                      <td>
                        <div className="erp-arap-type">
                          <span className={"erp-arap-badge" + (e._type === "purchase" ? " is-purchase" : " is-manual")}>{e.type}</span>
                          {purRet.hasReturns ? <span className="erp-arap-ret" title="Has returns">↩</span> : null}
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
                          {e._type === "manual" ? <ActBtn tone="blue" title="Edit Money In receipt" onClick={function () { openEditMoneyInReceipt(e); }} /> : null}
                          {hasPendChq ? <span className="erp-arap-pend" title="Has pending cheque(s)">🕐</span> : null}
                          {isOut ? <ActBtn tone="orange" icon="pay" title="Record payment" wide onClick={function () { setSplitPayModal(e); }}>Pay</ActBtn> : null}
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
                <span>Paid <b className="is-green">{getCurrencySymbol()} {fmtNum(filtPaid)}</b></span>
                <span>Outstanding <b className="is-red">{getCurrencySymbol()} {fmtNum(filtBal)}</b></span>
              </div>
            ) : null}
            <div className="erp-arap-pager-wrap">
              <Pager pager={payPager} />
            </div>
          </div>
        </div>
      </div>

      {/* Add via shared Money In modal */}
      {addModal && (
        <MoneyInOutModal
          mode="in"
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

      {editReceipt && (
        <MoneyInOutModal
          mode="in"
          editRecord={editReceipt}
          S={S}
          today={today}
          uid={uid}
          tcTrialGuard={tcTrialGuard}
          showAlert={showAlert}
          addAudit={addAudit}
          setState={setState}
          onClose={function () { setEditReceipt(null); }}
          onSaved={function (updated) {
            if (viewItem && viewItem.id === (updated && updated.id)) {
              setViewItem(null);
            }
          }}
          Modal={Modal}
          Input={Input}
          Sel={Sel}
          Btn={Btn}
          C={C}
          getCurrencySymbol={getCurrencySymbol}
          customers={state.customers || []}
          suppliers={state.suppliers || []}
          others={state.others || []}
          zIndex={13000}
        />
      )}

      {/* Payment Modal */}
      {splitPayModal && (
        <SplitPaymentModal
          title={"Pay — " + (splitPayModal.source || splitPayModal.reference || "Invoice")}
          invoiceTotal={splitPayModal.amount}
          alreadyPaid={splitPayModal.paid || 0}
          isSale={false}
          onSave={function (splits) { processSplitEntry(splitPayModal, splits); }}
          onClose={function () { setSplitPayModal(null); }}
        />
      )}

      {/* View Modal — wide compact payable detail */}
      {viewItem && (function () {
        var isPur = viewItem._type === "purchase";
        var pur = viewItem._purObj || null;
        var invNo = (pur && pur.invoiceNo) || viewItem.reference || (viewItem.id || "").slice(0, 8);
        var isOut = viewItem.balance > 0;
        var retMeta = isPur && viewItem._returnMeta ? viewItem._returnMeta : { hasReturns: false };
        var items = isPur && pur ? (pur.items || []) : [];
        return (
          <Modal
            className="erp-arap-view-modal is-pay"
            title={isPur ? ("Purchase · " + invNo) : ("Payable · " + (viewItem.source || "Manual"))}
            subtitle={isPur ? ((viewItem.source || "Supplier") + " · " + fmtDateFull(viewItem.date)) : (viewItem.type + " · " + fmtDateFull(viewItem.date))}
            onClose={function () { setViewItem(null); }}
            wide
            closeRound
          >
            <div className="erp-arap-view">
              {isOut ? (
                <div className="erp-arap-view-alert is-due">
                  <div>
                    <strong>{isPur ? "Payment due on this purchase" : "Amount still payable"}</strong>
                    <span>Outstanding balance needs to be paid</span>
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
                  <div className="erp-arap-view-card-title">{isPur ? "Supplier" : "Party"}</div>
                  <div className="erp-arap-view-name">{viewItem.source || "—"}</div>
                  <div className="erp-arap-view-muted">{fmtDateFull(viewItem.date)}</div>
                  <div className="erp-arap-view-chips">
                    <span className={"erp-arap-badge" + (isPur ? " is-purchase" : " is-manual")}>{viewItem.type}</span>
                    {retMeta.hasReturns ? <span className="erp-arap-ret">↩ Returns</span> : null}
                  </div>
                </div>
                <div className="erp-arap-view-card is-money">
                  <div className="erp-arap-view-money-row"><span>Total</span><b className="is-blue">{getCurrencySymbol()} {fmtNum(viewItem.amount)}</b></div>
                  <div className="erp-arap-view-money-row"><span>Paid</span><b className="is-green">{getCurrencySymbol()} {fmtNum(viewItem.paid)}</b></div>
                  <div className="erp-arap-view-money-row is-strong"><span>Balance</span><b className={isOut ? "is-red" : "is-green"}>{isOut ? (getCurrencySymbol() + " " + fmtNum(viewItem.balance)) : "Cleared"}</b></div>
                </div>
              </div>

              {isPur ? (
                <div className="erp-arap-view-doclink">
                  <div>
                    <div className="erp-arap-view-card-title">Purchase invoice</div>
                    <button
                      type="button"
                      className="erp-arap-inv-link is-pay"
                      onClick={function () {
                        if (!pur) { showAlert("Purchase record not found."); return; }
                        setDocFmt((state.settings && state.settings.invoiceDefaultSize) || "a4");
                        setDocView(pur);
                      }}
                      title="Open actual purchase invoice"
                    >
                      {invNo}
                    </button>
                    <div className="erp-arap-view-muted">Click invoice number to open the purchase invoice</div>
                  </div>
                  <button
                    type="button"
                    className="erp-arap-doc-btn is-pay-tone"
                    onClick={function () {
                      if (!pur) { showAlert("Purchase record not found."); return; }
                      setDocFmt((state.settings && state.settings.invoiceDefaultSize) || "a4");
                      setDocView(pur);
                    }}
                  >
                    Open purchase
                  </button>
                </div>
              ) : (function () {
                var rcpNo = (viewItem._manualObj && viewItem._manualObj.receiptNo) || viewItem.receiptNo || viewItem.reference || "";
                var hasRcp = !!(viewItem._manualObj && (viewItem._manualObj.receiptNo || viewItem._manualObj.id));
                return (
                  <div className="erp-arap-view-doclink">
                    <div>
                      <div className="erp-arap-view-card-title">Money In receipt</div>
                      {hasRcp ? (
                        <button
                          type="button"
                          className="erp-arap-inv-link is-pay"
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
                      <button type="button" className="erp-arap-doc-btn is-pay-tone" onClick={function () {
                        setDocFmt((state.settings && state.settings.invoiceDefaultSize) || "a4");
                        setReceiptView(viewItem._manualObj || viewItem);
                      }}>
                        Open receipt
                      </button>
                    ) : null}
                  </div>
                );
              })()}

              {PaymentBreakdown && isPur && pur ? (
                <div className="erp-arap-view-paybreak">
                  <PaymentBreakdown invoice={Object.assign({}, pur, { paid: pur.paidAmount || 0 })} cheques={state.cheques || []} isSale={false} />
                </div>
              ) : null}

              {items.length > 0 ? (
                <div className="erp-arap-view-items">
                  <div className="erp-arap-view-card-title">Line items</div>
                  <div className="erp-arap-view-table-wrap">
                    <table className="erp-arap-view-table">
                      <thead>
                        <tr><th>#</th><th>Item</th><th>Qty</th><th>Cost</th><th>Total</th></tr>
                      </thead>
                      <tbody>
                        {items.map(function (it, i) {
                          var unitCost = it.cost != null ? it.cost : (it.price || 0);
                          return (
                            <tr key={i}>
                              <td>{i + 1}</td>
                              <td>{it.name || "Item"}</td>
                              <td>{fmtStock(it.qty, it.unit)}</td>
                              <td>{getCurrencySymbol()} {fmtNum(unitCost)}</td>
                              <td>{getCurrencySymbol()} {fmtNum((it.qty || 0) * unitCost)}</td>
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
                  mode="purchase"
                  rows={retMeta.rows}
                  originalId={pur ? pur.id : viewItem.id}
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
                                  var manPays = S.get("tc3_manualPayables", []);
                                  var updated = manPays.map(function (m) {
                                    if (m.id !== viewItem.id) return m;
                                    var reversalEntry = { id: uid(), date: today(), amount: -ph.amount, cashMethod: ph.cashMethod || "Cash", note: "Reversed: " + (ph.note || fmtDateFull(ph.date)) };
                                    return Object.assign({}, m, { paymentHistory: (m.paymentHistory || []).concat([reversalEntry]) });
                                  });
                                  S.set("tc3_manualPayables", updated);
                                  setState(function (st) { return Object.assign({}, st, { _payTs: Date.now() }); });
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
                {isPur && pur ? (
                  <button type="button" className="erp-arap-doc-btn is-ghost" onClick={function () {
                    setDocFmt((state.settings && state.settings.invoiceDefaultSize) || "a4");
                    setDocView(pur);
                  }}>
                    View actual purchase
                  </button>
                ) : null}
                {!isPur ? (
                  <button type="button" className="erp-arap-doc-btn is-pay-tone" onClick={function () {
                    openEditMoneyInReceipt(viewItem);
                  }}>
                    Edit receipt
                  </button>
                ) : null}
                {isOut ? (
                  <button type="button" className="erp-arap-doc-btn is-pay is-pay-tone" onClick={function () { setViewItem(null); setSplitPayModal(viewItem); }}>
                    Record payment
                  </button>
                ) : null}
                <button type="button" className="erp-arap-doc-btn is-ghost" onClick={function () { setViewItem(null); }}>Close</button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* View & Print — purchase invoice (universal chrome) */}
      {docView && (function () {
        var dRet = purchaseReturnUiStatus(docView, state.purchaseReturns);
        var sheetSize = (docFmt === "thermal58" || docFmt === "thermal80") ? "a4" : docFmt;
        return (
          <div className="erp-si-fv is-purchase" role="dialog" aria-modal="true" aria-label="View and print purchase invoice">
            <div className="erp-si-fv-bar">
              <div className="erp-si-fv-bar-left">
                <span className="erp-si-fv-badge" aria-hidden="true">VP</span>
                <div className="erp-si-fv-meta">
                  <span className="erp-si-fv-kicker">View &amp; Print</span>
                  <div className="erp-si-fv-meta-main">
                    <span className="erp-si-fv-inv">{docView.invoiceNo || docView.id.slice(0, 8)}</span>
                    <span className="erp-si-fv-sub">{docView.supplier || "Supplier"} · {fmtDateFull(docView.date)}</span>
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
                  onClick={function () { setPrintTarget("purchase"); setPrintFmtOpen(true); }}
                >Print</button>
                {WABtn ? (
                  <WABtn
                    title="Share as PDF via WhatsApp"
                    onClick={function () {
                      whatsappDocById(
                        "arap-pur-preview-" + docView.id,
                        "Purchase-" + (docView.invoiceNo || docView.id.slice(0, 8)),
                        "",
                        docFmt
                      );
                    }}
                  />
                ) : null}
                <button type="button" className="erp-si-fv-btn is-close" onClick={function () { setDocView(null); }} aria-label="Close">✕</button>
              </div>
            </div>
            {dRet.hasReturns ? (
              <div className="erp-si-fv-return">
                <span>↩ Returns linked to this purchase</span>
              </div>
            ) : null}
            <div className="erp-si-fv-stage">
              <div id={"arap-pur-preview-" + docView.id} className={"erp-si-fv-sheet" + ((docFmt === "thermal58" || docFmt === "thermal80") ? " is-thermal" : " is-paper")}>
                <PurchaseInvoiceDoc
                  pur={docView}
                  settings={state.settings}
                  size={sheetSize}
                  fmtDateFull={fmtDateFull}
                  fmtNum={fmtNum}
                  getCurrencySymbol={getCurrencySymbol}
                  fmtStock={fmtStock}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* View & Print — Money In receipt (universal chrome) */}
      {receiptView && (function () {
        var rcp = receiptView;
        var rcpNo = rcp.receiptNo || rcp.reference || (rcp.id || "").slice(0, 8);
        var sheetSize = (docFmt === "thermal58" || docFmt === "thermal80") ? "a4" : docFmt;
        return (
          <div className="erp-si-fv is-receipt" role="dialog" aria-modal="true" aria-label="View and print money in receipt">
            <div className="erp-si-fv-bar">
              <div className="erp-si-fv-bar-left">
                <span className="erp-si-fv-badge" aria-hidden="true">VP</span>
                <div className="erp-si-fv-meta">
                  <span className="erp-si-fv-kicker">View &amp; Print</span>
                  <div className="erp-si-fv-meta-main">
                    <span className="erp-si-fv-inv">{rcpNo}</span>
                    <span className="erp-si-fv-sub">Money In · {rcp.source || "Party"} · {fmtDateFull(rcp.date)}</span>
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
                  className="erp-si-fv-btn is-convert"
                  onClick={function () { openEditMoneyInReceipt(rcp); }}
                >Edit</button>
                <button
                  type="button"
                  className="erp-si-fv-btn is-print"
                  onClick={function () { setPrintTarget("receipt"); setPrintFmtOpen(true); }}
                >Print</button>
                {WABtn ? (
                  <WABtn
                    title="Share as PDF via WhatsApp"
                    onClick={function () {
                      whatsappDocById("arap-rcp-preview-" + rcp.id, "Receipt-" + rcpNo, "", docFmt);
                    }}
                  />
                ) : null}
                <button type="button" className="erp-si-fv-btn is-close" onClick={function () { setReceiptView(null); }} aria-label="Close">✕</button>
              </div>
            </div>
            <div className="erp-si-fv-stage">
              <div id={"arap-rcp-preview-" + rcp.id} className={"erp-si-fv-sheet" + ((docFmt === "thermal58" || docFmt === "thermal80") ? " is-thermal" : " is-paper")}>
                <MoneyReceiptDoc
                  receipt={rcp}
                  mode="in"
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

      <PrintFormatChooser
        open={printFmtOpen}
        settings={state.settings}
        thermalId={invThermalFmt}
        title={printTarget === "receipt" ? "Print receipt" : "Print purchase invoice"}
        hint="Choose A4, A5, or Thermal for your printer."
        onClose={function () { setPrintFmtOpen(false); setPrintTarget(null); }}
        onSelect={function (fmt) {
          setPrintFmtOpen(false);
          setDocFmt(fmt);
          setPendingPrintFmt(fmt);
        }}
        zIndex={13000}
      />
    </div>
  );
};


var Payables = EnhancedPayables;
export default Payables;
