import React, { useEffect, useRef, useState } from "react";
import AddPartyModal from "./AddPartyModal.jsx";

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
  var Modal = props.Modal;
  var Btn = props.Btn;
  var focusKey = props.focusKey;
  var context = props.context || "sales";

  var inputRef = useRef(null);
  var rootRef = useRef(null);
  var [dropIdx, setDropIdx] = useState(-1);
  var [isOpen, setIsOpen] = useState(false);
  var [showCreateModal, setShowCreateModal] = useState(false);
  var [createInitial, setCreateInitial] = useState({ name: "", phone: "", address: "" });

  useEffect(function () {
    if (focusKey == null) return;
    var el = inputRef.current;
    if (!el) return;
    try {
      el.focus();
      el.select();
      setIsOpen(true);
    } catch (e) { /* ignore */ }
  }, [focusKey]);

  useEffect(function () {
    if (!isOpen) return;
    function handlePointerDown(e) {
      var root = rootRef.current;
      if (root && !root.contains(e.target)) {
        setIsOpen(false);
        setDropIdx(-1);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return function () {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  var filteredCustomers = React.useMemo(function () {
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

  var openCreate = function (name) {
    setIsOpen(false);
    setDropIdx(-1);
    setCreateInitial({ name: String(name || "").trim(), phone: "", address: "" });
    setShowCreateModal(true);
  };

  var closePicker = function () {
    setIsOpen(false);
    setDropIdx(-1);
  };

  var handleSelect = function (customer) {
    if (!customer) return;
    onSelectCustomer(customer);
    closePicker();
    focusAfterSelect();
  };

  var handleCreated = function () {
    setShowCreateModal(false);
    focusAfterSelect();
  };

  var placeholder = props.placeholder || "Search customer by name or phone...";
  var compact = !!props.compact;
  var inputStyle = compact
    ? { width: "100%", outline: "none", fontFamily: "inherit" }
    : { width: "100%", border: "1px solid " + (selectedCustomerId ? C.green : C.border), borderRadius: 7, padding: "8px 11px", fontSize: 13, outline: "none", fontFamily: "inherit" };
  var canCreate = String(value || "").trim() && filteredCustomers.length === 0;

  return (
    <>
      <div
        ref={rootRef}
        className={
          "erp-cust-picker"
          + (compact ? " erp-cust-picker-compact" : "")
          + (isOpen ? " is-open" : "")
        }
        style={{ position: "relative" }}
      >
        <input
          ref={inputRef}
          className={compact ? "erp-cust-picker-input" : undefined}
          value={value}
          onFocus={function () { setIsOpen(true); }}
          onChange={function (e) {
            onValueChange(e.target.value);
            setDropIdx(-1);
            setIsOpen(true);
          }}
          onKeyDown={function (e) {
            var list = filteredCustomers;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setDropIdx(function (i) { return Math.min(i + 1, canCreate ? list.length : Math.max(list.length - 1, 0)); });
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setDropIdx(function (i) { return Math.max(i - 1, -1); });
              return;
            }
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
                openCreate(value);
              }
            }
            if (e.key === "Escape") {
              onValueChange("");
              closePicker();
            }
          }}
          placeholder={placeholder}
          style={inputStyle}
        />

        {isOpen && value && !selectedCustomerId && (
          <div className="erp-cust-picker-drop">
            {filteredCustomers.map(function (c, idx) {
              var dupN = normalizeNameKey ? duplicateNameKeys[normalizeNameKey(c.name)] : false;
              return (
                <div
                  key={c.id}
                  className={"erp-cust-picker-item" + (dropIdx === idx ? " active" : "")}
                  onClick={function () { handleSelect(c); }}
                  onMouseEnter={function () { setDropIdx(idx); }}
                  onMouseLeave={function () { setDropIdx(-1); }}
                >
                  <span className="erp-cust-picker-item-name">
                    {c.name}{dupN ? <span title="Duplicate name exists"> {" "}⚠️</span> : null}
                  </span>
                  <span className="erp-cust-picker-item-phone">{c.phone}</span>
                </div>
              );
            })}
            {canCreate && (
              <div
                className={"erp-cust-picker-item erp-cust-picker-create-opt" + (dropIdx === filteredCustomers.length ? " active" : "")}
                onClick={function () { openCreate(value); }}
                onMouseEnter={function () { setDropIdx(filteredCustomers.length); }}
                onMouseLeave={function () { setDropIdx(-1); }}
              >
                + Add new customer
              </div>
            )}
          </div>
        )}
      </div>

      <AddPartyModal
        open={showCreateModal}
        onClose={function () { setShowCreateModal(false); }}
        onCreate={function (draft) { return onCreateCustomer(draft); }}
        onSaved={handleCreated}
        customers={customers}
        context={context}
        partyKind="customer"
        initialValues={createInitial}
        Modal={Modal}
        Input={Input}
        Btn={Btn}
        zIndex={props.zIndex || 1100}
      />
    </>
  );
};

export default CustomerPicker;
