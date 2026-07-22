/**
 * Shared print page-size helpers (A4 / A5 / Thermal).
 */

export function resolveThermalFormat(settings) {
  var t = settings && settings.invoiceThermalSize;
  return t === "thermal58" ? "thermal58" : "thermal80";
}

export function pageFormatMeta(fmt) {
  var f = String(fmt || "a4").toLowerCase();
  if (f === "a5") {
    return { pageSize: "A5", margin: "8mm", pageFormat: "a5", isThermal: false, label: "A5" };
  }
  if (f === "thermal58") {
    return { pageSize: "58mm auto", margin: "3mm", pageFormat: "thermal58", isThermal: true, bodyW: "218px", label: "Thermal 58mm" };
  }
  if (f === "thermal" || f === "thermal80") {
    return { pageSize: "80mm auto", margin: "3mm", pageFormat: "thermal80", isThermal: true, bodyW: "302px", label: "Thermal 80mm" };
  }
  return { pageSize: "A4", margin: "8mm", pageFormat: "a4", isThermal: false, label: "A4" };
}

/** Inject / replace @page rules so the browser print dialog uses the chosen size. */
export function applyPageFormatToHtml(html, fmt) {
  if (!html) return html;
  var m = pageFormatMeta(fmt);
  var pageRule = "@page{size:" + m.pageSize + (m.isThermal ? "" : " portrait") + ";margin:" + m.margin + " !important;}";
  var extra = m.isThermal
    ? "html,body{width:" + m.bodyW + " !important;max-width:" + m.bodyW + " !important;margin:0 auto !important;}"
    : "";
  var block = "<style data-tc-print-fmt=\"1\">" + pageRule + extra + "@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>";

  var cleaned = String(html).replace(/<style[^>]*data-tc-print-fmt=["']1["'][^>]*>[\s\S]*?<\/style>/gi, "");
  cleaned = cleaned.replace(/@page\s*\{[^}]*\}/gi, "");

  if (/<\/head>/i.test(cleaned)) {
    return cleaned.replace(/<\/head>/i, block + "</head>");
  }
  if (/<body[^>]*>/i.test(cleaned)) {
    return cleaned.replace(/<body[^>]*>/i, function (tag) { return tag + block; });
  }
  return block + cleaned;
}

export function buildPrintCssForFormat(fmt) {
  var m = pageFormatMeta(fmt);
  var bodyW = m.isThermal
    ? "body{background:#fff;font-family:'Courier New',monospace;width:" + m.bodyW + ";}"
    : "body{background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;}";
  return "<style>*{box-sizing:border-box;margin:0;padding:0;}html,body{height:auto;}" + bodyW +
    "@page{size:" + m.pageSize + (m.isThermal ? "" : " portrait") + ";margin:" + m.margin + ";}" +
    "@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>";
}
