/**
 * Shared print page-size helpers (A4 / A5 / Thermal 58 / Thermal 80).
 */

export var PRINT_FORMAT_DEFS = [
  { id: "a4", label: "A4", shortLabel: "A4", settingKey: "invoiceFormatA4", kind: "paper", sub: "Standard page · invoices & reports" },
  { id: "a5", label: "A5", shortLabel: "A5", settingKey: "invoiceFormatA5", kind: "paper", sub: "Half page · compact invoices" },
  { id: "thermal58", label: "Thermal 58mm", shortLabel: "58mm", settingKey: "invoiceFormatThermal58", kind: "thermal", sub: "Narrow receipt printer" },
  { id: "thermal80", label: "Thermal 80mm", shortLabel: "80mm", settingKey: "invoiceFormatThermal80", kind: "thermal", sub: "Standard POS receipt printer" },
];

function settingFlag(settings, key, fallbackTrue) {
  if (!settings || settings[key] === undefined || settings[key] === null) return fallbackTrue !== false;
  return settings[key] !== false;
}

/** Whether a format is enabled for print choosers (defaults ON for backward compatibility). */
export function isPrintFormatEnabled(settings, id) {
  var def = PRINT_FORMAT_DEFS.find(function (d) { return d.id === id; });
  if (!def) return false;
  return settingFlag(settings, def.settingKey, true);
}

export function getEnabledPrintFormats(settings) {
  var list = PRINT_FORMAT_DEFS.filter(function (d) { return isPrintFormatEnabled(settings, d.id); });
  if (!list.length) return [PRINT_FORMAT_DEFS[0]];
  return list;
}

/** Toolbar / chooser options: [[id, shortLabel], ...] */
export function buildPrintFmtOptions(settings) {
  return getEnabledPrintFormats(settings).map(function (d) {
    return [d.id, d.shortLabel];
  });
}

/**
 * Preferred thermal id for quick-print shortcuts.
 * Uses invoiceThermalSize when that size is enabled; otherwise first enabled thermal; else thermal80.
 */
export function resolveThermalFormat(settings) {
  var preferred = settings && settings.invoiceThermalSize === "thermal58" ? "thermal58" : "thermal80";
  if (isPrintFormatEnabled(settings, preferred)) return preferred;
  if (isPrintFormatEnabled(settings, "thermal80")) return "thermal80";
  if (isPrintFormatEnabled(settings, "thermal58")) return "thermal58";
  return preferred;
}

/** Format pre-selected when opening View & Print (must be enabled). */
export function resolveDefaultPrintFormat(settings) {
  var enabled = getEnabledPrintFormats(settings);
  var ids = enabled.map(function (d) { return d.id; });
  var paper = settings && settings.invoiceDefaultSize;
  if (paper && ids.indexOf(paper) >= 0) return paper;
  var thermal = resolveThermalFormat(settings);
  if (ids.indexOf(thermal) >= 0) return thermal;
  return ids[0] || "a4";
}

/** Clamp default paper/thermal after toggles change. Returns patch fields. */
export function clampPrintFormatDefaults(settings) {
  var next = Object.assign({}, settings || {});
  var enabled = getEnabledPrintFormats(next);
  var ids = enabled.map(function (d) { return d.id; });
  if (ids.indexOf(next.invoiceDefaultSize) < 0) {
    var paper = enabled.find(function (d) { return d.kind === "paper"; });
    next.invoiceDefaultSize = paper ? paper.id : (ids[0] || "a4");
  }
  if (ids.indexOf(next.invoiceThermalSize) < 0) {
    var thermal = enabled.find(function (d) { return d.kind === "thermal"; });
    next.invoiceThermalSize = thermal ? thermal.id : "thermal80";
  }
  return next;
}

export function pageFormatMeta(fmt, opts) {
  opts = opts || {};
  var voucherSlip = opts.voucherSlip === true;
  var f = String(fmt || "a4").toLowerCase();
  if (f === "a5") {
    if (voucherSlip) {
      return { pageSize: "A5 landscape", margin: "6mm", pageFormat: "a5", isThermal: false, landscape: true, label: "A5" };
    }
    return { pageSize: "A5", margin: "8mm", pageFormat: "a5", isThermal: false, landscape: false, label: "A5" };
  }
  if (f === "thermal58") {
    return { pageSize: "58mm auto", margin: "3mm", pageFormat: "thermal58", isThermal: true, landscape: false, bodyW: "218px", label: "Thermal 58mm" };
  }
  if (f === "thermal" || f === "thermal80") {
    return { pageSize: "80mm auto", margin: "3mm", pageFormat: "thermal80", isThermal: true, landscape: false, bodyW: "302px", label: "Thermal 80mm" };
  }
  return { pageSize: "A4", margin: "8mm", pageFormat: "a4", isThermal: false, landscape: false, label: "A4" };
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

export function buildPrintCssForFormat(fmt, opts) {
  var m = pageFormatMeta(fmt, opts);
  var bodyW = m.isThermal
    ? "body{background:#fff;font-family:'Courier New',monospace;width:" + m.bodyW + ";}"
    : "body{background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;}";
  return "<style>*{box-sizing:border-box;margin:0;padding:0;}html,body{height:auto;}" + bodyW +
    "@page{size:" + m.pageSize + (m.isThermal || m.landscape ? "" : " portrait") + ";margin:" + m.margin + ";}" +
    "@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>";
}
