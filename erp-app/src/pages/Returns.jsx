import React, { useState, useEffect } from "react";
import { computeSaleTaxFromSnapshot, computePurchaseReturnTax } from "../tax/taxCompute.js";
import { round2 } from "../utils/moneyRound.js";
import { LIST_PAGE_SIZE, sortNewestFirst } from "../utils/listPage.js";
import { glassInvoiceLineTotal } from "../utils/glassProduct.js";
import { isVoidedTxn } from "../utils/voidInvoice.js";
import { stampProductStock, stampUpdatedAt, stampCustomerBalance, stampTransactionIsoDateTime } from "../utils/stampUpdatedAt.js";

function saleLineReturnKey(it, idx) {
  if (it && (it.lineId || it.cartLineId)) return String(it.lineId || it.cartLineId);
  return String((it && it.id) || "line") + "#" + idx;
}

function purchaseLineReturnKey(it, idx) {
  if (it && (it.lineId || it.purchaseLineId)) return String(it.lineId || it.purchaseLineId);
  return String((it && it.id) || "pline") + "#" + idx;
}

/* ─── RETURNS PAGE ────────────────────────────────────────────────────────── */
var Returns = function (props) {
  var state = props.state;
  var setState = props.setState;
  var C = props.C;
  var showAlert = props.showAlert;
  var showConfirm = props.showConfirm;
  var S = props.S;
  var uid = props.uid;
  var today = props.today;
  var addAudit = props.addAudit;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var genInvNo = props.genInvNo;
  var roundQty = props.roundQty;
  var StatCard = props.StatCard;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var Btn = props.Btn;
  var Modal = props.Modal;
  var Input = props.Input;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var Badge = props.Badge;
  var usePager = props.usePager;
  var Pager = props.Pager;
  var tcTrialGuard = props.tcTrialGuard;
  var openSourceDocument = props.openSourceDocument;
  var [tab, setTab] = useState("salesreturn");
  var TABS = [["salesreturn", "Sales Return"], ["purchasereturn", "Purchase Return"]];
  useEffect(function () {
    try {
      var t = sessionStorage.getItem("tc3_returns_tab");
      if (t === "salesreturn" || t === "purchasereturn") {
        setTab(t);
        sessionStorage.removeItem("tc3_returns_tab");
      }
    } catch (e) { /* ignore */ }
  }, []);
  var salesRetCount = (state.salesReturns || []).length;
  var purRetCount = (state.purchaseReturns || []).length;
  var salesHistory = state.salesReturns || [];
  var purHistory = state.purchaseReturns || [];
  var salesGoods = salesHistory.reduce(function (a, r) { return a + (r.amount || 0); }, 0);
  var salesRefunds = salesHistory.filter(function (r) { return r.isRefund; }).reduce(function (a, r) { return a + (r.refundAmount || 0); }, 0);
  var salesUnits = salesHistory.reduce(function (a, r) { return a + (r.qty || 0); }, 0);
  var purGoods = purHistory.reduce(function (a, r) { return a + (r.amount || 0); }, 0);
  var purUnits = purHistory.reduce(function (a, r) { return a + (r.qty || 0); }, 0);
  var purSuppliers = [...new Set(purHistory.map(function (r) { return r.supplier; }))].length;

  return (
    <div className="erp-page erp-arap-modern is-ret">
      <div className="erp-arap-chrome">
        <div className="erp-arap-topbar">
          <div className="erp-arap-topbar-brand">
            <div className="erp-arap-brand-ico" aria-hidden="true">RT</div>
            <div>
              <h1 className="erp-arap-header-title">Returns</h1>
              <p className="erp-arap-header-sub">Sales &amp; purchase returns · restock &amp; refunds</p>
            </div>
          </div>
          {tab === "salesreturn" ? (
            <div className="erp-arap-kpi-row erp-ret-kpis" aria-label="Sales return totals">
              <div className="erp-arap-kpi is-red">
                <span className="erp-arap-kpi-lbl">Goods value</span>
                <span className="erp-arap-kpi-val">{getCurrencySymbol()} {fmtNum(salesGoods)}</span>
                <span className="erp-arap-kpi-sub">{salesRetCount} entries</span>
              </div>
              <div className="erp-arap-kpi is-orange">
                <span className="erp-arap-kpi-lbl">Cash refunded</span>
                <span className="erp-arap-kpi-val">{getCurrencySymbol()} {fmtNum(salesRefunds)}</span>
                <span className="erp-arap-kpi-sub">{salesHistory.filter(function (r) { return r.isRefund; }).length} refunds</span>
              </div>
              <div className="erp-arap-kpi is-green">
                <span className="erp-arap-kpi-lbl">Items restocked</span>
                <span className="erp-arap-kpi-val">{salesUnits}</span>
                <span className="erp-arap-kpi-sub">total units</span>
              </div>
            </div>
          ) : (
            <div className="erp-arap-kpi-row erp-ret-kpis" aria-label="Purchase return totals">
              <div className="erp-arap-kpi is-orange">
                <span className="erp-arap-kpi-lbl">Purchase returns</span>
                <span className="erp-arap-kpi-val">{getCurrencySymbol()} {fmtNum(purGoods)}</span>
                <span className="erp-arap-kpi-sub">{purRetCount} entries</span>
              </div>
              <div className="erp-arap-kpi is-purple">
                <span className="erp-arap-kpi-lbl">Items returned</span>
                <span className="erp-arap-kpi-val">{purUnits}</span>
                <span className="erp-arap-kpi-sub">total units</span>
              </div>
              <div className="erp-arap-kpi is-blue">
                <span className="erp-arap-kpi-lbl">Suppliers</span>
                <span className="erp-arap-kpi-val">{purSuppliers}</span>
                <span className="erp-arap-kpi-sub">involved</span>
              </div>
            </div>
          )}
        </div>
        <div className="erp-arap-tabs" role="tablist" aria-label="Return type">
          {TABS.map(function (t) {
            var isA = tab === t[0];
            var count = t[0] === "salesreturn" ? salesRetCount : purRetCount;
            return (
              <button
                key={t[0]}
                type="button"
                role="tab"
                aria-selected={isA}
                className={"erp-arap-tab" + (isA ? " is-active" : "")}
                onClick={function () { setTab(t[0]); }}
              >
                <span>{t[1]}</span>
                <span className="erp-arap-tab-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>
      {tab === "salesreturn" && <SalesReturnTab
        state={state}
        setState={setState}
        C={C}
        showAlert={showAlert}
        showConfirm={showConfirm}
        S={S}
        uid={uid}
        today={today}
        addAudit={addAudit}
        getCurrencySymbol={getCurrencySymbol}
        fmtNum={fmtNum}
        genInvNo={genInvNo}
        roundQty={roundQty}
        StatCard={StatCard}
        Card={Card}
        CardTitle={CardTitle}
        Btn={Btn}
        Modal={Modal}
        Input={Input}
        TH={TH}
        TR={TR}
        TD={TD}
        Badge={Badge}
        usePager={usePager}
        Pager={Pager}
        tcTrialGuard={tcTrialGuard}
        openSourceDocument={openSourceDocument}
      />}
      {tab === "purchasereturn" && <PurchaseReturnTab
        state={state}
        setState={setState}
        C={C}
        showAlert={showAlert}
        showConfirm={showConfirm}
        S={S}
        uid={uid}
        today={today}
        addAudit={addAudit}
        getCurrencySymbol={getCurrencySymbol}
        fmtNum={fmtNum}
        genInvNo={genInvNo}
        roundQty={roundQty}
        StatCard={StatCard}
        Card={Card}
        CardTitle={CardTitle}
        Btn={Btn}
        Modal={Modal}
        Input={Input}
        TH={TH}
        TR={TR}
        TD={TD}
        Badge={Badge}
        usePager={usePager}
        Pager={Pager}
        openSourceDocument={openSourceDocument}
      />}
    </div>
  );
};

/* ── SALES RETURN TAB ─────────────────────────────────────────────────────── */
var SalesReturnTab = function (props) {
  var state = props.state;
  var setState = props.setState;
  var C = props.C;
  var showAlert = props.showAlert;
  var showConfirm = props.showConfirm;
  var S = props.S;
  var uid = props.uid;
  var today = props.today;
  var addAudit = props.addAudit;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var genInvNo = props.genInvNo;
  var roundQty = props.roundQty;
  var StatCard = props.StatCard;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var Btn = props.Btn;
  var Modal = props.Modal;
  var Input = props.Input;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var Badge = props.Badge;
  var usePager = props.usePager;
  var Pager = props.Pager;
  var tcTrialGuard = props.tcTrialGuard;
  var openSourceDocument = props.openSourceDocument;

  var openReturnProof = function (r, kind) {
    if (!r || typeof openSourceDocument !== "function") return;
    openSourceDocument({ sourceKind: kind, sourceId: r.id });
  };
  var openLinkedInvoice = function (r) {
    if (!r || !r.invoiceId || typeof openSourceDocument !== "function") return;
    openSourceDocument({ sourceKind: "sale", sourceId: r.invoiceId });
  };
  var [modal, setModal] = useState(null);
  var [custSearch, setCustSearch] = useState("");
  var [invSearch, setInvSearch] = useState("");
  var [selInv, setSelInv] = useState(null);
  var [returnQtys, setReturnQtys] = useState({});
  var [refundMethod, setRefundMethod] = useState("Cash");
  var [returnReason, setReturnReason] = useState("");
  var [returnDate, setReturnDate] = useState(today());
  var [histSearch, setHistSearch] = useState("");

  var openModal = function () {
    setModal("search");
    setCustSearch(""); setInvSearch(""); setSelInv(null); setReturnQtys({}); setReturnReason(""); setReturnDate(today());
  };
  var closeModal = function () { setModal(null); setSelInv(null); setReturnQtys({}); setCustSearch(""); setInvSearch(""); setReturnReason(""); setReturnDate(today()); };

  /* already-returned qty per invoice+line (legacy rows fall back to productId) */
  var getReturnedQty = function (invoiceId, productId, lineKey) {
    return roundQty((state.salesReturns || []).filter(function (r) {
      if (r.invoiceId !== invoiceId) return false;
      if (r.saleLineKey) return r.saleLineKey === lineKey;
      /* Legacy rows (no saleLineKey): attribute to product — may under-allow multi-line same SKU. */
      return r.productId === productId;
    }).reduce(function (a, r) { return a + (r.qty || 0); }, 0));
  };

  var selectInvoice = function (inv) {
    var init = {};
    (inv.items || []).forEach(function (it, idx) { init[saleLineReturnKey(it, idx)] = "0"; });
    setSelInv(inv);
    setReturnQtys(init);
    setModal("items");
  };

  var returnLineAmount = function (it, q) {
    if (!(q > 0)) return 0;
    if (it && it.isGlassLine) {
      var full = glassInvoiceLineTotal(it);
      var soldQty = Number(it.qty) || 0;
      if (soldQty <= 0) return 0;
      return round2(full * (q / soldQty));
    }
    return round2(q * (Number(it.price) || 0));
  };

  /* Allocate invoice discount across return lines so returns cannot reverse more than was billed. */
  var saleReturnDiscountFactor = function (inv) {
    if (!inv) return 1;
    var disc = round2(Number(inv.discount) || 0);
    if (disc <= 0.005) return 1;
    var sub = 0;
    (inv.items || []).forEach(function (it) {
      if (it && it.isGlassLine) {
        sub = round2(sub + glassInvoiceLineTotal(it));
      } else {
        sub = round2(sub + (Number(it.qty) || 0) * (Number(it.price) || 0));
      }
    });
    if (sub <= 0.005) return 1;
    return Math.max(0, Math.min(1, (sub - disc) / sub));
  };

  var returnTotal = selInv ? (function () {
    var factor = saleReturnDiscountFactor(selInv);
    return (selInv.items || []).reduce(function (a, it, idx) {
      var q = parseFloat(returnQtys[saleLineReturnKey(it, idx)]) || 0;
      return a + round2(returnLineAmount(it, q) * factor);
    }, 0);
  })() : 0;

  /* Filter invoices: match customer search OR invoice number search */
  var allSales = sortNewestFirst(state.sales || []);
  var filteredSales = allSales.filter(function (s) {
    if (isVoidedTxn(s)) return false;
    var cq = custSearch.toLowerCase().trim();
    var iq = invSearch.toLowerCase().trim();
    var matchC = !cq || (s.customerName || "").toLowerCase().includes(cq) || (s.customerPhone || "").includes(cq);
    var matchI = !iq || (s.invoiceNo || "").toLowerCase().includes(iq);
    return matchC && matchI;
  });
  var salesPickPager = usePager(filteredSales, LIST_PAGE_SIZE);

  var processReturn = function () {
    if (!selInv) return;
    if (isVoidedTxn(selInv)) { showAlert("Cannot return a voided invoice."); return; }
    var hasQty = (selInv.items || []).some(function (it, idx) {
      return (parseFloat(returnQtys[saleLineReturnKey(it, idx)]) || 0) > 0;
    });
    if (!hasQty) { showAlert("Enter at least one return quantity."); return; }
    if (!returnReason.trim()) { showAlert("Please enter a reason for this return."); return; }
    var err = null;
    (selInv.items || []).forEach(function (it, idx) {
      if (err) return;
      var lk = saleLineReturnKey(it, idx);
      var q = parseFloat(returnQtys[lk]) || 0;
      var maxReturn = (Number(it.qty) || 0) - getReturnedQty(selInv.id, it.id, lk);
      if (q < 0) { err = "Quantity cannot be negative."; return; }
      if (q > maxReturn + 1e-9) { err = "\"" + (it.name || "Item") + "\": max returnable is " + maxReturn + "."; }
    });
    if (err) { showAlert(err); return; }

    if (!tcTrialGuard(state.salesReturns || [], "salesReturns")) return;

    /* FIX Bug 2: Dynamic refund calculation — works for Paid AND Partial invoices.
       If the new invoice total drops below what was already paid, the difference must be refunded. */
    var origPaid = selInv.paid || 0;
    var origOutstanding = Math.max(0, (selInv.total || 0) - origPaid);
    var origLineSub = selInv.subTotal != null ? selInv.subTotal : (selInv.items || []).reduce(function (a, it) {
      return a + (it.isGlassLine ? glassInvoiceLineTotal(it) : ((it.qty || 0) * (it.price || 0)));
    }, 0);
    var newLineSub = Math.max(0, origLineSub - returnTotal);
    var origNet = Math.max(0, origLineSub - (selInv.discount || 0));
    var newNet = Math.max(0, origNet - returnTotal);
    var tcRet = computeSaleTaxFromSnapshot(selInv, newNet);
    var newTotal = tcRet.grandTotal;
    var refundAmt = Math.max(0, origPaid - newTotal);
    var needsRefund = refundAmt > 0;

    var msg = needsRefund
      ? "Process return of " + getCurrencySymbol() + " " + fmtNum(returnTotal) + "?\n\nCustomer has already paid " + getCurrencySymbol() + " " + fmtNum(origPaid) + " — a " + refundMethod + " refund of " + getCurrencySymbol() + " " + fmtNum(refundAmt) + " will be recorded."
      : "Process return of " + getCurrencySymbol() + " " + fmtNum(returnTotal) + "?\n\nCustomer outstanding balance will be reduced.";

    showConfirm(msg, function () {
      var newReturns = (state.salesReturns || []).slice();
      var np = state.products.slice();
      /* FIX: refundAmt is a single amount for the whole transaction.
         Only the FIRST returned item row carries it — the rest get 0.
         getCashBalances sums all rows, so storing it on every row multiplies it by item count. */
      var refundRecorded = false;
      var discFactor = saleReturnDiscountFactor(selInv);
      var returnSpendGross = 0;
      var batchReturnId = genInvNo("SR");

      (selInv.items || []).forEach(function (it, idx) {
        var lk = saleLineReturnKey(it, idx);
        var q = parseFloat(returnQtys[lk]) || 0;
        if (q <= 0) return;
        var lineGross = round2(returnLineAmount(it, q) * discFactor);
        var isInclusive = selInv.taxMode === "inclusive" || ((state.settings && state.settings.taxMode === "inclusive") && selInv.taxMode !== "exclusive");
        var lineTaxBundle = computeSaleTaxFromSnapshot(selInv, lineGross);
        var lineReturnTax = round2(lineTaxBundle.totalTax || 0);
        var lineNet = isInclusive ? round2(lineGross - lineReturnTax) : lineGross;
        var lineReturnGross = isInclusive ? lineGross : round2(lineGross + lineReturnTax);
        returnSpendGross = round2(returnSpendGross + lineReturnGross);
        var thisRefund = (needsRefund && !refundRecorded) ? refundAmt : 0;
        if (needsRefund && !refundRecorded) refundRecorded = true;
        newReturns.push(stampTransactionIsoDateTime({
          id: uid(), returnId: batchReturnId, invoiceId: selInv.id, invoiceNo: selInv.invoiceNo,
          productId: it.id, productName: it.name || "Unknown Product",
          saleLineKey: lk,
          qty: q, amount: lineNet, returnTax: lineReturnTax, returnGross: lineReturnGross, cost: it.cost || 0, /* FIX 1+3: store exact cost at return time — avoids cross-period lookup errors */
          taxMode: selInv.taxMode || (isInclusive ? "inclusive" : "exclusive"),
          selectedTaxes: (selInv.selectedTaxes || []).map(function (t) { return { name: t.name, rate: t.rate, amount: t.amount }; }),
          date: returnDate || today(),
          createdAt: new Date().toISOString(),
          customer: selInv.customerName || selInv.customer || "",
          customerId: selInv.customerId || "",
          reason: returnReason.trim(),
          isRefund: needsRefund && thisRefund > 0, refundMethod: (needsRefund && thisRefund > 0) ? refundMethod : null,
          refundAmount: thisRefund
        }));
        np = np.map(function (p) {
          if (p.id !== it.id) return p;
          if (String(p.type || "").toLowerCase() === "service") return p;
          var curS = p.stock || 0;
          var curC = p.cost || 0;
          var retCost = it.cost || 0; /* cost stored at sale time — exact WAC snapshot */
          var newS = curS + q;
          var newC;
          if (newS <= 0) {
            newC = curC; /* safety: stock still zero/negative after return */
          } else if (curS <= 0) {
            newC = retCost; /* no existing stock — returned cost becomes the new WAC */
          } else {
            /* Re-blend: returned items re-enter inventory at their original sale cost */
            newC = ((curS * curC) + (q * retCost)) / newS;
          }
          return stampProductStock(Object.assign({}, p, { stock: newS, cost: Math.round(newC * 100) / 100 }), null, p);
        });
      });

      /* Reduce sale total/balance; align paymentHistory sum with paid (refund row when paid drops) */
      var ns = state.sales.map(function (s) {
        if (s.id !== selInv.id) return s;
        var newPaid = Math.min(origPaid, newTotal); /* can't have paid more than new total */
        var newBal = Math.max(0, newTotal - newPaid);
        var newStat = newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
        var taxPatch = {
          taxMode: tcRet.taxMode || "exclusive",
          totalTax: tcRet.totalTax || 0,
          selectedTaxes: (tcRet.selectedTaxes || []).map(function (t) { return { name: t.name, rate: t.rate, amount: t.amount }; }),
        };
        var refundFromPaid = origPaid - newPaid;
        var ph = (s.paymentHistory || []).slice();
        if (refundFromPaid > 0.005) {
          ph.push({
            id: uid(),
            date: today(),
            amount: -refundFromPaid,
            type: "refund",
            note: "Sales return adjustment",
            createdAt: new Date().toISOString(),
            cashMethod: needsRefund && refundMethod === "Bank" ? "Bank" : (needsRefund ? "Cash" : "Adjustment"),
          });
        }
        return stampUpdatedAt(Object.assign({}, s, taxPatch, {
          subTotal: newLineSub,
          total: newTotal,
          balance: newBal,
          paid: newPaid,
          payStatus: newStat,
          paymentHistory: ph,
        }));
      });

      /* Adjust customer credit and totalSpent — no early exit for needsRefund (Ghost Debt fix) */
      var newOutstanding = Math.max(0, newTotal - Math.min(origPaid, newTotal));
      var debtReduced = Math.max(0, origOutstanding - newOutstanding);
      var nc = state.customers.map(function (c) {
        if (!selInv.customerId || c.id !== selInv.customerId) return c;
        return stampCustomerBalance(Object.assign({}, c, {
          credit: Math.max(0, (c.credit || 0) - debtReduced),
          totalSpent: Math.max(0, (c.totalSpent || 0) - returnSpendGross)
        }), null, c);
      });

      S.setMany
        ? S.setMany([
            ["tc3_salesReturns", newReturns],
            ["tc3_products", np],
            ["tc3_sales", ns],
            ["tc3_customers", nc],
          ])
        : (S.set("tc3_salesReturns", newReturns), S.set("tc3_products", np), S.set("tc3_sales", ns), S.set("tc3_customers", nc));
      addAudit("Sales Return " + getCurrencySymbol() + " " + fmtNum(returnTotal) + " (" + returnReason.trim() + ")", selInv.invoiceNo || selInv.id.slice(0, 8));
      setState(function (st) { return Object.assign({}, st, { salesReturns: newReturns, products: np, sales: ns, customers: nc }); });
      closeModal();
    });
  };

  /* History */
  var history = sortNewestFirst(state.salesReturns || []);
  var filteredHistory = history.filter(function (r) {
    if (!histSearch.trim()) return true;
    var q = histSearch.toLowerCase();
    return (r.customer || "").toLowerCase().includes(q) || (r.invoiceNo || "").toLowerCase().includes(q) || (r.productName || "").toLowerCase().includes(q) || (r.returnId || "").toLowerCase().includes(q);
  });
  var histPager = usePager(filteredHistory, LIST_PAGE_SIZE);

  return (
    <div className="erp-arap-body">
      <div className="erp-arap-panel">
        <div className="erp-arap-toolbar">
          <div className="erp-arap-search-wrap">
            <input
              className="erp-arap-field"
              placeholder="Search customer, invoice, product, return ID…"
              value={histSearch}
              onChange={function (e) { setHistSearch(e.target.value); }}
              aria-label="Search sales returns"
            />
          </div>
          {histSearch ? (
            <button type="button" className="erp-arap-btn-clear" onClick={function () { setHistSearch(""); }}>Clear</button>
          ) : null}
          <span className="erp-arap-filter-meta">{filteredHistory.length} of {history.length}</span>
          <button type="button" className="erp-arap-add is-sales-ret" onClick={openModal} style={{ marginLeft: "auto" }}>
            <span className="erp-arap-add-ico" aria-hidden="true">↩</span>
            <span>New Sales Return</span>
          </button>
        </div>
        <div className="erp-arap-table-wrap">
          <table className="erp-arap-table">
            <thead>
              <tr>
                <th>Date</th><th>Return ID</th><th>Invoice</th><th>Customer</th><th>Product</th><th>Qty</th><th>Amount</th><th>Reason</th><th>Settlement</th><th>Proof</th>
              </tr>
            </thead>
            <tbody>
              {histPager.slice.map(function (r) {
                return (
                  <tr key={r.id} className="table-row-hover">
                    <td style={{ color: "#64748b" }}>{r.date}</td>
                    <td style={{ fontWeight: 800, color: "#b91c1c" }}>
                      {typeof openSourceDocument === "function" ? (
                        <button type="button" className="erp-stmt-ref-btn" onClick={function () { openReturnProof(r, "sale-return"); }}>{r.returnId || r.id.slice(0, 8)}</button>
                      ) : (r.returnId || r.id.slice(0, 8))}
                    </td>
                    <td style={{ color: "#2563eb" }}>
                      {r.invoiceNo && typeof openSourceDocument === "function" ? (
                        <button type="button" className="erp-stmt-ref-btn" onClick={function () { openLinkedInvoice(r); }}>{r.invoiceNo}</button>
                      ) : (r.invoiceNo || "—")}
                    </td>
                    <td>{r.customer || "—"}</td>
                    <td className="erp-arap-src" title={r.productName || ""}>{r.productName || "Unknown"}</td>
                    <td style={{ textAlign: "center" }}>{r.qty}</td>
                    <td className="erp-arap-amt" style={{ color: "#b91c1c", fontWeight: 800 }}>{getCurrencySymbol()} {fmtNum(r.amount)}</td>
                    <td style={{ color: "#64748b", maxWidth: 140, whiteSpace: "normal", fontSize: 12 }}>{r.reason || "—"}</td>
                    <td>
                      {r.isRefund
                        ? <span className="erp-arap-badge-cat" style={{ background: "#e6f7f2", color: "#047857" }}>Refund ({r.refundMethod})</span>
                        : <span style={{ color: "#94a3b8", fontSize: 12 }}>Balance adj.</span>}
                    </td>
                    <td>
                      {typeof openSourceDocument === "function" ? (
                        <Btn col="blue" onClick={function () { openReturnProof(r, "sale-return"); }}>View</Btn>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
              {filteredHistory.length === 0 && (
                <tr><td colSpan={10} className="erp-arap-empty">No return history yet. Click &quot;New Sales Return&quot; to get started.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="erp-arap-foot">
          <div className="erp-arap-pager-wrap"><Pager pager={histPager} /></div>
        </div>
      </div>

      {/* ── MODAL: Step 1 — Invoice Search ── */}
      {modal === "search" && (
        <Modal title="Sales Return — Select Invoice" onClose={closeModal} wide>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <Input label="Search by Customer Name / Phone" placeholder="Type customer name or phone..." value={custSearch} onChange={function (e) { setCustSearch(e.target.value); }} />
            <Input label="Search by Invoice Number" placeholder="e.g. INV-0012..." value={invSearch} onChange={function (e) { setInvSearch(e.target.value); }} />
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{filteredSales.length} invoices found — click a row to select</div>
          <div style={{ maxHeight: 420, overflowY: "auto", borderRadius: 10, border: "1px solid " + C.border }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 1 }}><tr><TH>Invoice #</TH><TH>Date</TH><TH>Customer</TH><TH>Phone</TH><TH>Items</TH><TH>Total</TH><TH>Status</TH></tr></thead>
              <tbody>
                {salesPickPager.slice.map(function (s, i) {
                  var alreadyReturnedAmt = (state.salesReturns || []).filter(function (r) { return r.invoiceId === s.id; }).reduce(function (a, r) { return a + r.amount; }, 0);
                  return (
                    <TR key={s.id} i={i} onClick={function () { selectInvoice(s); }}>
                      <TD bold><span style={{ color: C.blue, fontFamily: "monospace" }}>{s.invoiceNo || s.id.slice(0, 8)}</span></TD>
                      <TD color={C.muted}>{s.date}</TD>
                      <TD bold>{s.customerName || "Walk-in"}</TD>
                      <TD color={C.muted}>{s.customerPhone || "—"}</TD>
                      <TD center color={C.muted}>{(s.items || []).length}</TD>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{getCurrencySymbol()} {fmtNum(s.total)}</div>
                        {alreadyReturnedAmt > 0 && <div style={{ fontSize: 11, color: C.red }}>↩ {getCurrencySymbol()} {fmtNum(alreadyReturnedAmt)} returned</div>}
                      </td>
                      <TD><Badge status={s.payStatus || "Unpaid"} /></TD>
                    </TR>
                  );
                })}
                {filteredSales.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: C.muted }}>No invoices match your search</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager pager={salesPickPager} />
        </Modal>
      )}

      {/* ── MODAL: Step 2 — Item Selection ── */}
      {modal === "items" && selInv && (
        <Modal title={"Sales Return — " + (selInv.invoiceNo || selInv.id.slice(0, 8)) + " · " + (selInv.customerName || "Walk-in")} onClose={closeModal} wide>
          {/* Invoice summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16, padding: "12px 16px", background: "#f7f9ff", borderRadius: 10, border: "1px solid " + C.border }}>
            <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Customer</div><div style={{ fontWeight: 700 }}>{selInv.customerName || "Walk-in"}</div></div>
            <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Invoice Date</div><div style={{ fontWeight: 700 }}>{selInv.date}</div></div>
            <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Invoice Total</div><div style={{ fontWeight: 700, color: C.blue }}>{getCurrencySymbol()} {fmtNum(selInv.total)}</div></div>
            <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Payment</div><Badge status={selInv.payStatus || "Unpaid"} /></div>
          </div>

          <div style={{ marginBottom: 6, fontSize: 12, color: C.muted }}>Enter return quantities below. Leave 0 for items not being returned.</div>

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
            <thead><tr><TH>Product</TH><TH>Sold Qty</TH><TH>Already Returned</TH><TH>Max Returnable</TH><TH>Return Qty</TH><TH>Unit Price</TH><TH>Return Amount</TH></tr></thead>
            <tbody>
              {(selInv.items || []).map(function (it, i) {
                var lk = saleLineReturnKey(it, i);
                var alreadyRet = getReturnedQty(selInv.id, it.id, lk);
                var maxRet = it.qty - alreadyRet;
                var q = parseFloat(returnQtys[lk]) || 0;
                var amt = returnLineAmount(it, q);
                var overMax = q > maxRet;
                return (
                  <TR key={lk} i={i}>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{it.name || "Unknown Product"}</div>
                      {it.barcode && <div style={{ fontSize: 11, color: C.muted }}>#{it.barcode}</div>}
                    </td>
                    <TD center>{it.qty}</TD>
                    <TD center color={alreadyRet > 0 ? C.orange : C.muted}>{alreadyRet}</TD>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <span style={{ fontWeight: 700, color: maxRet <= 0 ? C.red : C.green, background: maxRet <= 0 ? "#fde8ed" : "#e6f7f2", borderRadius: 20, padding: "2px 10px", fontSize: 12 }}>{maxRet}</span>
                    </td>
                    <td style={{ padding: "6px 10px" }}>
                      <input
                        type="number" min="0" max={maxRet} value={returnQtys[lk] || "0"}
                        disabled={maxRet <= 0}
                        onChange={function (e) {
                          var val = e.target.value;
                          setReturnQtys(function (prev) { var n = Object.assign({}, prev); n[lk] = val; return n; });
                        }}
                        style={{ width: 80, border: "1.5px solid " + (overMax ? C.red : C.border), borderRadius: 8, padding: "8px 12px", fontSize: 14, fontWeight: 700, outline: "none", fontFamily: "inherit", background: maxRet <= 0 ? "#f5f5f5" : "#fff", color: overMax ? C.red : C.text, textAlign: "center" }}
                      />
                      {overMax && <div style={{ fontSize: 10, color: C.red, marginTop: 2, textAlign: "center" }}>Max {maxRet}</div>}
                    </td>
                    <TD color={C.muted}>{getCurrencySymbol()} {fmtNum(it.price)}</TD>
                    <td style={{ padding: "10px 14px" }}>
                      {amt > 0 ? <span style={{ fontWeight: 800, color: C.red, fontSize: 14 }}>{getCurrencySymbol()} {fmtNum(amt)}</span> : <span style={{ color: C.muted }}>—</span>}
                    </td>
                  </TR>
                );
              })}
            </tbody>
          </table>

          {/* Reason for Return — required */}
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, marginBottom: 14 }}>
            <Input label="Return Date" type="date" value={returnDate} onChange={function (e) { setReturnDate(e.target.value); }} />
            <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Reason for Return <span style={{ color: C.red }}>*</span></label>
            <input
              value={returnReason}
              onChange={function (e) { setReturnReason(e.target.value); }}
              placeholder="e.g. Defective product, Wrong item, Customer changed mind..."
              style={{ border: "1.5px solid " + (!returnReason.trim() ? "#f9a8ba" : C.border), borderRadius: 8, padding: "9px 13px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#fff", color: C.text, width: "100%" }}
            />
            {!returnReason.trim() && <div style={{ fontSize: 11, color: C.red, marginTop: 3 }}>Required — cannot process return without a reason</div>}
            </div>
          </div>

          {/* Refund method if customer has overpaid relative to new total */}
          {(function () {
            var origPaid = selInv.paid || 0;
            var newTotal = Math.max(0, (selInv.total || 0) - returnTotal);
            var refundAmt = Math.max(0, origPaid - newTotal);
            if (refundAmt <= 0 || returnTotal <= 0) return null;
            return (
              <div style={{ background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#b45309", marginBottom: 8 }}>
                  ⚠ Customer paid {getCurrencySymbol()} {fmtNum(origPaid)} — after this return the new total is {getCurrencySymbol()} {fmtNum(newTotal)}.
                  Select how to refund {getCurrencySymbol()} {fmtNum(refundAmt)}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {["Cash", "Bank"].map(function (m) {
                    return (
                      <button key={m} onClick={function () { setRefundMethod(m); }}
                        style={{ padding: "7px 22px", borderRadius: 8, border: "1.5px solid " + (refundMethod === m ? C.blue : C.border), background: refundMethod === m ? C.accentSoft : "#fff", fontWeight: 700, fontSize: 13, color: refundMethod === m ? C.blue : C.textMd, cursor: "pointer", transition: "all .12s" }}>
                        {m === "Cash" ? "💵 Cash" : "🏦 Bank"}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Total bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: returnTotal > 0 ? "#fde8ed" : "#f7f9ff", borderRadius: 10, marginBottom: 16, border: "1.5px solid " + (returnTotal > 0 ? "#f9a8ba" : C.border) }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Return Total</div>
              {selInv.payStatus !== "Paid" && returnTotal > 0 && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Will reduce customer outstanding balance</div>}
            </div>
            <span style={{ fontWeight: 900, fontSize: 22, color: returnTotal > 0 ? C.red : C.muted }}>{getCurrencySymbol()} {fmtNum(returnTotal)}</span>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Btn col="gray" onClick={function () { setModal("search"); }}>← Back to Invoice List</Btn>
            <Btn col="red" full onClick={processReturn} disabled={returnTotal <= 0}>↩ Process Return</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

/* ── PURCHASE RETURN TAB ──────────────────────────────────────────────────── */
var PurchaseReturnTab = function (props) {
  var state = props.state;
  var setState = props.setState;
  var C = props.C;
  var showAlert = props.showAlert;
  var showConfirm = props.showConfirm;
  var S = props.S;
  var uid = props.uid;
  var today = props.today;
  var addAudit = props.addAudit;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var genInvNo = props.genInvNo;
  var roundQty = props.roundQty;
  var StatCard = props.StatCard;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var Btn = props.Btn;
  var Modal = props.Modal;
  var Input = props.Input;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var Badge = props.Badge;
  var usePager = props.usePager;
  var Pager = props.Pager;
  var tcTrialGuard = props.tcTrialGuard;
  var openSourceDocument = props.openSourceDocument;

  var openReturnProof = function (r, kind) {
    if (!r || typeof openSourceDocument !== "function") return;
    openSourceDocument({ sourceKind: kind, sourceId: r.id });
  };
  var openLinkedPurchase = function (r) {
    if (!r || !r.purchaseId || typeof openSourceDocument !== "function") return;
    openSourceDocument({ sourceKind: "purchase", sourceId: r.purchaseId });
  };

  var [modal, setModal] = useState(null);
  var [suppSearch, setSuppSearch] = useState("");
  var [purSearch, setPurSearch] = useState("");
  var [selPur, setSelPur] = useState(null);
  var [returnQtys, setReturnQtys] = useState({});
  var [purReturnReason, setPurReturnReason] = useState("");
  var [purReturnDate, setPurReturnDate] = useState(today());
  var [purRefundMethod, setPurRefundMethod] = useState("Cash"); /* FIX Bug 1: cash back from supplier */
  var [histSearch, setHistSearch] = useState("");

  var openModal = function () {
    setModal("search");
    setSuppSearch(""); setPurSearch(""); setSelPur(null); setReturnQtys({}); setPurReturnReason(""); setPurReturnDate(today()); setPurRefundMethod("Cash");
  };
  var closeModal = function () { setModal(null); setSelPur(null); setReturnQtys({}); setSuppSearch(""); setPurSearch(""); setPurReturnReason(""); setPurReturnDate(today()); setPurRefundMethod("Cash"); };

  var getPurReturnedQty = function (purchaseId, productId, lineKey) {
    return roundQty((state.purchaseReturns || []).filter(function (r) {
      if (r.purchaseId !== purchaseId) return false;
      if (r.purchaseLineKey) return r.purchaseLineKey === lineKey;
      return r.productId === productId;
    }).reduce(function (a, r) { return a + (r.qty || 0); }, 0));
  };

  var selectPurchase = function (pur) {
    var init = {};
    (pur.items || []).forEach(function (it, idx) { init[purchaseLineReturnKey(it, idx)] = "0"; });
    setSelPur(pur);
    setReturnQtys(init);
    setModal("items");
  };

  var parsePurReturnQty = function (raw) {
    var q = parseFloat(raw);
    if (!isFinite(q) || q <= 0) return 0;
    return roundQty(q);
  };
  var resolvePurReturnUnitCost = function (it) {
    var unit = Number(it.cost);
    if (isNaN(unit)) unit = 0;
    var prMode = state.settings && state.settings.purchaseReturnCostMode === "original_cost";
    if (prMode) {
      var costMissing = it.cost == null || (typeof it.cost === "number" && isNaN(it.cost));
      if (costMissing || !(unit > 0)) {
        var pRow = (state.products || []).find(function (p) { return p.id === it.id; });
        unit = pRow ? Number(pRow.cost) || 0 : 0;
      }
    } else if (!(unit > 0)) {
      var pRowWac = (state.products || []).find(function (p) { return p.id === it.id; });
      unit = pRowWac ? Number(pRowWac.cost) || 0 : 0;
    }
    return unit;
  };

  var returnTotal = selPur ? (selPur.items || []).reduce(function (a, it, idx) {
    var q = parsePurReturnQty(returnQtys[purchaseLineReturnKey(it, idx)]);
    if (q <= 0) return a;
    var unitForUi = resolvePurReturnUnitCost(it);
    var lineCost = round2(q * unitForUi);
    var taxOn = state.settings && state.settings.taxEnabled ? computePurchaseReturnTax(selPur, lineCost, state.settings) : { apGross: lineCost };
    return a + round2(taxOn.apGross || lineCost);
  }, 0) : 0;
  var returnStockCost = selPur ? (selPur.items || []).reduce(function (a, it, idx) {
    var q = parsePurReturnQty(returnQtys[purchaseLineReturnKey(it, idx)]);
    if (q <= 0) return a;
    return a + round2(q * resolvePurReturnUnitCost(it));
  }, 0) : 0;

  var allPurchases = sortNewestFirst(state.purchases || []);
  var filteredPurchases = allPurchases.filter(function (p) {
    if (isVoidedTxn(p)) return false;
    var sq = suppSearch.toLowerCase().trim();
    var pq = purSearch.toLowerCase().trim();
    var matchS = !sq || (p.supplier || "").toLowerCase().includes(sq);
    var matchP = !pq || (p.invoiceNo || "").toLowerCase().includes(pq);
    return matchS && matchP;
  });
  var purPickPager = usePager(filteredPurchases, LIST_PAGE_SIZE);

  var processReturn = function () {
    if (!selPur) return;
    if (isVoidedTxn(selPur)) { showAlert("Cannot return a voided purchase."); return; }
    var hasQty = (selPur.items || []).some(function (it, idx) {
      return parsePurReturnQty(returnQtys[purchaseLineReturnKey(it, idx)]) > 0;
    });
    if (!hasQty) { showAlert("Enter at least one return quantity."); return; }
    if (!purReturnReason.trim()) { showAlert("Please enter a reason for this purchase return."); return; }
    var err = null;
    (selPur.items || []).forEach(function (it, idx) {
      if (err) return;
      var lk = purchaseLineReturnKey(it, idx);
      var q = parsePurReturnQty(returnQtys[lk]);
      var maxRet = it.qty - getPurReturnedQty(selPur.id, it.id, lk);
      if (q < 0) { err = "Quantity cannot be negative."; return; }
      if (q > maxRet) { err = "\"" + (it.name || "Item") + "\": max returnable is " + maxRet + "."; return; }
      var onHand = 0;
      var prodRow = (state.products || []).find(function (p) { return p.id === it.id; });
      if (prodRow) onHand = Math.max(0, Number(prodRow.stock) || 0);
      if (q > onHand) {
        err = "\"" + (it.name || "Item") + "\": only " + onHand + " in stock — cannot return " + q + ".";
      }
    });
    if (err) { showAlert(err); return; }

    if (!tcTrialGuard(state.purchaseReturns || [], "purchaseReturns")) return;

    /* FIX Bug 1 + Bug 2: Dynamic refund calculation for purchase returns.
       If the supplier already received payment and new total drops below paid amount,
       the difference must be recorded as cash coming BACK from the supplier. */
    var origPaid = selPur.paidAmount || 0;
    var newTotal = Math.max(0, (selPur.total || 0) - returnTotal);
    var refundAmt = Math.max(0, origPaid - newTotal);
    var needsRefund = refundAmt > 0;

    var msg = needsRefund
      ? "Process purchase return of " + getCurrencySymbol() + " " + fmtNum(returnTotal) + " to " + selPur.supplier + "?\n\nYou already paid " + getCurrencySymbol() + " " + fmtNum(origPaid) + " — supplier owes back " + getCurrencySymbol() + " " + fmtNum(refundAmt) + " which will be added to your " + purRefundMethod + " balance."
      : "Process purchase return of " + getCurrencySymbol() + " " + fmtNum(returnTotal) + " to " + selPur.supplier + "?\n\nStock will be reduced and supplier payable adjusted.";

    showConfirm(msg, function () {
      var newReturns = (state.purchaseReturns || []).slice();
      var np = state.products.slice();
      var prModeOriginal = state.settings && state.settings.purchaseReturnCostMode === "original_cost";
      var prPolicyWarnings = [];
      /* FIX: refundAmt is a single amount for the whole transaction.
         Only the FIRST returned item row carries it — the rest get 0.
         getCashBalances sums all rows, so storing it on every row multiplies it by item count. */
      var purRefundRecorded = false;
      var batchReturnId = genInvNo("PR");

      (selPur.items || []).forEach(function (it, idx) {
        var lk = purchaseLineReturnKey(it, idx);
        var q = parsePurReturnQty(returnQtys[lk]);
        if (q <= 0) return;
        var unitForGl = resolvePurReturnUnitCost(it);
        var costFallbackWac = false;
        if (prModeOriginal) {
          var costMissing = it.cost == null || (typeof it.cost === "number" && isNaN(it.cost));
          if (costMissing) {
            costFallbackWac = true;
            prPolicyWarnings.push("Original cost: purchase line missing unit cost — fell back to current WAC (" + (it.name || it.id) + ")");
          } else {
            var prodSnap = (state.products || []).find(function (p) { return p.id === it.id; });
            if (prodSnap && Math.abs((Number(prodSnap.cost) || 0) - unitForGl) > 0.02) {
              prPolicyWarnings.push("Original cost policy: GL uses purchase line " + fmtNum(unitForGl) + " for \"" + (it.name || "") + "\" (live product cost differs)");
            }
          }
        } else {
          var costMissingWac = it.cost == null || (typeof it.cost === "number" && isNaN(it.cost)) || !(Number(it.cost) > 0);
          if (costMissingWac && unitForGl > 0) {
            costFallbackWac = true;
            prPolicyWarnings.push("Current WAC: purchase line missing/zero cost — used product cost for \"" + (it.name || it.id) + "\"");
          }
        }
        var amt = round2(q * unitForGl);
        var prTaxBundle = state.settings && state.settings.taxEnabled ? computePurchaseReturnTax(selPur, amt, state.settings) : { taxReversal: 0, apGross: amt };
        var thisRefund = (needsRefund && !purRefundRecorded) ? refundAmt : 0;
        if (needsRefund && !purRefundRecorded) purRefundRecorded = true;
        newReturns.push(stampTransactionIsoDateTime({
          id: uid(), returnId: batchReturnId, purchaseId: selPur.id, purchaseNo: selPur.invoiceNo,
          purchaseLineId: it.id,
          purchaseLineKey: lk,
          productId: it.id, productName: it.name || "Unknown Product",
          qty: q, amount: amt, returnTax: round2(prTaxBundle.taxReversal || 0), returnGross: round2(prTaxBundle.apGross || amt), date: purReturnDate || today(),
          createdAt: new Date().toISOString(),
          supplier: selPur.supplier || "", cost: unitForGl,
          costSourceFallbackWac: costFallbackWac === true,
          reason: purReturnReason.trim(),
          isRefund: needsRefund && thisRefund > 0, refundMethod: (needsRefund && thisRefund > 0) ? purRefundMethod : null,
          refundAmount: thisRefund
        }));
        np = np.map(function (p) {
          if (p.id !== it.id) return p;
          if (String(p.type || "").toLowerCase() === "service") return p;
          var curS = p.stock || 0;
          var curC = p.cost || 0;
          var newS = Math.max(0, curS - q);
          /* PURCHASE RETURN — WAC LOCK (enterprise policy):
             Do NOT recompute weighted-average cost from returned line cost. Processing returns out of
             chronological order inverts WAC vs the true purchase timeline. We only deduct base qty.
             Inventory asset on the books drops by (returned_qty × line cost) via tc3_purchaseReturns rows
             and payable adjustments; remaining units keep the current frozen unit cost (curC). */
          return stampProductStock(Object.assign({}, p, { stock: newS, cost: Math.round(curC * 100) / 100 }), null, p);
        });
      });

      /* Reduce purchase total/balance; align paymentHistory when paid drops (refund) */
      var npur = state.purchases.map(function (p) {
        if (p.id !== selPur.id) return p;
        var newPaid = Math.min(origPaid, newTotal);
        var newBal = Math.max(0, newTotal - newPaid);
        var newStat = newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
        var refundFromPaid = origPaid - newPaid;
        var ph = (p.paymentHistory || []).slice();
        if (refundFromPaid > 0.005) {
          ph.push({
            id: uid(),
            date: today(),
            amount: -refundFromPaid,
            type: "refund",
            note: "Purchase return refund/adjustment",
            createdAt: new Date().toISOString(),
            cashMethod: needsRefund && purRefundMethod === "Bank" ? "Bank" : (needsRefund ? "Cash" : "Adjustment"),
          });
        }
        return stampUpdatedAt(Object.assign({}, p, { total: newTotal, balance: newBal, paidAmount: newPaid, status: newStat, paymentHistory: ph }));
      });

      S.setMany
        ? S.setMany([
            ["tc3_purchaseReturns", newReturns],
            ["tc3_products", np],
            ["tc3_purchases", npur],
          ])
        : (S.set("tc3_purchaseReturns", newReturns), S.set("tc3_products", np), S.set("tc3_purchases", npur));
      addAudit("Purchase Return " + getCurrencySymbol() + " " + fmtNum(returnTotal) + " (" + purReturnReason.trim() + ")", selPur.invoiceNo || selPur.id.slice(0, 8));
      setState(function (st) { return Object.assign({}, st, { purchaseReturns: newReturns, products: np, purchases: npur }); });
      if (prPolicyWarnings.length) {
        showAlert(prPolicyWarnings.filter(function (x, i, a) { return a.indexOf(x) === i; }).join("\n"));
      }
      closeModal();
    });
  };

  var history = sortNewestFirst(state.purchaseReturns || []);
  var filteredHistory = history.filter(function (r) {
    if (!histSearch.trim()) return true;
    var q = histSearch.toLowerCase();
    return (r.supplier || "").toLowerCase().includes(q) || (r.purchaseNo || "").toLowerCase().includes(q) || (r.productName || "").toLowerCase().includes(q) || (r.returnId || "").toLowerCase().includes(q);
  });
  var purHistPager = usePager(filteredHistory, LIST_PAGE_SIZE);

  return (
    <div className="erp-arap-body">
      <div className="erp-arap-panel">
        <div className="erp-arap-toolbar">
          <div className="erp-arap-search-wrap">
            <input
              className="erp-arap-field"
              placeholder="Search supplier, purchase no, product, return ID…"
              value={histSearch}
              onChange={function (e) { setHistSearch(e.target.value); }}
              aria-label="Search purchase returns"
            />
          </div>
          {histSearch ? (
            <button type="button" className="erp-arap-btn-clear" onClick={function () { setHistSearch(""); }}>Clear</button>
          ) : null}
          <span className="erp-arap-filter-meta">{filteredHistory.length} of {history.length}</span>
          <button type="button" className="erp-arap-add" onClick={openModal} style={{ marginLeft: "auto" }}>
            <span className="erp-arap-add-ico" aria-hidden="true">↻</span>
            <span>New Purchase Return</span>
          </button>
        </div>
        <div className="erp-arap-note" title={"Purchase return cost policy: " + (state.settings.purchaseReturnCostMode === "original_cost" ? "original receipt (uses line cost; full layer match reserved)" : "current — uses unit cost on the purchase line (WAC snapshot) for GL; product WAC is not re-blended on return") + ". See Settings → Accounting."}>
          <strong>Note:</strong> Returning items deducts stock but does not recalculate Weighted Average Cost. GL uses the purchase line unit cost (see Settings → Purchase return cost).
        </div>
        <div className="erp-arap-table-wrap">
          <table className="erp-arap-table">
            <thead>
              <tr>
                <th>Date</th><th>Return ID</th><th>Purchase #</th><th>Supplier</th><th>Product</th><th>Qty</th><th>Amount</th><th>Cost basis</th><th>Reason</th><th>Proof</th>
              </tr>
            </thead>
            <tbody>
              {purHistPager.slice.map(function (r) {
                return (
                  <tr key={r.id} className="table-row-hover">
                    <td style={{ color: "#64748b" }}>{r.date}</td>
                    <td style={{ fontWeight: 800, color: "#c2410c" }}>
                      {typeof openSourceDocument === "function" ? (
                        <button type="button" className="erp-stmt-ref-btn" onClick={function () { openReturnProof(r, "purchase-return"); }}>{r.returnId || r.id.slice(0, 8)}</button>
                      ) : (r.returnId || r.id.slice(0, 8))}
                    </td>
                    <td style={{ color: "#2563eb" }}>
                      {r.purchaseNo && typeof openSourceDocument === "function" ? (
                        <button type="button" className="erp-stmt-ref-btn" onClick={function () { openLinkedPurchase(r); }}>{r.purchaseNo}</button>
                      ) : (r.purchaseNo || "—")}
                    </td>
                    <td>{r.supplier || "—"}</td>
                    <td className="erp-arap-src" title={r.productName || ""}>{r.productName || "Unknown"}</td>
                    <td style={{ textAlign: "center" }}>{r.qty}</td>
                    <td className="erp-arap-amt" style={{ color: "#c2410c", fontWeight: 800 }}>{getCurrencySymbol()} {fmtNum(r.amount)}</td>
                    <td style={{ color: "#64748b", fontSize: 11, maxWidth: 200, whiteSpace: "normal" }}>
                      {state.settings && state.settings.purchaseReturnCostMode === "original_cost"
                        ? (r.costSourceFallbackWac
                          ? <span style={{ color: "#b45309", fontWeight: 700 }}>Fallback to WAC</span>
                          : <span>Purchase #{r.purchaseNo || "?"} line</span>)
                        : <span>WAC snapshot</span>}
                    </td>
                    <td style={{ color: "#64748b", fontSize: 12 }}>{r.reason || "—"}</td>
                    <td>
                      {typeof openSourceDocument === "function" ? (
                        <Btn col="blue" onClick={function () { openReturnProof(r, "purchase-return"); }}>View</Btn>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
              {filteredHistory.length === 0 && (
                <tr><td colSpan={10} className="erp-arap-empty">No return history yet. Click &quot;New Purchase Return&quot; to get started.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="erp-arap-foot">
          <div className="erp-arap-pager-wrap"><Pager pager={purHistPager} /></div>
        </div>
      </div>

      {/* MODAL Step 1 — Purchase Search */}
      {modal === "search" && (
        <Modal title="Purchase Return — Select Purchase Invoice" onClose={closeModal} wide>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <Input label="Search by Supplier Name" placeholder="Type supplier name..." value={suppSearch} onChange={function (e) { setSuppSearch(e.target.value); }} />
            <Input label="Search by Invoice Number" placeholder="e.g. PUR-0012..." value={purSearch} onChange={function (e) { setPurSearch(e.target.value); }} />
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{filteredPurchases.length} purchases found — click a row to select</div>
          <div style={{ maxHeight: 420, overflowY: "auto", borderRadius: 10, border: "1px solid " + C.border }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 1 }}><tr><TH>Invoice #</TH><TH>Date</TH><TH>Supplier</TH><TH>Items</TH><TH>Total</TH><TH>Balance</TH><TH>Status</TH></tr></thead>
              <tbody>
                {purPickPager.slice.map(function (p, i) {
                  var alreadyRetAmt = (state.purchaseReturns || []).filter(function (r) { return r.purchaseId === p.id; }).reduce(function (a, r) { return a + r.amount; }, 0);
                  return (
                    <TR key={p.id} i={i} onClick={function () { selectPurchase(p); }}>
                      <TD bold><span style={{ color: C.blue, fontFamily: "monospace" }}>{p.invoiceNo || p.id.slice(0, 8)}</span></TD>
                      <TD color={C.muted}>{p.date}</TD>
                      <TD bold>{p.supplier}</TD>
                      <TD center color={C.muted}>{(p.items || []).length}</TD>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 700 }}>{getCurrencySymbol()} {fmtNum(p.total)}</div>
                        {alreadyRetAmt > 0 && <div style={{ fontSize: 11, color: C.orange }}>🔄 {getCurrencySymbol()} {fmtNum(alreadyRetAmt)} returned</div>}
                      </td>
                      <TD color={C.red}>{getCurrencySymbol()} {fmtNum(Math.max(0, (p.total || 0) - (p.paidAmount || 0)))}</TD>
                      <TD><Badge status={p.status || "Unpaid"} /></TD>
                    </TR>
                  );
                })}
                {filteredPurchases.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: C.muted }}>No purchases match your search</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager pager={purPickPager} />
        </Modal>
      )}

      {/* MODAL Step 2 — Item Selection */}
      {modal === "items" && selPur && (
        <Modal title={"Purchase Return — " + (selPur.invoiceNo || selPur.id.slice(0, 8)) + " · " + selPur.supplier} onClose={closeModal} wide>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16, padding: "12px 16px", background: "#f7f9ff", borderRadius: 10, border: "1px solid " + C.border }}>
            <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Supplier</div><div style={{ fontWeight: 700 }}>{selPur.supplier}</div></div>
            <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Purchase Date</div><div style={{ fontWeight: 700 }}>{selPur.date}</div></div>
            <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Purchase Total</div><div style={{ fontWeight: 700, color: C.blue }}>{getCurrencySymbol()} {fmtNum(selPur.total)}</div></div>
            <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Status</div><Badge status={selPur.status || "Unpaid"} /></div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
            <thead><tr><TH>Product</TH><TH>Purchased</TH><TH>Already Returned</TH><TH>Max Returnable</TH><TH>Return Qty</TH><TH>Unit Cost</TH><TH>Return Amount</TH></tr></thead>
            <tbody>
              {(selPur.items || []).map(function (it, i) {
                var lk = purchaseLineReturnKey(it, i);
                var alreadyRet = getPurReturnedQty(selPur.id, it.id, lk);
                var maxRet = it.qty - alreadyRet;
                var q = parsePurReturnQty(returnQtys[lk]);
                var unit = resolvePurReturnUnitCost(it);
                var amt = round2(q * unit);
                var overMax = q > maxRet;
                return (
                  <TR key={lk} i={i}>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{it.name || "Unknown Product"}</div>
                    </td>
                    <TD center>{it.qty}</TD>
                    <TD center color={alreadyRet > 0 ? C.orange : C.muted}>{alreadyRet}</TD>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <span style={{ fontWeight: 700, color: maxRet <= 0 ? C.red : C.green, background: maxRet <= 0 ? "#fde8ed" : "#e6f7f2", borderRadius: 20, padding: "2px 10px", fontSize: 12 }}>{maxRet}</span>
                    </td>
                    <td style={{ padding: "6px 10px" }}>
                      <input
                        type="number" min="0" max={maxRet} value={returnQtys[lk] || "0"}
                        disabled={maxRet <= 0}
                        onChange={function (e) {
                          var val = e.target.value;
                          setReturnQtys(function (prev) { var n = Object.assign({}, prev); n[lk] = val; return n; });
                        }}
                        style={{ width: 80, border: "1.5px solid " + (overMax ? C.red : C.border), borderRadius: 8, padding: "8px 12px", fontSize: 14, fontWeight: 700, outline: "none", fontFamily: "inherit", background: maxRet <= 0 ? "#f5f5f5" : "#fff", color: overMax ? C.red : C.text, textAlign: "center" }}
                      />
                      {overMax && <div style={{ fontSize: 10, color: C.red, marginTop: 2, textAlign: "center" }}>Max {maxRet}</div>}
                    </td>
                    <TD color={C.muted}>{getCurrencySymbol()} {fmtNum(it.cost)}</TD>
                    <td style={{ padding: "10px 14px" }}>
                      {amt > 0 ? <span style={{ fontWeight: 800, color: C.orange, fontSize: 14 }}>{getCurrencySymbol()} {fmtNum(amt)}</span> : <span style={{ color: C.muted }}>—</span>}
                    </td>
                  </TR>
                );
              })}
            </tbody>
          </table>

          {/* Reason for Purchase Return — required */}
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, marginBottom: 14 }}>
            <Input label="Return Date" type="date" value={purReturnDate} onChange={function (e) { setPurReturnDate(e.target.value); }} />
            <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Reason for Return <span style={{ color: C.red }}>*</span></label>
            <input
              value={purReturnReason}
              onChange={function (e) { setPurReturnReason(e.target.value); }}
              placeholder="e.g. Damaged on delivery, Wrong product received, Quality issue..."
              style={{ border: "1.5px solid " + (!purReturnReason.trim() ? "#f9a8ba" : C.border), borderRadius: 8, padding: "9px 13px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#fff", color: C.text, width: "100%" }}
            />
            {!purReturnReason.trim() && <div style={{ fontSize: 11, color: C.red, marginTop: 3 }}>Required — cannot process return without a reason</div>}
            </div>
          </div>

          {/* FIX Bug 1: Show refund selector when supplier owes cash back */}
          {(function () {
            var origPaid = selPur.paidAmount || 0;
            var newTotal = Math.max(0, (selPur.total || 0) - returnTotal);
            var refundAmt = Math.max(0, origPaid - newTotal);
            if (refundAmt <= 0 || returnTotal <= 0) return null;
            return (
              <div style={{ background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#b45309", marginBottom: 8 }}>
                  ⚠ You already paid {getCurrencySymbol()} {fmtNum(origPaid)} — supplier owes back {getCurrencySymbol()} {fmtNum(refundAmt)}. How will they refund you?
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {["Cash", "Bank"].map(function (m) {
                    return (
                      <button key={m} onClick={function () { setPurRefundMethod(m); }}
                        style={{ padding: "7px 22px", borderRadius: 8, border: "1.5px solid " + (purRefundMethod === m ? C.orange : C.border), background: purRefundMethod === m ? "#fff3e0" : "#fff", fontWeight: 700, fontSize: 13, color: purRefundMethod === m ? C.orange : C.textMd, cursor: "pointer" }}>
                        {m === "Cash" ? "💵 Cash" : "🏦 Bank"}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: returnTotal > 0 ? "#fff3e0" : "#f7f9ff", borderRadius: 10, marginBottom: 16, border: "1.5px solid " + (returnTotal > 0 ? "#f7c97a" : C.border) }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Return Total</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Supplier payable will be reduced by this amount</div>
            </div>
            <span style={{ fontWeight: 900, fontSize: 22, color: returnTotal > 0 ? C.orange : C.muted }}>{getCurrencySymbol()} {fmtNum(returnTotal)}</span>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Btn col="gray" onClick={function () { setModal("search"); }}>← Back to Purchase List</Btn>
            <Btn col="orange" full onClick={processReturn} disabled={returnTotal <= 0}>🔄 Process Return</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Returns;
