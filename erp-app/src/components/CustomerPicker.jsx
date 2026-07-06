import React, { useMemo, useState } from "react";

var CustomerPicker = function (props) {
  var customers = Array.isArray(props.customers) ? props.customers : [];
  var value = props.value || "";
  var selectedCustomerId = props.selectedCustomerId || "";
  var onValueChange = props.onValueChange;
  var onSelectCustomer = props.onSelectCustomer;
  var onCreateCustomer = props.onCreateCustomer;
  var onAfterSelect = props.onAfterSelect;
  var duplicateNameKeys = props.duplicateNameKeys || {};
  var normalizeNameKey = props.normalizeNameKey;
  var C = props.C;
  var Input = props.Input;

  var [dropIdx, setDropIdx] = useState(-1);
  var [showCreate, setShowCreate] = useState(false);
  var [createForm, setCreateForm] = useState({ name: "", phone: "" });

  var filteredCustomers = useMemo(function () {
    var q = String(value || "").trim().toLowerCase();
    if (!q) return [];
    return customers.filter(function (c) {
      return String(c.name || "").toLowerCase().includes(q) || String(c.phone || "").includes(q);
    }).slice(0, 10);
  }, [customers, value]);

  var focusAfterSelect = function () {
    if (typeof onAfterSelect === "function") {
      setTimeout(function () { onAfterSelect(); }, 0);
    }
  };

  var handleSelect = function (customer) {
    if (!customer) return;
    onSelectCustomer(customer);
    setDropIdx(-1);
    setShowCreate(false);
    focusAfterSelect();
  };

  var handleCreate = function () {
    var name = String(createForm.name || "").trim();
    if (!name) return;
    var created = onCreateCustomer({
      name: name,
      phone: String(createForm.phone || "").trim(),
    });
    if (created) {
      setCreateForm({ name: "", phone: "" });
      setShowCreate(false);
      setDropIdx(-1);
      focusAfterSelect();
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        value={value}
        onChange={function (e) {
          onValueChange(e.target.value);
          setDropIdx(-1);
          setShowCreate(false);
        }}
        onKeyDown={function (e) {
          var list = filteredCustomers;
          var canCreate = String(value || "").trim() && list.length === 0;
          if (e.key === "ArrowDown") { e.preventDefault(); setDropIdx(function (i) { return Math.min(i + 1, canCreate ? list.length : Math.max(list.length - 1, 0)); }); return; }
          if (e.key === "ArrowUp") { e.preventDefault(); setDropIdx(function (i) { return Math.max(i - 1, -1); }); return; }
          if (e.key === "Enter") {
            e.preventDefault();
            if (selectedCustomerId) {
              focusAfterSelect();
              return;
            }
            if (dropIdx >= 0 && list[dropIdx]) {
              handleSelect(list[dropIdx]);
              return;
            }
            if (list.length > 0) {
              handleSelect(list[0]);
              return;
            }
            if (canCreate && dropIdx === list.length) {
              setShowCreate(true);
              setCreateForm({ name: String(value || "").trim(), phone: "" });
            }
          }
          if (e.key === "Escape") {
            onValueChange("");
            setDropIdx(-1);
            setShowCreate(false);
          }
        }}
        placeholder="Search customer by name or phone..."
        style={{ width: "100%", border: "1px solid " + (selectedCustomerId ? C.green : C.border), borderRadius: 7, padding: "8px 11px", fontSize: 13, outline: "none", fontFamily: "inherit" }}
      />
      {value && !selectedCustomerId && !showCreate && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid " + C.border, borderRadius: 7, zIndex: 50, maxHeight: 220, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,.1)" }}>
          {filteredCustomers.map(function (c, idx) {
            var dupN = normalizeNameKey ? duplicateNameKeys[normalizeNameKey(c.name)] : false;
            return (
              <div
                key={c.id}
                onClick={function () { handleSelect(c); }}
                onMouseEnter={function () { setDropIdx(idx); }}
                onMouseLeave={function () { setDropIdx(-1); }}
                style={{ padding: "9px 14px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f1f5f9", background: dropIdx === idx ? C.accentSoft : "#fff" }}
              >
                {c.name}{dupN ? <span title="Duplicate name exists"> {" "}⚠️</span> : null} <span style={{ color: C.muted }}>{c.phone}</span>
              </div>
            );
          })}
          {String(value || "").trim() && filteredCustomers.length === 0 && (
            <div
              onClick={function () {
                setShowCreate(true);
                setCreateForm({ name: String(value || "").trim(), phone: "" });
              }}
              onMouseEnter={function () { setDropIdx(filteredCustomers.length); }}
              onMouseLeave={function () { setDropIdx(-1); }}
              style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, background: dropIdx === filteredCustomers.length ? C.accentSoft : "#fff", color: C.accent, fontWeight: 700 }}
            >
              + Add new customer
            </div>
          )}
        </div>
      )}
      {showCreate && (
        <div style={{ marginTop: 8, padding: 10, border: "1px solid " + C.border, borderRadius: 8, background: "#f8fafc" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, marginBottom: 8 }}>Add new customer</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Input label="Name" value={createForm.name} onChange={function (e) { setCreateForm(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} placeholder="Customer name" />
            <Input label="Phone" value={createForm.phone} onChange={function (e) { setCreateForm(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); }} placeholder="Phone number" />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={handleCreate} style={{ border: "none", borderRadius: 6, padding: "7px 10px", background: C.accent, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Save Customer</button>
              <button type="button" onClick={function () { setShowCreate(false); }} style={{ border: "1px solid " + C.border, borderRadius: 6, padding: "7px 10px", background: "#fff", color: C.textMd, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerPicker;
