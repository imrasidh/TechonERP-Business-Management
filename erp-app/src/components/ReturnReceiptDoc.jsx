import React from "react";
import { DocPrintHeader, DocPrintFooter, DOC_PRINT_ACCENT } from "./DocPrintHeader.jsx";

/**
 * Sales / purchase return credit-debit note — shows source invoice and returned lines.
 */
export function ReturnReceiptDoc(props) {
  var data = props.data || {};
  var mode = data.mode === "purchase" ? "purchase" : "sales";
  var rows = Array.isArray(data.rows) ? data.rows : [];
  var parent = data.parent || null;
  var settings = props.settings || {};
  var fmtDateFull = props.fmtDateFull || function (d) { return d || "—"; };
  var fmtNum = props.fmtNum || function (n) { return Number(n || 0).toLocaleString(); };
  var getCurrencySymbol = props.getCurrencySymbol || function () { return "Rs"; };
  var size = props.size || "a4";
  var isA5 = size === "a5";
  var accent = DOC_PRINT_ACCENT;
  var mw = isA5 ? 560 : 794;
  var pad = 24;
  var px = pad + "px";
  var fs = 11;
  var pageMinH = isA5 ? "794px" : "1123px";
  var head = rows[0] || {};
  var returnNo = head.returnId || head.id || "—";
  var party = mode === "sales"
    ? (head.customer || head.customerName || "Walk-in")
    : (head.supplier || "Supplier");
  var sourceNo = mode === "sales"
    ? (head.invoiceNo || (parent && parent.invoiceNo) || "—")
    : (head.purchaseNo || (parent && parent.invoiceNo) || "—");
  var totalGross = rows.reduce(function (a, r) {
    return a + (Number(r.returnGross != null ? r.returnGross : r.amount) || 0);
  }, 0);
  var totalNet = rows.reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0);
  var totalTax = rows.reduce(function (a, r) { return a + (Number(r.returnTax) || 0); }, 0);
  var refundAmt = rows.reduce(function (a, r) { return a + (Number(r.refundAmount) || 0); }, 0);
  var hasRefund = refundAmt > 0.005;
  var title = mode === "sales" ? "SALES RETURN NOTE" : "PURCHASE RETURN NOTE";

  return (
    <div
      className="erp-return-rcp-doc"
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
      <DocPrintHeader
        settings={settings}
        title={title}
        padPx={pad}
        showTopbar
        showLogo={false}
        contactLabels={{ phone: "Tel:", email: "Email:", brn: "BRN:" }}
        metaRows={[
          { label: "Return No:", value: returnNo, mono: true },
          { label: "Date:", value: fmtDateFull(head.date) },
          { label: mode === "sales" ? "Customer:" : "Supplier:", value: party },
          { label: mode === "sales" ? "Source Invoice:" : "Source Purchase:", value: sourceNo, mono: true },
        ]}
      />

      <div style={{ padding: "0 " + px, marginBottom: 14 }}>
        <div style={{ fontSize: fs + 1, fontWeight: 800, color: accent, marginBottom: 6 }}>
          Returned items
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: accent, color: "#fff" }}>
              <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, width: 36 }}>#</th>
              <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10 }}>Product</th>
              <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 10, width: 72 }}>Qty</th>
              <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 10, width: 110 }}>Amount</th>
              <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10 }}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(function (r, i) {
              var lineAmt = Number(r.returnGross != null ? r.returnGross : r.amount) || 0;
              return (
                <tr key={r.id || i} style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "7px 10px", fontSize: fs, color: "#888" }}>{i + 1}</td>
                  <td style={{ padding: "7px 10px", fontSize: fs, fontWeight: 600 }}>{r.productName || "Item"}</td>
                  <td style={{ padding: "7px 10px", fontSize: fs, textAlign: "right" }}>{r.qty || 0}</td>
                  <td style={{ padding: "7px 10px", fontSize: fs, textAlign: "right", fontWeight: 700 }}>{fmtNum(lineAmt)}</td>
                  <td style={{ padding: "7px 10px", fontSize: fs - 1, color: "#555" }}>{r.reason || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: "8px " + px + " 8px", marginLeft: "auto", width: isA5 ? 280 : 320 }}>
        <div style={{ borderTop: "2px solid " + accent, paddingTop: 10 }}>
          {totalTax > 0.005 ? (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: fs, marginBottom: 4 }}>
              <span>Net goods</span><span>{getCurrencySymbol()} {fmtNum(totalNet)}</span>
            </div>
          ) : null}
          {totalTax > 0.005 ? (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: fs, marginBottom: 4 }}>
              <span>Tax reversed</span><span>{getCurrencySymbol()} {fmtNum(totalTax)}</span>
            </div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: fs + 2, fontWeight: 800, color: accent, marginTop: 6 }}>
            <span>Return total</span>
            <span>{getCurrencySymbol()} {fmtNum(totalGross || totalNet)}</span>
          </div>
          <div style={{ marginTop: 10, fontSize: fs, color: "#444", lineHeight: 1.5 }}>
            {hasRefund ? (
              <span>
                Settlement: <strong>{getCurrencySymbol()} {fmtNum(refundAmt)}</strong> refunded via {head.refundMethod || "Cash/Bank"}.
              </span>
            ) : (
              <span>Settlement: outstanding balance reduced on {mode === "sales" ? "customer account" : "supplier account"}.</span>
            )}
          </div>
          {sourceNo && sourceNo !== "—" ? (
            <div style={{ marginTop: 8, fontSize: fs - 1, color: "#666" }}>
              Original {mode === "sales" ? "invoice" : "purchase"}: <strong>{sourceNo}</strong>
            </div>
          ) : null}
        </div>
      </div>

      <DocPrintFooter
        settings={settings}
        accent={accent}
        padPx={pad}
        kind={mode === "sales" ? "sales_return" : "purchase_return"}
      />
    </div>
  );
}
