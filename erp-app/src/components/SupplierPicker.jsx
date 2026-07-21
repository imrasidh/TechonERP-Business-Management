import React, { useMemo, useState } from "react";
import AddPartyModal from "./AddPartyModal.jsx";

var SupplierPicker = function (props) {
  var suppliers = Array.isArray(props.suppliers) ? props.suppliers : [];
  var value = props.value || "";
  var selectedSupplierId = props.selectedSupplierId || "";
  var onValueChange = props.onValueChange;
  var onSelectSupplier = props.onSelectSupplier;
  var onCreateSupplier = props.onCreateSupplier;
  var onAfterSelect = props.onAfterSelect;
  var C = props.C;
  var Modal = props.Modal;
  var Input = props.Input;
  var Btn = props.Btn;
  var context = props.context || "purchase";
  var placeholder = props.placeholder || "Search supplier by name or phone...";
  var inputStyle = props.inputStyle || {};
  var dropdownMaxHeight = props.dropdownMaxHeight || 220;
  var dropdownItemStyle = props.dropdownItemStyle || {};

  var [dropIdx, setDropIdx] = useState(-1);
  var [showCreateModal, setShowCreateModal] = useState(false);
  var [createInitial, setCreateInitial] = useState({ name: "", phone: "", address: "", email: "", note: "" });

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
    focusAfterSelect();
  };

  var openCreate = function (name) {
    setCreateInitial({ name: String(name || "").trim(), phone: "", address: "", email: "", note: "" });
    setShowCreateModal(true);
    setDropIdx(-1);
  };

  var handleCreated = function (created) {
    if (created && typeof onCreateSupplier === "function") {
      /* onCreateSupplier already ran via modal; ensure parent state synced */
    }
    setShowCreateModal(false);
    focusAfterSelect();
  };

  return (
    <>
      <div style={{ position: "relative" }}>
        <input
          value={value}
          onChange={function (e) {
            onValueChange(e.target.value);
            setDropIdx(-1);
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
                openCreate(value);
              }
            }
            if (e.key === "Escape") {
              onValueChange("");
              setDropIdx(-1);
            }
          }}
          placeholder={placeholder}
          style={Object.assign({ width: "100%", border: "1px solid " + (selectedSupplierId ? C.green : C.border), borderRadius: 7, padding: "8px 11px", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }, inputStyle)}
        />
        {value && !selectedSupplierId && !showCreateModal && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid " + C.border, borderRadius: 7, zIndex: 50, maxHeight: dropdownMaxHeight, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,.1)" }}>
            {filteredSuppliers.map(function (s, idx) {
              return (
                <div
                  key={s.id}
                  onClick={function () { handleSelect(s); }}
                  onMouseEnter={function () { setDropIdx(idx); }}
                  onMouseLeave={function () { setDropIdx(-1); }}
                  style={Object.assign({ padding: "9px 14px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f1f5f9", background: dropIdx === idx ? C.accentSoft : "#fff" }, dropdownItemStyle)}
                >
                  {s.name} <span style={{ color: C.muted }}>{s.phone}{s.address ? " · " + s.address : ""}</span>
                </div>
              );
            })}
            {String(value || "").trim() && filteredSuppliers.length === 0 && (
              <div
                onClick={function () { openCreate(value); }}
                onMouseEnter={function () { setDropIdx(filteredSuppliers.length); }}
                onMouseLeave={function () { setDropIdx(-1); }}
                style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, background: dropIdx === filteredSuppliers.length ? C.accentSoft : "#fff", color: C.accent, fontWeight: 700 }}
              >
                + Add new supplier
              </div>
            )}
          </div>
        )}
      </div>

      <AddPartyModal
        open={showCreateModal}
        onClose={function () { setShowCreateModal(false); }}
        onCreate={function (draft) { return onCreateSupplier(draft); }}
        onSaved={handleCreated}
        suppliers={suppliers}
        context={context}
        partyKind="supplier"
        initialValues={createInitial}
        Modal={Modal}
        Input={Input}
        Btn={Btn}
        zIndex={props.zIndex || 1100}
      />
    </>
  );
};

export default SupplierPicker;
