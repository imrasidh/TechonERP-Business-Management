import React, { useMemo, useState } from "react";

var SupplierPicker = function (props) {
  var suppliers = Array.isArray(props.suppliers) ? props.suppliers : [];
  var value = props.value || "";
  var selectedSupplierId = props.selectedSupplierId || "";
  var onValueChange = props.onValueChange;
  var onSelectSupplier = props.onSelectSupplier;
  var onCreateSupplier = props.onCreateSupplier;
  var onAfterSelect = props.onAfterSelect;
  var C = props.C;
  var Input = props.Input;
  var placeholder = props.placeholder || "Search supplier by name or phone...";

  var [dropIdx, setDropIdx] = useState(-1);
  var [showCreate, setShowCreate] = useState(false);
  var [createForm, setCreateForm] = useState({ name: "", phone: "", address: "" });

  var filteredSuppliers = useMemo(function () {
    var q = String(value || "").trim().toLowerCase();
    if (!q) return [];
    return suppliers.filter(function (s) {
      return String(s.name || "").toLowerCase().includes(q)
        || String(s.phone || "").includes(q)
        || String(s.address || "").toLowerCase().includes(q);
    }).slice(0, 10);
  }, [suppliers, value]);

  var focusAfterSelect = function () {
    if (typeof onAfterSelect === "function") {
      setTimeout(function () { onAfterSelect(); }, 0);
    }
  };

  var handleSelect = function (supplier) {
    if (!supplier) return;
    onSelectSupplier(supplier);
    setDropIdx(-1);
    setShowCreate(false);
    focusAfterSelect();
  };

  var handleCreate = function () {
    var name = String(createForm.name || "").trim();
    if (!name) return;
    var created = onCreateSupplier({
      name: name,
      phone: String(createForm.phone || "").trim(),
      address: String(createForm.address || "").trim(),
    });
    if (created) {
      setCreateForm({ name: "", phone: "", address: "" });
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
          var list = filteredSuppliers;
          var canCreate = String(value || "").trim() && list.length === 0;
          if (e.key === "ArrowDown") { e.preventDefault(); setDropIdx(function (i) { return Math.min(i + 1, canCreate ? list.length : Math.max(list.length - 1, 0)); }); return; }
          if (e.key === "ArrowUp") { e.preventDefault(); setDropIdx(function (i) { return Math.max(i - 1, -1); }); return; }
          if (e.key === "Enter") {
            e.preventDefault();
            if (selectedSupplierId) {
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
              setCreateForm({ name: String(value || "").trim(), phone: "", address: "" });
            }
          }
          if (e.key === "Escape") {
            onValueChange("");
            setDropIdx(-1);
            setShowCreate(false);
          }
        }}
        placeholder={placeholder}
        style={{ width: "100%", border: "1px solid " + (selectedSupplierId ? C.green : C.border), borderRadius: 7, padding: "8px 11px", fontSize: 13, outline: "none", fontFamily: "inherit" }}
      />
      {value && !selectedSupplierId && !showCreate && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid " + C.border, borderRadius: 7, zIndex: 50, maxHeight: 220, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,.1)" }}>
          {filteredSuppliers.map(function (s, idx) {
            return (
              <div
                key={s.id}
                onClick={function () { handleSelect(s); }}
                onMouseEnter={function () { setDropIdx(idx); }}
                onMouseLeave={function () { setDropIdx(-1); }}
                style={{ padding: "9px 14px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f1f5f9", background: dropIdx === idx ? C.accentSoft : "#fff" }}
              >
                {s.name} <span style={{ color: C.muted }}>{s.phone}{s.address ? " · " + s.address : ""}</span>
              </div>
            );
          })}
          {String(value || "").trim() && filteredSuppliers.length === 0 && (
            <div
              onClick={function () {
                setShowCreate(true);
                setCreateForm({ name: String(value || "").trim(), phone: "", address: "" });
              }}
              onMouseEnter={function () { setDropIdx(filteredSuppliers.length); }}
              onMouseLeave={function () { setDropIdx(-1); }}
              style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, background: dropIdx === filteredSuppliers.length ? C.accentSoft : "#fff", color: C.accent, fontWeight: 700 }}
            >
              + Add new supplier
            </div>
          )}
        </div>
      )}
      {showCreate && (
        <div style={{ marginTop: 8, padding: 10, border: "1px solid " + C.border, borderRadius: 8, background: "#f8fafc" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, marginBottom: 8 }}>Add new supplier</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Input label="Name" value={createForm.name} onChange={function (e) { setCreateForm(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} placeholder="Supplier name" />
            <Input label="Phone" value={createForm.phone} onChange={function (e) { setCreateForm(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); }} placeholder="Phone number" />
            <Input label="Address" value={createForm.address} onChange={function (e) { setCreateForm(function (x) { return Object.assign({}, x, { address: e.target.value }); }); }} placeholder="Address (optional)" />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={handleCreate} style={{ border: "none", borderRadius: 6, padding: "7px 10px", background: C.accent, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Save Supplier</button>
              <button type="button" onClick={function () { setShowCreate(false); }} style={{ border: "1px solid " + C.border, borderRadius: 6, padding: "7px 10px", background: "#fff", color: C.textMd, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierPicker;
