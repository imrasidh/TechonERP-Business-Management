import React, { useMemo, useState } from "react";
import { productMatchesSearch, productMatchesSearchExact } from "../utils/productSearch.js";
import { isRepair3pInternalProduct } from "../utils/repair3pProduct.js";

var StockProductPicker = function (props) {
  var products = Array.isArray(props.products) ? props.products : [];
  var selectedProductId = props.selectedProductId || "";
  var value = props.value != null ? props.value : "";
  var onValueChange = props.onValueChange;
  var onSelectProduct = props.onSelectProduct;
  var label = props.label || "";
  var placeholder = props.placeholder || "Search by name, ID, or barcode…";
  var C = props.C || {};
  var fmtNum = props.fmtNum || function (n) { return n; };
  var getCurrencySymbol = props.getCurrencySymbol || function () { return "Rs"; };

  var [dropIdx, setDropIdx] = useState(-1);
  var [open, setOpen] = useState(false);

  var filtered = useMemo(function () {
    var q = String(value || "").trim();
    if (!q) return [];
    var ql = q.toLowerCase();
    return products.filter(function (p) {
      if (!p || p.status === "inactive") return false;
      if (isRepair3pInternalProduct(p)) return false;
      if (p.type === "service") return false;
      if ((p.stock || 0) <= 0) return false;
      return productMatchesSearch(p, ql);
    }).sort(function (a, b) {
      var aExact = productMatchesSearchExact(a, ql);
      var bExact = productMatchesSearchExact(b, ql);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return (b.stock || 0) - (a.stock || 0);
    }).slice(0, 10);
  }, [products, value]);

  var selectedProduct = selectedProductId
    ? products.find(function (p) { return p.id === selectedProductId; })
    : null;

  var handleSelect = function (p) {
    if (!p || !onSelectProduct) return;
    onSelectProduct(p);
    setDropIdx(-1);
    setOpen(false);
  };

  var border = C.border || "#e2e8f0";
  var textMd = C.textMd || "#64748b";
  var muted = C.muted || "#94a3b8";
  var accentSoft = C.accentSoft || "#eff6ff";
  var accent = C.accent || "#1d4ed8";
  var text = C.text || "#1e293b";

  return (
    <div style={{ position: "relative" }}>
      {label ? (
        <label style={{ fontSize: 11, fontWeight: 700, color: textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>{label}</label>
      ) : null}
      <input
        type="text"
        value={value}
        onChange={function (e) {
          if (onValueChange) onValueChange(e.target.value);
          setDropIdx(-1);
          setOpen(true);
        }}
        onFocus={function () { setOpen(true); }}
        onBlur={function () {
          setTimeout(function () { setOpen(false); setDropIdx(-1); }, 160);
        }}
        onKeyDown={function (e) {
          var list = filtered;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setDropIdx(function (i) { return Math.min(i + 1, Math.max(list.length - 1, 0)); });
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setDropIdx(function (i) { return Math.max(i - 1, -1); });
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (dropIdx >= 0 && list[dropIdx]) {
              handleSelect(list[dropIdx]);
              return;
            }
            if (list.length === 1) {
              handleSelect(list[0]);
            }
          }
          if (e.key === "Escape") {
            setOpen(false);
            setDropIdx(-1);
          }
        }}
        placeholder={placeholder}
        style={{
          width: "100%",
          border: "1.5px solid " + border,
          borderRadius: 8,
          padding: "9px 13px",
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {open && String(value || "").trim() && filtered.length > 0 ? (
        <div style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "100%",
          marginTop: 4,
          background: "#fff",
          border: "1px solid " + border,
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
          zIndex: 50,
          maxHeight: 220,
          overflowY: "auto",
        }}>
          {filtered.map(function (p, i) {
            var active = i === dropIdx;
            return (
              <button
                key={p.id}
                type="button"
                onMouseDown={function (e) { e.preventDefault(); handleSelect(p); }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  borderBottom: i < filtered.length - 1 ? "1px solid #f1f5f9" : "none",
                  background: active ? accentSoft : "#fff",
                  padding: "9px 12px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: text }}>{p.name}</div>
                <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
                  ID: {p.productId || "—"} · {p.barcode || "no barcode"} · Stock: {fmtNum(p.stock || 0)} · Cost: {getCurrencySymbol()} {fmtNum(p.cost || 0)}
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
      {open && String(value || "").trim() && filtered.length === 0 ? (
        <div style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "100%",
          marginTop: 4,
          background: "#fff",
          border: "1px solid " + border,
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 12,
          color: muted,
          zIndex: 50,
        }}>
          No stock product found. Try name, product ID, or barcode.
        </div>
      ) : null}
      {selectedProduct ? (
        <div style={{ fontSize: 11, color: accent, marginTop: 4, fontWeight: 600 }}>
          Selected: {selectedProduct.name} · Stock {fmtNum(selectedProduct.stock || 0)}
        </div>
      ) : null}
    </div>
  );
};

export default StockProductPicker;
