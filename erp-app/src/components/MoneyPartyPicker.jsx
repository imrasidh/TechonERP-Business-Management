import React, { useEffect, useMemo, useRef, useState } from "react";
import AddPartyModal from "./AddPartyModal.jsx";
import { partyKindLabel } from "../utils/partyCreate.js";

function buildPartyRows(customers, suppliers, others) {
  var rows = [];
  (customers || []).forEach(function (c) {
    if (!c || !c.name) return;
    rows.push({ id: c.id, name: c.name, phone: c.phone || "", kind: "customer", kindLabel: "Customer" });
  });
  (suppliers || []).forEach(function (s) {
    if (!s || !s.name) return;
    rows.push({ id: s.id, name: s.name, phone: s.phone || "", kind: "supplier", kindLabel: "Supplier" });
  });
  (others || []).forEach(function (o) {
    if (!o || !o.name) return;
    rows.push({ id: o.id, name: o.name, phone: o.phone || "", kind: "other", kindLabel: "Other" });
  });
  rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
  return rows;
}

function findExactParty(customers, suppliers, others, name) {
  var q = String(name || "").trim().toLowerCase();
  if (!q) return null;
  var c = (customers || []).find(function (row) { return String(row.name || "").trim().toLowerCase() === q; });
  if (c) return { id: c.id, name: c.name, kind: "customer" };
  var s = (suppliers || []).find(function (row) { return String(row.name || "").trim().toLowerCase() === q; });
  if (s) return { id: s.id, name: s.name, kind: "supplier" };
  var o = (others || []).find(function (row) { return String(row.name || "").trim().toLowerCase() === q; });
  if (o) return { id: o.id, name: o.name, kind: "other" };
  return null;
}

/**
 * Searchable customer / supplier / other picker for Money In / Money Out.
 */
export default function MoneyPartyPicker(props) {
  var customers = props.customers || [];
  var suppliers = props.suppliers || [];
  var others = props.others || [];
  var value = props.value || "";
  var selectedParty = props.selectedParty || null;
  var onValueChange = props.onValueChange;
  var onSelectParty = props.onSelectParty;
  var isIn = props.isIn !== false;
  var searchOnly = !!props.searchOnly;
  var allowedKinds = props.allowedKinds || null;
  var label = props.label;
  var placeholder = props.placeholder;
  var S = props.S;
  var setState = props.setState;
  var uid = props.uid;
  var tcTrialGuard = props.tcTrialGuard;
  var Modal = props.Modal;
  var Input = props.Input;
  var Btn = props.Btn;

  var rootRef = useRef(null);
  var [isOpen, setIsOpen] = useState(false);
  var [dropIdx, setDropIdx] = useState(-1);
  var [showPartyModal, setShowPartyModal] = useState(false);
  var [partyModalKind, setPartyModalKind] = useState(isIn ? "customer" : "supplier");
  var [createInitial, setCreateInitial] = useState({ name: "", phone: "", address: "", email: "", note: "" });

  var allParties = useMemo(function () {
    var rows = buildPartyRows(customers, suppliers, others);
    if (!allowedKinds || !allowedKinds.length) return rows;
    return rows.filter(function (p) { return allowedKinds.indexOf(p.kind) >= 0; });
  }, [customers, suppliers, others, allowedKinds]);

  var filtered = useMemo(function () {
    var q = String(value || "").trim().toLowerCase();
    if (!q) return searchOnly ? [] : allParties.slice(0, 10);
    return allParties.filter(function (p) {
      return p.name.toLowerCase().includes(q) || String(p.phone || "").includes(q);
    }).slice(0, 12);
  }, [allParties, value, searchOnly]);

  var exactMatch = useMemo(function () {
    var hit = findExactParty(customers, suppliers, others, value);
    if (!hit) return false;
    if (!allowedKinds || !allowedKinds.length) return true;
    return allowedKinds.indexOf(hit.kind) >= 0;
  }, [customers, suppliers, others, value, allowedKinds]);

  var typedName = String(value || "").trim();
  var canAdd = typedName && !exactMatch && !selectedParty;

  useEffect(function () {
    if (!isOpen) return;
    function handlePointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setIsOpen(false);
        setDropIdx(-1);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return function () { document.removeEventListener("mousedown", handlePointerDown); };
  }, [isOpen]);

  var closeDrop = function () {
    setIsOpen(false);
    setDropIdx(-1);
  };

  var handleSelect = function (party) {
    if (!party) return;
    onSelectParty({ id: party.id, name: party.name, kind: party.kind });
    onValueChange(party.name);
    closeDrop();
  };

  var openPartyCreate = function () {
    var preferred = isIn ? "customer" : "supplier";
    if (allowedKinds && allowedKinds.length && allowedKinds.indexOf(preferred) < 0) {
      preferred = allowedKinds[0];
    }
    setPartyModalKind(preferred);
    setCreateInitial({ name: typedName, phone: "", address: "", email: "", note: "" });
    setShowPartyModal(true);
    closeDrop();
  };

  var handlePartySaved = function (created, kind) {
    if (!created) return;
    onSelectParty({ id: created.id, name: created.name, kind: kind });
    onValueChange(created.name);
    setShowPartyModal(false);
  };

  var addOptionsCount = canAdd ? 1 : 0;
  var listCount = filtered.length + addOptionsCount;

  return (
    <>
      <div className="erp-money-party-field" ref={rootRef}>
        {label ? <label className="erp-money-party-label">{label}</label> : null}
        <input
          type="text"
          className={"erp-money-party-input" + (selectedParty ? " is-selected" : "")}
          value={value}
          placeholder={placeholder}
          onFocus={function () {
            if (!searchOnly || String(value || "").trim()) setIsOpen(true);
          }}
          onChange={function (e) {
            var next = e.target.value;
            onValueChange(next);
            onSelectParty(null);
            setDropIdx(-1);
            setIsOpen(!!String(next || "").trim() || !searchOnly);
          }}
          onKeyDown={function (e) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (searchOnly && !String(value || "").trim()) return;
              setIsOpen(true);
              setDropIdx(function (i) { return Math.min(i + 1, Math.max(listCount - 1, 0)); });
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setDropIdx(function (i) { return Math.max(i - 1, -1); });
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (dropIdx >= 0 && dropIdx < filtered.length) {
                handleSelect(filtered[dropIdx]);
                return;
              }
              if (filtered.length === 1 && !canAdd) {
                handleSelect(filtered[0]);
                return;
              }
              if (canAdd && (dropIdx === filtered.length || filtered.length === 0)) {
                openPartyCreate();
                return;
              }
            }
            if (e.key === "Escape") closeDrop();
          }}
        />
        {selectedParty ? (
          <div className="erp-money-party-selected">
            {partyKindLabel(selectedParty.kind)} linked
          </div>
        ) : null}
        {isOpen && (filtered.length > 0 || canAdd) ? (
          <div className="erp-money-suggest" onMouseDown={function (e) { e.preventDefault(); }}>
            {filtered.map(function (p, idx) {
              return (
                <button
                  key={p.kind + "-" + p.id}
                  type="button"
                  className={"erp-money-suggest-item" + (dropIdx === idx ? " is-active" : "")}
                  onMouseDown={function (e) {
                    e.preventDefault();
                    handleSelect(p);
                  }}
                >
                  <span className="erp-money-suggest-name">{p.name}</span>
                  <span className="erp-money-suggest-meta">
                    {p.phone ? <span className="erp-money-suggest-phone">{p.phone}</span> : null}
                    <span className={"erp-money-suggest-kind is-" + p.kind}>{p.kindLabel}</span>
                  </span>
                </button>
              );
            })}
            {canAdd ? (
              <button
                type="button"
                className={"erp-money-suggest-add is-new" + (dropIdx === filtered.length ? " is-active" : "")}
                onMouseDown={function (e) {
                  e.preventDefault();
                  openPartyCreate();
                }}
              >
                + Add “{typedName}”
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <AddPartyModal
        open={showPartyModal}
        onClose={function () { setShowPartyModal(false); }}
        onSaved={handlePartySaved}
        context="money"
        defaultKind={partyModalKind}
        allowedKinds={allowedKinds}
        initialValues={createInitial}
        customers={customers}
        suppliers={suppliers}
        others={others}
        S={S}
        setState={setState}
        uid={uid}
        tcTrialGuard={tcTrialGuard}
        Modal={Modal}
        Input={Input}
        Btn={Btn}
        zIndex={1200}
      />
    </>
  );
}

export { findExactParty };
