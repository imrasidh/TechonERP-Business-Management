import { buildPrintCssForFormat, pageFormatMeta } from "./printFormat.js";

function getElementHtml(elId) {
  if (typeof document === "undefined") return "";
  var el = document.getElementById(elId);
  return el ? el.innerHTML : "";
}

export function buildDocHtmlFromElement(opts) {
  opts = opts || {};
  var body = getElementHtml(opts.elId);
  if (!body) return null;
  var escapeHtml = opts.escapeHtml || function (s) { return String(s || ""); };
  var css = buildPrintCssForFormat(opts.fmt || "a4", opts.extra || {});
  return "<!DOCTYPE html><html><head>" + (opts.printFontLink || "") +
    "<title>" + escapeHtml(opts.title || "Document") + "</title>" + css +
    "</head><body>" + body + "</body></html>";
}

export function printDocElement(opts) {
  var full = buildDocHtmlFromElement(opts);
  if (!full) return false;
  var w = window.open("", "_blank", "width=900,height=760");
  if (!w) return false;
  w.document.write(full);
  w.document.close();
  setTimeout(function () { try { w.focus(); w.print(); } catch (e) { /* ignore */ } }, 500);
  return true;
}

export function saveDocPdf(opts) {
  opts = opts || {};
  var showAlert = opts.showAlert || function () {};
  var full = buildDocHtmlFromElement(opts);
  if (!full) {
    showAlert("Document preview not ready. Please try again.");
    return;
  }
  if (!(typeof window !== "undefined" && window.electronAPI && typeof window.electronAPI.printHtml === "function")) {
    showAlert("Save as PDF is only available in the desktop app. You can also use Print → Save as PDF.");
    return;
  }
  showAlert("Saving PDF — please wait…");
  window.electronAPI.printHtml({ html: full, pdfOnly: true }).then(function (res) {
    if (res && res.ok) showAlert("PDF saved" + (res.path ? ":\n" + res.path : "."));
    else showAlert("Save PDF failed: " + ((res && res.message) || "Unknown error"));
  }).catch(function (err) {
    showAlert("Save PDF failed: " + (err && err.message ? err.message : "Unknown error"));
  });
}

export function shareDocWhatsApp(opts) {
  opts = opts || {};
  var showAlert = opts.showAlert || function () {};
  var shareViaWhatsApp = opts.shareViaWhatsApp;
  if (typeof shareViaWhatsApp !== "function") {
    showAlert("WhatsApp sharing is only available in the desktop app.");
    return;
  }
  var body = getElementHtml(opts.elId);
  if (!body) {
    showAlert("Document preview not ready. Please try again.");
    return;
  }
  var fmt = opts.fmt || "a4";
  var meta = pageFormatMeta(fmt, opts.extra || {});
  var css = buildPrintCssForFormat(fmt, opts.extra || {});
  shareViaWhatsApp(body, opts.filename || "TechonDoc", opts.phone || "", {
    headStyles: css,
    pageFormat: meta.pageFormat,
  });
}
