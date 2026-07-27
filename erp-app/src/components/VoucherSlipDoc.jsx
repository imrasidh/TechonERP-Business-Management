import React from "react";
import { DocPrintHeader, DocPrintFooter, DOC_PRINT_ACCENT } from "./DocPrintHeader.jsx";

/**
 * Wide payment/expense voucher — A5 landscape half slip (wide, compact).
 * Used for Expense, Money In, and Money Out proofs.
 */
export function VoucherSlipDoc(props) {
  var variant = props.variant || "expense";
  var settings = props.settings || {};
  var fmtDateFull = props.fmtDateFull || function (d) { return d || "—"; };
  var fmtNum = props.fmtNum || function (n) { return Number(n || 0).toLocaleString(); };
  var getCurrencySymbol = props.getCurrencySymbol || function () { return "Rs"; };
  var accent = DOC_PRINT_ACCENT;
  var pad = 22;
  var px = pad + "px";
  var fs = 11;

  /* A5 landscape = 794×560; half-height wide slip */
  var slipW = 794;
  var slipMinH = 340;

  var isExpense = variant === "expense";
  var isIn = variant === "money-in";
  var isOut = variant === "money-out";

  var docTitle = isExpense
    ? "EXPENSE VOUCHER"
    : (isIn ? "MONEY IN RECEIPT" : "MONEY OUT RECEIPT");

  var amountLabel = isExpense
    ? "Amount Paid"
    : (isIn ? "Amount Received" : "Amount Paid");

  var partyLabel = isExpense
    ? "Payee"
    : (isIn ? "Received From" : "Paid To");

  var data = props.data || {};
  var docNo = props.docNo || data.receiptNo || data.reference || (data.id || "").slice(0, 8) || "—";
  var date = data.date || "";
  var amount = Number(data.amount) || 0;
  var partyName = isExpense
    ? (data.payee || data.description || "—")
    : (isIn ? (data.source || data.person) : (data.person || data.source)) || "—";
  var method = data.cashMethod || data.payMode || data.paymentMethod || "Cash";
  var category = data.category || data.type || "";
  var description = data.description || data.note || "";
  var note = data.note && data.description && data.note !== data.description ? data.note : "";
  var reference = data.reference || "";

  var metaRows = [
    { label: "Voucher No:", value: docNo, mono: true },
    { label: "Date:", value: fmtDateFull(date) },
  ];
  if (isExpense && category) metaRows.push({ label: "Category:", value: category });
  if (!isExpense) metaRows.push({ label: "Type:", value: isIn ? "Money In" : "Money Out" });
  if (reference) metaRows.push({ label: "Reference:", value: reference, mono: true });

  var detailRows = [];
  if (isExpense) {
    if (description) detailRows.push({ label: "Description", value: description });
    detailRows.push({ label: "Payment method", value: method });
    if (note) detailRows.push({ label: "Note", value: note });
  } else {
    if (category) detailRows.push({ label: "Purpose", value: category });
    if (description) detailRows.push({ label: "Details", value: description });
    detailRows.push({ label: method === "Bank" || method === "Card" ? "Paid via" : "Received via", value: method });
    if (data.partyKind) detailRows.push({ label: "Party type", value: data.partyKind });
  }

  return (
    <div
      className={"erp-voucher-slip is-" + variant}
      style={{
        fontFamily: "'Segoe UI', Arial, sans-serif",
        background: "#fff",
        width: slipW,
        maxWidth: "100%",
        margin: "0 auto",
        color: "#111",
        minHeight: slipMinH,
        boxSizing: "border-box",
        border: "1px solid #e2e8f0",
        borderRadius: 4,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <DocPrintHeader
        settings={settings}
        title={docTitle}
        padPx={pad}
        showTopbar
        showLogo={false}
        previewMode
        contactLabels={{ phone: "Tel:", email: "Email:", brn: "BRN:" }}
        metaRows={metaRows}
      />

      <div style={{ padding: "12px " + px + " 16px", flex: 1, display: "flex", gap: 20, alignItems: "stretch" }}>
        {/* Left — party & details */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: accent, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            {partyLabel}
          </div>
          <div style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "12px 14px",
            background: "#fafbff",
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", lineHeight: 1.3, wordBreak: "break-word" }}>
              {partyName}
            </div>
            {isExpense && category ? (
              <div style={{ marginTop: 6, display: "inline-block", background: accent + "14", color: accent, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>
                {category}
              </div>
            ) : null}
          </div>

          {detailRows.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: fs }}>
              <tbody>
                {detailRows.map(function (row, i) {
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "6px 0", color: "#64748b", fontWeight: 600, width: "38%", verticalAlign: "top" }}>{row.label}</td>
                      <td style={{ padding: "6px 0", color: "#0f172a", fontWeight: 500, wordBreak: "break-word" }}>{row.value}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>

        {/* Right — amount highlight */}
        <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{
            border: "2px solid " + accent,
            borderRadius: 10,
            padding: "16px 18px",
            textAlign: "center",
            background: "linear-gradient(180deg, #f8fafc 0%, #fff 100%)",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              {amountLabel}
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: accent, lineHeight: 1.1 }}>
              {getCurrencySymbol()} {fmtNum(amount)}
            </div>
            <div style={{ marginTop: 10, fontSize: 10, color: "#64748b", fontWeight: 600 }}>
              {method}
            </div>
          </div>
        </div>
      </div>

      {/* Signature + shared invoice footer text */}
      <div style={{
        padding: "10px " + px + " 0",
        borderTop: "1px solid #e5e7eb",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: 16,
        background: "#f8fafc",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 18 }}>Authorized signature</div>
          <div style={{ borderBottom: "1px solid #cbd5e1", width: 180, height: 1 }} />
        </div>
        <div style={{ fontSize: 9, color: "#94a3b8", textAlign: "right", maxWidth: 280, lineHeight: 1.4 }}>
          Computer-generated {isExpense ? "expense voucher" : (isIn ? "money-in receipt" : "money-out receipt")}.
          {settings.shopName ? " · " + settings.shopName : ""}
        </div>
      </div>
      <DocPrintFooter
        settings={settings}
        accent={accent}
        padPx={pad}
        compact
        withSpacer={false}
        kind={isExpense ? "expense" : (isIn ? "money_in" : "money_out")}
      />
    </div>
  );
}

export default VoucherSlipDoc;
