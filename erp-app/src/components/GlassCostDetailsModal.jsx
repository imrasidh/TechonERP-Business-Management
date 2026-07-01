import React from "react";
import { glassProductEconomicsDetails } from "../utils/glassProduct.js";
import CloseIconButton from "./CloseIconButton.jsx";

var statCard = function (label, value, accent) {
  return (
    <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px", border: "1px solid #e8eef5", textAlign: "center" }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent || "#0f172a", marginTop: 6, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
};

var priceCard = function (title, rows, accent, sym) {
  return (
    <div style={{ flex: "1 1 0", minWidth: 0, background: "#fff", borderRadius: 12, border: "1.5px solid #e8eef5", overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", background: accent.bg, borderBottom: "1px solid #e8eef5" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: accent.label, textTransform: "uppercase", letterSpacing: "0.08em" }}>{title}</div>
      </div>
      <div style={{ padding: "4px 14px 12px" }}>
        {rows.map(function (row, idx) {
          return (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "10px 0", borderBottom: idx < rows.length - 1 ? "1px solid #f1f5f9" : "none" }}>
              <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>{row.label}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: accent.value, whiteSpace: "nowrap" }}>{sym} {row.val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

var GlassCostDetailsModal = function (props) {
  var product = props.product;
  var line = props.line;
  var C = props.C;
  var fmtNum = props.fmtNum;
  var getCurrencySymbol = props.getCurrencySymbol;
  var onClose = props.onClose;
  if (!product) return null;

  var d = glassProductEconomicsDetails(product, line, fmtNum, getCurrencySymbol);
  if (!d) return null;

  var accent = C.accent || "#2563eb";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Glass cost and pricing details"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 10050, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div
        onClick={function (e) { e.stopPropagation(); }}
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 620,
          maxHeight: "92vh",
          overflow: "auto",
          boxShadow: "0 28px 64px rgba(15,23,42,0.22)",
          border: "1px solid #e2e8f0",
        }}
      >
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #eef2f7", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, background: "linear-gradient(180deg, #f8fbff 0%, #fff 100%)" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: accent, textTransform: "uppercase", letterSpacing: "0.1em" }}>Glass pricing</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", marginTop: 6, lineHeight: 1.25 }}>{d.name}</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>
              Full sheet: <strong style={{ color: "#334155" }}>{d.sheetSize}</strong>
            </div>
          </div>
          <CloseIconButton onClick={onClose} size={36} tone="muted" />
        </div>

        <div style={{ padding: "20px 24px 24px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>One full sheet equals</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
            {statCard("Sq Ft", d.areas.sqFt > 0 ? d.fn(d.areas.sqFt) : "—", accent)}
            {statCard("Sq Meter", d.areas.sqM > 0 ? d.fn(d.areas.sqM) : "—", accent)}
            {statCard("In stock", d.fn(d.stock.sheets) + " sheets", "#0f172a")}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 20, lineHeight: 1.5 }}>
            Stock available: <strong style={{ color: "#475569" }}>{d.fn(d.stock.sqFt)} Sq Ft</strong> ({d.fn(d.stock.sqM)} Sq M)
          </div>

          <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
            {priceCard("Your cost (purchase)", [
              { label: "Per sheet", val: d.fn(d.cost.sheet) },
              { label: "Per Sq Ft", val: d.fn(d.cost.sqFt) },
              { label: "Per Sq M", val: d.fn(d.cost.sqM) },
            ], { bg: "#fef2f2", label: "#b91c1c", value: "#991b1b" }, d.sym)}
            {priceCard("Selling rate (POS)", [
              { label: "Per sheet", val: d.fn(d.sell.sheet) },
              { label: "Per Sq Ft", val: d.fn(d.sell.sqFt) },
              { label: "Per Sq M", val: d.fn(d.sell.sqM) },
            ], { bg: "#eff6ff", label: accent, value: accent }, d.sym)}
          </div>

          <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px", marginBottom: d.cut ? 16 : 0, border: "1px solid #eef2f7" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Other area units (reference)</div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
              {d.areas.sqIn > 0 ? (d.fn(d.areas.sqIn) + " Sq In") : "—"}
              {d.areas.sqCm > 0 ? (" · " + d.fn(d.areas.sqCm) + " Sq Cm") : ""}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
              POS sells by <strong>Sq Ft</strong> — sheet price is divided by Sq Ft per sheet.
            </div>
          </div>

          {d.cut && (
            <div style={{ background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)", borderRadius: 12, padding: "16px 18px", border: "1.5px solid #dbeafe" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Current cut on this line</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 12 }}>
                {statCard("Cut size", d.cut.size + " × " + d.cut.pieces, "#334155")}
                {statCard("Area", d.fn(d.cut.sqFt) + " Sq Ft", accent)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {statCard("Cost", d.sym + " " + d.fn(d.cut.cost), "#991b1b")}
                {statCard("Sell", d.sym + " " + d.fn(d.cut.sell), accent)}
                {statCard("Profit", d.sym + " " + d.fn(d.cut.profit), d.cut.profit >= 0 ? (C.green || "#16a34a") : (C.red || "#dc2626"))}
              </div>
            </div>
          )}

          {!d.cut && (
            <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "8px 0 0", fontStyle: "italic" }}>
              Enter width &amp; height on the sale line to see cut profit here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GlassCostDetailsModal;
