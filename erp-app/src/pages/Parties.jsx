import React, { useEffect, useState } from "react";
import { ActBtn, ActBtnGroup, actBtnCellStyle } from "../components/ActBtn.jsx";
import AddPartyModal from "../components/AddPartyModal.jsx";
import Customers from "./Customers.jsx";
import Suppliers from "./Suppliers.jsx";
import { createAndPersistOther } from "../utils/otherCreate.js";
import { LIST_PAGE_SIZE } from "../utils/listPage.js";

var PARTY_TABS = [
  { id: "customer", label: "Customers", ico: "CU" },
  { id: "supplier", label: "Suppliers", ico: "SU" },
  { id: "other", label: "Others", ico: "OT" },
];

function OthersTab(props) {
  var state = props.state;
  var setState = props.setState;
  var S = props.S;
  var uid = props.uid;
  var tcTrialGuard = props.tcTrialGuard;
  var showConfirm = props.showConfirm;
  var Btn = props.Btn;
  var Input = props.Input;
  var Modal = props.Modal;
  var usePager = props.usePager;
  var Pager = props.Pager;

  var others = state.others || [];
  var [show, setShow] = useState(false);
  var [search, setSearch] = useState("");
  var [editOther, setEditOther] = useState(null);

  var filtered = others.filter(function (o) {
    var q = search.toLowerCase();
    return !q
      || String(o.name || "").toLowerCase().includes(q)
      || String(o.phone || "").includes(q)
      || String(o.address || "").toLowerCase().includes(q)
      || String(o.note || "").toLowerCase().includes(q);
  });
  var pager = usePager(filtered, LIST_PAGE_SIZE);

  var saveEdit = function () {
    if (!editOther || !editOther.name) return;
    var next = others.map(function (o) {
      return o.id === editOther.id
        ? Object.assign({}, o, {
          name: editOther.name,
          phone: editOther.phone || "",
          address: editOther.address || "",
          note: editOther.note || "",
          updatedAt: new Date().toISOString(),
        })
        : o;
    });
    S.set("tc3_others", next);
    setState(function (st) { return Object.assign({}, st, { others: next }); });
    setEditOther(null);
  };

  var deleteOther = function (id) {
    var target = others.find(function (o) { return o.id === id; });
    if (!target) return;
    showConfirm("Delete contact \"" + target.name + "\"?", function () {
      var next = others.filter(function (o) { return o.id !== id; });
      S.set("tc3_others", next);
      setState(function (st) { return Object.assign({}, st, { others: next }); });
      if (editOther && editOther.id === id) setEditOther(null);
    });
  };

  return (
    <React.Fragment>
      <div className="erp-pty-panel is-other" style={{ height: "100%" }}>
        <div className="erp-pty-panel-head">
          <div className="erp-pty-panel-head-left">
            <span className="erp-pty-panel-ico" aria-hidden="true">OT</span>
            <div>
              <div className="erp-pty-panel-title">Other contacts</div>
              <div className="erp-pty-panel-count">{filtered.length.toLocaleString()} shown · {others.length.toLocaleString()} total</div>
            </div>
          </div>
          <button type="button" className="erp-pty-btn-add" onClick={function () { setShow(true); }}>+ Add Other</button>
        </div>

        <div className="erp-pty-toolbar">
          <div className="erp-pty-search-wrap">
            <input
              className="erp-pty-field"
              value={search}
              onChange={function (e) { setSearch(e.target.value); }}
              placeholder="Search name, phone, address, note…"
              aria-label="Search other contacts"
            />
          </div>
          {search ? (
            <button type="button" className="erp-pty-btn-clear" onClick={function () { setSearch(""); }}>Clear</button>
          ) : null}
        </div>

        <div className="erp-pty-table-wrap">
          <table className="erp-pty-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pager.slice.length === 0 ? (
                <tr>
                  <td colSpan={5} className="erp-pty-empty">No other contacts found</td>
                </tr>
              ) : pager.slice.map(function (o) {
                return (
                  <tr key={o.id}>
                    <td><span className="erp-pty-name">{o.name}</span></td>
                    <td className="erp-pty-muted">{o.phone || "—"}</td>
                    <td className="erp-pty-muted">{o.address || "—"}</td>
                    <td className="erp-pty-muted" title={o.note || ""}>{o.note ? o.note.slice(0, 48) : "—"}</td>
                    <td style={actBtnCellStyle}>
                      <ActBtnGroup align="left">
                        <ActBtn tone="blue" title="Edit contact" onClick={function () { setEditOther(Object.assign({}, o)); }} />
                        <ActBtn tone="red" icon="delete" title="Delete contact" onClick={function () { deleteOther(o.id); }} />
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
            <span><strong>{filtered.length}</strong> contacts</span>
          </div>
          <div className="erp-pty-footer-pager">
            {Pager ? <Pager pager={pager} /> : null}
          </div>
        </div>
      </div>

      {show ? (
        <AddPartyModal
          open={show}
          onClose={function () { setShow(false); }}
          onCreate={function (draft) {
            var result = createAndPersistOther({
              others: others,
              setState: setState,
              S: S,
              uid: uid,
              tcTrialGuard: tcTrialGuard,
              draft: draft,
            });
            if (!result.ok) return null;
            return result.other;
          }}
          others={others}
          context="parties_other"
          partyKind="other"
          Modal={Modal}
          Input={Input}
          Btn={Btn}
        />
      ) : null}

      {editOther ? (
        <Modal
          title={"Edit Contact — " + editOther.name}
          onClose={function () { setEditOther(null); }}
          wide
          closeRound
          className="erp-party-modal is-other"
        >
          <div className="erp-party-modal-body">
            <div className="erp-party-modal-fields">
              <Input compact label="Name *" value={editOther.name || ""} onChange={function (e) { setEditOther(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} />
              <div className="erp-party-modal-meta-row is-two">
                <Input compact label="Phone" value={editOther.phone || ""} onChange={function (e) { setEditOther(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); }} />
                <Input compact label="Address" value={editOther.address || ""} onChange={function (e) { setEditOther(function (x) { return Object.assign({}, x, { address: e.target.value }); }); }} />
              </div>
              <Input compact label="Note" value={editOther.note || ""} onChange={function (e) { setEditOther(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} />
            </div>
            <div className="erp-party-modal-footer">
              <Btn col="gray" onClick={function () { setEditOther(null); }}>Cancel</Btn>
              <Btn col="blue" onClick={saveEdit} disabled={!editOther.name}>Save Changes</Btn>
            </div>
          </div>
        </Modal>
      ) : null}
    </React.Fragment>
  );
}

export default function Parties(props) {
  var partyTab = props.partyTab || "customer";
  var setPartyTab = props.setPartyTab;
  var state = props.state || {};

  var [tab, setTab] = useState(partyTab);

  useEffect(function () {
    if (partyTab && partyTab !== tab) setTab(partyTab);
  }, [partyTab]);

  var selectTab = function (nextTab) {
    setTab(nextTab);
    if (typeof setPartyTab === "function") setPartyTab(nextTab);
  };

  var custCount = (state.customers || []).length;
  var suppCount = (state.suppliers || []).length;
  var otherCount = (state.others || []).length;
  var tabCounts = { customer: custCount, supplier: suppCount, other: otherCount };

  var tabClass = tab === "supplier" ? "is-tab-supplier" : (tab === "other" ? "is-tab-other" : "is-tab-customer");
  var subLabel = tab === "supplier"
    ? "Vendors & payables"
    : (tab === "other" ? "Misc contacts" : "Buyers & receivables");

  return (
    <div className={"erp-page erp-pty-modern " + tabClass}>
      <div className="erp-pty-chrome">
        <div className="erp-pty-topbar">
          <div className="erp-pty-topbar-brand">
            <h1 className="erp-pty-header-title">Parties</h1>
            <p className="erp-pty-header-sub">{subLabel}</p>
          </div>
          <div className="erp-pty-kpi-row" aria-label="Party totals">
            <div className="erp-pty-kpi is-blue">
              <span className="erp-pty-kpi-lbl">Customers</span>
              <span className="erp-pty-kpi-val">{custCount.toLocaleString()}</span>
            </div>
            <div className="erp-pty-kpi is-orange">
              <span className="erp-pty-kpi-lbl">Suppliers</span>
              <span className="erp-pty-kpi-val">{suppCount.toLocaleString()}</span>
            </div>
            <div className="erp-pty-kpi is-teal">
              <span className="erp-pty-kpi-lbl">Others</span>
              <span className="erp-pty-kpi-val">{otherCount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="erp-pty-tabs" role="tablist" aria-label="Party types">
          {PARTY_TABS.map(function (t) {
            var active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={"erp-pty-tab is-" + t.id + (active ? " is-active" : "")}
                onClick={function () { selectTab(t.id); }}
              >
                <span>{t.label}</span>
                <span className="erp-pty-tab-count">{(tabCounts[t.id] || 0).toLocaleString()}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="erp-pty-body">
        {tab === "customer" ? <Customers {...props} embedded /> : null}
        {tab === "supplier" ? <Suppliers {...props} embedded /> : null}
        {tab === "other" ? <OthersTab {...props} Pager={props.Pager} /> : null}
      </div>
    </div>
  );
}
