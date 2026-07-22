import React from "react";

/**
 * Money In / Money Out receipt — invoice-style layout (same family as InvoiceA4).
 */
export function MoneyReceiptDoc(props) {
  var receipt = props.receipt || {};
  var mode = props.mode === "out" ? "out" : "in";
  var isIn = mode === "in";
  var settings = props.settings || {};
  var fmtDateFull = props.fmtDateFull || function (d) { return d || "—"; };
  var fmtNum = props.fmtNum || function (n) { return Number(n || 0).toLocaleString(); };
  var getCurrencySymbol = props.getCurrencySymbol || function () { return "Rs"; };
  var size = props.size || "a4";
  var isA5 = size === "a5";

  var accent = "#1a4fa0";
  var shopName = settings.shopName || "TechonERP";
  var logo = settings.invoiceLogo;
  var logoW = settings.invoiceLogoSize || 80;
  var receiptNo = receipt.receiptNo || receipt.reference || (receipt.id || "").slice(0, 8);
  var partyName = isIn
    ? (receipt.source || receipt.person || "—")
    : (receipt.person || receipt.source || "—");
  var partyLabel = isIn ? "Received From" : "Paid To";
  var docTitle = isIn ? "RECEIPT" : "PAYMENT RECEIPT";
  var amountLabel = isIn ? "Amount Received" : "Amount Paid";
  var methodLabel = isIn ? "Received Via" : "Paid Via";
  var mw = isA5 ? 560 : 794;
  var pad = 24;
  var px = pad + "px";
  var fs = 11;
  var pageMinH = isA5 ? "794px" : "1123px";

  var now = new Date();
  var tStr = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");

  return (
    <div
      className={"erp-money-rcp-doc is-invoice" + (isIn ? " is-in" : " is-out")}
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
      {/* Header — same pattern as sales invoice */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "24px " + px + " 16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {logo ? <img src={logo} alt={shopName} style={{ width: logoW, height: "auto", objectFit: "contain", display: "block" }} /> : null}
            {!logo ? <div style={{ fontSize: 20, fontWeight: 900, color: accent, letterSpacing: "-0.02em", textTransform: "uppercase" }}>{shopName}</div> : null}
          </div>
          <div style={{ lineHeight: 1.7 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: accent, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 2 }}>{shopName}</div>
            {settings.address ? <div style={{ fontSize: fs - 1, color: "#555" }}>{settings.address}</div> : null}
            {settings.phone ? <div style={{ fontSize: fs - 1, color: "#555" }}>Tel: {settings.phone}{settings.phone2 ? " / " + settings.phone2 : ""}</div> : null}
            {settings.email ? <div style={{ fontSize: fs - 1, color: "#555" }}>{settings.email}</div> : null}
            {settings.website ? <div style={{ fontSize: fs - 1, color: "#555" }}>{settings.website}</div> : null}
            {settings.brn ? <div style={{ fontSize: fs - 1, color: "#555" }}>BRN: {settings.brn}</div> : null}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: accent, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1, marginBottom: 10 }}>{docTitle}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: fs }}>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 14 }}>
              <span style={{ color: "#888" }}>Receipt No:</span>
              <span style={{ fontWeight: 700, color: "#111", fontFamily: "monospace", minWidth: 120, textAlign: "right" }}>{receiptNo}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 14 }}>
              <span style={{ color: "#888" }}>Date:</span>
              <span style={{ fontWeight: 600, minWidth: 120, textAlign: "right" }}>{fmtDateFull(receipt.date)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 14 }}>
              <span style={{ color: "#888" }}>Time:</span>
              <span style={{ fontWeight: 600, minWidth: 120, textAlign: "right" }}>{tStr}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 14 }}>
              <span style={{ color: "#888" }}>Type:</span>
              <span style={{ fontWeight: 700, minWidth: 120, textAlign: "right" }}>{isIn ? "Money In" : "Money Out"}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ margin: "0 " + px, borderTop: "2px solid " + accent, marginBottom: 14 }} />

      {/* Party */}
      <div style={{ padding: "0 " + px, marginBottom: 14 }}>
        <div style={{ fontSize: fs + 1, fontWeight: 800, color: accent, marginBottom: 6 }}>{partyLabel}:</div>
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: fs, color: "#333" }}>
            <span style={{ color: "#888" }}>Name: </span>
            <span style={{ fontWeight: 600 }}>{partyName}</span>
          </div>
          {receipt.partyKind ? (
            <div style={{ fontSize: fs, color: "#333" }}>
              <span style={{ color: "#888" }}>Party: </span>
              <span>{receipt.partyKind}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Details table — invoice style */}
      <div style={{ padding: "0 " + px, flex: 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: accent, color: "#fff" }}>
              <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, width: 40 }}>#</th>
              <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10 }}>Description</th>
              <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, width: 140 }}>Method</th>
              <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 10, width: 130 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <td style={{ padding: "8px 10px", fontSize: fs, color: "#888" }}>1</td>
              <td style={{ padding: "8px 10px", fontSize: fs, fontWeight: 600 }}>
                <div>{receipt.type || (isIn ? "Money In" : "Money Out")}</div>
                {receipt.note ? <div style={{ fontSize: 10, color: "#888", fontWeight: 500, marginTop: 2 }}>{receipt.note}</div> : null}
                {receipt.reference ? <div style={{ fontSize: 10, color: "#888", fontWeight: 500, marginTop: 2 }}>Ref: {receipt.reference}</div> : null}
              </td>
              <td style={{ padding: "8px 10px", fontSize: fs }}>{receipt.paymentMethod || "Cash"}</td>
              <td style={{ padding: "8px 10px", fontSize: fs, textAlign: "right", fontWeight: 700 }}>{fmtNum(receipt.amount)}</td>
            </tr>
            {/* padded empty rows for invoice look */}
            {[2, 3, 4, 5].map(function (n) {
              return (
                <tr key={n} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px", height: 28 }}>&nbsp;</td>
                  <td />
                  <td />
                  <td />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer totals */}
      <div style={{ padding: "16px " + px + " 28px", display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-end" }}>
        <div style={{ fontSize: fs, color: "#555", lineHeight: 1.7, maxWidth: 320 }}>
          <div><strong>{methodLabel}:</strong> {receipt.paymentMethod || "Cash"}</div>
          <div style={{ marginTop: 4, color: "#888", fontSize: 10 }}>
            This is a computer-generated {isIn ? "money-in" : "money-out"} receipt.
          </div>
        </div>
        <div style={{ minWidth: 220 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: fs }}>
            <span style={{ color: "#666" }}>{amountLabel}</span>
            <span style={{ fontWeight: 700 }}>{getCurrencySymbol()} {fmtNum(receipt.amount)}</span>
          </div>
          <div style={{ background: accent, color: "#fff", borderRadius: 6, padding: "10px 14px", display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
            <span>GRAND TOTAL</span>
            <span>{getCurrencySymbol()} {fmtNum(receipt.amount)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MoneyReceiptDoc;
