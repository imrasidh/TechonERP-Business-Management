import React from "react";

/**
 * Shows linked return rows (read-only). mode: "sale" | "purchase"
 */
var ReturnDetailsPanel = function (props) {
  var rows = props.rows || [];
  var C = props.C;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var fmtDateFull = props.fmtDateFull;
  var mode = props.mode || "sale";
  var originalId = props.originalId || "";
  if (!rows.length) return null;

  return (
    <div style={{ marginTop: 14, padding: "14px 16px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#c2410c", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Return details</div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, lineHeight: 1.45 }}>
        Linked to original {mode === "purchase" ? "purchase" : "invoice"} ID <span style={{ fontFamily: "monospace", fontWeight: 700, color: C.text }}>{originalId || "—"}</span>
        {" · "}Each row is one return line recorded in the returns register.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#ffedd5", borderBottom: "1px solid #fdba74" }}>
              <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 800, color: C.muted, fontSize: 10, textTransform: "uppercase" }}>Return date</th>
              <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 800, color: C.muted, fontSize: 10, textTransform: "uppercase" }}>Reference</th>
              <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 800, color: C.muted, fontSize: 10, textTransform: "uppercase" }}>Product</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 800, color: C.muted, fontSize: 10, textTransform: "uppercase" }}>Qty</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 800, color: C.muted, fontSize: 10, textTransform: "uppercase" }}>Amount</th>
              <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 800, color: C.muted, fontSize: 10, textTransform: "uppercase" }}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(function (r, i) {
              return (
                <tr key={r.id || i} style={{ borderBottom: "1px solid " + C.borderLight, background: i % 2 === 0 ? "#fff" : "#fffdfb" }}>
                  <td style={{ padding: "8px 10px", color: C.text }}>{fmtDateFull ? fmtDateFull(r.date) : r.date}</td>
                  <td style={{ padding: "8px 10px", fontFamily: "monospace", fontWeight: 700, color: mode === "purchase" ? C.orange : C.red }}>{r.returnId || r.id.slice(0, 8)}</td>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{r.productName || "—"}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>{r.qty != null ? r.qty : "—"}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 800, color: mode === "purchase" ? C.orange : C.red }}>{getCurrencySymbol()} {fmtNum(r.amount || 0)}</td>
                  <td style={{ padding: "8px 10px", color: C.muted, maxWidth: 220 }}>{r.reason || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: "#9a3412", fontWeight: 600 }}>
        Totals: {rows.reduce(function (a, r) { return a + (Number(r.qty) || 0); }, 0)} units · {getCurrencySymbol()}{" "}
        {fmtNum(rows.reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0))} returned (goods value)
      </div>
    </div>
  );
};

export default ReturnDetailsPanel;
