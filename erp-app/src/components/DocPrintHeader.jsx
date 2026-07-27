import React from "react";

/** Canonical print letterhead accent (Business Performance Report / Accounts Hub). */
export var DOC_PRINT_ACCENT = "#0d1b3e";

function resolvePrintedOn(printedOn) {
  if (printedOn != null && printedOn !== "") return String(printedOn);
  try { return new Date().toLocaleString(); } catch (e) { return ""; }
}

/** Allow only safe image URLs for invoice logos (block javascript: etc.). */
export function safeInvoiceLogoSrc(logo) {
  var s = String(logo == null ? "" : logo).trim();
  if (!s) return null;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(s)) return s;
  if (/^https:\/\//i.test(s)) return s;
  if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(s)) return s;
  return null;
}

function contactLines(settings, labels) {
  labels = labels || {};
  var phoneLabel = labels.phone != null ? labels.phone : "Tel:";
  var emailLabel = labels.email != null ? labels.email : "Email:";
  var brnLabel = labels.brn != null ? labels.brn : "BRN:";
  var lines = [];
  if (settings.address) lines.push({ key: "addr", text: settings.address });
  if (settings.phone) {
    lines.push({
      key: "phone",
      text: phoneLabel + " " + settings.phone + (settings.phone2 ? " / " + settings.phone2 : ""),
    });
  }
  if (settings.email) lines.push({ key: "email", text: emailLabel + " " + settings.email });
  if (settings.website) lines.push({ key: "web", text: settings.website });
  if (settings.brn) lines.push({ key: "brn", text: brnLabel + " " + settings.brn });
  return lines;
}

/**
 * Universal ERP print heading — same letterhead as Business Performance Report:
 * left shop + contact lines, right title + Printed (+ optional meta rows), navy rule.
 */
export function DocPrintHeader(props) {
  var settings = props.settings || {};
  var accent = props.accent || DOC_PRINT_ACCENT;
  var title = props.title || "";
  var metaRows = Array.isArray(props.metaRows) ? props.metaRows : [];
  var previewMode = !!props.previewMode;
  var pad = props.padPx != null ? props.padPx : (previewMode ? 16 : 24);
  var px = pad + "px";
  var showPrinted = props.showPrinted !== false;
  var printedOn = resolvePrintedOn(props.printedOn);
  var showTopbar = !!props.showTopbar;
  var showLogo = props.showLogo !== false;
  var labels = props.contactLabels || {};
  var ruleMb = props.ruleMarginBottom != null ? props.ruleMarginBottom : (previewMode ? 8 : 12);

  var shopName = settings.shopName || "Techon ERP";
  var logo = showLogo ? safeInvoiceLogoSrc(settings.invoiceLogo) : null;
  var logoW = settings.invoiceLogoSize || 72;
  if (previewMode && logoW > 56) logoW = 56;
  var lines = contactLines(settings, labels);
  var metaFs = previewMode ? 10 : 11;

  return (
    <>
      {showTopbar ? (
        <div style={{ height: 6, background: accent, margin: "0 0 " + (previewMode ? 8 : 12) + "px" }} />
      ) : null}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 14,
          alignItems: "flex-start",
          padding: (previewMode ? "8px " : "0 ") + px + " 10px",
          borderBottom: "2.5px solid " + accent,
          marginBottom: ruleMb,
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          {logo ? (
            <img
              src={logo}
              alt={shopName}
              style={{ width: logoW, height: "auto", objectFit: "contain", display: "block", marginBottom: 6 }}
            />
          ) : null}
          <div
            style={{
              fontSize: previewMode ? 16 : 20,
              fontWeight: 800,
              color: accent,
              textTransform: "uppercase",
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
            }}
          >
            {shopName}
          </div>
          {lines.length ? (
            <div style={{ fontSize: metaFs, color: "#555", lineHeight: 1.45, marginTop: 3 }}>
              {lines.map(function (ln) {
                return <div key={ln.key}>{ln.text}</div>;
              })}
            </div>
          ) : null}
        </div>
        <div style={{ textAlign: "right", flex: "0 0 auto", maxWidth: "48%" }}>
          <div
            style={{
              fontSize: previewMode ? 12 : 14,
              fontWeight: 800,
              color: accent,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              lineHeight: 1.25,
            }}
          >
            {title}
          </div>
          {showPrinted && printedOn ? (
            <div style={{ fontSize: metaFs, color: "#444", marginTop: 3 }}>Printed: {printedOn}</div>
          ) : null}
          {metaRows.map(function (row, i) {
            if (!row || row.hide || (row.value == null && row.value !== 0)) return null;
            return (
              <div key={i} style={{ fontSize: metaFs, color: "#444", marginTop: 2 }}>
                {row.label ? <span style={{ color: "#64748b" }}>{row.label} </span> : null}
                <span
                  style={{
                    fontWeight: row.mono ? 700 : 650,
                    fontFamily: row.mono ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" : "inherit",
                    color: "#111",
                  }}
                >
                  {row.value}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/**
 * HTML twin of DocPrintHeader for string-built print windows.
 */
export function buildDocPrintHeaderHtml(opts) {
  opts = opts || {};
  var settings = opts.settings || {};
  var accent = opts.accent || DOC_PRINT_ACCENT;
  var title = opts.title || "";
  var metaRows = Array.isArray(opts.metaRows) ? opts.metaRows : [];
  var pad = opts.padPx != null ? opts.padPx : 0;
  var escapeHtml = typeof opts.escapeHtml === "function" ? opts.escapeHtml : function (s) { return String(s == null ? "" : s); };
  var labels = opts.contactLabels || {};
  var showPrinted = opts.showPrinted !== false;
  var printedOn = resolvePrintedOn(opts.printedOn);
  var showTopbar = !!opts.showTopbar;
  var showLogo = opts.showLogo !== false;
  var ruleMb = opts.ruleMarginBottom != null ? opts.ruleMarginBottom : 12;
  var shopName = settings.shopName || "Techon ERP";
  var logo = showLogo ? safeInvoiceLogoSrc(settings.invoiceLogo) : null;
  var logoW = settings.invoiceLogoSize || 72;
  var lines = contactLines(settings, labels);
  var px = pad ? (pad + "px") : "0";

  var html = "";
  if (showTopbar) {
    html += "<div style='height:6px;background:" + accent + ";margin:0 0 12px;'></div>";
  }
  html += "<div style='display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:0 " + px + " 10px;border-bottom:2.5px solid " + accent + ";margin-bottom:" + ruleMb + "px;'>";
  html += "<div style='min-width:0;flex:1 1 auto;'>";
  if (logo) {
    html += "<img src='" + String(logo).replace(/'/g, "&#39;") + "' alt='" + escapeHtml(shopName)
      + "' style='width:" + logoW + "px;height:auto;object-fit:contain;display:block;margin-bottom:6px'/>";
  }
  html += "<div style='font-size:20px;font-weight:800;color:" + accent + ";text-transform:uppercase;letter-spacing:-0.02em;line-height:1.15;'>"
    + escapeHtml(shopName) + "</div>";
  if (lines.length) {
    html += "<div style='font-size:11px;color:#555;line-height:1.45;margin-top:3px;'>";
    lines.forEach(function (ln, i) {
      html += escapeHtml(ln.text);
      if (i < lines.length - 1) html += "<br/>";
    });
    html += "</div>";
  }
  html += "</div>";
  html += "<div style='text-align:right;flex:0 0 auto;max-width:48%;'>";
  html += "<div style='font-size:14px;font-weight:800;color:" + accent + ";text-transform:uppercase;letter-spacing:0.04em;line-height:1.25;'>"
    + escapeHtml(title) + "</div>";
  if (showPrinted && printedOn) {
    html += "<div style='font-size:11px;color:#444;margin-top:3px;'>Printed: " + escapeHtml(printedOn) + "</div>";
  }
  metaRows.forEach(function (row) {
    if (!row || row.hide || (row.value == null && row.value !== 0)) return;
    html += "<div style='font-size:11px;color:#444;margin-top:2px;'>";
    if (row.label) html += "<span style='color:#64748b;'>" + escapeHtml(row.label) + " </span>";
    html += "<span style='font-weight:" + (row.mono ? "700" : "650") + ";color:#111;font-family:"
      + (row.mono ? "monospace" : "inherit") + ";'>" + escapeHtml(row.value) + "</span>";
    html += "</div>";
  });
  html += "</div></div>";
  return html;
}

export var DOC_PRINT_POWERED_BY = "Powered By Techon Computers | +94 70 1234678";

/**
 * Thank-you / closing line by document type.
 * Only sales invoices (and quotations) use Settings → Invoice Design footer text.
 * Other docs get wording that fits that voucher / receipt / return.
 */
export function getPrintFooterMessage(kind, settings) {
  var k = String(kind || "invoice").toLowerCase();
  var custom = settings && settings.footer != null ? String(settings.footer).trim() : "";

  if (k === "invoice" || k === "sale" || k === "sales") {
    return custom || "Thank you for your purchase!";
  }
  if (k === "quotation" || k === "quote") {
    return custom || "Thank you. We look forward to serving you.";
  }
  if (k === "purchase" || k === "purchase_invoice") {
    return "Thank you for your supply.";
  }
  if (k === "sales_return" || k === "sale_return" || k === "return_sales") {
    return "Return received. Thank you for your understanding.";
  }
  if (k === "purchase_return" || k === "return_purchase") {
    return "Purchase return noted. Thank you.";
  }
  if (k === "money_in" || k === "receipt_in") {
    return "Thank you for your payment.";
  }
  if (k === "money_out" || k === "receipt_out") {
    return "Payment recorded. Thank you.";
  }
  if (k === "expense" || k === "expense_voucher") {
    return "Expense recorded. Thank you.";
  }
  if (k === "repair" || k === "repair_job") {
    return "We take care of your devices.";
  }
  if (k === "statement" || k === "statement_settled" || k === "statement_credit") {
    return "This statement is for your records.";
  }
  if (k === "report") {
    return "Thank you for your business.";
  }
  return custom || "Thank you for your business!";
}

/** @deprecated Prefer getPrintFooterMessage(kind, settings). */
export function resolvePrintFooterText(settings, fallback) {
  var t = settings && settings.footer != null ? String(settings.footer).trim() : "";
  if (t) return t;
  return fallback != null && String(fallback).trim() ? String(fallback).trim() : "Thank you for your business!";
}

/**
 * Fixed-bottom print footer.
 * Message depends on `kind` (invoice / purchase / return / voucher…).
 * Powered-by line is always the same.
 * Parent should be a flex column with page min-height so the spacer pins this to the bottom.
 */
export function DocPrintFooter(props) {
  var settings = props.settings || {};
  var accent = props.accent || DOC_PRINT_ACCENT;
  var pad = props.padPx != null ? props.padPx : 24;
  var px = pad + "px";
  var compact = !!props.compact;
  var withSpacer = props.withSpacer !== false;
  var showPowered = props.showPowered !== false;
  var text = props.message != null && String(props.message).trim()
    ? String(props.message).trim()
    : getPrintFooterMessage(props.kind || "invoice", settings);
  var powered = props.poweredBy || DOC_PRINT_POWERED_BY;

  return (
    <React.Fragment>
      {withSpacer ? (
        <div style={{ flex: "1 1 auto", minHeight: compact ? 8 : 16 }} aria-hidden="true" />
      ) : null}
      <div
        className="erp-doc-print-footer"
        style={{
          margin: "0 " + px,
          paddingTop: compact ? 6 : 8,
          paddingBottom: compact ? 8 : 10,
          marginTop: withSpacer ? 0 : (compact ? 6 : 8),
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: compact ? 6 : 8 }}>
          <div style={{ width: "22%", borderTop: "1px solid " + accent, opacity: 0.65 }} />
          <div
            style={{
              fontSize: compact ? 11 : 12,
              fontWeight: 700,
              color: accent,
              textAlign: "center",
              fontStyle: "italic",
              letterSpacing: "0.01em",
              whiteSpace: "pre-wrap",
              maxWidth: "70%",
              lineHeight: 1.4,
            }}
          >
            {text}
          </div>
          <div style={{ width: "22%", borderTop: "1px solid " + accent, opacity: 0.65 }} />
        </div>
        {showPowered ? (
          <div style={{ textAlign: "center", fontSize: 8, color: "#000", fontWeight: 400, paddingBottom: 4 }}>
            {powered}
          </div>
        ) : null}
      </div>
    </React.Fragment>
  );
}

/** HTML twin of DocPrintFooter for string-built print windows. */
export function buildDocPrintFooterHtml(opts) {
  opts = opts || {};
  var settings = opts.settings || {};
  var accent = opts.accent || DOC_PRINT_ACCENT;
  var pad = opts.padPx != null ? opts.padPx : 24;
  var px = pad + "px";
  var withSpacer = opts.withSpacer !== false;
  var showPowered = opts.showPowered !== false;
  var escapeHtml = typeof opts.escapeHtml === "function" ? opts.escapeHtml : function (s) { return String(s == null ? "" : s); };
  var text = opts.message != null && String(opts.message).trim()
    ? String(opts.message).trim()
    : getPrintFooterMessage(opts.kind || "invoice", settings);
  var powered = opts.poweredBy || DOC_PRINT_POWERED_BY;
  var html = "";
  if (withSpacer) {
    html += "<div class='footer-spacer' style='flex:1 1 auto;min-height:16px;' aria-hidden='true'></div>";
  }
  html += "<div class='print-footer erp-doc-print-footer' style='margin:0 " + px + ";padding-top:8px;padding-bottom:12px;flex-shrink:0;'>";
  html += "<div style='display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:8px;'>";
  html += "<div style='width:22%;border-top:1px solid " + accent + ";opacity:0.65;'></div>";
  html += "<div style='font-size:12px;font-weight:700;color:" + accent + ";text-align:center;font-style:italic;letter-spacing:0.01em;white-space:pre-wrap;max-width:70%;line-height:1.4;'>"
    + escapeHtml(text) + "</div>";
  html += "<div style='width:22%;border-top:1px solid " + accent + ";opacity:0.65;'></div>";
  html += "</div>";
  if (showPowered) {
    html += "<div style='text-align:center;font-size:8px;color:#000;font-weight:400;padding-bottom:4px;'>"
      + escapeHtml(powered) + "</div>";
  }
  html += "</div>";
  return html;
}

export default DocPrintHeader;
