import React, { useState } from "react";
import { ActBtn, ActBtnGroup, actBtnCellStyle } from "../components/ActBtn.jsx";
import { LIST_PAGE_SIZE, sortNewestFirst } from "../utils/listPage.js";
import { stampUpdatedAt, stampTransactionIsoDateTime } from "../utils/stampUpdatedAt.js";
import {
  buildInvoiceEditLockIdentity,
  checkForeignInvoiceEditLock,
  formatInvoiceEditLockMessage,
} from "../utils/invoiceEditLocks.js";
import {
  assertPaymentFitsPurchaseBalance,
  assertPaymentFitsSaleBalance,
  loadFreshPurchaseForPayment,
  loadFreshSaleForPayment,
  pushKeysNow,
} from "../utils/concurrencyGuards.js";
import { PurchaseInvoiceDoc } from "../components/PurchaseInvoiceDoc.jsx";
import { MoneyReceiptDoc } from "../components/MoneyReceiptDoc.jsx";
import { MoneyInOutModal } from "../components/MoneyInOutModal.jsx";
import PrintFormatChooser from "../components/PrintFormatChooser.jsx";
import { resolveThermalFormat } from "../utils/printFormat.js";

/* ─── CHEQUE REGISTER PAGE ────────────────────────────────────────────────── */
var Cheques = React.memo(function (props) {
  var state = props.state;
  var setState = props.setState;
  var setActive = props.setActive;
  var C = props.C;
  var S = props.S;
  var today = props.today;
  var uid = props.uid;
  var tcTrialGuard = props.tcTrialGuard;
  var showAlert = props.showAlert;
  var showConfirm = props.showConfirm;
  var addAudit = props.addAudit;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var StatCard = props.StatCard;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var Btn = props.Btn;
  var Modal = props.Modal;
  var Input = props.Input;
  var Sel = props.Sel;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var usePager = props.usePager;
  var Pager = props.Pager;
  var checkPeriodClose = props.checkPeriodClose;
  var InvoiceA4 = props.InvoiceA4;
  var InvoiceThermal = props.InvoiceThermal;
  var WABtn = props.WABtn;
  var fmtDate = props.fmtDate || function (d) { return d || "—"; };
  var fmtDateFull = props.fmtDateFull || fmtDate;
  var fmtStock = props.fmtStock || function (q) { return q; };
  var escapeHtml = props.escapeHtml || function (s) { return String(s == null ? "" : s); };
  var PRINT_FONT_LINK = props.PRINT_FONT_LINK || "";
  var shareViaWhatsApp = props.shareViaWhatsApp;

  var [tab, setTab] = useState("all");
  var [search, setSearch] = useState("");
  var [actionModal, setActionModal] = useState(null); /* { cheque, action: "clear"|"bounce"|"reissue" } */
  var [reissueForm, setReissueForm] = useState({ chequeNo: "", dueDate: "", bankName: "" });
  var [addModal, setAddModal] = useState(null); /* "incoming" | "outgoing" */
  var [addForm, setAddForm] = useState({ chequeNo: "", bankName: "", amount: "", dueDate: today(), partyName: "", note: "", partyType: "customer" });
  var [docView, setDocView] = useState(null); /* sale | purchase */
  var [docKind, setDocKind] = useState(""); /* sale | purchase */
  var [receiptView, setReceiptView] = useState(null);
  var [receiptMode, setReceiptMode] = useState("in"); /* in = money in (payable), out = money out (receivable) */
  var [editReceipt, setEditReceipt] = useState(null);
  var [docFmt, setDocFmt] = useState(function () { return (state.settings && state.settings.invoiceDefaultSize) || "a4"; });
  var [printFmtOpen, setPrintFmtOpen] = useState(false);
  var [printTarget, setPrintTarget] = useState(null); /* sale | purchase | receipt */

  var cheques = sortNewestFirst(state.cheques || []);
  var todayStr = today();
  var invThermalFmt = resolveThermalFormat(state.settings || {});
  var invPrintFmtOptions = [
    ["a4", "A4"],
    ["a5", "A5"],
    [invThermalFmt, invThermalFmt === "thermal58" ? "58mm" : "80mm"],
  ];

  var resolveLinkedDoc = function (ch) {
    if (!ch) return null;
    if (ch.type === "incoming" && ch.saleId) {
      var sale = (state.sales || []).find(function (s) { return s.id === ch.saleId; });
      if (sale) return { kind: "sale", label: sale.invoiceNo || ch.invoiceNo || "Invoice", doc: sale };
    }
    if (ch.type === "outgoing" && ch.purchaseId) {
      var pur = (state.purchases || []).find(function (p) { return p.id === ch.purchaseId; });
      if (pur) return { kind: "purchase", label: pur.invoiceNo || ch.purchaseNo || "Purchase", doc: pur };
    }
    if (ch.type === "incoming" && ch.manualReceivableId) {
      var mr = (S.get("tc3_manualReceivables", []) || []).find(function (r) { return r.id === ch.manualReceivableId; });
      if (mr) return { kind: "receipt-out", label: mr.receiptNo || mr.reference || "Receipt", doc: mr };
    }
    if (ch.type === "outgoing" && (ch.manualPayableId || ch.thirdPartyRepairId)) {
      var mp = (S.get("tc3_manualPayables", []) || []).find(function (p) {
        if (ch.manualPayableId && p.id === ch.manualPayableId) return true;
        if (!ch.manualPayableId && ch.thirdPartyRepairId && p.thirdPartyRepairId === ch.thirdPartyRepairId) return true;
        return false;
      });
      if (mp) return { kind: "receipt-in", label: mp.receiptNo || mp.reference || "Receipt", doc: mp };
    }
    /* Fallback by invoice/purchase number text */
    if (ch.invoiceNo) {
      var saleByNo = (state.sales || []).find(function (s) { return String(s.invoiceNo || "") === String(ch.invoiceNo); });
      if (saleByNo) return { kind: "sale", label: saleByNo.invoiceNo, doc: saleByNo };
    }
    if (ch.purchaseNo) {
      var purByNo = (state.purchases || []).find(function (p) { return String(p.invoiceNo || "") === String(ch.purchaseNo); });
      if (purByNo) return { kind: "purchase", label: purByNo.invoiceNo, doc: purByNo };
    }
    return null;
  };

  var openLinkedDoc = function (ch) {
    var linked = resolveLinkedDoc(ch);
    if (!linked) {
      showAlert("No linked invoice or receipt found for this cheque.");
      return;
    }
    setDocFmt((state.settings && state.settings.invoiceDefaultSize) || "a4");
    if (linked.kind === "sale") {
      setReceiptView(null);
      setDocKind("sale");
      setDocView(linked.doc);
      return;
    }
    if (linked.kind === "purchase") {
      setReceiptView(null);
      setDocKind("purchase");
      setDocView(linked.doc);
      return;
    }
    setDocView(null);
    setDocKind("");
    setReceiptMode(linked.kind === "receipt-out" ? "out" : "in");
    setReceiptView(linked.doc);
  };

  var printDocById = function (elId, title, fmt) {
    var el = document.getElementById(elId);
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
    w.document.write("<!DOCTYPE html><html><head>" + PRINT_FONT_LINK + "<title>" + escapeHtml(title || "") + "</title>" + css + "</head><body>" + el.innerHTML + "</body></html>");
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 500);
  };

  /* Status badge */
  var ChequeStatusBadge = function (bp) {
    var s = bp.status; var due = bp.due;
    var overdue = s === "Pending" && due < todayStr;
    var dueSoon = s === "Pending" && due >= todayStr && (new Date(due) - new Date(todayStr)) / 86400000 <= 7;
    if (s === "Cleared") return <span className="erp-chq-status is-cleared">Cleared</span>;
    if (s === "Bounced") return <span className="erp-chq-status is-bounced">Bounced</span>;
    if (overdue) return <span className="erp-chq-status is-overdue">Overdue</span>;
    if (dueSoon) return <span className="erp-chq-status is-soon">Due soon</span>;
    return <span className="erp-chq-status is-pending">Pending</span>;
  };

  var pendingOut = cheques.filter(function (c) { return c.type === "outgoing" && c.status === "Pending"; }).reduce(function (a, c) { return a + c.amount; }, 0);
  var pendingIn = cheques.filter(function (c) { return c.type === "incoming" && c.status === "Pending"; }).reduce(function (a, c) { return a + c.amount; }, 0);
  var overdueCount = cheques.filter(function (c) { return c.status === "Pending" && c.dueDate < todayStr; }).length;
  var pendingOutCount = cheques.filter(function (c) { return c.type === "outgoing" && c.status === "Pending"; }).length;
  var pendingInCount = cheques.filter(function (c) { return c.type === "incoming" && c.status === "Pending"; }).length;
  var clearedCount = cheques.filter(function (c) { return c.status === "Cleared"; }).length;
  var bouncedCount = cheques.filter(function (c) { return c.status === "Bounced"; }).length;
  var pendingTabCount = cheques.filter(function (c) { return c.status === "Pending"; }).length;

  var TABS = [
    ["all", "All", cheques.length],
    ["pending", "Pending", pendingTabCount],
    ["overdue", "Overdue", overdueCount],
    ["cleared", "Cleared", clearedCount],
    ["bounced", "Bounced", bouncedCount]
  ];

  var filtered = cheques.filter(function (ch) {
    var q = search.toLowerCase().trim();
    var matchQ = !q || (ch.chequeNo || "").toLowerCase().includes(q) || (ch.supplierName || ch.customerName || ch.partyName || "").toLowerCase().includes(q) || (ch.invoiceNo || ch.purchaseNo || "").toLowerCase().includes(q) || (ch.bankName || "").toLowerCase().includes(q);
    var overdue = ch.status === "Pending" && ch.dueDate < todayStr;
    var matchTab = tab === "all"
      || (tab === "pending" && ch.status === "Pending")
      || (tab === "overdue" && overdue)
      || (tab === "cleared" && ch.status === "Cleared")
      || (tab === "bounced" && ch.status === "Bounced");
    return matchQ && matchTab;
  });
  var chqPager = usePager(filtered, LIST_PAGE_SIZE);

  /* ── Mark Cleared ── */
  var markCleared = function (ch) {
    if (ch.status === "Voided") { showAlert("This cheque has been voided and cannot be cleared."); return; }
    var lockId = buildInvoiceEditLockIdentity({
      currentUser: props.currentUser || null,
      clientMachineLabel: String(props.clientMachineLabel || "").trim(),
    });
    var proceedClear = function () {
      showConfirm(
        (ch.type === "outgoing" ? "Mark this cheque as CLEARED?\n\n" + getCurrencySymbol() + " " + fmtNum(ch.amount) + " will be deducted from your bank balance." : "Mark this cheque as CLEARED?\n\n" + getCurrencySymbol() + " " + fmtNum(ch.amount) + " will be added to your bank balance."),
        function () {
          var applyClear = function (salesBase, purchasesBase) {
            var nch = (state.cheques || []).map(function (c) {
              return c.id === ch.id ? stampUpdatedAt(Object.assign({}, c, { status: "Cleared", clearedDate: today() })) : c;
            });
            var chqIds = [ch.id];
            if (ch.replacesChequeid) chqIds.push(ch.replacesChequeid);
            var matchesPh = function (ph) { return chqIds.indexOf(ph.chequeId) >= 0; };
            var np = (purchasesBase || state.purchases || []).slice();
            var ns = (salesBase || state.sales || []).slice();
            var nc = state.customers.slice();
            if (ch.type === "outgoing" && ch.purchaseId) {
              var pur = np.find(function (p) { return p.id === ch.purchaseId; });
              if (pur) {
                var fitP = assertPaymentFitsPurchaseBalance(pur, ch.amount);
                if (!fitP.ok) { showAlert(fitP.message); return; }
              }
              np = np.map(function (p) {
                if (p.id !== ch.purchaseId) return p;
                var newPaid = (p.paidAmount || 0) + ch.amount;
                var newBal = p.total - newPaid;
                var newStatus = newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
                var updPh = (p.paymentHistory || []).map(function (ph) {
                  return matchesPh(ph) ? Object.assign({}, ph, { amount: ch.amount, chequeId: ch.id, note: ph.note.replace("(Pending", "(Cleared " + today() + ""), cashMethod: "Bank" }) : ph;
                });
                return stampUpdatedAt(Object.assign({}, p, { paidAmount: newPaid, balance: newBal, status: newStatus, paymentHistory: updPh }));
              });
            }
            if (ch.type === "outgoing" && (ch.manualPayableId || ch.thirdPartyRepairId)) {
              var manPays = S.get("tc3_manualPayables", []);
              var updManPays = manPays.map(function (mp) {
                if (ch.manualPayableId && mp.id !== ch.manualPayableId) return mp;
                if (!ch.manualPayableId && ch.thirdPartyRepairId && mp.thirdPartyRepairId !== ch.thirdPartyRepairId) return mp;
                if (!ch.manualPayableId && ch.thirdPartyRepairId) {
                  var linkedPh = (mp.paymentHistory || []).some(function (ph) { return ph.chequeId === ch.id; });
                  if (!linkedPh) return mp;
                }
                var updPh = (mp.paymentHistory || []).map(function (ph) {
                  return matchesPh(ph) ? Object.assign({}, ph, { amount: ch.amount, chequeId: ch.id, cashMethod: "Bank", note: ph.note.replace("(Pending", "(Cleared " + today() + "") }) : ph;
                });
                return stampUpdatedAt(Object.assign({}, mp, { paymentHistory: updPh }));
              });
              S.set("tc3_manualPayables", updManPays);
            }
            if (ch.type === "incoming" && ch.saleId) {
              var saleRow = ns.find(function (s) { return s.id === ch.saleId; });
              if (saleRow) {
                var fitS = assertPaymentFitsSaleBalance(saleRow, ch.amount);
                if (!fitS.ok) { showAlert(fitS.message); return; }
              }
              ns = ns.map(function (s) {
                if (s.id !== ch.saleId) return s;
                var newPaid = (s.paid || 0) + ch.amount;
                var newBal = s.total - newPaid;
                var newStatus = newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
                var updPh = (s.paymentHistory || []).map(function (ph) {
                  return matchesPh(ph) ? Object.assign({}, ph, { amount: ch.amount, chequeId: ch.id, note: ph.note.replace("(Pending", "(Cleared " + today() + ""), cashMethod: "Bank" }) : ph;
                });
                return stampUpdatedAt(Object.assign({}, s, { paid: newPaid, balance: newBal, payStatus: newStatus, paymentHistory: updPh }));
              });
              var saleForCr = ns.find(function (s) { return s.id === ch.saleId; }) || state.sales.find(function (s) { return s.id === ch.saleId; });
              var creditTargetId = ch.customerId || (saleForCr && saleForCr.customerId) || "";
              if (creditTargetId) {
                nc = nc.map(function (c) {
                  return c.id === creditTargetId ? stampCustomerBalance(Object.assign({}, c, { credit: Math.max(0, (c.credit || 0) - ch.amount) }), null, c) : c;
                });
              } else if (saleForCr && saleForCr.customerName) {
                var nameKey = String(saleForCr.customerName).trim().toLowerCase();
                var nameMatches = nc.filter(function (c) { return String(c.name || "").trim().toLowerCase() === nameKey; });
                if (nameMatches.length === 1) {
                  nc = nc.map(function (c) {
                    return c.id === nameMatches[0].id ? stampCustomerBalance(Object.assign({}, c, { credit: Math.max(0, (c.credit || 0) - ch.amount) }), null, c) : c;
                  });
                }
              }
            }
            if (ch.type === "incoming" && ch.manualReceivableId) {
              var manRecs = S.get("tc3_manualReceivables", []);
              var updManRecs = manRecs.map(function (mr) {
                if (mr.id !== ch.manualReceivableId) return mr;
                var updPh = (mr.paymentHistory || []).map(function (ph) {
                  return matchesPh(ph) ? Object.assign({}, ph, { amount: ch.amount, chequeId: ch.id, cashMethod: "Bank", note: ph.note.replace("(Pending", "(Cleared " + today() + "") }) : ph;
                });
                return stampUpdatedAt(Object.assign({}, mr, { paymentHistory: updPh }));
              });
              S.set("tc3_manualReceivables", updManRecs);
            }
            S.set("tc3_cheques", nch);
            if (ch.type === "outgoing" && ch.purchaseId) S.set("tc3_purchases", np);
            if (ch.type === "incoming" && ch.saleId) {
              S.set("tc3_sales", ns);
              S.set("tc3_customers", nc);
            }
            var pushPairs = [["tc3_cheques", nch]];
            if (ch.type === "outgoing" && ch.purchaseId) pushPairs.push(["tc3_purchases", np]);
            if (ch.type === "incoming" && ch.saleId) {
              pushPairs.push(["tc3_sales", ns]);
              pushPairs.push(["tc3_customers", nc]);
            }
            try { pushKeysNow(pushPairs); } catch (_e) { /* ignore */ }
            setState(function (st) {
              return Object.assign({}, st, {
                cheques: nch,
                purchases: (ch.type === "outgoing" && ch.purchaseId) ? np : st.purchases,
                sales: (ch.type === "incoming" && ch.saleId) ? ns : st.sales,
                customers: (ch.type === "incoming" && ch.saleId) ? nc : st.customers,
              });
            });
            addAudit("Cheque Cleared", "#" + (ch.chequeNo || "") + " " + getCurrencySymbol() + " " + fmtNum(ch.amount));
            setActionModal(null);
          };

          var refreshThenClear = function () {
            if (ch.type === "incoming" && ch.saleId) {
              loadFreshSaleForPayment(S, ch.saleId).then(function (fresh) {
                applyClear(fresh.sales || state.sales, state.purchases);
              }).catch(function () { applyClear(state.sales, state.purchases); });
            } else if (ch.type === "outgoing" && ch.purchaseId) {
              loadFreshPurchaseForPayment(S, ch.purchaseId).then(function (fresh) {
                applyClear(state.sales, fresh.purchases || state.purchases);
              }).catch(function () { applyClear(state.sales, state.purchases); });
            } else {
              applyClear(state.sales, state.purchases);
            }
          };
          refreshThenClear();
        }
      );
    };

    if (ch.type === "incoming" && ch.saleId) {
      checkForeignInvoiceEditLock(S, ch.saleId, lockId).then(function (fl) {
        if (fl) {
          showAlert(formatInvoiceEditLockMessage(fl) + " Cannot clear cheque until they finish.");
          return;
        }
        proceedClear();
      }).catch(function () { proceedClear(); });
    } else {
      proceedClear();
    }
  };

  /* ── Mark Bounced ── */
  var markBounced = function (ch) {
    showConfirm("Mark this cheque as BOUNCED?\n\nThe linked invoice balance will remain unpaid.", function () {
      var nch = (state.cheques || []).map(function (c) {
        return c.id === ch.id ? stampUpdatedAt(Object.assign({}, c, { status: "Bounced", bouncedDate: today() })) : c;
      });
      S.set("tc3_cheques", nch);
      addAudit("Cheque Bounced #" + ch.chequeNo, getCurrencySymbol() + " " + fmtNum(ch.amount));
      setState(function (st) { return Object.assign({}, st, { cheques: nch }); });
      setActionModal({ cheque: Object.assign({}, ch, { status: "Bounced" }), action: "reissue_prompt" });
    });
  };

  /* ── Re-issue cheque ── */
  var reissueCheque = function (ch) {
    if (!reissueForm.chequeNo || !reissueForm.dueDate) { showAlert("Enter new cheque number and due date."); return; }
    var reissueTs = new Date().toISOString();
    var newCheque = stampTransactionIsoDateTime(Object.assign({}, ch, {
      id: uid(),
      chequeNo: reissueForm.chequeNo,
      bankName: reissueForm.bankName || ch.bankName,
      dueDate: reissueForm.dueDate,
      status: "Pending",
      issuedDate: today(),
      replacesChequeid: ch.replacesChequeid || ch.id,
      bouncedDate: undefined,
      clearedDate: undefined,
      createdAt: reissueTs,
      updatedAt: reissueTs
    }), reissueTs);
    var nch = (state.cheques || []).map(function (c) {
      return c.id === ch.id ? stampUpdatedAt(Object.assign({}, c, { replacedByChequeid: newCheque.id })) : c;
    }).concat([newCheque]);
    S.set("tc3_cheques", nch);
    addAudit("Cheque Re-issued #" + newCheque.chequeNo + " (replaces #" + ch.chequeNo + ")", getCurrencySymbol() + " " + fmtNum(ch.amount));
    setState(function (st) { return Object.assign({}, st, { cheques: nch }); });
    setActionModal(null);
    setReissueForm({ chequeNo: "", dueDate: "", bankName: "" });
    showAlert("✅ New cheque #" + newCheque.chequeNo + " issued for " + getCurrencySymbol() + " " + fmtNum(newCheque.amount) + " due " + newCheque.dueDate);
  };

  /* ── Add standalone cheque (not linked to invoice) ── */
  var addStandaloneCheque = function () {
    var amt = parseFloat(addForm.amount);
    if (!addForm.chequeNo || !amt || !addForm.partyName) { showAlert("Enter cheque number, amount and party name."); return; }
    if (!tcTrialGuard(state.cheques || [], "cheques")) return;
    var proceed = function () {
      var chTs = new Date().toISOString();
      var newCheque = stampTransactionIsoDateTime({
        id: uid(), type: addModal, status: "Pending",
        chequeNo: addForm.chequeNo, bankName: addForm.bankName,
        amount: amt, dueDate: addForm.dueDate || today(), issuedDate: today(),
        supplierName: addModal === "outgoing" ? addForm.partyName : "",
        customerName: addModal === "incoming" ? addForm.partyName : "",
        purchaseId: "", purchaseNo: "", saleId: "", invoiceNo: "",
        note: addForm.note, createdAt: chTs, updatedAt: chTs
      }, chTs);
      var nch = (state.cheques || []).concat([newCheque]);
      S.set("tc3_cheques", nch);
      addAudit("Cheque Added #" + newCheque.chequeNo, getCurrencySymbol() + " " + fmtNum(amt));
      setState(function (st) { return Object.assign({}, st, { cheques: nch }); });
      setAddModal(null);
      setAddForm({ chequeNo: "", bankName: "", amount: "", dueDate: today(), partyName: "", note: "" });
    };
    if (typeof checkPeriodClose === "function") {
      checkPeriodClose(today(), state.settings, proceed);
    } else {
      proceed();
    }
  };

  var deleteStandalone = function (id) {
    showConfirm("Delete this cheque record?", function () {
      var nch = (state.cheques || []).filter(function (c) { return c.id !== id; });
      S.set("tc3_cheques", nch);
      setState(function (st) { return Object.assign({}, st, { cheques: nch }); });
    });
  };

  return (
    <div className="erp-page erp-arap-modern is-chq">
      <div className="erp-arap-chrome">
        <div className="erp-arap-topbar">
          <div className="erp-arap-topbar-brand">
            <div className="erp-arap-brand-ico" aria-hidden="true">CQ</div>
            <div>
              <h1 className="erp-arap-header-title">Cheques</h1>
              <p className="erp-arap-header-sub">Register · clear · bounce · re-issue</p>
            </div>
          </div>
          <div className="erp-arap-kpi-row" aria-label="Cheque overview">
            <div className="erp-arap-kpi is-red">
              <span className="erp-arap-kpi-lbl">To pay</span>
              <span className="erp-arap-kpi-val">{getCurrencySymbol()} {fmtNum(pendingOut)}</span>
              <span className="erp-arap-kpi-sub">{pendingOutCount} outgoing</span>
            </div>
            <div className="erp-arap-kpi is-green">
              <span className="erp-arap-kpi-lbl">To receive</span>
              <span className="erp-arap-kpi-val">{getCurrencySymbol()} {fmtNum(pendingIn)}</span>
              <span className="erp-arap-kpi-sub">{pendingInCount} incoming</span>
            </div>
            <div className={"erp-arap-kpi " + (overdueCount > 0 ? "is-red" : "is-orange")}>
              <span className="erp-arap-kpi-lbl">Overdue</span>
              <span className="erp-arap-kpi-val">{overdueCount}</span>
              <span className="erp-arap-kpi-sub">past due date</span>
            </div>
            <div className="erp-arap-kpi is-purple">
              <span className="erp-arap-kpi-lbl">Total</span>
              <span className="erp-arap-kpi-val">{cheques.length}</span>
              <span className="erp-arap-kpi-sub">{clearedCount} cleared</span>
            </div>
          </div>
        </div>
        {overdueCount > 0 ? (
          <div className="erp-chq-alert">
            <strong>{overdueCount} overdue</strong>
            <span>Past due date — update status soon.</span>
            <button type="button" className="erp-chq-alert-btn" onClick={function () { setTab("overdue"); }}>View overdue</button>
          </div>
        ) : null}
        <div className="erp-arap-tabs" role="tablist" aria-label="Cheque status tabs">
          {TABS.map(function (t) {
            var active = tab === t[0];
            return (
              <button
                key={t[0]}
                type="button"
                role="tab"
                aria-selected={active}
                className={"erp-arap-tab" + (active ? " is-active" : "")}
                onClick={function () { setTab(t[0]); }}
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
                placeholder="Search cheque #, party, bank, invoice…"
                aria-label="Search cheques"
              />
            </div>
            {search ? (
              <button type="button" className="erp-arap-btn-clear" onClick={function () { setSearch(""); }}>Clear</button>
            ) : null}
            <span className="erp-arap-filter-meta">
              {(TABS.find(function (t) { return t[0] === tab; }) || TABS[0])[1]} · {filtered.length.toLocaleString()} cheques
            </span>
          </div>

          <div className="erp-arap-table-wrap">
            <table className="erp-arap-table" style={{ minWidth: 920, tableLayout: "auto" }}>
              <thead>
                <tr>
                  <th style={{ width: 64 }}>Type</th>
                  <th style={{ width: 96 }}>Cheque #</th>
                  <th style={{ width: 100 }}>Bank</th>
                  <th style={{ minWidth: 120 }}>Party</th>
                  <th style={{ width: 100 }}>Linked</th>
                  <th style={{ width: 100, textAlign: "right" }}>Amount</th>
                  <th style={{ width: 100 }}>Due</th>
                  <th style={{ width: 92 }}>Status</th>
                  <th style={{ width: 88 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="erp-arap-empty">
                      {search ? "No cheques match your search." : "No cheques in this tab. Cheque payments from Sales / Purchases appear here."}
                    </td>
                  </tr>
                )}
                {chqPager.slice.map(function (ch) {
                  var party = ch.type === "outgoing" ? (ch.supplierName || ch.partyName || "—") : (ch.customerName || ch.partyName || "—");
                  var linkedMeta = resolveLinkedDoc(ch);
                  var linkedLabel = linkedMeta
                    ? linkedMeta.label
                    : (ch.type === "outgoing" ? (ch.purchaseNo || "") : (ch.invoiceNo || "")) || "—";
                  var daysLeft = Math.ceil((new Date(ch.dueDate) - new Date(todayStr)) / 86400000);
                  return (
                    <tr key={ch.id} className="table-row-hover">
                      <td>
                        {ch.type === "outgoing"
                          ? <span className="erp-chq-type is-out">Out</span>
                          : <span className="erp-chq-type is-in">In</span>}
                      </td>
                      <td className="erp-arap-ref" style={{ color: "#4338ca", fontWeight: 800 }}>{ch.chequeNo}</td>
                      <td style={{ color: "#64748b", fontSize: 11.5 }}>{ch.bankName || "—"}</td>
                      <td className="erp-arap-src" title={party}>{party}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {linkedMeta ? (
                          <button
                            type="button"
                            className="erp-arap-inv-link is-chq"
                            title="Open original invoice / receipt"
                            onClick={function () { openLinkedDoc(ch); }}
                          >
                            {linkedLabel}
                          </button>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>{linkedLabel}</span>
                        )}
                      </td>
                      <td className="erp-arap-amt" style={{ color: ch.type === "outgoing" ? "#b91c1c" : "#047857", fontWeight: 800 }}>
                        {getCurrencySymbol()} {fmtNum(ch.amount)}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>{ch.dueDate}</div>
                        {ch.status === "Pending" ? (
                          <div
                            className="erp-chq-due-sub"
                            style={{ color: daysLeft < 0 ? "#b91c1c" : daysLeft <= 7 ? "#c2410c" : "#94a3b8" }}
                          >
                            {daysLeft < 0 ? Math.abs(daysLeft) + "d overdue" : daysLeft === 0 ? "Due today" : daysLeft + "d left"}
                          </div>
                        ) : null}
                      </td>
                      <td><ChequeStatusBadge status={ch.status} due={ch.dueDate} /></td>
                      <td style={Object.assign({}, actBtnCellStyle, { width: 88, minWidth: 88, whiteSpace: "nowrap" })}>
                        <ActBtnGroup gap={4}>
                          {ch.status === "Pending" ? (
                            <React.Fragment>
                              <ActBtn tone="green" icon="clear" title="Clear cheque" onClick={function () { setActionModal({ cheque: ch, action: "clear" }); }} />
                              <ActBtn tone="red" icon="return" title="Mark bounced" onClick={function () { markBounced(ch); }} />
                            </React.Fragment>
                          ) : null}
                          {ch.status === "Bounced" && !ch.replacedByChequeid ? (
                            <ActBtn tone="blue" icon="refresh" title="Re-issue cheque" onClick={function () { setActionModal({ cheque: ch, action: "reissue_prompt" }); }} />
                          ) : null}
                          {ch.status === "Bounced" && ch.replacedByChequeid ? (
                            <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>Re-issued</span>
                          ) : null}
                          {!ch.purchaseId && !ch.saleId ? (
                            <ActBtn tone="red" title="Delete standalone cheque" onClick={function () { deleteStandalone(ch.id); }} />
                          ) : null}
                        </ActBtnGroup>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="erp-arap-foot">
            <div className="erp-arap-pager-wrap">
              <Pager pager={chqPager} />
            </div>
          </div>
        </div>
      </div>

      {actionModal && actionModal.action === "clear" && (
        <Modal
          className="erp-arap-view-modal is-chq"
          title={"Clear cheque · #" + actionModal.cheque.chequeNo}
          subtitle={(actionModal.cheque.type === "outgoing" ? "Outgoing" : "Incoming") + " · bank balance will update"}
          onClose={function () { setActionModal(null); }}
          compact
          closeRound
        >
          <div className="erp-arap-view">
            <div className={"erp-arap-view-alert " + (actionModal.cheque.type === "outgoing" ? "is-due" : "is-ok")}>
              <div>
                <strong>{actionModal.cheque.type === "outgoing" ? "Deduct from bank" : "Add to bank"}</strong>
                <span>{actionModal.cheque.supplierName || actionModal.cheque.customerName || "—"} · due {actionModal.cheque.dueDate}</span>
              </div>
              <b>{getCurrencySymbol()} {fmtNum(actionModal.cheque.amount)}</b>
            </div>
            <div className="erp-arap-view-actions">
              <Btn col="green" onClick={function () { markCleared(actionModal.cheque); }}>Confirm clear</Btn>
              <Btn col="gray" onClick={function () { setActionModal(null); }}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      {actionModal && actionModal.action === "reissue_prompt" && (
        <Modal
          className="erp-arap-view-modal is-chq"
          title={"Re-issue · #" + actionModal.cheque.chequeNo}
          subtitle={"Bounced · amount " + getCurrencySymbol() + " " + fmtNum(actionModal.cheque.amount)}
          onClose={function () { setActionModal(null); setReissueForm({ chequeNo: "", dueDate: "", bankName: "" }); }}
          compact
          closeRound
        >
          <div className="erp-arap-view">
            <div className="erp-arap-view-alert is-due">
              <div>
                <strong>Issue replacement cheque</strong>
                <span>Original #{actionModal.cheque.chequeNo} bounced</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Input label="New cheque no *" value={reissueForm.chequeNo} onChange={function (e) { setReissueForm(function (x) { return Object.assign({}, x, { chequeNo: e.target.value }); }); }} placeholder="New number" />
                <Input label="Bank" value={reissueForm.bankName || actionModal.cheque.bankName || ""} onChange={function (e) { setReissueForm(function (x) { return Object.assign({}, x, { bankName: e.target.value }); }); }} />
              </div>
              <Input label="New due date *" type="date" value={reissueForm.dueDate} onChange={function (e) { setReissueForm(function (x) { return Object.assign({}, x, { dueDate: e.target.value }); }); }} />
            </div>
            <div className="erp-arap-view-actions">
              <Btn col="blue" onClick={function () { reissueCheque(actionModal.cheque); }}>Issue replacement</Btn>
              <Btn col="gray" onClick={function () { setActionModal(null); setReissueForm({ chequeNo: "", dueDate: "", bankName: "" }); }}>Skip</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* View & Print — sales invoice */}
      {docView && docKind === "sale" && InvoiceA4 ? (
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
                  return (
                    <button key={v} type="button" className={"erp-si-fv-fmt" + (docFmt === v ? " is-active" : "")} onClick={function () { setDocFmt(v); }}>{lbl}</button>
                  );
                })}
              </div>
            </div>
            <div className="erp-si-fv-actions">
              <button type="button" className="erp-si-fv-btn is-print" onClick={function () { setPrintTarget("sale"); setPrintFmtOpen(true); }}>Print</button>
              <button type="button" className="erp-si-fv-btn is-close" onClick={function () { setDocView(null); setDocKind(""); }} aria-label="Close">✕</button>
            </div>
          </div>
          <div className="erp-si-fv-stage">
            <div id={"chq-inv-preview-" + docView.id} className={"erp-si-fv-sheet" + ((docFmt === "thermal58" || docFmt === "thermal80") ? " is-thermal" : " is-paper")}>
              {(docFmt === "thermal58" || docFmt === "thermal80") && InvoiceThermal
                ? <InvoiceThermal inv={docView} settings={state.settings} invoiceLang="en" width={docFmt === "thermal58" ? 218 : 302} />
                : <InvoiceA4 inv={docView} settings={state.settings} invoiceLang="en" size={(docFmt === "thermal58" || docFmt === "thermal80") ? "a4" : docFmt} />}
            </div>
          </div>
        </div>
      ) : null}

      {/* View & Print — purchase invoice */}
      {docView && docKind === "purchase" ? (
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
                  return (
                    <button key={v} type="button" className={"erp-si-fv-fmt" + (docFmt === v ? " is-active" : "")} onClick={function () { setDocFmt(v); }}>{lbl}</button>
                  );
                })}
              </div>
            </div>
            <div className="erp-si-fv-actions">
              <button type="button" className="erp-si-fv-btn is-print" onClick={function () { setPrintTarget("purchase"); setPrintFmtOpen(true); }}>Print</button>
              <button type="button" className="erp-si-fv-btn is-close" onClick={function () { setDocView(null); setDocKind(""); }} aria-label="Close">✕</button>
            </div>
          </div>
          <div className="erp-si-fv-stage">
            <div id={"chq-pur-preview-" + docView.id} className={"erp-si-fv-sheet" + ((docFmt === "thermal58" || docFmt === "thermal80") ? " is-thermal" : " is-paper")}>
              <PurchaseInvoiceDoc
                pur={docView}
                settings={state.settings}
                size={(docFmt === "thermal58" || docFmt === "thermal80") ? "a4" : docFmt}
                fmtDateFull={fmtDateFull}
                fmtNum={fmtNum}
                getCurrencySymbol={getCurrencySymbol}
                fmtStock={fmtStock}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* View & Print — money receipt */}
      {receiptView ? (function () {
        var rcp = receiptView;
        var rcpNo = rcp.receiptNo || rcp.reference || (rcp.id || "").slice(0, 8);
        var sheetSize = (docFmt === "thermal58" || docFmt === "thermal80") ? "a4" : docFmt;
        var isOut = receiptMode === "out";
        return (
          <div className="erp-si-fv is-receipt" role="dialog" aria-modal="true" aria-label="View and print receipt">
            <div className="erp-si-fv-bar">
              <div className="erp-si-fv-bar-left">
                <span className="erp-si-fv-badge" aria-hidden="true">VP</span>
                <div className="erp-si-fv-meta">
                  <span className="erp-si-fv-kicker">View &amp; Print</span>
                  <div className="erp-si-fv-meta-main">
                    <span className="erp-si-fv-inv">{rcpNo}</span>
                    <span className="erp-si-fv-sub">{(isOut ? "Money Out" : "Money In") + " · " + (rcp.person || rcp.source || "Party") + " · " + fmtDateFull(rcp.date)}</span>
                  </div>
                </div>
              </div>
              <div className="erp-si-fv-tools">
                <span className="erp-si-fv-tool-label">Format</span>
                <div className="erp-si-fv-formats" role="group" aria-label="Print format">
                  {invPrintFmtOptions.map(function (item) {
                    var v = item[0]; var lbl = item[1];
                    return (
                      <button key={v} type="button" className={"erp-si-fv-fmt" + (docFmt === v ? " is-active" : "")} onClick={function () { setDocFmt(v); }}>{lbl}</button>
                    );
                  })}
                </div>
              </div>
              <div className="erp-si-fv-actions">
                <button
                  type="button"
                  className="erp-si-fv-btn is-convert"
                  onClick={function () {
                    if (rcp._isOpening) {
                      showAlert("Opening balance entries are edited from Accounts → Opening Balance.");
                      return;
                    }
                    if (rcp.thirdPartyRepairId) {
                      showAlert("This receipt is linked to a 3rd party repair. Edit it from Repairs.");
                      return;
                    }
                    setReceiptView(null);
                    setEditReceipt(rcp);
                  }}
                >Edit</button>
                <button type="button" className="erp-si-fv-btn is-print" onClick={function () { setPrintTarget("receipt"); setPrintFmtOpen(true); }}>Print</button>
                <button type="button" className="erp-si-fv-btn is-close" onClick={function () { setReceiptView(null); }} aria-label="Close">✕</button>
              </div>
            </div>
            <div className="erp-si-fv-stage">
              <div id={"chq-rcp-preview-" + rcp.id} className={"erp-si-fv-sheet" + ((docFmt === "thermal58" || docFmt === "thermal80") ? " is-thermal" : " is-paper")}>
                <MoneyReceiptDoc
                  receipt={rcp}
                  mode={isOut ? "out" : "in"}
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
      })() : null}

      {editReceipt ? (
        <MoneyInOutModal
          mode={receiptMode === "out" ? "out" : "in"}
          editRecord={editReceipt}
          S={S}
          today={today}
          uid={uid}
          tcTrialGuard={tcTrialGuard}
          showAlert={showAlert}
          addAudit={addAudit}
          setState={setState}
          onClose={function () { setEditReceipt(null); }}
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
      ) : null}

      <PrintFormatChooser
        open={printFmtOpen}
        settings={state.settings}
        thermalId={invThermalFmt}
        title={printTarget === "receipt" ? "Print receipt" : (printTarget === "purchase" ? "Print purchase" : "Print invoice")}
        hint="Choose A4, A5, or Thermal for your printer."
        onClose={function () { setPrintFmtOpen(false); setPrintTarget(null); }}
        onSelect={function (fmt) {
          setPrintFmtOpen(false);
          var target = printTarget;
          setPrintTarget(null);
          if (target === "sale" && docView) printDocById("chq-inv-preview-" + docView.id, "Invoice " + (docView.invoiceNo || ""), fmt);
          else if (target === "purchase" && docView) printDocById("chq-pur-preview-" + docView.id, "Purchase " + (docView.invoiceNo || ""), fmt);
          else if (target === "receipt" && receiptView) printDocById("chq-rcp-preview-" + receiptView.id, "Receipt " + (receiptView.receiptNo || ""), fmt);
        }}
      />
    </div>
  );
});

export default Cheques;
