import React, { useState } from "react";
import { ActBtn, ActBtnGroup, actBtnCellStyle } from "../components/ActBtn.jsx";
import AddPartyModal from "../components/AddPartyModal.jsx";
import { createAndPersistSupplier } from "../utils/supplierCreate.js";
import { pushKeysNow } from "../utils/concurrencyGuards.js";

var Suppliers = function (props) {
  var state = props.state;
  var setState = props.setState;
  var getTotalSupplierPayable = props.getTotalSupplierPayable;
  var getSupplierPayableFromPurchases = props.getSupplierPayableFromPurchases;
  var uid = props.uid;
  var tcTrialGuard = props.tcTrialGuard;
  var S = props.S;
  var showConfirm = props.showConfirm;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var fmtDate = props.fmtDate;
  var C = props.C;
  var Btn = props.Btn;
  var Input = props.Input;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var Modal = props.Modal;
  var Badge = props.Badge;
  var embedded = props.embedded;

  var [show, setShow] = useState(false);
  var [editS, setEditS] = useState(null);
  var [viewS, setViewS] = useState(null);
  var [search, setSearch] = useState("");
  var [filter, setFilter] = useState("All");

  var handleCreateSupplier = function (draft) {
    var result = createAndPersistSupplier({
      suppliers: state.suppliers,
      setState: setState,
      S: S,
      uid: uid,
      tcTrialGuard: tcTrialGuard,
      draft: draft,
    });
    if (!result.ok) return null;
    try { pushKeysNow([["tc3_suppliers", (state.suppliers || []).concat([result.supplier])]]); } catch (_e) { /* ignore */ }
    return result.supplier;
  };

  var totalPayable = getTotalSupplierPayable(state.purchases);
  var getSupplierPayable = function (supplierName) {
    return (typeof getSupplierPayableFromPurchases === "function"
      ? getSupplierPayableFromPurchases(supplierName, state.purchases)
      : state.purchases.reduce(function (a, p) {
          return p.supplier === supplierName ? a + Math.max(0, (p.total || 0) - (p.paidAmount || 0)) : a;
        }, 0));
  };
  var suppliersWithBalance = state.suppliers.filter(function (s) { return getSupplierPayable(s.name) > 0; }).length;
  var totalSpent = state.purchases.reduce(function (a, p) { return a + (p.paidAmount || 0); }, 0);

  var filtered = state.suppliers.filter(function (s) {
    var q = search.toLowerCase();
    var matchQ = !q || s.name.toLowerCase().includes(q) || (s.phone || "").includes(q) || (s.email || "").toLowerCase().includes(q);
    var matchF = filter === "All" || (filter === "Outstanding" && getSupplierPayable(s.name) > 0) || (filter === "Cleared" && getSupplierPayable(s.name) === 0);
    return matchQ && matchF;
  });

  var saveEdit = function () {
    if (!editS) return;
    var ns = state.suppliers.map(function (s) {
      return s.id === editS.id
        ? Object.assign({}, s, { name: editS.name, phone: editS.phone || "", email: editS.email || "", address: editS.address || "", note: editS.note || "", updatedAt: new Date().toISOString() })
        : s;
    });
    S.set("tc3_suppliers", ns);
    try { pushKeysNow([["tc3_suppliers", ns]]); } catch (_e) { /* ignore */ }
    setState(function (st) { return Object.assign({}, st, { suppliers: ns }); });
    setEditS(null);
  };

  var deleteSupplier = function (id) {
    showConfirm("Delete this supplier?", function () {
      var ns = state.suppliers.filter(function (s) { return s.id !== id; });
      S.set("tc3_suppliers", ns);
      try { pushKeysNow([["tc3_suppliers", ns]]); } catch (_e) { /* ignore */ }
      setState(function (st) { return Object.assign({}, st, { suppliers: ns }); });
      if (viewS && viewS.id === id) setViewS(null);
    });
  };

  var filteredPayable = filtered.reduce(function (a, s) { return a + getSupplierPayable(s.name); }, 0);
  var filteredOrders = filtered.reduce(function (a, s) {
    return a + state.purchases.filter(function (p) { return p.supplier === s.name; }).length;
  }, 0);

  var panel = (
    <div className="erp-pty-panel is-supplier" style={{ height: "100%" }}>
      <div className="erp-pty-panel-head">
        <div className="erp-pty-panel-head-left">
          <span className="erp-pty-panel-ico" aria-hidden="true">SU</span>
          <div>
            <div className="erp-pty-panel-title">Supplier register</div>
            <div className="erp-pty-panel-count">{filtered.length.toLocaleString()} shown · {state.suppliers.length.toLocaleString()} total · {suppliersWithBalance} with balance</div>
          </div>
        </div>
        <button type="button" className="erp-pty-btn-add" onClick={function () { setShow(true); }}>+ Add Supplier</button>
      </div>

      <div className="erp-pty-toolbar">
        <div className="erp-pty-search-wrap">
          <input
            className="erp-pty-field"
            value={search}
            onChange={function (e) { setSearch(e.target.value); }}
            placeholder="Search name, phone, email…"
            aria-label="Search suppliers"
          />
        </div>
        <div className="erp-pty-chips" role="group" aria-label="Payable filter">
          {["All", "Outstanding", "Cleared"].map(function (f2) {
            return (
              <button
                key={f2}
                type="button"
                className={"erp-pty-chip" + (filter === f2 ? " is-active" : "")}
                onClick={function () { setFilter(f2); }}
              >{f2}</button>
            );
          })}
        </div>
        {(search || filter !== "All") ? (
          <button type="button" className="erp-pty-btn-clear" onClick={function () { setSearch(""); setFilter("All"); }}>Clear</button>
        ) : null}
      </div>

      <div className="erp-pty-table-wrap">
        <table className="erp-pty-table">
          <thead>
            <tr>
              <th className="ctr">#</th>
              <th>Supplier</th>
              <th>Phone</th>
              <th>Email</th>
              <th className="ctr">Orders</th>
              <th className="num">Spent</th>
              <th className="num">Payable</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="erp-pty-empty">No suppliers found</td>
              </tr>
            ) : filtered.map(function (s, i) {
              var orders = state.purchases.filter(function (p) { return p.supplier === s.name; });
              var spent = orders.reduce(function (a, p) { return a + (p.paidAmount || 0); }, 0);
              var livePayable = getSupplierPayable(s.name);
              return (
                <tr key={s.id}>
                  <td className="ctr erp-pty-muted">{i + 1}</td>
                  <td>
                    <div className="erp-pty-name">{s.name}</div>
                    {s.note ? <div className="erp-pty-sub">{s.note.slice(0, 40)}</div> : null}
                    {s.address ? <div className="erp-pty-sub">{s.address}</div> : null}
                  </td>
                  <td className="erp-pty-muted">{s.phone || "—"}</td>
                  <td className="erp-pty-muted">{s.email || "—"}</td>
                  <td className="ctr"><strong>{orders.length}</strong></td>
                  <td className="num"><span className="erp-pty-money is-ok">{getCurrencySymbol()} {fmtNum(spent)}</span></td>
                  <td className="num">
                    {livePayable > 0
                      ? <span className="erp-pty-pill is-debt">{getCurrencySymbol()} {fmtNum(livePayable)}</span>
                      : <span className="erp-pty-pill is-ok">Cleared</span>}
                  </td>
                  <td style={actBtnCellStyle}>
                    <ActBtnGroup>
                      <ActBtn tone="cyan" title="View supplier" onClick={function () { setViewS(s); }} />
                      <ActBtn tone="blue" title="Edit supplier" onClick={function () { setEditS(Object.assign({}, s)); }} />
                      <ActBtn tone="red" icon="delete" title="Delete supplier" onClick={function () { deleteSupplier(s.id); }} />
                    </ActBtnGroup>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="erp-pty-footer">
        <div className="erp-pty-footer-meta">
          <span>Payable <strong className="is-debt">{getCurrencySymbol()} {fmtNum(filteredPayable)}</strong></span>
          <span>Orders <strong className="is-blue">{filteredOrders}</strong></span>
          <span>Paid all-time <strong>{getCurrencySymbol()} {fmtNum(totalSpent)}</strong></span>
        </div>
      </div>
    </div>
  );

  return (
    <div className={embedded ? "" : "erp-page erp-pty-modern is-tab-supplier"} style={embedded ? { height: "100%", minHeight: 0, display: "flex", flexDirection: "column" } : undefined}>
      {panel}

      {viewS && (
        <Modal title={"Supplier — " + viewS.name} onClose={function () { setViewS(null); }} wide>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div style={{ background: "#fff7ed", borderRadius: 10, padding: "12px 14px", border: "1px solid #fed7aa" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Contact</div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{viewS.name}</div>
              <div style={{ color: C.muted, marginTop: 4, fontSize: 12 }}>{viewS.phone || "—"}</div>
              <div style={{ color: C.muted, fontSize: 12 }}>{viewS.email || "—"}</div>
              <div style={{ color: C.muted, fontSize: 12 }}>{viewS.address || "—"}</div>
              {viewS.note ? <div style={{ color: C.textMd, fontSize: 12, marginTop: 6, fontStyle: "italic" }}>{viewS.note}</div> : null}
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Summary</div>
              {(function () {
                var orders = state.purchases.filter(function (p) { return p.supplier === viewS.name; });
                var spent = orders.reduce(function (a, p) { return a + (p.paidAmount || 0); }, 0);
                var total = orders.reduce(function (a, p) { return a + p.total; }, 0);
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Orders</span><strong>{orders.length}</strong></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Total value</span><strong style={{ color: C.blue }}>{getCurrencySymbol()} {fmtNum(total)}</strong></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Paid</span><strong style={{ color: C.green }}>{getCurrencySymbol()} {fmtNum(spent)}</strong></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, borderTop: "1px solid " + C.border, paddingTop: 6 }}><span>Outstanding</span><span style={{ color: getSupplierPayable(viewS.name) > 0 ? C.red : C.green }}>{getCurrencySymbol()} {fmtNum(getSupplierPayable(viewS.name))}</span></div>
                  </div>
                );
              })()}
            </div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Purchase history</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr><TH>Date</TH><TH>Invoice #</TH><TH>Items</TH><TH>Total</TH><TH>Paid</TH><TH>Balance</TH><TH>Status</TH></tr></thead>
            <tbody>
              {state.purchases.filter(function (p) { return p.supplier === viewS.name; }).slice().reverse().map(function (p, i) {
                return (
                  <TR key={p.id} i={i}>
                    <TD>{fmtDate(p.date)}</TD>
                    <td style={{ padding: "7px 10px" }}><span style={{ fontFamily: "monospace", fontSize: 11, color: C.accent }}>{p.invoiceNo || p.id.slice(0, 8)}</span></td>
                    <TD center>{(p.items || []).length}</TD>
                    <TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(p.total)}</TD>
                    <TD color={C.green}>{getCurrencySymbol()} {fmtNum(p.paidAmount || 0)}</TD>
                    <TD color={Math.max(0, (p.total || 0) - (p.paidAmount || 0)) > 0 ? C.red : C.muted}>{getCurrencySymbol()} {fmtNum(Math.max(0, (p.total || 0) - (p.paidAmount || 0)))}</TD>
                    <td style={{ padding: "7px 10px" }}><Badge status={p.status || "Unpaid"} /></td>
                  </TR>
                );
              })}
              {state.purchases.filter(function (p) { return p.supplier === viewS.name; }).length === 0 && <tr><td colSpan={7} style={{ padding: 14, textAlign: "center", color: C.muted }}>No purchases yet</td></tr>}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Btn col="blue" onClick={function () { setEditS(Object.assign({}, viewS)); setViewS(null); }}>Edit</Btn>
            <Btn col="gray" onClick={function () { setViewS(null); }}>Close</Btn>
          </div>
        </Modal>
      )}

      {show ? (
        <AddPartyModal
          open={show}
          onClose={function () { setShow(false); }}
          onCreate={handleCreateSupplier}
          suppliers={state.suppliers}
          context="suppliers"
          partyKind="supplier"
          Modal={Modal}
          Input={Input}
          Btn={Btn}
        />
      ) : null}

      {editS && (
        <Modal
          title={"Edit Supplier — " + editS.name}
          onClose={function () { setEditS(null); }}
          wide
          closeRound
          className="erp-party-modal is-supplier"
        >
          <div className="erp-party-modal-body">
            <div className="erp-party-modal-fields">
              <Input compact label="Name *" value={editS.name || ""} onChange={function (e) { setEditS(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} />
              <div className="erp-party-modal-meta-row is-three">
                <Input compact label="Phone" value={editS.phone || ""} onChange={function (e) { setEditS(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); }} />
                <Input compact label="Email" value={editS.email || ""} onChange={function (e) { setEditS(function (x) { return Object.assign({}, x, { email: e.target.value }); }); }} />
                <Input compact label="Address" value={editS.address || ""} onChange={function (e) { setEditS(function (x) { return Object.assign({}, x, { address: e.target.value }); }); }} />
              </div>
              <Input compact label="Note" value={editS.note || ""} onChange={function (e) { setEditS(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} />
            </div>
            <div className="erp-party-modal-footer">
              <Btn col="gray" onClick={function () { setEditS(null); }}>Cancel</Btn>
              <Btn col="blue" onClick={saveEdit} disabled={!editS.name}>Save Changes</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Suppliers;
