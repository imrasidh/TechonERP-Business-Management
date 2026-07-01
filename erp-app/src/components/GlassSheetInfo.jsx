import React from "react";
import { GLASS_DIMENSION_UNITS, calcRectAreas } from "../utils/glassDimensions.js";
import { buildGlassSheetFields, isGlassModuleCategory, isGlassSheetUnit, getGlassSellRatePerSqFt } from "../utils/glassProduct.js";

var readOnlyBox = {
  background: "#f0f4ff",
  border: "1.5px solid #dbe3f5",
  borderRadius: 8,
  padding: "9px 13px",
  fontSize: 13,
  color: "#1e3a5f",
  fontWeight: 600,
};

/**
 * Glass Sheet Information — shown only when category is glass module and base unit is Sheet.
 */
var GlassSheetInfo = function (props) {
  var form = props.form;
  var setForm = props.setForm;
  var C = props.C;
  var Input = props.Input;
  var Sel = props.Sel;
  var category = form.category || "";

  if (!isGlassModuleCategory(category)) return null;
  if (!isGlassSheetUnit(form)) return null;

  var w = form.glassSheetWidth != null ? form.glassSheetWidth : "";
  var h = form.glassSheetHeight != null ? form.glassSheetHeight : "";
  var u = form.glassDimensionUnit || "mm";
  var areas = calcRectAreas(w, h, u);
  var mockProduct = { price: form.price, cost: form.cost, glassAreaSqFt: areas.sqFt, glassSellPricePerSqFt: form.glassSellPricePerSqFt };
  var sellPerSqFt = getGlassSellRatePerSqFt(mockProduct);

  var syncAreas = function (nextW, nextH, nextU) {
    var fields = buildGlassSheetFields(nextW, nextH, nextU);
    setForm(function (x) {
      return Object.assign({}, x, {
        glassSheetWidth: nextW,
        glassSheetHeight: nextH,
        glassDimensionUnit: nextU,
        glassAreaSqFt: fields.glassAreaSqFt,
        glassAreaSqM: fields.glassAreaSqM,
        glassAreaSqIn: fields.glassAreaSqIn,
        glassAreaSqCm: fields.glassAreaSqCm,
        glassAreaSqMm: fields.glassAreaSqMm,
        unit: x.unit || "Sheet",
      });
    });
  };

  return (
    <div style={{ border: "1.5px solid " + (C.border || "#e1e8f5"), borderRadius: 10, padding: "14px 16px", background: "#fafbff" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: C.cyan || "#0077e6", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
        Glass Sheet Information
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 12 }}>
        <Input
          label="Sheet Width"
          type="number"
          value={w}
          onChange={function (e) { syncAreas(e.target.value, h, u); }}
          placeholder="e.g. 3660"
        />
        <Input
          label="Sheet Height"
          type="number"
          value={h}
          onChange={function (e) { syncAreas(w, e.target.value, u); }}
          placeholder="e.g. 2440"
        />
        <Sel label="Dimension Unit" value={u} onChange={function (e) { syncAreas(w, h, e.target.value); }}>
          {GLASS_DIMENSION_UNITS.map(function (du) { return <option key={du} value={du}>{du}</option>; })}
        </Sel>
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
        Calculated sheet area (read only)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 }}>
        {[
          { label: "Sq Ft", val: areas.sqFt },
          { label: "Sq Meter", val: areas.sqM },
          { label: "Sq Inch", val: areas.sqIn },
          { label: "Sq Cm", val: areas.sqCm },
          { label: "Sq Mm", val: areas.sqMm },
        ].map(function (row) {
          return (
            <div key={row.label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 4 }}>{row.label}</div>
              <div style={readOnlyBox}>{row.val > 0 ? row.val : "—"}</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.45 }}>
        Enter sheet size once. All area conversions are calculated automatically and stored on this product.
        {sellPerSqFt > 0 && areas.sqFt > 0 && (
          <div style={{ marginTop: 6, fontWeight: 700, color: C.blue || "#0077e6" }}>
            Sell rate at POS: {sellPerSqFt} / Sq Ft (from sheet sell price)
          </div>
        )}
      </div>
    </div>
  );
};

export default GlassSheetInfo;
