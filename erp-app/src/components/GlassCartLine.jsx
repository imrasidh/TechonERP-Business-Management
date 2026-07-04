import React, { useState } from "react";
import { GLASS_DIMENSION_UNITS } from "../utils/glassDimensions.js";
import { recalcGlassCartLine, glassAvailableSqFt, glassLineAmount } from "../utils/glassProduct.js";
import GlassCostDetailsModal from "./GlassCostDetailsModal.jsx";

export var GLASS_CART_FIELD_H = 26;

export var glassCartCellLabel = function (text, C) {
  return (
    <div style={{ fontSize: 9, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5, textAlign: "center" }}>
      {text}
    </div>
  );
};

export var glassCartFieldStyle = function (C, overrides) {
  return Object.assign({
    border: "1px solid " + C.border,
    borderRadius: 4,
    padding: "2px 5px",
    fontSize: 12,
    fontFamily: "inherit",
    fontWeight: 600,
    textAlign: "center",
    width: "100%",
    minHeight: GLASS_CART_FIELD_H,
    height: GLASS_CART_FIELD_H,
    boxSizing: "border-box",
    background: "#fff",
    outline: "none",
    minWidth: 0,
    display: "block",
    color: C.text || "#0f172a",
    lineHeight: 1.2,
  }, overrides || {});
};

/** Glass cart rate field — wide enough for 5–6 digit Rs/SqFt amounts. */
export var GlassRateInput = function (props) {
  var C = props.C;
  var value = props.value;
  var disabled = !!props.disabled;
  var onChange = props.onChange;
  var onKeyDown = props.onKeyDown;
  var currencySymbol = props.currencySymbol || "Rs";
  var belowCost = !!props.belowCost;
  var dataProps = props.dataProps || {};
  var unitNote = props.unitNote;
  if (unitNote === undefined) unitNote = "per Sq Ft";
  var compact = props.compact === true;
  var borderCol = belowCost ? C.red : C.border;
  var bgCol = belowCost ? "#fde8ed" : "#fff";

  var displayVal = value != null && value !== "" ? String(value) : "";

  return (
    <div style={{ width: "100%", minWidth: compact ? 0 : 148, maxWidth: "100%", boxSizing: "border-box", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "stretch", width: "100%", minHeight: GLASS_CART_FIELD_H }}>
        <span style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: compact ? 28 : 32,
          padding: compact ? "0 4px" : "0 6px",
          fontSize: compact ? 10 : 11,
          fontWeight: 700,
          color: C.muted,
          background: "#f1f5f9",
          border: "1px solid " + borderCol,
          borderRight: "none",
          borderRadius: compact ? "4px 0 0 4px" : "6px 0 0 6px",
        }}>{currencySymbol}</span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          value={displayVal}
          onChange={function (e) {
            var raw = e.target.value.replace(/[^\d.]/g, "");
            if (onChange) onChange(parseFloat(raw) || 0);
          }}
          onFocus={function (e) { e.target.select(); }}
          onKeyDown={onKeyDown}
          {...dataProps}
          style={{
            flex: "1 1 auto",
            minWidth: compact ? 36 : 64,
            width: 0,
            minHeight: GLASS_CART_FIELD_H,
            height: GLASS_CART_FIELD_H,
            border: "1px solid " + borderCol,
            borderRadius: compact ? "0 4px 4px 0" : "0 6px 6px 0",
            padding: compact ? "2px 5px" : "4px 8px",
            fontSize: compact ? 12 : 13,
            fontWeight: 700,
            textAlign: "right",
            fontFamily: "'JetBrains Mono', 'Consolas', monospace",
            outline: "none",
            background: bgCol,
            color: C.text || "#0f172a",
            boxSizing: "border-box",
            lineHeight: 1.2,
          }}
          onFocusCapture={function (e) {
            e.target.style.border = "1px solid " + (belowCost ? C.red : C.accent);
            e.target.style.background = belowCost ? "#fde8ed" : "#f0f4ff";
          }}
          onBlur={function (e) {
            e.target.style.border = "1px solid " + borderCol;
            e.target.style.background = bgCol;
          }}
          title={props.title || ""}
        />
      </div>
      {unitNote !== false ? (
        <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, marginTop: 4, textAlign: "center", minHeight: 13 }}>{unitNote || "per Sq Ft"}</div>
      ) : null}
    </div>
  );
};

var FIELD_H = GLASS_CART_FIELD_H;

var cellLabel = glassCartCellLabel;

var fieldStyle = function (C) {
  return glassCartFieldStyle(C);
};

var GlassCutFields = function (props) {
  var item = props.item;
  var C = props.C;
  var onChange = props.onChange;
  var onFieldKey = props.onFieldKey;
  var rowIndex = props.rowIndex;
  var disabled = !!props.disabled;
  var product = props.product;
  var compact = props.compact === true;

  var patch = function (fields) {
    onChange(recalcGlassCartLine(Object.assign({}, item, fields), product));
  };

  var keyProps = function (col) {
    return {
      "data-cartrow": rowIndex,
      "data-cartcol": col,
      disabled: disabled,
      onKeyDown: onFieldKey ? function (e) { onFieldKey(e, rowIndex, col); } : undefined,
      onFocus: function (e) {
        e.target.style.border = "1px solid " + C.accent;
        e.target.style.background = "#f0f4ff";
      },
      onBlur: function (e) {
        e.target.style.border = "1px solid " + C.border;
        e.target.style.background = "#fff";
      },
    };
  };

  var gridStyle = {
    display: "grid",
    gridTemplateColumns: compact ? "minmax(38px, 1fr) minmax(38px, 1fr) 50px 38px" : "minmax(56px, 1fr) minmax(56px, 1fr) 76px 56px",
    gap: compact ? 4 : 10,
    alignItems: "center",
    width: "100%",
  };

  return (
    <div style={gridStyle}>
      <div>
        {!compact && cellLabel("Width", C)}
        <input type="number" min="0" step="any" placeholder={compact ? "W" : "0"} value={item.glassWidth != null && item.glassWidth !== "" ? item.glassWidth : ""} onChange={function (e) { patch({ glassWidth: e.target.value }); }} style={fieldStyle(C)} {...keyProps(1)} />
      </div>
      <div>
        {!compact && cellLabel("Height", C)}
        <input type="number" min="0" step="any" placeholder={compact ? "H" : "0"} value={item.glassLength != null && item.glassLength !== "" ? item.glassLength : ""} onChange={function (e) { patch({ glassLength: e.target.value }); }} style={fieldStyle(C)} {...keyProps(2)} />
      </div>
      <div>
        {!compact && cellLabel("Unit", C)}
        <select value={item.glassDimensionUnit || "mm"} onChange={function (e) { patch({ glassDimensionUnit: e.target.value }); }} style={Object.assign({}, fieldStyle(C), { padding: compact ? "2px 3px" : "8px 6px", lineHeight: 1.2, fontSize: compact ? 11 : 14 })} {...keyProps(3)}>
          {GLASS_DIMENSION_UNITS.map(function (u) { return <option key={u} value={u}>{u}</option>; })}
        </select>
      </div>
      <div>
        {!compact && cellLabel("Pcs", C)}
        <input type="number" min="1" step="1" placeholder={compact ? "Pcs" : "1"} value={item.glassPieces != null ? item.glassPieces : 1} onChange={function (e) { patch({ glassPieces: e.target.value }); }} style={fieldStyle(C)} {...keyProps(4)} />
      </div>
    </div>
  );
};

var GlassLineExtras = function (props) {
  var item = props.item;
  var product = props.product;
  var C = props.C;
  var fmtNum = props.fmtNum;
  var getCurrencySymbol = props.getCurrencySymbol;
  var disabled = !!props.disabled;
  var onChange = props.onChange;
  var [costOpen, setCostOpen] = useState(false);

  var live = product ? recalcGlassCartLine(item, product) : item;
  var usedSqFt = Number(live.glassTotalSqFt) || 0;
  var availSqFt = product ? glassAvailableSqFt(product) : 0;
  var sym = getCurrencySymbol ? getCurrencySymbol() : "Rs";

  return (
    <div style={{ padding: "2px 0 0" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: usedSqFt > 0 ? C.blue : C.muted }}>
        {usedSqFt > 0 ? (fmtNum(usedSqFt) + " Sq Ft · " + sym + " " + fmtNum(glassLineAmount(live))) : "Enter width & height"}
      </div>
      {product && (
        <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
          Stock {fmtNum(availSqFt)} Sq Ft{usedSqFt > 0 ? (" · Left " + fmtNum(Math.max(0, availSqFt - usedSqFt))) : ""}
        </div>
      )}
      {product && (
        <button type="button" disabled={disabled} onClick={function () { setCostOpen(true); }} style={{ border: "1px solid " + (C.accent || "#2563eb"), background: "#fff", padding: "5px 12px", borderRadius: 6, fontSize: 10, fontWeight: 800, color: C.accent, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, marginTop: 8 }}>
          View cost &amp; pricing
        </button>
      )}
      {costOpen && product && (
        <GlassCostDetailsModal product={product} line={item} C={C} fmtNum={fmtNum} getCurrencySymbol={getCurrencySymbol} onClose={function () { setCostOpen(false); }} />
      )}
    </div>
  );
};

export { GlassCutFields, GlassLineExtras };

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

  return (
    <div style={{ minWidth: 0, padding: "4px 0", width: "100%" }}>
      <GlassCutFields item={item} product={product} C={C} rowIndex={rowIndex} onFieldKey={onFieldKey} disabled={disabled} onChange={onChange} />
      <GlassLineExtras item={item} product={product} C={C} fmtNum={fmtNum} getCurrencySymbol={getCurrencySymbol} disabled={disabled} onChange={onChange} />
    </div>
  );
};

export default GlassCartLine;
