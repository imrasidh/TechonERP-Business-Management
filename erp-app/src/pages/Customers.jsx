import React, { useState } from "react";
import { ActBtn, ActBtnGroup, actBtnCellStyle } from "../components/ActBtn.jsx";
import AddPartyModal from "../components/AddPartyModal.jsx";
import { createAndPersistCustomer } from "../utils/customerCreate.js";
import { LIST_PAGE_SIZE } from "../utils/listPage.js";
import { SourceDocLink } from "../components/SourceDocLink.jsx";

var Customers = function (props) {
  var state = props.state;
  var setState = props.setState;
  var getDuplicateNormalizedNameKeys = props.getDuplicateNormalizedNameKeys;
  var normalizePaymentCustomerName = props.normalizePaymentCustomerName;
  var showConfirm = props.showConfirm;
  var showAlert = props.showAlert;
  var tcTrialGuard = props.tcTrialGuard;
  var uid = props.uid;
  var S = props.S;
  var usePager = props.usePager;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var fmtDate = props.fmtDate;
  var C = props.C;
  var Btn = props.Btn;
  var Input = props.Input;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var Pager = props.Pager;
  var Modal = props.Modal;
  var Badge = props.Badge;
  var openSourceDocument = props.openSourceDocument;
  var getCustomerOutstandingBalance = props.getCustomerOutstandingBalance;
  var embedded = props.embedded;

  var [show, setShow] = useState(false);
  var [sel, setSel] = useState(null);
  var [editCust, setEditCust] = useState(null);
  var [custSearch, setCustSearch] = useState("");
  var filteredCusts = state.customers.filter(function (c) {
    var q = custSearch.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || (c.phone || "").includes(q) || (c.address || "").toLowerCase().includes(q);
  });
  var custDupNameKeys = getDuplicateNormalizedNameKeys(state.customers);
  var custPager = usePager(filteredCusts, LIST_PAGE_SIZE);
  var handleCreateCustomer = function (draft) {
    var result = createAndPersistCustomer({
      customers: state.customers,
      setState: setState,
      S: S,
      uid: uid,
      tcTrialGuard: tcTrialGuard,
      draft: draft,
    });
    if (!result.ok) return null;
    return result.customer;
  };

  var saveEditCust = function () {
    if (!editCust || !editCust.name) return;
    var nc = state.customers.map(function (c) {
      return c.id === editCust.id ? Object.assign({}, c, { name: editCust.name, phone: editCust.phone || "", address: editCust.address || "", updatedAt: new Date().toISOString() }) : c;
    });
    S.set("tc3_customers", nc);
    setState(function (st) { return Object.assign({}, st, { customers: nc }); });
    setEditCust(null);
  };

  var deleteCust = function (custId) {
    var target = state.customers.find(function (c) { return c.id === custId; });
    if (!target) return;
    var linkedSales = (state.sales || []).some(function (s) {
      return s.customerId === custId || (s.customerName && s.customerName === target.name);
    });
    if (linkedSales) {
      if (showAlert) showAlert("Cannot delete customer with existing sales history.");
      return;
    }
    showConfirm("Delete customer \"" + target.name + "\"?", function () {
      var nc = state.customers.filter(function (c) { return c.id !== custId; });
      S.set("tc3_customers", nc);
      setState(function (st) { return Object.assign({}, st, { customers: nc }); });
      if (sel && sel.id === custId) setSel(null);
      if (editCust && editCust.id === custId) setEditCust(null);
    });
  };

  var panel = (
    <div className="erp-pty-panel is-customer" style={{ height: "100%" }}>
      <div className="erp-pty-panel-head">
        <div className="erp-pty-panel-head-left">
          <span className="erp-pty-panel-ico" aria-hidden="true">CU</span>
          <div>
            <div className="erp-pty-panel-title">Customer register</div>
            <div className="erp-pty-panel-count">{filteredCusts.length.toLocaleString()} shown · {state.customers.length.toLocaleString()} total</div>
          </div>
        </div>
        <button type="button" className="erp-pty-btn-add" onClick={function () { setShow(true); }}>+ Add Customer</button>
      </div>

      <div className="erp-pty-toolbar">
        <div className="erp-pty-search-wrap">
          <input
            className="erp-pty-field"
            value={custSearch}
            onChange={function (e) { setCustSearch(e.target.value); }}
            placeholder="Search name, phone, address…"
            aria-label="Search customers"
          />
        </div>
        {custSearch ? (
          <button type="button" className="erp-pty-btn-clear" onClick={function () { setCustSearch(""); }}>Clear</button>
        ) : null}
      </div>

      <div className="erp-pty-table-wrap">
        <table className="erp-pty-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Address</th>
              <th className="num">Credit</th>
              <th className="num">Spent</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {custPager.slice.length === 0 ? (
              <tr>
                <td colSpan={6} className="erp-pty-empty">No customers found</td>
              </tr>
            ) : custPager.slice.map(function (c) {
              var dupR = custDupNameKeys[normalizePaymentCustomerName(c.name)];
              var liveCredit = typeof getCustomerOutstandingBalance === "function"
                ? getCustomerOutstandingBalance(c, state.sales)
                : (c.credit || 0);
              return (
                <tr key={c.id}>
                  <td>
                    <span className="erp-pty-name">{c.name}{dupR ? " ⚠" : ""}</span>
                  </td>
                  <td className="erp-pty-muted">{c.phone || "—"}</td>
                  <td className="erp-pty-muted">{c.address || "—"}</td>
                  <td className="num">
                    <span className={"erp-pty-money " + (liveCredit > 0 ? "is-debt" : "is-ok")}>
                      {getCurrencySymbol()} {fmtNum(liveCredit)}
                    </span>
                  </td>
                  <td className="num">
                    <span className="erp-pty-money is-blue">{getCurrencySymbol()} {fmtNum(c.totalSpent || 0)}</span>
                  </td>
                  <td style={actBtnCellStyle}>
                    <ActBtnGroup align="left">
                      <ActBtn tone="blue" title="Edit customer" onClick={function () { setEditCust({ id: c.id, name: c.name, phone: c.phone || "", address: c.address || "" }); }} />
                      <ActBtn tone="cyan" title="View history" onClick={function () { setSel(c); }} />
                      <ActBtn tone="red" icon="delete" title="Delete customer" onClick={function () { deleteCust(c.id); }} />
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
          <span><strong>{filteredCusts.length}</strong> customers</span>
        </div>
        <div className="erp-pty-footer-pager">
          <Pager pager={custPager} />
        </div>
      </div>
    </div>
  );

  return (
    <div className={embedded ? "" : "erp-page erp-pty-modern"} style={embedded ? { height: "100%", minHeight: 0, display: "flex", flexDirection: "column" } : undefined}>
      {panel}
      {show ? (
        <AddPartyModal
          open={show}
          onClose={function () { setShow(false); }}
          onCreate={handleCreateCustomer}
          customers={state.customers}
          context="customers"
          partyKind="customer"
          Modal={Modal}
          Input={Input}
          Btn={Btn}
        />
      ) : null}
      {editCust && (
        <Modal
          title={"Edit Customer — " + editCust.name}
          onClose={function () { setEditCust(null); }}
          wide
          closeRound
          className="erp-party-modal is-customer"
        >
          <div className="erp-party-modal-body">
            <div className="erp-party-modal-fields">
              <Input compact label="Name *" value={editCust.name} onChange={function (e) { setEditCust(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} />
              <div className="erp-party-modal-meta-row is-two">
                <Input compact label="Phone" value={editCust.phone || ""} onChange={function (e) { setEditCust(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); }} />
                <Input compact label="Address" value={editCust.address || ""} onChange={function (e) { setEditCust(function (x) { return Object.assign({}, x, { address: e.target.value }); }); }} />
              </div>
            </div>
            <div className="erp-party-modal-footer">
              <Btn col="gray" onClick={function () { setEditCust(null); }}>Cancel</Btn>
              <Btn col="blue" onClick={saveEditCust} disabled={!editCust.name}>Save Changes</Btn>
            </div>
          </div>
        </Modal>
      )}
      {sel && (
        <Modal title={sel.name + " - Purchase History"} onClose={function () { setSel(null); }} wide>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8, marginBottom: 12 }}>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px" }}><div style={{ fontSize: 10, color: C.muted, fontWeight: 700 }}>TOTAL PURCHASES</div><div style={{ fontWeight: 800, color: C.blue }}>{state.sales.filter(function (s) { return s.customerId === sel.id || s.customerName === sel.name; }).length}</div></div>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px" }}><div style={{ fontSize: 10, color: C.muted, fontWeight: 700 }}>TOTAL SPENT</div><div style={{ fontWeight: 800, color: C.blue }}>{getCurrencySymbol()} {fmtNum(sel.totalSpent || 0)}</div></div>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px" }}><div style={{ fontSize: 10, color: C.muted, fontWeight: 700 }}>OUTSTANDING</div><div style={{ fontWeight: 800, color: C.red }}>{getCurrencySymbol()} {fmtNum(typeof getCustomerOutstandingBalance === "function" ? getCustomerOutstandingBalance(sel, state.sales) : (sel.credit || 0))}</div></div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ background: "#f8fafc" }}><TH>Invoice</TH><TH>Date</TH><TH>Total</TH><TH>Paid</TH><TH>Balance</TH><TH>Status</TH></tr></thead>
            <tbody>
              {state.sales.filter(function (s) { return s.customerId === sel.id || s.customerName === sel.name; }).map(function (s, i) {
                return <TR key={s.id} i={i}><td style={{ padding: "7px 10px" }}><SourceDocLink nav={{ sourceKind: "sale", sourceId: s.id, label: s.invoiceNo || s.id.slice(0, 8) }} label={s.invoiceNo || s.id.slice(0, 8)} openSourceDocument={openSourceDocument} className="erp-stmt-ref-btn" /></td><TD>{fmtDate(s.date)}</TD><TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(s.total)}</TD><TD color={C.green}>{getCurrencySymbol()} {fmtNum(s.paid || 0)}</TD><TD color={C.red}>{getCurrencySymbol()} {fmtNum(s.total - (s.paid || 0))}</TD><td style={{ padding: "7px 10px" }}><Badge status={s.payStatus || "Paid"} /></td></TR>;
              })}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
};

export default Customers;
