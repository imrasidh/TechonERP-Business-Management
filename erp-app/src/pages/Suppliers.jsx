import React, { useState } from "react";

var Suppliers = function (props) {
  var state = props.state;
  var setState = props.setState;
  var getTotalSupplierPayable = props.getTotalSupplierPayable;
  var uid = props.uid;
  var S = props.S;
  var showConfirm = props.showConfirm;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var fmtDate = props.fmtDate;
  var C = props.C;
  var StatCard = props.StatCard;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var Btn = props.Btn;
  var Input = props.Input;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var Modal = props.Modal;
  var Badge = props.Badge;

  var [show, setShow] = useState(false);
  var [editS, setEditS] = useState(null);
  var [viewS, setViewS] = useState(null);
  var [search, setSearch] = useState("");
  var [filter, setFilter] = useState("All");
  var [f, setF] = useState({ name: "", phone: "", email: "", address: "", note: "" });

  var totalPayable = getTotalSupplierPayable(state.purchases); // BUG8 FIX
  /* Fix 2: Compute each supplier's real payable from purchase balances so the
     displayed value never drifts even if s.payable was updated incorrectly. */
  var getSupplierPayable = function (supplierName) {
    return state.purchases.reduce(function (a, p) {
      return p.supplier === supplierName ? a + Math.max(0, (p.total || 0) - (p.paidAmount || 0)) : a;
    }, 0);
  };
  var suppliersWithBalance = state.suppliers.filter(function (s) { return getSupplierPayable(s.name) > 0; }).length;
  var totalSpent = state.purchases.reduce(function (a, p) { return a + (p.paidAmount || 0); }, 0);

  var filtered = state.suppliers.filter(function (s) {
    var q = search.toLowerCase();
    var matchQ = !q || s.name.toLowerCase().includes(q) || (s.phone || "").includes(q) || (s.email || "").toLowerCase().includes(q);
    var matchF = filter === "All" || (filter === "Outstanding" && getSupplierPayable(s.name) > 0) || (filter === "Cleared" && getSupplierPayable(s.name) === 0);
    return matchQ && matchF;
  });

  var saveNew = function () {
    if (!f.name) return;
    var s = { id: uid(), name: f.name, phone: f.phone || "", email: f.email || "", address: f.address || "", note: f.note || "", payable: 0 };
    var ns = state.suppliers.concat([s]);
    S.set("tc3_suppliers", ns);
    setState(function (st) { return Object.assign({}, st, { suppliers: ns }); });
    setShow(false); setF({ name: "", phone: "", email: "", address: "", note: "" });
  };

  var saveEdit = function () {
    if (!editS) return;
    var ns = state.suppliers.map(function (s) { return s.id === editS.id ? Object.assign({}, s, { name: editS.name, phone: editS.phone || "", email: editS.email || "", address: editS.address || "", note: editS.note || "" }) : s; });
    S.set("tc3_suppliers", ns);
    setState(function (st) { return Object.assign({}, st, { suppliers: ns }); });
    setEditS(null);
  };

  var deleteSupplier = function (id) {
    showConfirm("Delete this supplier?", function () {
      var ns = state.suppliers.filter(function (s) { return s.id !== id; });
      S.set("tc3_suppliers", ns);
      setState(function (st) { return Object.assign({}, st, { suppliers: ns }); });
      if (viewS && viewS.id === id) setViewS(null);
    });
  };

  return (
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
        <StatCard money={false} label="Total Suppliers" value={state.suppliers.length} accent={C.blue} icon="🏭" sub={suppliersWithBalance + " with balance"} />
        <StatCard label="Total Payable" value={totalPayable} accent={totalPayable > 0 ? C.red : C.green} icon="💳" sub="outstanding balance" />
        <StatCard label="Total Purchases Paid" value={totalSpent} accent={C.green} icon="✅" sub="all time" />
      </div>

      <Card>
        <CardTitle sub={filtered.length + " suppliers"} action={<Btn sm col="blue" onClick={function () { setShow(true); }}>+ Add Supplier</Btn>}>Suppliers</CardTitle>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 180 }}><Input value={search} onChange={function (e) { setSearch(e.target.value); }} placeholder="Search name, phone, email..." /></div>
          <div style={{ display: "flex", gap: 6 }}>
            {["All", "Outstanding", "Cleared"].map(function (f2) {
              return <button key={f2} onClick={function () { setFilter(f2); }} style={{ padding: "7px 14px", borderRadius: 7, border: "1.5px solid " + (filter === f2 ? C.accent : C.border), background: filter === f2 ? C.accentSoft : "#fff", color: filter === f2 ? C.accent : C.muted, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{f2}</button>;
            })}
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f8fafc" }}><TH>#</TH><TH>Supplier</TH><TH>Phone</TH><TH>Email</TH><TH>Address</TH><TH>Orders</TH><TH>Total Spent</TH><TH>Payable</TH><TH>Actions</TH></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: C.muted }}>No suppliers found</td></tr>}
              {filtered.map(function (s, i) {
                var orders = state.purchases.filter(function (p) { return p.supplier === s.name; });
                var spent = orders.reduce(function (a, p) { return a + (p.paidAmount || 0); }, 0);
                return (
                  <TR key={s.id} i={i}>
                    <TD color={C.muted}>{i + 1}</TD>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ fontWeight: 700, color: C.text }}>{s.name}</div>
                      {s.note && <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{s.note.slice(0, 40)}</div>}
                    </td>
                    <TD>{s.phone || "—"}</TD>
                    <TD>{s.email || "—"}</TD>
                    <TD>{s.address || "—"}</TD>
                    <TD center bold>{orders.length}</TD>
                    <TD color={C.green}>{getCurrencySymbol()} {fmtNum(spent)}</TD>
                    <td style={{ padding: "10px 14px" }}>
                      {(function () {
                        var livePayable = getSupplierPayable(s.name);
                        return livePayable > 0
                          ? <span style={{ background: C.dangerSoft, color: C.red, padding: "3px 10px", borderRadius: 20, fontWeight: 700, fontSize: 12 }}>{getCurrencySymbol()} {fmtNum(livePayable)}</span>
                          : <span style={{ background: C.successSoft, color: C.green, padding: "3px 10px", borderRadius: 20, fontWeight: 700, fontSize: 12 }}>Cleared</span>;
                      })()}
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <Btn sm col="gray" onClick={function () { setViewS(s); }}>View</Btn>
                        <Btn sm col="blue" onClick={function () { setEditS(Object.assign({}, s)); }}>Edit</Btn>
                        <Btn sm col="red" onClick={function () { deleteSupplier(s.id); }}>Del</Btn>
                      </div>
                    </td>
                  </TR>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, padding: "10px 14px", borderTop: "2px solid " + C.border, fontSize: 13, fontWeight: 700, background: "#f7f9ff" }}>
            <span>Total Payable: <span style={{ color: C.red }}>{getCurrencySymbol()} {fmtNum(filtered.reduce(function (a, s) { return a + getSupplierPayable(s.name); }, 0))}</span></span>
            <span>Total Orders: <span style={{ color: C.blue }}>{filtered.reduce(function (a, s) { return a + state.purchases.filter(function (p) { return p.supplier === s.name; }).length; }, 0)}</span></span>
          </div>
        )}
      </Card>

      {viewS && (
        <Modal title={"Supplier — " + viewS.name} onClose={function () { setViewS(null); }} wide>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div style={{ background: "#f7f9ff", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 10 }}>Contact Info</div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{viewS.name}</div>
              <div style={{ color: C.muted, marginTop: 4, fontSize: 13 }}>📞 {viewS.phone || "—"}</div>
              <div style={{ color: C.muted, fontSize: 13 }}>✉ {viewS.email || "—"}</div>
              <div style={{ color: C.muted, fontSize: 13 }}>📍 {viewS.address || "—"}</div>
              {viewS.note && <div style={{ color: C.textMd, fontSize: 12, marginTop: 6, fontStyle: "italic" }}>{viewS.note}</div>}
            </div>
            <div style={{ background: "#f7f9ff", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 10 }}>Financial Summary</div>
              {(function () {
                var orders = state.purchases.filter(function (p) { return p.supplier === viewS.name; });
                var spent = orders.reduce(function (a, p) { return a + (p.paidAmount || 0); }, 0);
                var total = orders.reduce(function (a, p) { return a + p.total; }, 0);
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Total Orders</span><strong>{orders.length}</strong></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Total Value</span><strong style={{ color: C.blue }}>{getCurrencySymbol()} {fmtNum(total)}</strong></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Amount Paid</span><strong style={{ color: C.green }}>{getCurrencySymbol()} {fmtNum(spent)}</strong></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 900, borderTop: "1px solid " + C.border, paddingTop: 6, marginTop: 2 }}><span>Outstanding</span><span style={{ color: getSupplierPayable(viewS.name) > 0 ? C.red : C.green }}>{getCurrencySymbol()} {fmtNum(getSupplierPayable(viewS.name))}</span></div>
                  </div>
                );
              })()}
            </div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Purchase History</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr><TH>Date</TH><TH>Invoice #</TH><TH>Items</TH><TH>Total</TH><TH>Paid</TH><TH>Balance</TH><TH>Status</TH></tr></thead>
            <tbody>
              {state.purchases.filter(function (p) { return p.supplier === viewS.name; }).slice().reverse().map(function (p, i) {
                return (
                  <TR key={p.id} i={i}>
                    <TD>{fmtDate(p.date)}</TD>
                    <td style={{ padding: "9px 12px" }}><span style={{ fontFamily: "monospace", fontSize: 11, color: C.accent }}>{p.invoiceNo || p.id.slice(0, 8)}</span></td>
                    <TD center>{(p.items || []).length}</TD>
                    <TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(p.total)}</TD>
                    <TD color={C.green}>{getCurrencySymbol()} {fmtNum(p.paidAmount || 0)}</TD>
                    <TD color={Math.max(0, (p.total || 0) - (p.paidAmount || 0)) > 0 ? C.red : C.muted}>{getCurrencySymbol()} {fmtNum(Math.max(0, (p.total || 0) - (p.paidAmount || 0)))}</TD>
                    <td style={{ padding: "9px 12px" }}><Badge status={p.status || "Unpaid"} /></td>
                  </TR>
                );
              })}
              {state.purchases.filter(function (p) { return p.supplier === viewS.name; }).length === 0 && <tr><td colSpan={7} style={{ padding: 16, textAlign: "center", color: C.muted }}>No purchases yet</td></tr>}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Btn col="blue" onClick={function () { setEditS(Object.assign({}, viewS)); setViewS(null); }}>Edit</Btn>
            <Btn col="gray" onClick={function () { setViewS(null); }}>Close</Btn>
          </div>
        </Modal>
      )}

      {show && (
        <Modal title="Add Supplier" onClose={function () { setShow(false); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input label="Name *" value={f.name} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Phone" value={f.phone} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); }} />
              <Input label="Email" value={f.email} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { email: e.target.value }); }); }} />
            </div>
            <Input label="Address" value={f.address} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { address: e.target.value }); }); }} />
            <Input label="Note (optional)" value={f.note} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} />
            <div style={{ display: "flex", gap: 8 }}><Btn col="blue" onClick={saveNew} disabled={!f.name}>Save</Btn><Btn col="gray" onClick={function () { setShow(false); }}>Cancel</Btn></div>
          </div>
        </Modal>
      )}

      {editS && (
        <Modal title={"Edit Supplier — " + editS.name} onClose={function () { setEditS(null); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input label="Name *" value={editS.name || ""} onChange={function (e) { setEditS(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Phone" value={editS.phone || ""} onChange={function (e) { setEditS(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); }} />
              <Input label="Email" value={editS.email || ""} onChange={function (e) { setEditS(function (x) { return Object.assign({}, x, { email: e.target.value }); }); }} />
            </div>
            <Input label="Address" value={editS.address || ""} onChange={function (e) { setEditS(function (x) { return Object.assign({}, x, { address: e.target.value }); }); }} />
            <Input label="Note" value={editS.note || ""} onChange={function (e) { setEditS(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} />
            <div style={{ display: "flex", gap: 8 }}><Btn col="blue" onClick={saveEdit}>Save Changes</Btn><Btn col="gray" onClick={function () { setEditS(null); }}>Cancel</Btn></div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Suppliers;
