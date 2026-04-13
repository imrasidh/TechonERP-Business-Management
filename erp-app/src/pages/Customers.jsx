import React, { useState } from "react";

var Customers = function (props) {
  var state = props.state;
  var setState = props.setState;
  var getDuplicateNormalizedNameKeys = props.getDuplicateNormalizedNameKeys;
  var normalizePaymentCustomerName = props.normalizePaymentCustomerName;
  var showConfirm = props.showConfirm;
  var tcTrialGuard = props.tcTrialGuard;
  var uid = props.uid;
  var S = props.S;
  var usePager = props.usePager;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var fmtDate = props.fmtDate;
  var C = props.C;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var Btn = props.Btn;
  var Input = props.Input;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var Pager = props.Pager;
  var Modal = props.Modal;
  var Badge = props.Badge;

  var [show, setShow] = useState(false);
  var [f, setF] = useState({ name: "", phone: "", address: "" });
  var [sel, setSel] = useState(null);
  var [editCust, setEditCust] = useState(null);
  var [custSearch, setCustSearch] = useState("");
  var filteredCusts = state.customers.filter(function (c) {
    var q = custSearch.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || (c.phone || "").includes(q) || (c.address || "").toLowerCase().includes(q);
  });
  var custDupNameKeys = getDuplicateNormalizedNameKeys(state.customers);
  var custPager = usePager(filteredCusts, 50);
  var saveNew = function () {
    if (!f.name) return;
    if (f.phone && state.customers.find(function (c) { return c.phone === f.phone; })) {
      showConfirm("A customer with phone \"" + f.phone + "\" already exists. Add anyway?", function () {
        var c = { id: uid(), name: f.name, phone: f.phone || "", address: f.address || "", credit: 0, totalSpent: 0 };
        if (!tcTrialGuard(state.customers, 'customers')) return;
        var nc = state.customers.concat([c]);
        S.set("tc3_customers", nc);
        setState(function (st) { return Object.assign({}, st, { customers: nc }); });
        setF({ name: "", phone: "", address: "" }); setShow(false);
      });
      return;
    }
    var c = { id: uid(), name: f.name, phone: f.phone || "", address: f.address || "", credit: 0, totalSpent: 0 };
    var nc = state.customers.concat([c]);
    S.set("tc3_customers", nc);
    setState(function (st) { return Object.assign({}, st, { customers: nc }); });
    setShow(false); setF({ name: "", phone: "", address: "" });
  };

  var saveEditCust = function () {
    if (!editCust || !editCust.name) return;
    var nc = state.customers.map(function (c) {
      return c.id === editCust.id ? Object.assign({}, c, { name: editCust.name, phone: editCust.phone || "", address: editCust.address || "" }) : c;
    });
    S.set("tc3_customers", nc);
    setState(function (st) { return Object.assign({}, st, { customers: nc }); });
    setEditCust(null);
  };

  return (
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <CardTitle sub={filteredCusts.length.toLocaleString() + " of " + state.customers.length.toLocaleString() + " customers"} action={<Btn sm col="blue" onClick={function () { setShow(true); }}>+ Add Customer</Btn>}>Customers</CardTitle>
        <Input value={custSearch} onChange={function (e) { setCustSearch(e.target.value); }} placeholder="Search customers by name, phone, address..." style={{ marginBottom: 10 }} />
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#f8fafc" }}><TH>Name</TH><TH>Phone</TH><TH>Address</TH><TH>Credit Balance</TH><TH>Total Spent</TH><TH>History</TH></tr></thead>
          <tbody>
            {custPager.slice.map(function (c, i) {
              var dupR = custDupNameKeys[normalizePaymentCustomerName(c.name)];
              return (
                <TR key={c.id} i={i}>
                  <TD bold>{c.name}{dupR ? <span title="Duplicate name exists"> ⚠️</span> : null}</TD><TD>{c.phone}</TD><TD>{c.address}</TD>
                  <TD color={(c.credit || 0) > 0 ? C.red : C.muted}>{getCurrencySymbol()} {fmtNum(c.credit || 0)}</TD>
                  <TD color={C.blue}>{getCurrencySymbol()} {fmtNum(c.totalSpent || 0)}</TD>
                  <td style={{ padding: "9px 12px", display: "flex", gap: 6 }}>
                    <Btn sm col="cyan" onClick={function () { setEditCust({ id: c.id, name: c.name, phone: c.phone || "", address: c.address || "" }); }}>Edit</Btn>
                    <Btn sm col="gray" onClick={function () { setSel(c); }}>View</Btn>
                  </td>
                </TR>
              );
            })}
          </tbody>
        </table>
        <Pager pager={custPager} />
      </Card>
      {show && (
        <Modal title="Add Customer" onClose={function () { setShow(false); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input label="Name" value={f.name} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} />
            <Input label="Phone" value={f.phone} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); }} />
            <Input label="Address" value={f.address} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { address: e.target.value }); }); }} />
            <div style={{ display: "flex", gap: 8 }}><Btn col="blue" onClick={saveNew} disabled={!f.name}>Save</Btn><Btn col="gray" onClick={function () { setShow(false); }}>Cancel</Btn></div>
          </div>
        </Modal>
      )}
      {editCust && (
        <Modal title={"Edit Customer — " + editCust.name} onClose={function () { setEditCust(null); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input label="Name" value={editCust.name} onChange={function (e) { setEditCust(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} />
            <Input label="Phone" value={editCust.phone} onChange={function (e) { setEditCust(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); }} />
            <Input label="Address" value={editCust.address} onChange={function (e) { setEditCust(function (x) { return Object.assign({}, x, { address: e.target.value }); }); }} />
            <div style={{ display: "flex", gap: 8 }}><Btn col="blue" onClick={saveEditCust} disabled={!editCust.name}>Save Changes</Btn><Btn col="gray" onClick={function () { setEditCust(null); }}>Cancel</Btn></div>
          </div>
        </Modal>
      )}
      {sel && (
        <Modal title={sel.name + " - Purchase History"} onClose={function () { setSel(null); }} wide>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 14 }}>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted }}>TOTAL PURCHASES</div><div style={{ fontWeight: 700, color: C.blue }}>{state.sales.filter(function (s) { return s.customerId === sel.id || s.customerName === sel.name; }).length}</div></div>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted }}>TOTAL SPENT</div><div style={{ fontWeight: 700, color: C.blue }}>{getCurrencySymbol()} {fmtNum(sel.totalSpent || 0)}</div></div>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted }}>OUTSTANDING</div><div style={{ fontWeight: 700, color: C.red }}>{getCurrencySymbol()} {fmtNum(sel.credit || 0)}</div></div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8fafc" }}><TH>Invoice</TH><TH>Date</TH><TH>Total</TH><TH>Paid</TH><TH>Balance</TH><TH>Status</TH></tr></thead>
            <tbody>
              {state.sales.filter(function (s) { return s.customerId === sel.id || s.customerName === sel.name; }).map(function (s, i) {
                return <TR key={s.id} i={i}><td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12 }}>{s.invoiceNo || s.id.slice(0, 8)}</td><TD>{fmtDate(s.date)}</TD><TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(s.total)}</TD><TD color={C.green}>{getCurrencySymbol()} {fmtNum(s.paid || 0)}</TD><TD color={C.red}>{getCurrencySymbol()} {fmtNum(s.total - (s.paid || 0))}</TD><td style={{ padding: "9px 12px" }}><Badge status={s.payStatus || "Paid"} /></td></TR>;
              })}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
};

export default Customers;
