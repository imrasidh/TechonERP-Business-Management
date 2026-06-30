import React, { useState, useEffect } from "react";
import { computeSaleTaxFromSnapshot, computePurchaseReturnTax } from "../tax/taxCompute.js";
import { round2 } from "../utils/moneyRound.js";
import { LIST_PAGE_SIZE, sortNewestFirst } from "../utils/listPage.js";

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
  var [tab, setTab] = useState("salesreturn");
  var TABS = [["salesreturn", "↩ Sales Return"], ["purchasereturn", "🔄 Purchase Return"]];
  useEffect(function () {
    try {
      var t = sessionStorage.getItem("tc3_returns_tab");
      if (t === "salesreturn" || t === "purchasereturn") {
        setTab(t);
        sessionStorage.removeItem("tc3_returns_tab");
      }
    } catch (e) { /* ignore */ }
  }, []);
  return (
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 4, background: "#fff", borderRadius: 12, padding: 5, border: "1.5px solid " + C.border, boxShadow: C.shadowCard, alignSelf: "flex-start" }}>
        {TABS.map(function (t) {
          var isA = tab === t[0];
          return (
            <button key={t[0]} onClick={function () { setTab(t[0]); }}
              style={{ background: isA ? "linear-gradient(135deg,#2979ff,#2255d4)" : "transparent", color: isA ? "#fff" : C.textMd, border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all .15s", fontFamily: "inherit", boxShadow: isA ? "0 2px 8px rgba(41,121,255,0.28)" : "none" }}>
              {t[1]}
            </button>
          );
        })}
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

  /* modal steps: null | "search" | "items" */
  var [modal, setModal] = useState(null);
  var [custSearch, setCustSearch] = useState("");
  var [invSearch, setInvSearch] = useState("");
  var [selInv, setSelInv] = useState(null);
  var [returnQtys, setReturnQtys] = useState({});
  var [refundMethod, setRefundMethod] = useState("Cash");
  var [returnReason, setReturnReason] = useState("");
  var [histSearch, setHistSearch] = useState("");

  var openModal = function () {
    setModal("search");
    setCustSearch(""); setInvSearch(""); setSelInv(null); setReturnQtys({}); setReturnReason("");
  };
  var closeModal = function () { setModal(null); setSelInv(null); setReturnQtys({}); setCustSearch(""); setInvSearch(""); setReturnReason(""); };

  /* already-returned qty per invoice+product */
  var getReturnedQty = function (invoiceId, productId) {
    return roundQty((state.salesReturns || []).filter(function (r) {
      return r.invoiceId === invoiceId && r.productId === productId;
    }).reduce(function (a, r) { return a + (r.qty || 0); }, 0));
  };

  var selectInvoice = function (inv) {
    var init = {};
    (inv.items || []).forEach(function (it) { init[it.id] = "0"; });
    setSelInv(inv);
    setReturnQtys(init);
    setModal("items");
  };

  var returnTotal = selInv ? (selInv.items || []).reduce(function (a, it) {
    var q = parseInt(returnQtys[it.id]) || 0;
    return a + q * (it.price || 0);
  }, 0) : 0;

  /* Filter invoices: match customer search OR invoice number search */
  var allSales = sortNewestFirst(state.sales || []);
  var filteredSales = allSales.filter(function (s) {
    var cq = custSearch.toLowerCase().trim();
    var iq = invSearch.toLowerCase().trim();
    var matchC = !cq || (s.customerName || "").toLowerCase().includes(cq) || (s.customerPhone || "").includes(cq);
    var matchI = !iq || (s.invoiceNo || "").toLowerCase().includes(iq);
    return matchC && matchI;
  });
  var salesPickPager = usePager(filteredSales, LIST_PAGE_SIZE);

  var processReturn = function () {
    if (!selInv) return;
    var hasQty = (selInv.items || []).some(function (it) { return (parseInt(returnQtys[it.id]) || 0) > 0; });
    if (!hasQty) { showAlert("Enter at least one return quantity."); return; }
    if (!returnReason.trim()) { showAlert("Please enter a reason for this return."); return; }
    var err = null;
    (selInv.items || []).forEach(function (it) {
      if (err) return;
      var q = parseInt(returnQtys[it.id]) || 0;
      var maxReturn = it.qty - getReturnedQty(selInv.id, it.id);
      if (q < 0) { err = "Quantity cannot be negative."; return; }
      if (q > maxReturn) { err = "\"" + (it.name || "Item") + "\": max returnable is " + maxReturn + "."; }
    });
    if (err) { showAlert(err); return; }

    if (!tcTrialGuard(state.salesReturns || [], "salesReturns")) return;

    /* FIX Bug 2: Dynamic refund calculation — works for Paid AND Partial invoices.
       If the new invoice total drops below what was already paid, the difference must be refunded. */
    var origPaid = selInv.paid || 0;
    var origLineSub = selInv.subTotal != null ? selInv.subTotal : (selInv.items || []).reduce(function (a, it) { return a + (it.qty || 0) * (it.price || 0); }, 0);
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

      (selInv.items || []).forEach(function (it) {
        var q = parseInt(returnQtys[it.id]) || 0;
        if (q <= 0) return;
        var lineGross = round2(q * (it.price || 0));
        var isInclusive = selInv.taxMode === "inclusive" || ((state.settings && state.settings.taxMode === "inclusive") && selInv.taxMode !== "exclusive");
        var lineTaxBundle = computeSaleTaxFromSnapshot(selInv, lineGross);
        var lineReturnTax = round2(lineTaxBundle.totalTax || 0);
        var lineNet = isInclusive ? round2(lineGross - lineReturnTax) : lineGross;
        var lineReturnGross = isInclusive ? lineGross : round2(lineGross + lineReturnTax);
        var thisRefund = (needsRefund && !refundRecorded) ? refundAmt : 0;
        if (needsRefund && !refundRecorded) refundRecorded = true;
        newReturns.push({
          id: uid(), returnId: genInvNo("SR"), invoiceId: selInv.id, invoiceNo: selInv.invoiceNo,
          productId: it.id, productName: it.name || "Unknown Product",
          qty: q, amount: lineNet, returnTax: lineReturnTax, returnGross: lineReturnGross, cost: it.cost || 0, /* FIX 1+3: store exact cost at return time — avoids cross-period lookup errors */
          taxMode: selInv.taxMode || (isInclusive ? "inclusive" : "exclusive"),
          selectedTaxes: (selInv.selectedTaxes || []).map(function (t) { return { name: t.name, rate: t.rate, amount: t.amount }; }),
          date: today(),
          createdAt: new Date().toISOString(),
          customer: selInv.customerName || selInv.customer || "",
          customerId: selInv.customerId || "",
          reason: returnReason.trim(),
          isRefund: needsRefund && thisRefund > 0, refundMethod: (needsRefund && thisRefund > 0) ? refundMethod : null,
          refundAmount: thisRefund
        });
        np = np.map(function (p) {
          if (p.id !== it.id) return p;
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
          return Object.assign({}, p, { stock: newS, cost: Math.round(newC * 100) / 100 });
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
            cashMethod: "Adjustment",
          });
        }
        return Object.assign({}, s, taxPatch, {
          subTotal: newLineSub,
          total: newTotal,
          balance: newBal,
          paid: newPaid,
          payStatus: newStat,
          paymentHistory: ph,
        });
      });

      /* Adjust customer credit and totalSpent — no early exit for needsRefund (Ghost Debt fix) */
      var nc = state.customers.map(function (c) {
        if (!selInv.customerId || c.id !== selInv.customerId) return c;
        /* Amount of the return that erased debt (vs amount refunded as cash) */
        var debtReduced = returnTotal - (needsRefund ? refundAmt : 0);
        return Object.assign({}, c, {
          credit: Math.max(0, (c.credit || 0) - debtReduced),
          totalSpent: Math.max(0, (c.totalSpent || 0) - returnTotal)
        });
      });

      S.set("tc3_salesReturns", newReturns);
      S.set("tc3_products", np);
      S.set("tc3_sales", ns);
      S.set("tc3_customers", nc);
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
  var totalReturns = history.reduce(function (a, r) { return a + (r.amount || 0); }, 0);
  var totalRefunds = history.filter(function (r) { return r.isRefund; }).reduce(function (a, r) { return a + (r.refundAmount || 0); }, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
        <StatCard label="Total Returns (goods value)" value={totalReturns} accent={C.red} icon="↩" sub={history.length + " entries · retail value of returned line items"} />
        <StatCard label="Cash Refunded" value={totalRefunds} accent={C.orange} icon="💸" sub={history.filter(function (r) { return r.isRefund; }).length + " refunds issued"} />
        <StatCard label="Items Restocked" money={false} value={history.reduce(function (a, r) { return a + (r.qty || 0); }, 0)} accent={C.green} icon="📦" sub="total units returned" />
      </div>

      {/* Action */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Sales Returns</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Process customer returns and refunds</div>
          </div>
          <Btn col="red" onClick={openModal}>↩ New Sales Return</Btn>
        </div>
      </Card>

      {/* Return History */}
      <Card>
        <CardTitle sub={filteredHistory.length + " of " + history.length + " entries"}>Return History</CardTitle>
        <Input placeholder="Search customer, invoice, product, return ID..." value={histSearch} onChange={function (e) { setHistSearch(e.target.value); }} style={{ marginBottom: 10 }} />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><TH>Date</TH><TH>Return ID</TH><TH>Invoice</TH><TH>Customer</TH><TH>Product</TH><TH>Qty</TH><TH>Amount</TH><TH>Reason</TH><TH>Settlement</TH></tr></thead>
            <tbody>
              {histPager.slice.map(function (r, i) {
                return (
                  <TR key={r.id} i={i}>
                    <TD color={C.muted}>{r.date}</TD>
                    <TD bold color={C.red}>{r.returnId || r.id.slice(0, 8)}</TD>
                    <TD color={C.blue}>{r.invoiceNo || "—"}</TD>
                    <TD>{r.customer || "—"}</TD>
                    <TD>{r.productName || "Unknown"}</TD>
                    <TD center>{r.qty}</TD>
                    <TD bold color={C.red}>{getCurrencySymbol()} {fmtNum(r.amount)}</TD>
                    <TD color={C.muted} style={{ maxWidth: 160, whiteSpace: "normal" }}><span style={{ fontSize: 12 }}>{r.reason || "—"}</span></TD>
                    <TD>{r.isRefund ? <span style={{ background: "#e6f7f2", color: C.green, border: "1px solid #9ee8ce", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>Refund ({r.refundMethod})</span> : <span style={{ color: C.muted, fontSize: 12 }}>Balance adj.</span>}</TD>
                  </TR>
                );
              })}
              {filteredHistory.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: C.muted }}>No return history yet. Click &quot;New Sales Return&quot; to get started.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager pager={histPager} />
      </Card>

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
                var alreadyRet = getReturnedQty(selInv.id, it.id);
                var maxRet = it.qty - alreadyRet;
                var q = parseInt(returnQtys[it.id]) || 0;
                var amt = q * (it.price || 0);
                var overMax = q > maxRet;
                return (
                  <TR key={it.id || i} i={i}>
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
                        type="number" min="0" max={maxRet} value={returnQtys[it.id] || "0"}
                        disabled={maxRet <= 0}
                        onChange={function (e) {
                          var val = e.target.value;
                          setReturnQtys(function (prev) { var n = Object.assign({}, prev); n[it.id] = val; return n; });
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
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Reason for Return <span style={{ color: C.red }}>*</span></label>
            <input
              value={returnReason}
              onChange={function (e) { setReturnReason(e.target.value); }}
              placeholder="e.g. Defective product, Wrong item, Customer changed mind..."
              style={{ border: "1.5px solid " + (!returnReason.trim() ? "#f9a8ba" : C.border), borderRadius: 8, padding: "9px 13px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#fff", color: C.text, width: "100%" }}
            />
            {!returnReason.trim() && <div style={{ fontSize: 11, color: C.red, marginTop: 3 }}>Required — cannot process return without a reason</div>}
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

  var [modal, setModal] = useState(null);
  var [suppSearch, setSuppSearch] = useState("");
  var [purSearch, setPurSearch] = useState("");
  var [selPur, setSelPur] = useState(null);
  var [returnQtys, setReturnQtys] = useState({});
  var [purReturnReason, setPurReturnReason] = useState("");
  var [purRefundMethod, setPurRefundMethod] = useState("Cash"); /* FIX Bug 1: cash back from supplier */
  var [histSearch, setHistSearch] = useState("");

  var openModal = function () {
    setModal("search");
    setSuppSearch(""); setPurSearch(""); setSelPur(null); setReturnQtys({}); setPurReturnReason(""); setPurRefundMethod("Cash");
  };
  var closeModal = function () { setModal(null); setSelPur(null); setReturnQtys({}); setSuppSearch(""); setPurSearch(""); setPurReturnReason(""); setPurRefundMethod("Cash"); };

  var getPurReturnedQty = function (purchaseId, productId) {
    return roundQty((state.purchaseReturns || []).filter(function (r) {
      return r.purchaseId === purchaseId && r.productId === productId;
    }).reduce(function (a, r) { return a + (r.qty || 0); }, 0));
  };

  var selectPurchase = function (pur) {
    var init = {};
    (pur.items || []).forEach(function (it) { init[it.id] = "0"; });
    setSelPur(pur);
    setReturnQtys(init);
    setModal("items");
  };

  var returnTotal = selPur ? (selPur.items || []).reduce(function (a, it) {
    var q = parseInt(returnQtys[it.id]) || 0;
    if (q <= 0) return a;
    var lineCost = round2(q * (it.cost || 0));
    var taxOn = state.settings && state.settings.taxEnabled ? computePurchaseReturnTax(selPur, lineCost, state.settings) : { apGross: lineCost };
    return a + round2(taxOn.apGross || lineCost);
  }, 0) : 0;
  var returnStockCost = selPur ? (selPur.items || []).reduce(function (a, it) {
    var q = parseInt(returnQtys[it.id]) || 0;
    return a + round2(q * (it.cost || 0));
  }, 0) : 0;

  var allPurchases = sortNewestFirst(state.purchases || []);
  var filteredPurchases = allPurchases.filter(function (p) {
    var sq = suppSearch.toLowerCase().trim();
    var pq = purSearch.toLowerCase().trim();
    var matchS = !sq || (p.supplier || "").toLowerCase().includes(sq);
    var matchP = !pq || (p.invoiceNo || "").toLowerCase().includes(pq);
    return matchS && matchP;
  });
  var purPickPager = usePager(filteredPurchases, LIST_PAGE_SIZE);

  var processReturn = function () {
    if (!selPur) return;
    var hasQty = (selPur.items || []).some(function (it) { return (parseInt(returnQtys[it.id]) || 0) > 0; });
    if (!hasQty) { showAlert("Enter at least one return quantity."); return; }
    if (!purReturnReason.trim()) { showAlert("Please enter a reason for this purchase return."); return; }
    var err = null;
    (selPur.items || []).forEach(function (it) {
      if (err) return;
      var q = parseInt(returnQtys[it.id]) || 0;
      var maxRet = it.qty - getPurReturnedQty(selPur.id, it.id);
      if (q < 0) { err = "Quantity cannot be negative."; return; }
      if (q > maxRet) { err = "\"" + (it.name || "Item") + "\": max returnable is " + maxRet + "."; }
    });
    if (err) { showAlert(err); return; }

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

      (selPur.items || []).forEach(function (it) {
        var q = parseInt(returnQtys[it.id]) || 0;
        if (q <= 0) return;
        var unitForGl = Number(it.cost);
        if (isNaN(unitForGl)) unitForGl = 0;
        var costFallbackWac = false;
        if (prModeOriginal) {
          var costMissing = it.cost == null || (typeof it.cost === "number" && isNaN(it.cost));
          if (costMissing) {
            var pRowFb = (state.products || []).find(function (p) { return p.id === it.id; });
            unitForGl = pRowFb ? Number(pRowFb.cost) || 0 : 0;
            costFallbackWac = true;
            prPolicyWarnings.push("Original cost: purchase line missing unit cost — fell back to current WAC (" + (it.name || it.id) + ")");
          } else {
            unitForGl = Number(it.cost) || 0;
            var prodSnap = (state.products || []).find(function (p) { return p.id === it.id; });
            if (prodSnap && Math.abs((Number(prodSnap.cost) || 0) - unitForGl) > 0.02) {
              prPolicyWarnings.push("Original cost policy: GL uses purchase line " + fmtNum(unitForGl) + " for \"" + (it.name || "") + "\" (live product cost differs)");
            }
          }
        }
        var amt = round2(q * unitForGl);
        var prTaxBundle = state.settings && state.settings.taxEnabled ? computePurchaseReturnTax(selPur, amt, state.settings) : { taxReversal: 0, apGross: amt };
        var thisRefund = (needsRefund && !purRefundRecorded) ? refundAmt : 0;
        if (needsRefund && !purRefundRecorded) purRefundRecorded = true;
        newReturns.push({
          id: uid(), returnId: genInvNo("PR"), purchaseId: selPur.id, purchaseNo: selPur.invoiceNo,
          purchaseLineId: it.id,
          productId: it.id, productName: it.name || "Unknown Product",
          qty: q, amount: amt, returnTax: round2(prTaxBundle.taxReversal || 0), returnGross: round2(prTaxBundle.apGross || amt), date: today(),
          createdAt: new Date().toISOString(),
          supplier: selPur.supplier || "", cost: unitForGl,
          costSourceFallbackWac: costFallbackWac === true,
          reason: purReturnReason.trim(),
          isRefund: needsRefund && thisRefund > 0, refundMethod: (needsRefund && thisRefund > 0) ? purRefundMethod : null,
          refundAmount: thisRefund
        });
        np = np.map(function (p) {
          if (p.id !== it.id) return p;
          var curS = p.stock || 0;
          var curC = p.cost || 0;
          var newS = Math.max(0, curS - q);
          /* PURCHASE RETURN — WAC LOCK (enterprise policy):
             Do NOT recompute weighted-average cost from returned line cost. Processing returns out of
             chronological order inverts WAC vs the true purchase timeline. We only deduct base qty.
             Inventory asset on the books drops by (returned_qty × line cost) via tc3_purchaseReturns rows
             and payable adjustments; remaining units keep the current frozen unit cost (curC). */
          return Object.assign({}, p, { stock: newS, cost: Math.round(curC * 100) / 100 });
        });
      });

      /* Reduce purchase total/balance */
      var npur = state.purchases.map(function (p) {
        if (p.id !== selPur.id) return p;
        var newPaid = Math.min(origPaid, newTotal);
        var newBal = Math.max(0, newTotal - newPaid);
        var newStat = newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
        return Object.assign({}, p, { total: newTotal, balance: newBal, paidAmount: newPaid, status: newStat });
      });

      S.set("tc3_purchaseReturns", newReturns);
      S.set("tc3_products", np);
      S.set("tc3_purchases", npur);
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
  var totalReturns = history.reduce(function (a, r) { return a + (r.amount || 0); }, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
        <StatCard label="Total Purchase Returns" value={totalReturns} accent={C.orange} icon="🔄" sub={history.length + " entries"} />
        <StatCard label="Items Returned" money={false} value={history.reduce(function (a, r) { return a + (r.qty || 0); }, 0)} accent={C.purple} icon="📤" sub="total units" />
        <StatCard label="Suppliers Involved" money={false} value={[...new Set(history.map(function (r) { return r.supplier; }))].length} accent={C.cyan} icon="🏭" />
      </div>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Purchase Returns</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Return goods to suppliers, adjust stock and payables</div>
          </div>
          <Btn col="orange" onClick={openModal}>🔄 New Purchase Return</Btn>
        </div>
        <div
          style={{ marginTop: 12, padding: "10px 14px", background: "#f0f7ff", border: "1px solid #bfdbfe", borderRadius: 10, fontSize: 12, color: "#1e40af", lineHeight: 1.5 }}
          title={"Purchase return cost policy: " + (state.settings.purchaseReturnCostMode === "original_cost" ? "original receipt (uses line cost; full layer match reserved)" : "current — uses unit cost on the purchase line (WAC snapshot) for GL; product WAC is not re-blended on return") + ". See Settings → Accounting."}
        >
          <strong>Note:</strong> Returning items deducts stock but does not recalculate the current Weighted Average Cost to prevent historical ledger distortion. GL uses the line unit cost from the purchase (see Settings → Purchase return cost).
        </div>
      </Card>

      <Card>
        <CardTitle sub={filteredHistory.length + " of " + history.length + " entries"}>Return History</CardTitle>
        <Input placeholder="Search supplier, purchase no, product, return ID..." value={histSearch} onChange={function (e) { setHistSearch(e.target.value); }} style={{ marginBottom: 10 }} />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><TH>Date</TH><TH>Return ID</TH><TH>Purchase #</TH><TH>Supplier</TH><TH>Product</TH><TH>Qty</TH><TH>Amount</TH><TH>Cost basis</TH><TH>Reason</TH></tr></thead>
            <tbody>
              {purHistPager.slice.map(function (r, i) {
                return (
                  <TR key={r.id} i={i}>
                    <TD color={C.muted}>{r.date}</TD>
                    <TD bold color={C.orange}>{r.returnId || r.id.slice(0, 8)}</TD>
                    <TD color={C.blue}>{r.purchaseNo || "—"}</TD>
                    <TD>{r.supplier || "—"}</TD>
                    <TD>{r.productName || "Unknown"}</TD>
                    <TD center>{r.qty}</TD>
                    <TD bold color={C.orange}>{getCurrencySymbol()} {fmtNum(r.amount)}</TD>
                    <TD color={C.muted} style={{ fontSize: 11, maxWidth: 220 }}>
                      {state.settings && state.settings.purchaseReturnCostMode === "original_cost"
                        ? (r.costSourceFallbackWac
                          ? <span style={{ color: "#b45309", fontWeight: 700 }}>Fallback to WAC (source not found)</span>
                          : <span>Based on purchase #{r.purchaseNo || "?"} line {r.purchaseLineId ? String(r.purchaseLineId).slice(0, 10) : "—"}</span>)
                        : <span>WAC snapshot (policy)</span>}
                    </TD>
                    <TD color={C.muted}><span style={{ fontSize: 12 }}>{r.reason || "—"}</span></TD>
                  </TR>
                );
              })}
              {filteredHistory.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", padding: 24, color: C.muted }}>No return history yet. Click &quot;New Purchase Return&quot; to get started.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager pager={purHistPager} />
      </Card>

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
                var alreadyRet = getPurReturnedQty(selPur.id, it.id);
                var maxRet = it.qty - alreadyRet;
                var q = parseInt(returnQtys[it.id]) || 0;
                var amt = q * (it.cost || 0);
                var overMax = q > maxRet;
                return (
                  <TR key={it.id || i} i={i}>
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
                        type="number" min="0" max={maxRet} value={returnQtys[it.id] || "0"}
                        disabled={maxRet <= 0}
                        onChange={function (e) {
                          var val = e.target.value;
                          setReturnQtys(function (prev) { var n = Object.assign({}, prev); n[it.id] = val; return n; });
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
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Reason for Return <span style={{ color: C.red }}>*</span></label>
            <input
              value={purReturnReason}
              onChange={function (e) { setPurReturnReason(e.target.value); }}
              placeholder="e.g. Damaged on delivery, Wrong product received, Quality issue..."
              style={{ border: "1.5px solid " + (!purReturnReason.trim() ? "#f9a8ba" : C.border), borderRadius: 8, padding: "9px 13px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#fff", color: C.text, width: "100%" }}
            />
            {!purReturnReason.trim() && <div style={{ fontSize: 11, color: C.red, marginTop: 3 }}>Required — cannot process return without a reason</div>}
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
