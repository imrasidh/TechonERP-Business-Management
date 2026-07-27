import React, { useState, useEffect } from "react";
import { ReturnReceiptDoc } from "./ReturnReceiptDoc.jsx";
import { MoneyReceiptDoc } from "./MoneyReceiptDoc.jsx";
import { ExpenseVoucherDoc } from "./ExpenseVoucherDoc.jsx";
import { PurchaseInvoiceDoc } from "./PurchaseInvoiceDoc.jsx";
import PrintFormatChooser from "./PrintFormatChooser.jsx";
import { buildPrintFmtOptions, resolveDefaultPrintFormat } from "../utils/printFormat.js";
import { printDocElement, saveDocPdf, shareDocWhatsApp } from "../utils/docPrintActions.js";

/**
 * Universal view/print shell for invoices, receipts, returns, and linked proofs.
 */
export function SourceDocumentViewer(props) {
  var view = props.view;
  var onClose = props.onClose;
  var onOpenLinked = props.onOpenLinked;
  var state = props.state || {};
  var settings = state.settings || {};
  var fmtDate = props.fmtDate || function (d) { return d || ""; };
  var fmtDateFull = props.fmtDateFull || fmtDate;
  var fmtNum = props.fmtNum || function (n) { return Number(n || 0).toLocaleString(); };
  var getCurrencySymbol = props.getCurrencySymbol || function () { return "Rs"; };
  var fmtStock = props.fmtStock;
  var showAlert = props.showAlert || function () {};
  var InvoiceA4 = props.InvoiceA4;
  var InvoiceThermal = props.InvoiceThermal;
  var PRINT_FONT_LINK = props.PRINT_FONT_LINK || "";
  var escapeHtml = props.escapeHtml || function (s) { return String(s || ""); };
  var WABtn = props.WABtn;
  var shareViaWhatsApp = props.shareViaWhatsApp;

  var invPrintFmtOptions = buildPrintFmtOptions(settings);
  var [docFmt, setDocFmt] = useState(function () { return resolveDefaultPrintFormat(settings); });
  var [printFmtOpen, setPrintFmtOpen] = useState(false);
  var [docWarranty, setDocWarranty] = useState(false);

  useEffect(function () {
    if (!view || !view.resolved || !view.resolved.ok) return;
    var payload = view.resolved.payload;
    if (view.resolved.kind === "sale" && payload) {
      setDocWarranty(!!payload.includeWarranty);
    } else {
      setDocWarranty(false);
    }
  }, [view && view.resolved && view.resolved.kind, view && view.resolved && view.resolved.id]);

  if (!view || !view.resolved || !view.resolved.ok) return null;
  var res = view.resolved;
  var kind = res.kind;
  var previewId = "src-doc-preview-" + kind + "-" + res.id;
  var isVoucherSlip = kind === "expense" || kind === "manual-ar" || kind === "manual-ap";
  var printExtra = isVoucherSlip ? { voucherSlip: true } : {};

  var docPrintOpts = function (fmt) {
    return {
      elId: previewId,
      title: printTitle,
      fmt: fmt || docFmt,
      printFontLink: PRINT_FONT_LINK,
      escapeHtml: escapeHtml,
      extra: printExtra,
    };
  };

  var printDocById = function (elId, title, fmt) {
    printDocElement(docPrintOpts(fmt));
  };

  var savePdf = function () {
    saveDocPdf(Object.assign({}, docPrintOpts(docFmt), { showAlert: showAlert }));
  };

  var shareWa = function () {
    var phone = "";
    if (kind === "sale" && res.payload) phone = res.payload.customerPhone || "";
    shareDocWhatsApp(Object.assign({}, docPrintOpts(docFmt), {
      showAlert: showAlert,
      shareViaWhatsApp: shareViaWhatsApp,
      filename: printTitle.replace(/[^\w\-]+/g, "-"),
      phone: phone,
    }));
  };

  var titleText = res.label || "Document";
  var subText = "";
  var sheetBody = null;
  var printTitle = titleText;
  var isThermalFmt = docFmt === "thermal58" || docFmt === "thermal80";
  var sheetSize = isThermalFmt ? "a4" : docFmt;

  if (kind === "sale" && res.payload && InvoiceA4 && InvoiceThermal) {
    subText = (res.payload.customerName || "Walk-in") + " · " + fmtDate(res.payload.date);
    printTitle = "Invoice " + (res.payload.invoiceNo || "");
    var saleInv = Object.assign({}, res.payload, { includeWarranty: docWarranty });
    sheetBody = isThermalFmt
      ? <InvoiceThermal inv={saleInv} settings={settings} invoiceLang="en" width={docFmt === "thermal58" ? 218 : 302} />
      : <InvoiceA4 inv={saleInv} settings={settings} invoiceLang="en" size={sheetSize} />;
  } else if (kind === "purchase" && res.payload) {
    subText = (res.payload.supplier || "Supplier") + " · " + fmtDateFull(res.payload.date);
    printTitle = "Purchase " + (res.payload.invoiceNo || "");
    sheetBody = (
      <PurchaseInvoiceDoc
        pur={res.payload}
        settings={settings}
        fmtDateFull={fmtDateFull}
        fmtNum={fmtNum}
        getCurrencySymbol={getCurrencySymbol}
        fmtStock={fmtStock}
        size={sheetSize}
      />
    );
  } else if ((kind === "sale-return" || kind === "purchase-return") && res.payload) {
    subText = (res.parentLabel ? ("From " + res.parentLabel + " · ") : "") + fmtDate((res.payload.rows && res.payload.rows[0] && res.payload.rows[0].date) || "");
    printTitle = (kind === "sale-return" ? "Sales Return " : "Purchase Return ") + titleText;
    sheetBody = (
      <ReturnReceiptDoc
        data={res.payload}
        settings={settings}
        fmtDateFull={fmtDateFull}
        fmtNum={fmtNum}
        getCurrencySymbol={getCurrencySymbol}
        size={sheetSize}
      />
    );
  } else if ((kind === "manual-ar" || kind === "manual-ap") && res.payload) {
    var isOut = kind === "manual-ar";
    subText = (isOut ? "Money Out" : "Money In") + " · " + (res.payload.person || res.payload.source || "Party") + " · " + fmtDateFull(res.payload.date);
    printTitle = "Receipt " + titleText;
    sheetBody = (
      <MoneyReceiptDoc
        receipt={res.payload}
        mode={isOut ? "out" : "in"}
        size={sheetSize}
        settings={settings}
        fmtDateFull={fmtDateFull}
        fmtNum={fmtNum}
        getCurrencySymbol={getCurrencySymbol}
      />
    );
  } else if (kind === "expense" && res.payload) {
    var exp = res.payload;
    subText = fmtDateFull(exp.date) + " · " + (exp.cashMethod || exp.payMode || "Cash");
    printTitle = "Expense " + (exp.category || "");
    sheetBody = (
      <ExpenseVoucherDoc
        expense={exp}
        settings={settings}
        fmtDateFull={fmtDateFull}
        fmtNum={fmtNum}
        getCurrencySymbol={getCurrencySymbol}
      />
    );
  } else {
    showAlert("Document preview not available for this type yet.");
    return null;
  }

  return (
    <>
      <div className="erp-si-fv" role="dialog" aria-modal="true" aria-label="View source document">
        <div className="erp-si-fv-bar">
          <div className="erp-si-fv-bar-left">
            <span className="erp-si-fv-badge" aria-hidden="true">VP</span>
            <div className="erp-si-fv-meta">
              <span className="erp-si-fv-kicker">View &amp; Print</span>
              <div className="erp-si-fv-meta-main">
                <span className="erp-si-fv-inv">{titleText}</span>
                <span className="erp-si-fv-sub">{subText}</span>
              </div>
            </div>
          </div>
          <div className="erp-si-fv-tools">
            <span className="erp-si-fv-tool-label">Format</span>
            <div className="erp-si-fv-formats" role="group" aria-label="Print format">
              {invPrintFmtOptions.map(function (item) {
                var v = item[0]; var lbl = item[1];
                return (
                  <button key={v} type="button" className={"erp-si-fv-fmt" + (docFmt === v ? " is-active" : "")} onClick={function () { setDocFmt(v); }}>{lbl}</button>
                );
              })}
            </div>
            {kind === "sale" ? (
              <label className={"erp-si-fv-warranty" + (docWarranty ? " is-on" : "") + (settings.warrantyEnabled === false ? " is-disabled" : "")} title={settings.warrantyEnabled === false ? "Enable warranty text in Settings → Invoice Design" : "Include warranty policy on this print"}>
                <input
                  type="checkbox"
                  checked={docWarranty}
                  disabled={settings.warrantyEnabled === false}
                  onChange={function (e) { setDocWarranty(e.target.checked); }}
                />
                <span>Warranty</span>
              </label>
            ) : null}
          </div>
          <div className="erp-si-fv-actions">
            {res.parentKind && res.parentId && typeof onOpenLinked === "function" ? (
              <button
                type="button"
                className="erp-si-fv-btn is-convert"
                onClick={function () { onOpenLinked({ sourceKind: res.parentKind, sourceId: res.parentId }); }}
              >
                Open {res.parentKind === "sale" ? "invoice" : "purchase"} {res.parentLabel || ""}
              </button>
            ) : null}
            <button type="button" className="erp-si-fv-btn is-print" onClick={function () { setPrintFmtOpen(true); }}>Print</button>
            <button type="button" className="erp-si-fv-btn is-convert" onClick={savePdf}>Save PDF</button>
            {WABtn ? (
              <WABtn title="Share as PDF via WhatsApp" onClick={shareWa} />
            ) : null}
            <button type="button" className="erp-si-fv-btn is-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>
        <div className="erp-si-fv-stage">
          <div
            id={previewId}
            className={"erp-si-fv-sheet" + (isThermalFmt ? " is-thermal" : " is-paper") + (isVoucherSlip ? " is-voucher-slip" : "")}
          >
            {sheetBody}
          </div>
        </div>
      </div>

      <PrintFormatChooser
        open={printFmtOpen}
        settings={settings}
        title="Print document"
        hint="Choose an enabled paper size for your printer."
        onClose={function () { setPrintFmtOpen(false); }}
        onSelect={function (fmt) {
          setPrintFmtOpen(false);
          printDocById(previewId, printTitle, fmt);
        }}
      />
    </>
  );
}
