import React from "react";

/**
 * Formal Purchase Invoice document (mirrors sales InvoiceA4 layout).
 * Renders from the live purchase record — no separate HTML store.
 */
export function PurchaseInvoiceDoc(props) {
  var pur = props.pur || {};
  var settings = props.settings || {};
  var fmtDateFull = props.fmtDateFull || function (d) { return d || "—"; };
  var fmtNum = props.fmtNum || function (n) { return Number(n || 0).toLocaleString(); };
  var getCurrencySymbol = props.getCurrencySymbol || function () { return "Rs"; };
  var fmtStock = props.fmtStock || function (q, u) { return String(q || 0) + (u ? " " + u : ""); };

  var size = props.size || "a4";
  var isA5 = size === "a5";
  var accent = "#1a4fa0";
  var shopName = settings.shopName || "TechonERP";
  var logo = settings.invoiceLogo;
  var logoW = settings.invoiceLogoSize || 80;
  var items = pur.items || [];
  var paid = Number(pur.paidAmount || 0);
  var total = Number(pur.total || 0);
  var balance = Math.max(0, total - paid);
  var mw = isA5 ? 560 : 794;
  var pad = 24;
  var px = pad + "px";
  var fs = 11;
  var pageMinH = isA5 ? "794px" : "1123px";

  var now = new Date();
  var tStr = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");

  return (
    <div
      className="erp-pur-inv-doc"
      style={{
        fontFamily: "'Segoe UI',Arial,sans-serif",
        background: "#fff",
        width: mw,
        margin: "0 auto",
        color: "#111",
        minHeight: pageMinH,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "24px " + px + " 16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {logo ? <img src={logo} alt={shopName} style={{ width: logoW, height: "auto", objectFit: "contain" }} /> : null}
            {!logo ? <div style={{ fontSize: 20, fontWeight: 900, color: accent, textTransform: "uppercase" }}>{shopName}</div> : null}
          </div>
          <div style={{ lineHeight: 1.7 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: accent, textTransform: "uppercase", marginBottom: 2 }}>{shopName}</div>
            {settings.address ? <div style={{ fontSize: fs - 1, color: "#555" }}>{settings.address}</div> : null}
            {settings.phone ? <div style={{ fontSize: fs - 1, color: "#555" }}>Tel: {settings.phone}{settings.phone2 ? " / " + settings.phone2 : ""}</div> : null}
            {settings.email ? <div style={{ fontSize: fs - 1, color: "#555" }}>{settings.email}</div> : null}
            {settings.brn ? <div style={{ fontSize: fs - 1, color: "#555" }}>BRN: {settings.brn}</div> : null}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
            Purchase Invoice
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: fs }}>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 14 }}>
              <span style={{ color: "#888" }}>Invoice No:</span>
              <span style={{ fontWeight: 700, fontFamily: "monospace", minWidth: 120, textAlign: "right" }}>{pur.invoiceNo || pur.id}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 14 }}>
              <span style={{ color: "#888" }}>Date:</span>
              <span style={{ fontWeight: 600, minWidth: 120, textAlign: "right" }}>{fmtDateFull(pur.date)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 14 }}>
              <span style={{ color: "#888" }}>Time:</span>
              <span style={{ fontWeight: 600, minWidth: 120, textAlign: "right" }}>{tStr}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 14 }}>
              <span style={{ color: "#888" }}>Status:</span>
              <span style={{ fontWeight: 700, minWidth: 120, textAlign: "right" }}>{pur.status || (balance <= 0 ? "Paid" : "Unpaid")}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ margin: "0 " + px, borderTop: "2px solid " + accent, marginBottom: 14 }} />

      <div style={{ padding: "0 " + px, marginBottom: 14 }}>
        <div style={{ fontSize: fs + 1, fontWeight: 800, color: accent, marginBottom: 6 }}>Supplier:</div>
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
          <div style={{ fontSize: fs, fontWeight: 700 }}>{pur.supplier || "—"}</div>
          {pur.payMode ? <div style={{ fontSize: fs - 1, color: "#666", marginTop: 2 }}>Pay mode: {pur.payMode}</div> : null}
          {pur.note ? <div style={{ fontSize: fs - 1, color: "#666", marginTop: 2 }}>Note: {pur.note}</div> : null}
        </div>
      </div>

      <div style={{ padding: "0 " + px, flex: 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: accent, color: "#fff" }}>
              <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, width: 36 }}>#</th>
              <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10 }}>Product description</th>
              <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 10, width: 110 }}>Qty / Unit</th>
              <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 10, width: 110 }}>Cost</th>
              <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 10, width: 120 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {(items.length ? items : [{ name: "—", qty: 0, cost: 0 }]).map(function (it, i) {
              var unitCost = it.cost != null ? it.cost : (it.price || 0);
              var line = (Number(it.qty) || 0) * (Number(unitCost) || 0);
              return (
                <tr key={i} style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "7px 10px", fontSize: fs, color: "#888" }}>{i + 1}</td>
                  <td style={{ padding: "7px 10px", fontSize: fs, fontWeight: 600 }}>{it.name || "Item"}</td>
                  <td style={{ padding: "7px 10px", fontSize: fs, textAlign: "right" }}>{fmtStock(it.qty, it.unit)}</td>
                  <td style={{ padding: "7px 10px", fontSize: fs, textAlign: "right" }}>{fmtNum(unitCost)}</td>
                  <td style={{ padding: "7px 10px", fontSize: fs, textAlign: "right", fontWeight: 700 }}>{fmtNum(line)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: "16px " + px + " 28px", display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-end" }}>
        <div style={{ fontSize: fs, color: "#555", lineHeight: 1.6 }}>
          <div><strong>Payment:</strong> {getCurrencySymbol()} {fmtNum(paid)} paid</div>
          <div><strong>Balance due:</strong> {getCurrencySymbol()} {fmtNum(balance)}</div>
        </div>
        <div style={{ minWidth: 220 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: fs }}>
            <span style={{ color: "#666" }}>Subtotal</span>
            <span style={{ fontWeight: 700 }}>{getCurrencySymbol()} {fmtNum(total)}</span>
          </div>
          <div style={{ background: accent, color: "#fff", borderRadius: 6, padding: "10px 14px", display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
            <span>GRAND TOTAL</span>
            <span>{getCurrencySymbol()} {fmtNum(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PurchaseInvoiceDoc;
