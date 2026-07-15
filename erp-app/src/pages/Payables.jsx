import React, { useState } from "react";
import { purchaseReturnUiStatus } from "../utils/returnDisplay.js";
import { isVoidedTxn } from "../utils/voidInvoice.js";
import ReturnDetailsPanel from "../components/ReturnDetailsPanel.jsx";
import { ActBtn, ActBtnGroup, actBtnCellStyle } from "../components/ActBtn.jsx";
import { LIST_PAGE_SIZE } from "../utils/listPage.js";

/* ═══════════════════════════════════════════════════════════
   ENHANCED PAYABLES — Purchase invoices + Manual (Borrowed, Other)
   ═══════════════════════════════════════════════════════════ */
var EnhancedPayables = function (props) {
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
  var [newForm, setNewForm] = useState({ date: today(), source: "", type: "Borrowed Money", amount: "", paymentMethod: "Cash", reference: "", note: "" });

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
    return { id: mp.id, _type: "manual", date: mp.date, source: mp.source, type: mp.type, amount: mp.amount, paid: paid, balance: bal, reference: mp.reference || "", note: mp.note || "", paymentHistory: mp.paymentHistory || [], _manualObj: mp };
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

  var saveManual = function () {
    if (!newForm.source.trim()) { showAlert("Please enter source (person / company)."); return; }
    if (!newForm.amount || parseFloat(newForm.amount) <= 0) { showAlert("Please enter a valid amount."); return; }
    var entry = { id: uid(), date: newForm.date, source: newForm.source.trim(), type: newForm.type, amount: parseFloat(newForm.amount), paymentMethod: newForm.paymentMethod || "Cash", reference: newForm.reference || "", note: newForm.note || "", paymentHistory: [], createdAt: new Date().toISOString() };
    var list = manualPays.concat([entry]);
    S.set("tc3_manualPayables", list);
    /* Fix 4: Trigger re-render so cash balance and payable totals update immediately */
    setState(function (st) { return Object.assign({}, st, { _payTs: Date.now() }); });
    setAddModal(false);
    setNewForm({ date: today(), source: "", type: "Borrowed Money", amount: "", paymentMethod: "Cash", reference: "", note: "" });
    showAlert("Payable recorded! Cash balance updated.");
  };

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
      var chqTotal = chequeList.reduce(function (a, c) { return a + (parseFloat(c.amount) || 0); }, 0);
      if (chqTotal <= 0) { showAlert("Total cheque amount must be greater than zero."); return; }
      var nch = (state.cheques || []).slice();
      var phEntries = [];
      chequeList.forEach(function (chq) {
        var chqAmt = parseFloat(chq.amount) || 0;
        if (chqAmt <= 0 || !chq.no.trim()) return;
        var newCheque = {
          id: uid(), type: "outgoing", status: "Pending",
          chequeNo: chq.no.trim(), bankName: (chq.bank || "").trim(),
          amount: chqAmt, dueDate: chq.due || today(), issuedDate: today(),
          supplierName: item.source || "",
          purchaseId: item._type === "purchase" ? item.id : "",
          purchaseNo: item.reference || "",
          manualPayableId: item._type === "manual" ? item.id : "",
          note: payNote || "", createdAt: today()
        };
        nch.push(newCheque);
        phEntries.push({ id: uid(), date: today(), amount: 0, cashMethod: "Cheque",
          note: "Cheque #" + chq.no.trim() + " " + getCurrencySymbol() + " " + fmtNum(chqAmt) + " (Pending — due " + chq.due + ")" + (payNote ? " | " + payNote : ""),
          chequeId: newCheque.id });
      });
      if (item._type === "purchase") {
        var pur = state.purchases.find(function (p) { return p.id === item.id; });
        if (pur) {
          var updPur = Object.assign({}, pur, { paymentHistory: (pur.paymentHistory || []).concat(phEntries) });
          var np0 = state.purchases.map(function (p) { return p.id === item.id ? updPur : p; });
          S.set("tc3_purchases", np0); S.set("tc3_cheques", nch);
          addAudit(chequeList.length + " Cheque(s) Issued " + getCurrencySymbol() + " " + fmtNum(chqTotal), item.reference || "");
          setState(function (st) { return Object.assign({}, st, { purchases: np0, cheques: nch }); });
        }
      } else {
        var list0 = S.get("tc3_manualPayables", []);
        var upd0 = list0.map(function (mp) {
          return mp.id !== item.id ? mp : Object.assign({}, mp, { paymentHistory: (mp.paymentHistory || []).concat(phEntries) });
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
      var pur = state.purchases.find(function (p) { return p.id === item.id; });
      if (!pur) return;
      var newPaid = (pur.paidAmount || 0) + amt; /* overpayment allowed — creates credit balance */
      var newBal = pur.total - newPaid;
      var newStatus = newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
      var ph = (pur.paymentHistory || []).concat([{ id: uid(), date: today(), amount: amt, cashMethod: payMethod, note: (payMethod || "Cash") + (payNote ? ": " + payNote : "") }]);
      var updPur = Object.assign({}, pur, { paidAmount: newPaid, balance: newBal, status: newStatus, paymentHistory: ph });
      /* Supplier payable is computed dynamically — no manual mutation needed */
      var np = state.purchases.map(function (p) { return p.id === item.id ? updPur : p; });
      S.set("tc3_purchases", np);
      addAudit("Purchase Payment: Rs " + amt, pur.invoiceNo || pur.id.slice(0, 8));
      setState(function (st) { return Object.assign({}, st, { purchases: np }); });
    } else {
      var list = S.get("tc3_manualPayables", []);
      var updated = list.map(function (mp) {
        if (mp.id !== item.id) return mp;
        var ph2 = (mp.paymentHistory || []).concat([{ id: uid(), date: today(), amount: amt, cashMethod: payMethod, note: payNote || "" }]);
        return Object.assign({}, mp, { paymentHistory: ph2 });
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
      var pur = entry._purObj;
      var newPh = (pur.paymentHistory || []).slice();
      splits.forEach(function (row) {
        var amt = parseFloat(row.amount) || 0; if (amt <= 0) return;
        if (row.method === "Cheque") {
          var nc = { id: uid(), type: "outgoing", status: "Pending", chequeNo: (row.chequeNo || "").trim(), bankName: (row.chequeBankName || "").trim(), amount: amt, dueDate: row.chequeDueDate || today(), issuedDate: today(), supplierName: pur.supplier || "", purchaseId: pur.id, purchaseNo: pur.invoiceNo || "", note: row.note || "", createdAt: today() };
          newCheques.push(nc);
          newPh.push({ id: uid(), date: today(), amount: 0, cashMethod: "Cheque", note: "Cheque #" + (row.chequeNo || "") + " " + getCurrencySymbol() + " " + fmtNum(amt) + " (Pending — due " + (row.chequeDueDate || today()) + ")" + (row.note ? " | " + row.note : ""), chequeId: nc.id });
        } else {
          var cm = (row.method === "Bank" || row.method === "Online" || row.method === "Card") ? "Bank" : "Cash";
          newPh.push({ id: uid(), date: today(), amount: amt, cashMethod: cm, note: (row.method || "Cash") + (row.note ? ": " + row.note : "") });
        }
      });
      var newPaid = (pur.paidAmount || 0) + totalNonCheque; var newBal = pur.total - newPaid;
      var updPur = Object.assign({}, pur, { paidAmount: newPaid, balance: newBal, status: newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid", paymentHistory: newPh });
      var np = state.purchases.map(function (p) { return p.id === pur.id ? updPur : p; });
      S.set("tc3_purchases", np); S.set("tc3_cheques", newCheques);
      setState(function (st) { return Object.assign({}, st, { purchases: np, cheques: newCheques }); });
    } else {
      var manPays = S.get("tc3_manualPayables", []);
      var newPh2 = [];
      splits.forEach(function (row) {
        var amt = parseFloat(row.amount) || 0; if (amt <= 0) return;
        if (row.method === "Cheque") {
          var nc2 = { id: uid(), type: "outgoing", status: "Pending", chequeNo: (row.chequeNo || "").trim(), bankName: (row.chequeBankName || "").trim(), amount: amt, dueDate: row.chequeDueDate || today(), issuedDate: today(), manualPayableId: entry.id, note: row.note || "", createdAt: today() };
          newCheques.push(nc2);
          newPh2.push({ id: uid(), date: today(), amount: 0, cashMethod: "Cheque", note: "Cheque #" + (row.chequeNo || "") + " " + getCurrencySymbol() + " " + fmtNum(amt) + " (Pending — due " + (row.chequeDueDate || today()) + ")", chequeId: nc2.id });
        } else {
          var cm2 = (row.method === "Bank" || row.method === "Online" || row.method === "Card") ? "Bank" : "Cash";
          newPh2.push({ id: uid(), date: today(), amount: amt, cashMethod: cm2, note: (row.method || "Cash") + (row.note ? ": " + row.note : "") });
        }
      });
      var updMan = manPays.map(function (mp) { return mp.id === entry.id ? Object.assign({}, mp, { paymentHistory: (mp.paymentHistory || []).concat(newPh2) }) : mp; });
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

  var PTABS = [["all", "All"], ["outstanding", "Outstanding"], ["cleared", "Cleared"], ["purchases", "Purchase Invoices"], ["manual", "Manual Entries"]];

  return (
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
        <StatCard label="Total Payable" value={totalPayable} accent={C.red} icon="📤" sub={allEntries.filter(function (e) { return e.balance > 0; }).length + " pending"} />
        <StatCard label="Supplier Invoices" value={totalPurchases} accent={C.orange} icon="🏭" sub={state.purchases.length + " orders"} />
        <StatCard label="Manual (Borrowed etc)" value={totalManual} accent={C.purple} icon="💰" sub={manualEntries.filter(function (e) { return e.balance > 0; }).length + " pending"} />
        <StatCard label="Total Entries" money={false} value={allEntries.length} accent={C.blue} icon="📋" sub="All payable records" />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, borderBottom: "2px solid " + C.border, flex: 1 }}>
          {PTABS.map(function (t) { return <button key={t[0]} onClick={function () { setPtab(t[0]); }} style={{ padding: "9px 15px", borderRadius: "9px 9px 0 0", border: "1.5px solid " + (ptab === t[0] ? C.border : "transparent"), borderBottom: ptab === t[0] ? "2px solid #fff" : "none", background: ptab === t[0] ? "#fff" : "transparent", color: ptab === t[0] ? C.accent : C.muted, fontWeight: 700, fontSize: 12, cursor: "pointer", marginBottom: ptab === t[0] ? -2 : 0 }}>{t[1]}</button>; })}
        </div>
        <div style={{ marginLeft: 12, flexShrink: 0 }}>
          <Btn col="orange" onClick={function () { setAddModal(true); }}>💰 Add Payable (Money In)</Btn>
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
              {filtered.length === 0 && <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: C.muted }}>No payables found</td></tr>}
              {payPager.slice.map(function (e, i) {
                var isOut = e.balance > 0;
                var purRet = e._type === "purchase" && e._returnMeta ? e._returnMeta : { hasReturns: false };
                var rowBg = purRet.hasReturns ? "#fff7ed" : (i % 2 === 0 ? "#ffffff" : "#f8fbff");
                return (
                  <tr key={e.id} className="table-row-hover" style={{ background: rowBg, borderBottom: "1px solid " + C.borderLight }} title={purRet.hasReturns ? "This invoice has return activity" : undefined}>
                    <TD>{fmtDateFull(e.date)}</TD>
                    <TD bold>{e.source}</TD>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "nowrap" }}>
                        <span style={{ background: e._type === "purchase" ? C.warnSoft : "#f3e8ff", color: e._type === "purchase" ? C.amber : C.purple, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{e.type}</span>
                        {purRet.hasReturns ? <span style={{ fontSize: 10, fontWeight: 700, color: "#c2410c", background: "#ffedd5", border: "1px solid #fdba74", borderRadius: 5, padding: "1px 5px", lineHeight: 1.3 }}>↩</span> : null}
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
                        {isOut && (state.cheques || []).some(function (ch) { return ch.purchaseId === e.id && ch.status === "Pending"; }) ? (
                          <span title="Has pending cheque(s)" style={{ fontSize: 11, lineHeight: 1 }}>🕐</span>
                        ) : null}
                        {isOut ? <ActBtn tone="orange" title="Record payment" wide onClick={function () { setSplitPayModal(e); }}>Pay</ActBtn> : null}
                        {e._type === "manual" ? <ActBtn tone="red" title="Delete entry" onClick={function () { deleteManual(e.id); }}>✕</ActBtn> : null}
                      </ActBtnGroup>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager pager={payPager} />
        {filtered.length > 0 && (
          <div style={{ display: "flex", gap: 20, padding: "10px 14px", borderTop: "2px solid " + C.border, fontSize: 13, fontWeight: 700, background: "#f7f9ff" }}>
            <span>Total: <span style={{ color: C.blue }}>{getCurrencySymbol()} {fmtNum(filtered.reduce(function (a, e) { return a + e.amount; }, 0))}</span></span>
            <span>Paid: <span style={{ color: C.green }}>{getCurrencySymbol()} {fmtNum(filtered.reduce(function (a, e) { return a + e.paid; }, 0))}</span></span>
            <span>Outstanding: <span style={{ color: C.red }}>{getCurrencySymbol()} {fmtNum(filtered.reduce(function (a, e) { return a + e.balance; }, 0))}</span></span>
          </div>
        )}
      </Card>

      {/* Add Modal */}
      {addModal && (
        <Modal title="Add Manual Payable" onClose={function () { setAddModal(false); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "#e8f5e9", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: "#1b5e20", fontWeight: 700 }}>💰 MONEY IN — Cash/Bank balance will INCREASE when saved. You are receiving money that you must repay later.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Date *" type="date" value={newForm.date} onChange={function (e) { setNewForm(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }} />
              <Sel label="Type *" value={newForm.type} onChange={function (e) { setNewForm(function (x) { return Object.assign({}, x, { type: e.target.value }); }); }}>
                <option>Borrowed Money</option>
                <option>Bank Loan</option>
                <option>Family / Friend Loan</option>
                <option>Security Deposit Received</option>
                <option>Advance from Customer</option>
                <option>Cheque Received (Pending)</option>
                <option>Inter-Account Transfer</option>
                <option>Other Payable</option>
              </Sel>
            </div>
            <Input label="Source (Person / Company) *" value={newForm.source} onChange={function (e) { setNewForm(function (x) { return Object.assign({}, x, { source: e.target.value }); }); }} placeholder="e.g. Friend, Bank, Family" />
            <Input label="Amount (Rs) *" type="number" value={newForm.amount} onChange={function (e) { setNewForm(function (x) { return Object.assign({}, x, { amount: e.target.value }); }); }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 5 }}>Received Via</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[["Cash", "💵 Cash", "#1b5e20", "#f0f9f4"], ["Bank", "🏦 Bank", "#1565c0", "#e8f0fe"]].map(function (opt) {
                  var active = (newForm.paymentMethod || "Cash") === opt[0];
                  return <button key={opt[0]} onClick={function () { setNewForm(function (x) { return Object.assign({}, x, { paymentMethod: opt[0] }); }); }} style={{ flex: 1, padding: "9px 8px", borderRadius: 9, border: "2px solid " + (active ? opt[2] : C.border), background: active ? opt[3] : "#fff", color: active ? opt[2] : C.textMd, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{opt[1]}</button>;
                })}
              </div>
            </div>
            <Input label="Reference" value={newForm.reference} onChange={function (e) { setNewForm(function (x) { return Object.assign({}, x, { reference: e.target.value }); }); }} placeholder="Optional reference" />
            <Input label="Note" value={newForm.note} onChange={function (e) { setNewForm(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} placeholder="Optional note" />
            <Btn col="orange" onClick={saveManual}>Save Payable</Btn>
          </div>
        </Modal>
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

      {/* View Modal */}
      {viewItem && (
        <Modal title={"Payable — " + viewItem.source} onClose={function () { setViewItem(null); }} wide={viewItem._type === "purchase" && viewItem._returnMeta && viewItem._returnMeta.hasReturns}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[["Date", fmtDateFull(viewItem.date)], ["Source", viewItem.source], ["Type", viewItem.type], ["Total Amount", getCurrencySymbol() + " " + fmtNum(viewItem.amount)], ["Paid", getCurrencySymbol() + " " + fmtNum(viewItem.paid)], ["Balance (after returns)", getCurrencySymbol() + " " + fmtNum(viewItem.balance)], ["Reference", viewItem.reference || "—"], ["Note", viewItem.note || "—"]].map(function (r) {
              return <div key={r[0]} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid " + C.borderLight }}><span style={{ color: C.muted, fontSize: 13 }}>{r[0]}</span><span style={{ fontWeight: 700, fontSize: 13 }}>{r[1]}</span></div>;
            })}
            {viewItem._type === "purchase" && viewItem._returnMeta && viewItem._returnMeta.hasReturns ? (
              <div style={{ padding: "10px 12px", background: "#fff7ed", borderRadius: 8, border: "1px solid #fed7aa", fontSize: 12, color: "#9a3412" }}>
                <strong>Return summary:</strong>{" "}
                {getCurrencySymbol()} {fmtNum(viewItem._returnMeta.totalRet)} returned (goods value) · adjusted balance shown above reflects the current purchase total after returns.
                <div style={{ fontSize: 11, marginTop: 4, color: C.muted }}>Original invoice link: purchase ID <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{viewItem._purObj && viewItem._purObj.id}</span></div>
              </div>
            ) : null}
            {viewItem._type === "purchase" && viewItem._returnMeta && viewItem._returnMeta.hasReturns ? (
              <ReturnDetailsPanel
                mode="purchase"
                rows={viewItem._returnMeta.rows}
                originalId={viewItem._purObj ? viewItem._purObj.id : viewItem.id}
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
                              var manPays = S.get("tc3_manualPayables", []);
                              var updated = manPays.map(function (m) {
                                if (m.id !== viewItem.id) return m;
                                var reversalEntry = { id: uid(), date: today(), amount: -ph.amount, cashMethod: ph.cashMethod || "Cash", note: "Reversed: " + (ph.note || fmtDateFull(ph.date)) };
                                return Object.assign({}, m, { paymentHistory: (m.paymentHistory || []).concat([reversalEntry]) });
                              });
                              S.set("tc3_manualPayables", updated);
                              setState(function (st) { return Object.assign({}, st, { _payTs: Date.now() }); });
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
    </div>
  );
};


var Payables = EnhancedPayables;
export default Payables;
