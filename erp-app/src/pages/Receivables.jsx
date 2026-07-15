import React, { useState } from "react";
import { saleReturnUiStatus } from "../utils/returnDisplay.js";
import { isVoidedTxn } from "../utils/voidInvoice.js";
import ReturnDetailsPanel from "../components/ReturnDetailsPanel.jsx";
import { ActBtn, ActBtnGroup, actBtnCellStyle } from "../components/ActBtn.jsx";
import { LIST_PAGE_SIZE } from "../utils/listPage.js";

/* ═══════════════════════════════════════════════════════════
   ENHANCED RECEIVABLES — Sales invoices + Manual (Loan Given, Other)
   ═══════════════════════════════════════════════════════════ */
var EnhancedReceivables = function (props) {
  var state = props.state;
  var setState = props.setState;
  var S = props.S;
  var today = props.today;
  var uid = props.uid;
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
  var [newForm, setNewForm] = useState({ date: today(), person: "", type: "Loan Given", amount: "", paymentMethod: "Cash", reference: "", note: "" });

  var manualRecs = S.get("tc3_manualReceivables", []);

  /* ── processSplitSale: handles split/multi-method payments on sales invoices ── */
  var processSplitSale = function (saleId, splits, __forcedId, __legacyAll) {
    var sale = state.sales.find(function (s) { return s.id === saleId; });
    if (!sale) return;
    if (isVoidedTxn(sale)) { showAlert("Cannot record payment on a voided invoice."); return; }
    var newPh = (sale.paymentHistory || []).slice();
    var newCheques = (state.cheques || []).slice();
    var totalAdded = 0;
    var totalNonCheque = 0;
    splits.forEach(function (row) {
      var amt = parseFloat(row.amount) || 0;
      if (amt <= 0) return;
      totalAdded += amt;
      if (row.method === "Cheque") {
        var newChq = { id: uid(), type: "incoming", status: "Pending", chequeNo: (row.chequeNo || "").trim(), bankName: (row.chequeBankName || "").trim(), amount: amt, dueDate: row.chequeDueDate || today(), issuedDate: today(), customerId: sale.customerId || "", customerName: sale.customerName || "", saleId: saleId, invoiceNo: sale.invoiceNo || "", note: row.note || "", createdAt: today() };
        newCheques.push(newChq);
        newPh.push({ id: uid(), date: today(), amount: 0, cashMethod: "Cheque", note: "Cheque #" + (row.chequeNo || "") + " " + getCurrencySymbol() + " " + fmtNum(amt) + " (Pending — due " + (row.chequeDueDate || today()) + ")" + (row.note ? " | " + row.note : ""), chequeId: newChq.id });
      } else {
        var cm = (row.method === "Bank" || row.method === "Online" || row.method === "Card") ? "Bank" : "Cash";
        totalNonCheque += amt;
        newPh.push({ id: uid(), date: today(), amount: amt, cashMethod: cm, note: (row.method || "Cash") + (row.note ? ": " + row.note : "") });
      }
    });
    var newPaid = (sale.paid || 0) + totalNonCheque;
    var newBal = sale.total - newPaid;
    var newStatus = newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
    var updSale = Object.assign({}, sale, { paid: newPaid, balance: newBal, payStatus: newStatus, paymentHistory: newPh });
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
    var nc = state.customers.map(function (c) { return res.ids.indexOf(c.id) >= 0 ? Object.assign({}, c, { credit: Math.max(0, (c.credit || 0) - totalNonCheque) }) : c; });
    var ns = state.sales.map(function (s) { return s.id === saleId ? updSale : s; });
    S.set("tc3_sales", ns); S.set("tc3_customers", nc); S.set("tc3_cheques", newCheques);
    setState(function (st) { return Object.assign({}, st, { sales: ns, customers: nc, cheques: newCheques }); });
    setSplitPayModal(null);
    addAudit("Payment " + getCurrencySymbol() + " " + fmtNum(totalAdded), sale.invoiceNo || saleId.slice(0, 8));
    toastAfterCustomerPaymentApplied(state.customers, res);
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
    return { id: mr.id, _type: "manual", date: mr.date, source: mr.person, type: mr.type, amount: mr.amount, paid: paid, balance: bal, reference: mr.reference || "", note: mr.note || "", paymentHistory: mr.paymentHistory || [], _manualObj: mr };
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

  var saveManual = function () {
    if (!newForm.person.trim()) { showAlert("Please enter person / customer name."); return; }
    if (!newForm.amount || parseFloat(newForm.amount) <= 0) { showAlert("Please enter a valid amount."); return; }
    var entry = { id: uid(), date: newForm.date, person: newForm.person.trim(), type: newForm.type, amount: parseFloat(newForm.amount), paymentMethod: newForm.paymentMethod || "Cash", reference: newForm.reference || "", note: newForm.note || "", paymentHistory: [], createdAt: new Date().toISOString() };
    var list = manualRecs.concat([entry]);
    S.set("tc3_manualReceivables", list);
    /* Fix 4: Trigger re-render so cash balance and receivable totals update immediately */
    setState(function (st) { return Object.assign({}, st, { _recTs: Date.now() }); });
    setAddModal(false);
    setNewForm({ date: today(), person: "", type: "Loan Given", amount: "", paymentMethod: "Cash", reference: "", note: "" });
    showAlert("Receivable recorded! Cash balance updated.");
  };

  var applyErSaleCashPayment = function (item, amt, forcedId, legacyAll) {
    var sale = state.sales.find(function (s) { return s.id === item.id; });
    if (!sale) return true;
    if (isVoidedTxn(sale)) { showAlert("Cannot record payment on a voided invoice."); return false; }
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
    var updSale = Object.assign({}, sale, { paid: newPaid, balance: newBal, payStatus: newStatus, paymentHistory: ph });
    warnPaymentCustomerMatchSafety(state.customers, sale, "EnhancedReceivables.recordPayment");
    maybeShowPaymentMatchToasts(sale, res);
    var nc = state.customers.map(function (c) { return res.ids.indexOf(c.id) >= 0 ? Object.assign({}, c, { credit: Math.max(0, (c.credit || 0) - amt) }) : c; });
    var ns = state.sales.map(function (s) { return s.id === item.id ? updSale : s; });
    S.set("tc3_sales", ns); S.set("tc3_customers", nc);
    addAudit("Receivable Payment: Rs " + amt, item.reference || (sale.invoiceNo || sale.id.slice(0, 8)));
    setState(function (st) { return Object.assign({}, st, { sales: ns, customers: nc }); });
    toastAfterCustomerPaymentApplied(state.customers, res);
    return true;
  };

  var recordPayment = function () {
    var amt = parseFloat(payAmt);
    if (!amt || amt <= 0) { showAlert("Enter a valid payment amount."); return; }
    var item = payModal;
    /* ── Cheque: save ALL cheques in chequeList ── */
    if (payMethod === "Cheque") {
      if (chequeList.length === 0) { showAlert("Add at least one cheque using the + Add Cheque button."); return; }
      var chqTotal = chequeList.reduce(function (a, c) { return a + (parseFloat(c.amount) || 0); }, 0);
      if (chqTotal <= 0) { showAlert("Total cheque amount must be greater than zero."); return; }
      var nch = (state.cheques || []).slice();
      var phEntries = [];
      chequeList.forEach(function (chq) {
        var chqAmt = parseFloat(chq.amount) || 0;
        if (chqAmt <= 0 || !chq.no.trim()) return;
        var newCheque = {
          id: uid(), type: "incoming", status: "Pending",
          chequeNo: chq.no.trim(), bankName: (chq.bank || "").trim(),
          amount: chqAmt, dueDate: chq.due || today(), issuedDate: today(),
          customerId: item._saleObj ? (item._saleObj.customerId || "") : "",
          customerName: item.source || "",
          saleId: item._type === "sale" ? item.id : "",
          invoiceNo: item.reference || "",
          manualReceivableId: item._type === "manual" ? item.id : "",
          note: payNote || "", createdAt: today()
        };
        nch.push(newCheque);
        phEntries.push({ id: uid(), date: today(), amount: 0, cashMethod: "Cheque",
          note: "Cheque #" + chq.no.trim() + " " + getCurrencySymbol() + " " + fmtNum(chqAmt) + " (Pending — due " + chq.due + ")" + (payNote ? " | " + payNote : ""),
          chequeId: newCheque.id });
      });
      if (item._type === "sale") {
        var sale = state.sales.find(function (s) { return s.id === item.id; });
        if (sale) {
          var updSale = Object.assign({}, sale, { paymentHistory: (sale.paymentHistory || []).concat(phEntries) });
          var ns = state.sales.map(function (s) { return s.id === item.id ? updSale : s; });
          S.set("tc3_sales", ns); S.set("tc3_cheques", nch);
          addAudit(chequeList.length + " Cheque(s) Received " + getCurrencySymbol() + " " + fmtNum(chqTotal), item.reference || "");
          setState(function (st) { return Object.assign({}, st, { sales: ns, cheques: nch }); });
        }
      } else {
        var list0 = S.get("tc3_manualReceivables", []);
        var upd0 = list0.map(function (mr) {
          return mr.id !== item.id ? mr : Object.assign({}, mr, { paymentHistory: (mr.paymentHistory || []).concat(phEntries) });
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
        return Object.assign({}, mr, { paymentHistory: ph2 });
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

  var RTABS = [["all", "All"], ["outstanding", "Outstanding"], ["cleared", "Cleared"], ["sales", "Sales Invoices"], ["manual", "Manual Entries"]];

  return (
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
        <StatCard label="Total Receivable" value={totalReceivable} accent={C.red} icon="📥" sub={allEntries.filter(function (e) { return e.balance > 0; }).length + " pending"} />
        <StatCard label="From Sales" value={totalSales} accent={C.blue} icon="🧾" sub={state.sales.length + " invoices"} />
        <StatCard label="Manual (Loans etc)" value={totalManual} accent={C.purple} icon="🤝" sub={manualEntries.filter(function (e) { return e.balance > 0; }).length + " pending"} />
        <StatCard label="Total Entries" money={false} value={allEntries.length} accent={C.cyan} icon="📋" sub="All receivable records" />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, borderBottom: "2px solid " + C.border, flex: 1 }}>
          {RTABS.map(function (t) { return <button key={t[0]} onClick={function () { setRtab(t[0]); }} style={{ padding: "9px 15px", borderRadius: "9px 9px 0 0", border: "1.5px solid " + (rtab === t[0] ? C.border : "transparent"), borderBottom: rtab === t[0] ? "2px solid #fff" : "none", background: rtab === t[0] ? "#fff" : "transparent", color: rtab === t[0] ? C.accent : C.muted, fontWeight: 700, fontSize: 12, cursor: "pointer", marginBottom: rtab === t[0] ? -2 : 0 }}>{t[1]}</button>; })}
        </div>
        <div style={{ marginLeft: 12, flexShrink: 0 }}>
          <Btn col="cyan" onClick={function () { setAddModal(true); }}>💸 Add Receivable (Money Out)</Btn>
        </div>
      </div>
      <Card>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}><Input value={search} onChange={function (e) { setSearch(e.target.value); }} placeholder="Search source, reference..." /></div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><TH>Date</TH><TH>Source</TH><TH>Type</TH><TH>Total Amount</TH><TH>Paid</TH><TH>Balance</TH><TH>Reference</TH><TH>Actions</TH></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: C.muted }}>No receivables found</td></tr>}
              {recPager.slice.map(function (e, i) {
                var isOut = e.balance > 0;
                var saleRet = e._type === "sale" && e._returnMeta ? e._returnMeta : { hasReturns: false };
                var rowBg = saleRet.hasReturns ? "#fff7ed" : (i % 2 === 0 ? "#ffffff" : "#f8fbff");
                return (
                  <tr key={e.id} className="table-row-hover" style={{ background: rowBg, borderBottom: "1px solid " + C.borderLight }} title={saleRet.hasReturns ? "This invoice has return activity" : undefined}>
                    <TD>{fmtDateFull(e.date)}</TD>
                    <TD bold>{e.source}</TD>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "nowrap" }}>
                        <span style={{ background: e._type === "sale" ? C.accentSoft : "#f3e8ff", color: e._type === "sale" ? C.accent : C.purple, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{e.type}</span>
                        {saleRet.hasReturns ? <span style={{ fontSize: 10, fontWeight: 700, color: "#9f1239", background: "#ffe4e6", border: "1px solid #fda4af", borderRadius: 5, padding: "1px 5px", lineHeight: 1.3 }}>↩</span> : null}
                      </div>
                    </td>
                    <TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(e.amount)}</TD>
                    <TD color={C.green}>{getCurrencySymbol()} {fmtNum(e.paid)}</TD>
                    <td style={{ padding: "10px 12px" }}>
                      {isOut
                        ? <span style={{ background: C.dangerSoft, color: C.red, padding: "3px 10px", borderRadius: 20, fontWeight: 700, fontSize: 12 }}>{getCurrencySymbol()} {fmtNum(e.balance)}</span>
                        : <span style={{ background: C.successSoft, color: C.green, padding: "3px 10px", borderRadius: 20, fontWeight: 700, fontSize: 12 }}>Cleared</span>
                      }
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 11, color: C.muted }}>{e.reference || "—"}</td>
                    <td style={actBtnCellStyle}>
                      <ActBtnGroup>
                        <ActBtn tone="cyan" title="View details" onClick={function () { setViewItem(e); }}>🧾</ActBtn>
                        {isOut && (state.cheques || []).some(function (ch) { return ch.saleId === (e._saleObj && e._saleObj.id) && ch.status === "Pending"; }) ? (
                          <span title="Has pending cheque(s)" style={{ fontSize: 11, lineHeight: 1 }}>🕐</span>
                        ) : null}
                        {isOut ? <ActBtn tone="green" title="Record payment" wide onClick={function () { setSplitPayModal(e); }}>Pay</ActBtn> : null}
                        {e._type === "manual" ? <ActBtn tone="red" title="Delete entry" onClick={function () { deleteManual(e.id); }}>✕</ActBtn> : null}
                      </ActBtnGroup>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager pager={recPager} />
        {filtered.length > 0 && (
          <div style={{ display: "flex", gap: 20, padding: "10px 14px", borderTop: "2px solid " + C.border, fontSize: 13, fontWeight: 700, background: "#f7f9ff" }}>
            <span>Total: <span style={{ color: C.blue }}>{getCurrencySymbol()} {fmtNum(filtered.reduce(function (a, e) { return a + e.amount; }, 0))}</span></span>
            <span>Collected: <span style={{ color: C.green }}>{getCurrencySymbol()} {fmtNum(filtered.reduce(function (a, e) { return a + e.paid; }, 0))}</span></span>
            <span>Outstanding: <span style={{ color: C.red }}>{getCurrencySymbol()} {fmtNum(filtered.reduce(function (a, e) { return a + e.balance; }, 0))}</span></span>
          </div>
        )}
      </Card>

      {/* Add Modal */}
      {addModal && (
        <Modal title="Add Manual Receivable" onClose={function () { setAddModal(false); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "#fde8ed", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: C.red, fontWeight: 700 }}>💸 MONEY OUT — Cash/Bank balance will DECREASE when saved. You are giving money that others will owe you back.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Date *" type="date" value={newForm.date} onChange={function (e) { setNewForm(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }} />
              <Sel label="Type *" value={newForm.type} onChange={function (e) { setNewForm(function (x) { return Object.assign({}, x, { type: e.target.value }); }); }}>
                <option>Loan Given</option>
                <option>Staff Advance</option>
                <option>Security Deposit Paid</option>
                <option>Advance to Supplier</option>
                <option>Cheque Issued (Pending)</option>
                <option>Refund Pending</option>
                <option>Inter-Account Transfer</option>
                <option>Other Receivable</option>
              </Sel>
            </div>
            <Input label="Person / Customer *" value={newForm.person} onChange={function (e) { setNewForm(function (x) { return Object.assign({}, x, { person: e.target.value }); }); }} placeholder="e.g. Staff member name" />
            <Input label="Amount (Rs) *" type="number" value={newForm.amount} onChange={function (e) { setNewForm(function (x) { return Object.assign({}, x, { amount: e.target.value }); }); }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 5 }}>Payment Method</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[["Cash", "💵 Cash", "#1b5e20", "#f0f9f4"], ["Bank", "🏦 Bank", "#1565c0", "#e8f0fe"]].map(function (opt) {
                  var active = (newForm.paymentMethod || "Cash") === opt[0];
                  return <button key={opt[0]} onClick={function () { setNewForm(function (x) { return Object.assign({}, x, { paymentMethod: opt[0] }); }); }} style={{ flex: 1, padding: "9px 8px", borderRadius: 9, border: "2px solid " + (active ? opt[2] : C.border), background: active ? opt[3] : "#fff", color: active ? opt[2] : C.textMd, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{opt[1]}</button>;
                })}
              </div>
            </div>
            <Input label="Reference" value={newForm.reference} onChange={function (e) { setNewForm(function (x) { return Object.assign({}, x, { reference: e.target.value }); }); }} placeholder="Optional reference" />
            <Input label="Note" value={newForm.note} onChange={function (e) { setNewForm(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} placeholder="Optional note" />
            <Btn col="cyan" onClick={saveManual}>Save Receivable</Btn>
          </div>
        </Modal>
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

      {/* View Modal */}
      {viewItem && (
        <Modal title={"Receivable — " + viewItem.source} onClose={function () { setViewItem(null); }} wide={viewItem._type === "sale" && viewItem._returnMeta && viewItem._returnMeta.hasReturns}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[["Date", fmtDateFull(viewItem.date)], ["Source", viewItem.source], ["Type", viewItem.type], ["Total Amount", getCurrencySymbol() + " " + fmtNum(viewItem.amount)], ["Paid", getCurrencySymbol() + " " + fmtNum(viewItem.paid)], ["Balance (after returns)", getCurrencySymbol() + " " + fmtNum(viewItem.balance)], ["Reference", viewItem.reference || "—"], ["Note", viewItem.note || "—"]].map(function (r) {
              return <div key={r[0]} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid " + C.borderLight }}><span style={{ color: C.muted, fontSize: 13 }}>{r[0]}</span><span style={{ fontWeight: 700, fontSize: 13 }}>{r[1]}</span></div>;
            })}
            {viewItem._type === "sale" && viewItem._returnMeta && viewItem._returnMeta.hasReturns ? (
              <div style={{ padding: "10px 12px", background: "#fff7ed", borderRadius: 8, border: "1px solid #fed7aa", fontSize: 12, color: "#9a3412" }}>
                <strong>Return summary:</strong>{" "}
                {getCurrencySymbol()} {fmtNum(viewItem._returnMeta.totalRet)} returned (goods value) · balance above reflects the invoice after returns.
                <div style={{ fontSize: 11, marginTop: 4, color: C.muted }}>Original invoice link: sale ID <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{viewItem._saleObj && viewItem._saleObj.id}</span></div>
              </div>
            ) : null}
            {viewItem._type === "sale" && viewItem._returnMeta && viewItem._returnMeta.hasReturns ? (
              <ReturnDetailsPanel
                mode="sale"
                rows={viewItem._returnMeta.rows}
                originalId={viewItem._saleObj ? viewItem._saleObj.id : viewItem.id}
                C={C}
                getCurrencySymbol={getCurrencySymbol}
                fmtNum={fmtNum}
                fmtDateFull={fmtDateFull}
              />
            ) : null}
            {viewItem.paymentHistory && viewItem.paymentHistory.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Payment History</div>
                {viewItem.paymentHistory.map(function (ph, i) {
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
                        {(ph.amount || 0) > 0 && !isReversal && viewItem._type === "manual" && (
                          <button onClick={function () {
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
                  var nc = { id: uid(), type: "incoming", status: "Pending", chequeNo: (row.chequeNo || "").trim(), bankName: (row.chequeBankName || "").trim(), amount: amt, dueDate: row.chequeDueDate || today(), issuedDate: today(), manualReceivableId: splitPayModal.id, note: row.note || "", createdAt: today() };
                  newCheques.push(nc);
                  newPh.push({ id: uid(), date: today(), amount: 0, cashMethod: "Cheque", note: "Cheque #" + (row.chequeNo || "") + " " + getCurrencySymbol() + " " + fmtNum(amt) + " (Pending — due " + (row.chequeDueDate || today()) + ")", chequeId: nc.id });
                } else {
                  var cm = (row.method === "Bank" || row.method === "Online" || row.method === "Card") ? "Bank" : "Cash";
                  newPh.push({ id: uid(), date: today(), amount: amt, cashMethod: cm, note: (row.method || "Cash") + (row.note ? ": " + row.note : "") });
                }
              });
              var updMan = manRecs.map(function (mr) { return mr.id === splitPayModal.id ? Object.assign({}, mr, { paymentHistory: (mr.paymentHistory || []).concat(newPh) }) : mr; });
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
