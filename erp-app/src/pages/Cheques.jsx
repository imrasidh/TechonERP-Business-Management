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
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var usePager = props.usePager;
  var Pager = props.Pager;
  var checkPeriodClose = props.checkPeriodClose;

  var [tab, setTab] = useState("all");
  var [search, setSearch] = useState("");
  var [actionModal, setActionModal] = useState(null); /* { cheque, action: "clear"|"bounce"|"reissue" } */
  var [reissueForm, setReissueForm] = useState({ chequeNo: "", dueDate: "", bankName: "" });
  var [addModal, setAddModal] = useState(null); /* "incoming" | "outgoing" */
  var [addForm, setAddForm] = useState({ chequeNo: "", bankName: "", amount: "", dueDate: today(), partyName: "", note: "", partyType: "customer" });

  var cheques = sortNewestFirst(state.cheques || []);
  var todayStr = today();

  /* Status badge */
  var ChequeStatusBadge = function (bp) {
    var s = bp.status; var due = bp.due;
    var overdue = s === "Pending" && due < todayStr;
    var dueSoon = s === "Pending" && due >= todayStr && (new Date(due) - new Date(todayStr)) / 86400000 <= 7;
    if (s === "Cleared") return <span style={{ background: "#e6f7f2", color: "#0a7a53", border: "1px solid #9ee8ce", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>✅ Cleared</span>;
    if (s === "Bounced") return <span style={{ background: "#fde8ed", color: "#c0152e", border: "1px solid #f9a8ba", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>↩ Bounced</span>;
    if (overdue) return <span style={{ background: "#fde8ed", color: "#c0152e", border: "1px solid #f9a8ba", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, animation: "pulse 1s infinite" }}>🔴 Overdue</span>;
    if (dueSoon) return <span style={{ background: "#fff3e0", color: "#b45309", border: "1px solid #f7c97a", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>🟡 Due Soon</span>;
    return <span style={{ background: "#e8eeff", color: "#1a47c2", border: "1px solid #a8bcf0", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>⏳ Pending</span>;
  };

  var TABS = [["all", "All"], ["pending", "Pending"], ["overdue", "Overdue"], ["cleared", "Cleared"], ["bounced", "Bounced"]];

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

  /* Totals */
  var pendingOut = cheques.filter(function (c) { return c.type === "outgoing" && c.status === "Pending"; }).reduce(function (a, c) { return a + c.amount; }, 0);
  var pendingIn  = cheques.filter(function (c) { return c.type === "incoming" && c.status === "Pending"; }).reduce(function (a, c) { return a + c.amount; }, 0);
  var overdueCount = cheques.filter(function (c) { return c.status === "Pending" && c.dueDate < todayStr; }).length;

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
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
        <StatCard label="To Pay (Outgoing)" value={pendingOut} accent={C.red} icon="📤" sub={cheques.filter(function (c) { return c.type === "outgoing" && c.status === "Pending"; }).length + " pending cheques"} />
        <StatCard label="To Receive (Incoming)" value={pendingIn} accent={C.green} icon="📥" sub={cheques.filter(function (c) { return c.type === "incoming" && c.status === "Pending"; }).length + " pending cheques"} />
        <StatCard label="Overdue" money={false} value={overdueCount} accent={overdueCount > 0 ? C.red : C.muted} icon="🔴" sub="past due date" />
        <StatCard label="Total Cheques" money={false} value={cheques.length} accent={C.purple} icon="🏷" sub={cheques.filter(function (c) { return c.status === "Cleared"; }).length + " cleared"} />
      </div>

      {/* Overdue alert banner */}
      {overdueCount > 0 && (
        <div style={{ background: "#fde8ed", border: "1.5px solid #f9a8ba", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22 }}>🔴</span>
          <div>
            <div style={{ fontWeight: 800, color: C.red, fontSize: 14 }}>{overdueCount} cheque{overdueCount > 1 ? "s" : ""} overdue!</div>
            <div style={{ fontSize: 12, color: "#b91c1c" }}>These cheques are past their due date. Please update status immediately.</div>
          </div>
          <Btn sm col="red" onClick={function () { setTab("overdue"); }} style={{ marginLeft: "auto" }}>View Overdue</Btn>
        </div>
      )}

      <Card>
        <CardTitle sub={filtered.length + " cheques"}>Cheque Register</CardTitle>

        {/* Tabs + Search */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {TABS.map(function (t) {
              var isA = tab === t[0];
              return <button key={t[0]} onClick={function () { setTab(t[0]); }} style={{ padding: "6px 14px", borderRadius: 8, border: "1.5px solid " + (isA ? C.blue : C.border), background: isA ? C.accentSoft : "#fff", fontWeight: 700, fontSize: 12, color: isA ? C.blue : C.textMd, cursor: "pointer" }}>{t[1]}</button>;
            })}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Input placeholder="Search cheque #, party, bank..." value={search} onChange={function (e) { setSearch(e.target.value); }} />
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <TH>Type</TH><TH>Cheque #</TH><TH>Bank</TH><TH>Party</TH><TH>Linked To</TH>
              <TH>Amount</TH><TH>Due Date</TH><TH>Status</TH><TH>Actions</TH>
            </tr></thead>
            <tbody>
              {chqPager.slice.map(function (ch, i) {
                var party = ch.type === "outgoing" ? (ch.supplierName || ch.partyName || "—") : (ch.customerName || ch.partyName || "—");
                var linked = ch.type === "outgoing" ? (ch.purchaseNo || "—") : (ch.invoiceNo || "—");
                var daysLeft = Math.ceil((new Date(ch.dueDate) - new Date(todayStr)) / 86400000);
                return (
                  <TR key={ch.id} i={i}>
                    <td style={{ padding: "10px 14px" }}>
                      {ch.type === "outgoing"
                        ? <span style={{ background: "#fde8ed", color: C.red, border: "1px solid #f9a8ba", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>📤 Out</span>
                        : <span style={{ background: "#e6f7f2", color: C.green, border: "1px solid #9ee8ce", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>📥 In</span>
                      }
                    </td>
                    <TD bold color={C.purple}>{ch.chequeNo}</TD>
                    <TD color={C.muted}>{ch.bankName || "—"}</TD>
                    <TD bold>{party}</TD>
                    <TD color={C.blue}>{linked}</TD>
                    <TD bold color={ch.type === "outgoing" ? C.red : C.green}>{getCurrencySymbol()} {fmtNum(ch.amount)}</TD>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{ch.dueDate}</div>
                      {ch.status === "Pending" && <div style={{ fontSize: 11, color: daysLeft < 0 ? C.red : daysLeft <= 7 ? C.orange : C.muted, fontWeight: 600 }}>{daysLeft < 0 ? Math.abs(daysLeft) + "d overdue" : daysLeft === 0 ? "Due today!" : daysLeft + "d left"}</div>}
                    </td>
                    <td style={{ padding: "10px 14px" }}><ChequeStatusBadge status={ch.status} due={ch.dueDate} /></td>
                    <td style={actBtnCellStyle}>
                      <ActBtnGroup>
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
                          <span style={{ fontSize: 11, color: C.muted }}>Re-issued</span>
                        ) : null}
                        {!ch.purchaseId && !ch.saleId ? (
                          <ActBtn tone="red" title="Delete standalone cheque" onClick={function () { deleteStandalone(ch.id); }} />
                        ) : null}
                      </ActBtnGroup>
                    </td>
                  </TR>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: C.muted }}>
                {search ? "No cheques match your search." : "No cheques in this category. Record payment by Cheque in Purchases or Sales."}
              </td></tr>}
            </tbody>
          </table>
        </div>
        <Pager pager={chqPager} />
      </Card>

      {/* ── Action Modal — Confirm Clear ── */}
      {actionModal && actionModal.action === "clear" && (
        <Modal title={"Clear Cheque #" + actionModal.cheque.chequeNo} onClose={function () { setActionModal(null); }}>
          <div style={{ background: "#f7f9ff", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Cheque #</div><div style={{ fontWeight: 800 }}>{actionModal.cheque.chequeNo}</div></div>
              <div><div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Amount</div><div style={{ fontWeight: 800, fontSize: 18, color: C.blue }}>{getCurrencySymbol()} {fmtNum(actionModal.cheque.amount)}</div></div>
              <div><div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Party</div><div style={{ fontWeight: 700 }}>{actionModal.cheque.supplierName || actionModal.cheque.customerName || "—"}</div></div>
              <div><div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Due Date</div><div style={{ fontWeight: 700 }}>{actionModal.cheque.dueDate}</div></div>
            </div>
          </div>
          <div style={{ background: actionModal.cheque.type === "outgoing" ? "#fde8ed" : "#e6f7f2", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontWeight: 700, color: actionModal.cheque.type === "outgoing" ? C.red : C.green, fontSize: 14 }}>
            {actionModal.cheque.type === "outgoing" ? "📤 " + getCurrencySymbol() + " " + fmtNum(actionModal.cheque.amount) + " will be DEDUCTED from your Bank balance." : "📥 " + getCurrencySymbol() + " " + fmtNum(actionModal.cheque.amount) + " will be ADDED to your Bank balance."}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn col="green" full onClick={function () { markCleared(actionModal.cheque); }}>✅ Confirm — Mark Cleared</Btn>
            <Btn col="gray" onClick={function () { setActionModal(null); }}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {/* ── Action Modal — Re-issue after Bounce ── */}
      {actionModal && actionModal.action === "reissue_prompt" && (
        <Modal title={"Re-issue Cheque — #" + actionModal.cheque.chequeNo + " Bounced"} onClose={function () { setActionModal(null); setReissueForm({ chequeNo: "", dueDate: "", bankName: "" }); }}>
          <div style={{ background: "#fde8ed", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 13, color: C.red, fontWeight: 700 }}>
            ↩ Cheque #{actionModal.cheque.chequeNo} for {getCurrencySymbol()} {fmtNum(actionModal.cheque.amount)} bounced. Issue a replacement cheque:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="New Cheque No *" value={reissueForm.chequeNo} onChange={function (e) { setReissueForm(function (x) { return Object.assign({}, x, { chequeNo: e.target.value }); }); }} placeholder="New cheque number" />
              <Input label="Bank Name" value={reissueForm.bankName || actionModal.cheque.bankName || ""} onChange={function (e) { setReissueForm(function (x) { return Object.assign({}, x, { bankName: e.target.value }); }); }} />
            </div>
            <Input label="New Due Date *" type="date" value={reissueForm.dueDate} onChange={function (e) { setReissueForm(function (x) { return Object.assign({}, x, { dueDate: e.target.value }); }); }} />
            <div style={{ fontSize: 12, color: C.muted }}>Amount stays the same: {getCurrencySymbol()} {fmtNum(actionModal.cheque.amount)}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn col="blue" full onClick={function () { reissueCheque(actionModal.cheque); }}>🔄 Issue Replacement Cheque</Btn>
            <Btn col="gray" onClick={function () { setActionModal(null); setReissueForm({ chequeNo: "", dueDate: "", bankName: "" }); }}>Skip</Btn>
          </div>
        </Modal>
      )}

      {/* ── Add Standalone Cheque Modal ── */}

    </div>
  );
});

export default Cheques;
