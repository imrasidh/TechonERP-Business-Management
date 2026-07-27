import React, { useState, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import PrintFormatChooser from "./PrintFormatChooser.jsx";
import { applyPageFormatToHtml, pageFormatMeta, buildPrintFmtOptions } from "../utils/printFormat.js";

/**
 * Universal View & Print modal — same chrome as Reports Print Preview:
 * dark bar · Print · Save PDF · WhatsApp · Close · document stage.
 *
 * Pass either `html` (iframe) or `children` (React document, e.g. InvoiceA4).
 */
export function UniversalPrintPreview(props) {
  var open = props.open === true;
  var title = props.title || "Document";
  var subtitle = props.subtitle || "";
  var badge = props.badge || "VP";
  var kicker = props.kicker || "Print preview";
  var html = props.html || "";
  var children = props.children;
  var filename = props.filename || "TechonDoc";
  var settings = props.settings || {};
  var WABtn = props.WABtn;
  var showAlert = props.showAlert || function () {};
  var shareViaWhatsApp = props.shareViaWhatsApp;
  var onClose = props.onClose || function () {};
  var PRINT_FONT_LINK = props.PRINT_FONT_LINK || "";
  var openPrintWindow = props.openPrintWindow;
  var escapeHtml = props.escapeHtml || function (s) { return String(s == null ? "" : s); };
  var showFormats = props.showFormats === true;
  var format = props.format || "a4";
  var onFormatChange = props.onFormatChange;
  var showWarranty = props.showWarranty === true;
  var warranty = props.warranty === true;
  var onWarrantyChange = props.onWarrantyChange;
  var warrantyDisabled = props.warrantyDisabled === true;
  var previewElId = props.previewElId || "tc-univ-print-body";
  var zIndex = props.zIndex != null ? props.zIndex : 12000;

  var [printFmtOpen, setPrintFmtOpen] = useState(false);
  var sheetRef = useRef(null);
  var invPrintFmtOptions = buildPrintFmtOptions(settings);

  var isThermal = String(format).indexOf("thermal") === 0;
  var sheetW = format === "a5" ? 560 : (format === "thermal58" ? 230 : (isThermal ? 310 : 794));
  var sheetMinH = format === "a5" ? 794 : (isThermal ? 0 : 1123);

  useLayoutEffect(function () {
    if (!open) return;
    var el = sheetRef.current;
    if (!el) return;
    var w = sheetW + "px";
    el.style.setProperty("width", w, "important");
    el.style.setProperty("min-width", w, "important");
    el.style.setProperty("max-width", w, "important");
    if (sheetMinH) {
      el.style.setProperty("min-height", sheetMinH + "px", "important");
    } else {
      el.style.setProperty("min-height", "0", "important");
    }
    el.style.setProperty("height", "fit-content", "important");
    el.style.setProperty("margin-left", "auto", "important");
    el.style.setProperty("margin-right", "auto", "important");
    el.style.setProperty("box-sizing", "border-box", "important");
    el.style.setProperty("background", "#fff", "important");
    if (isThermal) {
      el.style.setProperty("padding", format === "thermal58" ? "4px" : "6px", "important");
    } else {
      el.style.setProperty("padding", "0", "important");
    }
  }, [open, format, sheetW, sheetMinH, isThermal]);

  if (!open) return null;

  var buildFullHtml = function (bodyInner, fmt) {
    var meta = pageFormatMeta(fmt || format);
    var isThermal = meta.isThermal;
    var bodyW = isThermal
      ? "body{background:#fff;font-family:'Courier New',monospace;width:" + meta.bodyW + ";margin:0 auto;}"
      : "body{background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;margin:0;}";
    var css = "<style>*{box-sizing:border-box;margin:0;padding:0;}html,body{height:auto;}" + bodyW
      + "@page{size:" + meta.pageSize + (isThermal ? "" : " portrait") + ";margin:" + meta.margin + ";}"
      + "@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>";
    var full = "<!DOCTYPE html><html><head>" + PRINT_FONT_LINK + "<title>" + escapeHtml(title) + "</title>" + css + "</head><body>" + (bodyInner || "") + "</body></html>";
    return applyPageFormatToHtml(full, fmt || format);
  };

  var getBodyHtml = function () {
    if (html) {
      var body = String(html).replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
      return body || html;
    }
    var el = document.getElementById(previewElId);
    return el ? el.innerHTML : "";
  };

  var getDocumentHtml = function () {
    if (html && /<html/i.test(html)) return html;
    return buildFullHtml(getBodyHtml(), format);
  };

  var doPrint = function (fmt) {
    setPrintFmtOpen(false);
    var full = html && /<html/i.test(html)
      ? applyPageFormatToHtml(html, fmt)
      : buildFullHtml(getBodyHtml(), fmt);
    if (typeof openPrintWindow === "function") {
      openPrintWindow(full, { width: 920, height: 1100, delay: 400 });
      return;
    }
    var w = window.open("", "_blank", "width=920,height=1100");
    if (!w) {
      showAlert("Popup blocked. Please allow popups and try again.");
      return;
    }
    w.document.write(full);
    w.document.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch (e) { /* ignore */ } }, 400);
  };

  var onPrintClick = function () {
    setPrintFmtOpen(true);
  };

  var savePdf = function () {
    var full = getDocumentHtml();
    if (!(window.electronAPI && typeof window.electronAPI.printHtml === "function")) {
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
  };

  var shareWa = function () {
    if (typeof shareViaWhatsApp !== "function") {
      showAlert("WhatsApp sharing is only available in the desktop app.");
      return;
    }
    var body = getBodyHtml();
    var headMatch = (html || "").match(/<style[^>]*>[\s\S]*?<\/style>/gi);
    var headStyles = headMatch ? headMatch.join("") : "";
    shareViaWhatsApp(body || html, filename, props.waPhone || "", {
      headStyles: headStyles,
      pageFormat: format === "a5" ? "a5" : (String(format).indexOf("thermal") === 0 ? format : "a4"),
    });
  };

  var sheetSizeClass = isThermal
    ? (format === "thermal58" ? "is-thermal is-thermal58" : "is-thermal is-thermal80")
    : (format === "a5" ? "is-paper is-a5" : "is-paper is-a4");
  var iframeH = isThermal ? "min(70vh, 900px)" : (format === "a5" ? "min(72vh, 794px)" : "min(78vh, 1123px)");
  var ui = (
    <div className="erp-si-fv erp-rpt-fv erp-univ-fv" role="dialog" aria-modal="true" aria-label="Print preview" style={{ zIndex: zIndex }}>
      <div className="erp-si-fv-bar">
        <div className="erp-si-fv-bar-left">
          <span className="erp-si-fv-badge" aria-hidden="true">{badge}</span>
          <div className="erp-si-fv-meta">
            <div className="erp-si-fv-kicker">{kicker}</div>
            <div className="erp-si-fv-meta-main">
              <span className="erp-si-fv-inv">{title}</span>
              {subtitle ? <span className="erp-si-fv-sub">{subtitle}</span> : null}
            </div>
          </div>
        </div>
        {(showFormats || showWarranty) ? (
          <div className="erp-si-fv-tools">
            {showFormats ? (
              <React.Fragment>
                <span className="erp-si-fv-tool-label">Format</span>
                <div className="erp-si-fv-formats" role="group" aria-label="Print format">
                  {invPrintFmtOptions.map(function (item) {
                    var v = item[0]; var lbl = item[1];
                    return (
                      <button
                        key={v}
                        type="button"
                        className={"erp-si-fv-fmt" + (format === v ? " is-active" : "")}
                        onClick={function () { if (typeof onFormatChange === "function") onFormatChange(v); }}
                      >{lbl}</button>
                    );
                  })}
                </div>
              </React.Fragment>
            ) : null}
            {showWarranty ? (
              <label className={"erp-si-fv-warranty" + (warranty ? " is-on" : "") + (warrantyDisabled ? " is-disabled" : "")} title={warrantyDisabled ? "Enable warranty text in Settings → Invoice Design" : "Include warranty policy on this print"}>
                <input
                  type="checkbox"
                  checked={warranty}
                  disabled={warrantyDisabled}
                  onChange={function (e) {
                    if (typeof onWarrantyChange === "function") onWarrantyChange(e.target.checked);
                  }}
                />
                <span>Warranty</span>
              </label>
            ) : null}
          </div>
        ) : null}
        <div className="erp-si-fv-actions">
          <button type="button" className="erp-si-fv-btn is-print" onClick={onPrintClick}>Print</button>
          <button type="button" className="erp-si-fv-btn is-convert" onClick={savePdf}>Save PDF</button>
          {WABtn ? (
            <WABtn title="Share as PDF via WhatsApp" onClick={shareWa} />
          ) : (
            <button type="button" className="erp-si-fv-btn is-print" onClick={shareWa}>WhatsApp</button>
          )}
          <button type="button" className="erp-si-fv-btn is-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>
      {props.belowBar ? <div className="erp-si-fv-return">{props.belowBar}</div> : null}
      <div className="erp-si-fv-stage">
        <div ref={sheetRef} className={"erp-si-fv-sheet erp-univ-fv-sheet " + sheetSizeClass}>
          {html ? (
            <iframe title="Print preview" className="erp-rpt-fv-iframe erp-univ-fv-iframe" srcDoc={html} style={{ width: "100%", height: iframeH, border: 0, display: "block", background: "#fff" }} />
          ) : (
            <div id={previewElId} className="erp-univ-fv-react-doc" style={{ width: "100%", maxWidth: "100%", margin: "0 auto", display: "block", background: "#fff" }}>
              {children}
            </div>
          )}
        </div>
      </div>
      <PrintFormatChooser
        open={printFmtOpen}
        settings={settings}
        title="Print"
        hint="Choose an enabled paper size for your printer."
        onClose={function () { setPrintFmtOpen(false); }}
        onSelect={doPrint}
        zIndex={zIndex + 1000}
      />
    </div>
  );

  if (typeof document === "undefined") return ui;
  return createPortal(ui, document.body);
}

export default UniversalPrintPreview;
