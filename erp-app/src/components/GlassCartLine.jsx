import React, { useState } from "react";
import { GLASS_DIMENSION_UNITS } from "../utils/glassDimensions.js";
import { recalcGlassCartLine, glassAvailableSqFt, glassLineAmount } from "../utils/glassProduct.js";
import GlassCostDetailsModal from "./GlassCostDetailsModal.jsx";

export var GLASS_CART_FIELD_H = 38;

export var glassCartCellLabel = function (text, C) {
  return (
    <div style={{ fontSize: 9, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5, textAlign: "center" }}>
      {text}
    </div>
  );
};

export var glassCartFieldStyle = function (C, overrides) {
  return Object.assign({
    border: "1.5px solid " + C.border,
    borderRadius: 8,
    padding: "0 8px",
    fontSize: 13,
    fontFamily: "inherit",
    fontWeight: 600,
    textAlign: "center",
    width: "100%",
    height: GLASS_CART_FIELD_H,
    lineHeight: GLASS_CART_FIELD_H + "px",
    boxSizing: "border-box",
    background: "#fff",
    outline: "none",
    minWidth: 0,
    display: "block",
  }, overrides || {});
};

var FIELD_H = GLASS_CART_FIELD_H;

var cellLabel = glassCartCellLabel;

var fieldStyle = function (C) {
  return glassCartFieldStyle(C);
};

var GlassCartLine = function (props) {
  var item = props.item;
  var product = props.product;
  var C = props.C;
  var fmtNum = props.fmtNum;
  var getCurrencySymbol = props.getCurrencySymbol;
  var onChange = props.onChange;
  var onFieldKey = props.onFieldKey;
  var rowIndex = props.rowIndex;
  var disabled = !!props.disabled;
  var [costOpen, setCostOpen] = useState(false);

  var patch = function (fields) {
    onChange(recalcGlassCartLine(Object.assign({}, item, fields), product));
  };

  var live = product ? recalcGlassCartLine(item, product) : item;
  var usedSqFt = Number(live.glassTotalSqFt) || 0;
  var availSqFt = product ? glassAvailableSqFt(product) : 0;
  var sym = getCurrencySymbol ? getCurrencySymbol() : "Rs";

  var keyProps = function (col) {
    return {
      "data-cartrow": rowIndex,
      "data-cartcol": col,
      disabled: disabled,
      onKeyDown: onFieldKey ? function (e) { onFieldKey(e, rowIndex, col); } : undefined,
      onFocus: function (e) {
        e.target.style.border = "1.5px solid " + C.accent;
        e.target.style.background = "#f0f4ff";
      },
      onBlur: function (e) {
        e.target.style.border = "1.5px solid " + C.border;
        e.target.style.background = "#fff";
      },
    };
  };

  return (
    <div style={{ minWidth: 0, padding: "4px 0" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(56px, 1fr) minmax(56px, 1fr) 76px 56px", gap: 10, alignItems: "end" }}>
        <div>
          {cellLabel("Width", C)}
          <input
            type="number"
            min="0"
            step="any"
            placeholder="0"
            value={item.glassWidth != null && item.glassWidth !== "" ? item.glassWidth : ""}
            onChange={function (e) { patch({ glassWidth: e.target.value }); }}
            style={fieldStyle(C)}
            {...keyProps(1)}
          />
        </div>
        <div>
          {cellLabel("Height", C)}
          <input
            type="number"
            min="0"
            step="any"
            placeholder="0"
            value={item.glassLength != null && item.glassLength !== "" ? item.glassLength : ""}
            onChange={function (e) { patch({ glassLength: e.target.value }); }}
            style={fieldStyle(C)}
            {...keyProps(2)}
          />
        </div>
        <div>
          {cellLabel("Unit", C)}
          <select
            value={item.glassDimensionUnit || "mm"}
            onChange={function (e) { patch({ glassDimensionUnit: e.target.value }); }}
            style={Object.assign({}, fieldStyle(C), { padding: "0 6px", lineHeight: "normal" })}
            {...keyProps(3)}
          >
            {GLASS_DIMENSION_UNITS.map(function (u) { return <option key={u} value={u}>{u}</option>; })}
          </select>
        </div>
        <div>
          {cellLabel("Pcs", C)}
          <input
            type="number"
            min="1"
            step="1"
            placeholder="1"
            value={item.glassPieces != null ? item.glassPieces : 1}
            onChange={function (e) { patch({ glassPieces: e.target.value }); }}
            style={fieldStyle(C)}
            {...keyProps(4)}
          />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: usedSqFt > 0 ? C.blue : C.muted, whiteSpace: "nowrap" }}>
          {usedSqFt > 0 ? (fmtNum(usedSqFt) + " Sq Ft · " + sym + " " + fmtNum(glassLineAmount(live))) : "Enter width & height"}
        </div>
      </div>
      {product && (
        <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
          Stock {fmtNum(availSqFt)} Sq Ft{usedSqFt > 0 ? (" · Left " + fmtNum(Math.max(0, availSqFt - usedSqFt))) : ""}
        </div>
      )}
      {product && (
        <button
          type="button"
          disabled={disabled}
          onClick={function () { setCostOpen(true); }}
          style={{
            border: "1px solid " + (C.accent || "#2563eb"),
            background: "#fff",
            padding: "5px 12px",
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 800,
            color: C.accent,
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.5 : 1,
            marginTop: 8,
          }}
        >
          View cost &amp; pricing
        </button>
      )}

      {costOpen && product && (
        <GlassCostDetailsModal
          product={product}
          line={item}
          C={C}
          fmtNum={fmtNum}
          getCurrencySymbol={getCurrencySymbol}
          onClose={function () { setCostOpen(false); }}
        />
      )}
    </div>
  );
};

export default GlassCartLine;
