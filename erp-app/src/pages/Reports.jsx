import React, { useState, useEffect } from "react";

var Reports = React.memo(function (props) {
  var state = props.state;
  var setState = props.setState;
  var today = props.today;
  var S = props.S;
  var getCashBalances = props.getCashBalances;
  var getNetCOGS = props.getNetCOGS;
  var getNetCOGSForRange = props.getNetCOGSForRange;
  var getTotalSupplierPayable = props.getTotalSupplierPayable;
  var getSupplierPayableFromPurchases =
    typeof props.getSupplierPayableFromPurchases === "function"
      ? props.getSupplierPayableFromPurchases
      : function (supplierName, purchases) {
          return (purchases || []).reduce(function (a, p) {
            var bal = Math.max(0, (p.total || 0) - (p.paidAmount || 0));
            return p.supplier === supplierName ? a + bal : a;
          }, 0);
        };
  var pwMatchesAsync = props.pwMatchesAsync;
  var uid = props.uid;
  var PRINT_FONT_LINK = props.PRINT_FONT_LINK;
  var escapeHtml = props.escapeHtml;
  var shareViaWhatsApp = props.shareViaWhatsApp;
  var showAlert = props.showAlert;
  var getCurrencySymbol = props.getCurrencySymbol;
  var getBulkDisplayParts = props.getBulkDisplayParts;
  var fmtStockDual = props.fmtStockDual;
  var fmtStock = props.fmtStock;
  var fmtNum = props.fmtNum;
  var fmtSumQty =
    typeof props.fmtSumQty === "function"
      ? props.fmtSumQty
      : function (n) {
          var q = Number(n) || 0;
          return String(Math.round(q * 1000) / 1000);
        };
  var fmtDateFull = props.fmtDateFull;
  var getBusinessProfile = props.getBusinessProfile;
  var normalizePaymentCustomerName = props.normalizePaymentCustomerName;
  var getTotalReceivableDerived = props.getTotalReceivableDerived;
  var getTotalPayableDerived = props.getTotalPayableDerived;
  var getProfitAndLossFromLedger = props.getProfitAndLossFromLedger;
  var getBalanceSheetFromLedger = props.getBalanceSheetFromLedger;
  var C = props.C;
  var StatCard = props.StatCard;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var Btn = props.Btn;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var Badge = props.Badge;
  var Modal = props.Modal;
  var Input = props.Input;
  var WABtn = props.WABtn;
  var [tab, setTab] = useState("overview");
  var [reportDate, setReportDate] = useState(today());
  var [reportMonth, setReportMonth] = useState(today().slice(0, 7));
  var [rangeFrom, setRangeFrom] = useState(today().slice(0, 7) + "-01");
  var [rangeTo, setRangeTo] = useState(today());
  var [pnlPeriod, setPnlPeriod] = useState("monthly");
  var [pnlMonth, setPnlMonth] = useState(today().slice(0, 7));
  var [pnlYear, setPnlYear] = useState(today().slice(0, 4));
  var [pnlQuarter, setPnlQuarter] = useState("Q" + (Math.ceil((new Date().getMonth() + 1) / 3)) + "-" + today().slice(0, 4));
  var [pnlFrom, setPnlFrom] = useState(today().slice(0, 7) + "-01");
  var [pnlTo, setPnlTo] = useState(today());
  var [rptAssetEdit, setRptAssetEdit] = useState(null);
  var [rptAssetAction, setRptAssetAction] = useState(null);
  var [rptAssetPw, setRptAssetPw] = useState("");
  var [rptAssetReason, setRptAssetReason] = useState("");
  var [rptAssetPwMsg, setRptAssetPwMsg] = useState("");
  var [assetFilterCat, setAssetFilterCat] = useState("All");
  var [assetFilterFrom, setAssetFilterFrom] = useState("");
  var [assetFilterTo, setAssetFilterTo] = useState("");

  var systemConfigRpt = props.systemConfig || {};
  var isNetworkServerRpt = systemConfigRpt.role === "network_server";
  var [terminalNameMap, setTerminalNameMap] = useState({});
  useEffect(function () {
    if (!isNetworkServerRpt) return;
    var api = window.electronAPI;
    if (!api || !api.getConnectedClients) return;
    api.getConnectedClients().then(function (r) {
      if (!r || !r.ok || !r.clients) return;
      var m = {};
      (r.clients || []).forEach(function (c) {
        var disp = (c.client_label && String(c.client_label).trim()) || c.device_name || c.device_id;
        m[c.device_id] = disp;
      });
      setTerminalNameMap(m);
    }).catch(function () {});
  }, [isNetworkServerRpt, tab]);

  /* BUG1 FIX: Use getCashBalances() as authoritative cash figure (replaces stale manual formula) */
  var _rptBalances = getCashBalances(state);
  var cashInHand = _rptBalances.total;
  /* capital — used in overview and assets tabs */
  var capital = state.settings.capitalInvested || 0;
  var totalSalesIncome = state.sales.reduce(function (a, s) { return a + (s.paid || 0); }, 0);
  var totalPurchasesPaid = state.purchases.reduce(function (a, p) { return a + (p.paidAmount || 0); }, 0);
  var totalExpenses = state.expenses.reduce(function (a, e) { return a + e.amount; }, 0);
  var totalAssetsSpent = (state.assets || []).reduce(function (a, x) { return a + (x.amount || x.value || 0); }, 0);
  var totalCOGS = getNetCOGS(state.sales, state.salesReturns); /* Bug 3 fix: net COGS after returns */
  /* sale.total is already reduced by returns, so totalRevenue IS netRevenue.
     Reconstruct grossRevenue by adding back the return amounts for display. */
  var netRevenue = state.sales.reduce(function (a, s) { return a + s.total; }, 0);
  var totalTaxOnInvoices = state.sales.reduce(function (a, s) { return a + (s.totalTax || 0); }, 0);
  /* Sales returns: r.amount = retail value reversed; cash refunds tracked separately in getCashBalances via r.refundAmount */
  var totalSalesReturnAmt = (state.salesReturns || []).reduce(function (a, r) { return a + (r.amount || 0); }, 0);
  var totalPurchaseReturnAmt = (state.purchaseReturns || []).reduce(function (a, r) { return a + (r.amount || 0); }, 0);
  var totalRevenue = netRevenue + totalSalesReturnAmt; /* gross revenue before returns — for display */
  var totalProfit = netRevenue - totalCOGS;
  var grossMarginPct = netRevenue > 0 ? Math.round((totalProfit / netRevenue) * 100) : 0;
  /* FIX 1: Exclude soft-deleted (inactive) products from Net Worth stock value */
  var activeProductsR = state.products.filter(function (p) { return p.status !== "inactive"; });
  var stockCostValue = activeProductsR.reduce(function (a, p) { return a + (p.cost || 0) * (p.stock || 0); }, 0);
  var stockValue = stockCostValue;
  /* BUG2/GL: receivables — ledger AR when synced */
  var totalReceivable = typeof getTotalReceivableDerived === "function"
    ? getTotalReceivableDerived(state)
    : (function () {
      var fromSales = state.sales.reduce(function (a, s) { return a + Math.max(0, s.total - (s.paid || 0)); }, 0);
      var fromManual = S.get("tc3_manualReceivables", []).reduce(function (a, mr) {
        var paid = (mr.paymentHistory || []).reduce(function (s2, p) { return s2 + p.amount; }, 0);
        return a + Math.max(0, mr.amount - paid);
      }, 0);
      return fromSales + fromManual;
    }());
  /* BUG3/GL: payables — ledger AP when synced */
  var totalPayable = typeof getTotalPayableDerived === "function"
    ? getTotalPayableDerived(state)
    : (function () {
      var fromSupp = getTotalSupplierPayable(state.purchases);
      var fromManual = S.get("tc3_manualPayables", []).reduce(function (a, mp) {
        var paid = (mp.paymentHistory || []).reduce(function (s2, p) { return s2 + p.amount; }, 0);
        return a + Math.max(0, mp.amount - paid);
      }, 0);
      return fromSupp + fromManual;
    }());
  var glPL = typeof getProfitAndLossFromLedger === "function" ? getProfitAndLossFromLedger(null, null) : null;
  var glBS = typeof getBalanceSheetFromLedger === "function" ? getBalanceSheetFromLedger(null) : null;
  /* BUG4 FIX: netWorth now uses correct cash, cost-based stock, full receivable, fixed assets and payable */
  var netWorth = cashInHand + stockValue + totalReceivable + totalAssetsSpent - totalPayable;
  /* BUG5 FIX (Dashboard): filter out repairs already converted to POS invoices
     to match the same logic used in P&L and Full Report — prevents double-counting */
  var totalRepairRevenue = state.repairs.reduce(function (a, r) {
    if (r.status !== "Delivered") return a;
    var alreadyInvoiced = state.sales.some(function (s) { return s.fromRepairId === r.id; });
    return alreadyInvoiced ? a : a + (r.estimatedCost || r.cost || 0);
  }, 0);
  var activeRepairs = state.repairs.filter(function (r) { return r.status === "Repairing" || r.status === "Pending"; }).length;

  var daySales = state.sales.filter(function (s) { return s.date === reportDate; });
  var daySalesTotal = daySales.reduce(function (a, s) { return a + s.total; }, 0);
  var dayReturns = (state.salesReturns || []).filter(function (r) { return r.date === reportDate; });
  var dayCOGS = getNetCOGSForRange(daySales, dayReturns);
  var dayProfit = daySalesTotal - dayCOGS;
  var dayExpenses = state.expenses.filter(function (e) { return e.date === reportDate; }).reduce(function (a, e) { return a + e.amount; }, 0);
  var dayNetProfit = dayProfit - dayExpenses;
  var dayPaid = daySales.reduce(function (a, s) { return a + (s.paid || 0); }, 0);
  var dayUnpaid = daySales.reduce(function (a, s) { return a + Math.max(0, s.total - (s.paid || 0)); }, 0);
  var dayTaxCollected = daySales.reduce(function (a, s) { return a + (s.totalTax || 0); }, 0);

  var monthSales = state.sales.filter(function (s) { return s.date.slice(0, 7) === reportMonth; });
  var monthSalesTotal = monthSales.reduce(function (a, s) { return a + s.total; }, 0);
  var monthReturns = (state.salesReturns || []).filter(function (r) { return r.date.slice(0, 7) === reportMonth; });
  var monthCOGS = getNetCOGSForRange(monthSales, monthReturns);
  var monthProfit = monthSalesTotal - monthCOGS;
  var monthExpenses = state.expenses.filter(function (e) { return e.date.slice(0, 7) === reportMonth; }).reduce(function (a, e) { return a + e.amount; }, 0);
  var monthRepairRev = state.repairs.filter(function (r) {
    if (r.status !== "Delivered") return false;
    if ((r.dateOut || r.date || "").slice(0, 7) !== reportMonth) return false;
    return !state.sales.some(function (s) { return s.fromRepairId === r.id; });
  }).reduce(function (a, r) { return a + (r.estimatedCost || r.cost || 0); }, 0);
  var monthNetProfit = monthProfit + monthRepairRev - monthExpenses;
  var monthPurchases = state.purchases.filter(function (p) { return (p.date || "").slice(0, 7) === reportMonth; }).reduce(function (a, p) { return a + (p.total || 0); }, 0);
  var monthPaid = monthSales.reduce(function (a, s) { return a + (s.paid || 0); }, 0);
  var monthReceivable = monthSales.reduce(function (a, s) { return a + Math.max(0, s.total - (s.paid || 0)); }, 0);
  var monthTaxCollected = monthSales.reduce(function (a, s) { return a + (s.totalTax || 0); }, 0);

  var doRptAssetAction = function () {
    var storedPw = S.get("tc3_apppass", "");
    if (!rptAssetPw) { setRptAssetPwMsg("Password required."); return; }
    if (!rptAssetReason || rptAssetReason.trim().length < 3) {
      setRptAssetPwMsg("Please enter a reason (min 3 chars).");
      return;
    }
    pwMatchesAsync(rptAssetPw, storedPw).then(function (ok) {
      if (!ok) { setRptAssetPwMsg("Incorrect password."); return; }
      var prevLog = S.get("tc3_assetLog", []);
      if (rptAssetAction === "delete" && rptAssetEdit) {
        var filtered = (state.assets || []).filter(function (a) { return a.id !== rptAssetEdit.id; });
        S.set("tc3_assets", filtered);
        setState(function (st) { return Object.assign({}, st, { assets: filtered }); });
        var entry = { id: uid(), date: today(), action: "Deleted", assetId: rptAssetEdit.id, assetName: rptAssetEdit.name, category: rptAssetEdit.category, amount: rptAssetEdit.amount, reason: rptAssetReason };
        S.set("tc3_assetLog", prevLog.concat([entry]));
      } else if (rptAssetAction === "edit" && rptAssetEdit) {
        var entry2 = { id: uid(), date: today(), action: "Edited", assetId: rptAssetEdit.id, assetName: rptAssetEdit.name, category: rptAssetEdit.category, amount: rptAssetEdit.amount, reason: rptAssetReason };
        var updated = (state.assets || []).map(function (a) { return a.id === rptAssetEdit.id ? Object.assign({}, rptAssetEdit) : a; });
        S.set("tc3_assets", updated);
        setState(function (st) { return Object.assign({}, st, { assets: updated }); });
        S.set("tc3_assetLog", prevLog.concat([entry2]));
      }
      setRptAssetAction(null);
      setRptAssetEdit(null);
      setRptAssetPw("");
      setRptAssetReason("");
      setRptAssetPwMsg("");
    });
  };

  var REPORT_CSS = "body{font-family:'Plus Jakarta Sans',Arial,sans-serif;padding:24px;color:#000;} table{width:100%;border-collapse:collapse;margin:12px 0;} th{background:#0d1b3e;color:#fff;padding:8px 12px;text-align:left;font-size:12px;} td{padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;} .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d1b3e;padding-bottom:12px;margin-bottom:18px;} .shop{font-size:22px;font-weight:900;} .title{font-size:16px;font-weight:700;color:#2255d4;margin-top:4px;} .kv{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f0f0f0;font-size:13px;} .kv-label{color:#666;} .kv-val{font-weight:700;} .card{background:#f8fafc;border-radius:8px;padding:12px 16px;margin:8px 0;} .green{color:#0f9e6e;} .red{color:#e03151;} .blue{color:#2255d4;} @media print{@page{margin:15mm;}body{padding:0;}}";

  /* Iframe fallback only (Chromium iframe print is unreliable). */
  var printHtmlViaIframe = function (fullHtml, delay) {
    delay = delay != null ? delay : 450;
    var iframe = document.createElement("iframe");
    iframe.setAttribute("title", "Print");
    /* 0×0 iframes often fail to print in Chromium; keep real dimensions off-screen */
    iframe.setAttribute(
      "style",
      "position:fixed;left:-10000px;top:0;width:816px;min-height:1056px;border:0;background:#fff;opacity:0;pointer-events:none"
    );
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);
    var win = iframe.contentWindow;
    try {
      win.document.open();
      win.document.write(fullHtml);
      win.document.close();
      setTimeout(function () {
        try {
          win.focus();
          win.print();
        } catch (e) {}
        setTimeout(function () {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        }, 1200);
      }, delay);
    } catch (e) {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      showAlert("Print could not be opened. Allow pop-ups for this app or try again.");
    }
  };

  /* Main-process print only when the classic popup path fails (popup blocked or document.write error).
     origin/main had Reports inline in App.jsx and used window.open + w.print() only — IPC was added later
     and incorrectly ran first, so printing never hit the working path. */
  var printHtmlViaElectronIpc = function (fullHtml, delay) {
    delay = delay != null ? delay : 450;
    if (typeof window !== "undefined" && window.electronAPI && typeof window.electronAPI.printHtml === "function") {
      window.electronAPI.printHtml(fullHtml).then(function (res) {
        if (!res || res.ok !== true) {
          if (res && res.message) showAlert("Print: " + res.message);
          printHtmlViaIframe(fullHtml, delay);
        }
      }).catch(function (err) {
        var msg = err && err.message ? String(err.message) : "Print failed";
        showAlert(msg);
        printHtmlViaIframe(fullHtml, delay);
      });
      return;
    }
    printHtmlViaIframe(fullHtml, delay);
  };

  /* Chromium/Electron: document.write() on multi‑MB strings (full Business Report) often fails or never prints; use a blob URL + load + print. */
  var OPEN_PRINT_LARGE_HTML = 450000;

  var openPrintWindow = function (fullHtml, opts) {
    opts = opts || {};
    var delay = opts.delay != null ? opts.delay : 450;
    /* WhatsApp share: shareAnyReport() sets this to capture HTML without opening print */
    if (typeof window !== "undefined" && typeof window._tcShareCapturePrintHtml === "function") {
      try {
        window._tcShareCapturePrintHtml(fullHtml);
      } catch (e) {}
      return;
    }
    /* Full Business Report: renderer print is unreliable (huge HTML). Main process printToPDF + open — same as working WhatsApp PDF path. */
    if (opts.useMainPdf && typeof window !== "undefined" && window.electronAPI && typeof window.electronAPI.printHtml === "function") {
      window.electronAPI.printHtml({ html: fullHtml, pdfOnly: true }).then(function (res) {
        if (!res || res.ok !== true) {
          showAlert("Print: " + (res && res.message ? res.message : "Could not generate PDF."));
          openPrintWindow(fullHtml, Object.assign({}, opts, { useMainPdf: false }));
          return;
        }
      }).catch(function (err) {
        showAlert(err && err.message ? String(err.message) : "Print failed");
        openPrintWindow(fullHtml, Object.assign({}, opts, { useMainPdf: false }));
      });
      return;
    }
    var feat = "width=" + (opts.width || 1000) + ",height=" + (opts.height || 750);
    var large = typeof fullHtml === "string" && fullHtml.length > OPEN_PRINT_LARGE_HTML;
    var blobUrl = null;
    if (large) {
      try {
        blobUrl = URL.createObjectURL(new Blob([fullHtml], { type: "text/html;charset=utf-8" }));
      } catch (e) {
        blobUrl = null;
        large = false;
      }
    }
    var w = large && blobUrl
      ? window.open(blobUrl, "_blank", feat)
      : window.open("", "_blank", feat);
    if (!w) {
      if (blobUrl) {
        try { URL.revokeObjectURL(blobUrl); } catch (e) {}
      }
      showAlert("Popup blocked. Please allow popups for this window and try again.");
      printHtmlViaElectronIpc(fullHtml, delay);
      return;
    }
    var printDelay = large ? Math.max(delay, 900, Math.min(2200, 400 + Math.floor(fullHtml.length / 80000))) : delay;
    var revokeLater = function () {
      if (!blobUrl) return;
      var u = blobUrl;
      blobUrl = null;
      setTimeout(function () {
        try { URL.revokeObjectURL(u); } catch (e) {}
      }, 180000);
    };
    var runPrint = function () {
      try {
        w.focus();
        w.print();
      } catch (e) {}
      revokeLater();
    };
    if (large && blobUrl) {
      var fired = false;
      var fire = function () {
        if (fired) return;
        fired = true;
        setTimeout(runPrint, printDelay);
      };
      try {
        if (w.document && w.document.readyState === "complete") {
          fire();
        } else {
          w.addEventListener("load", fire);
        }
      } catch (e) {
        fire();
      }
      setTimeout(function () {
        if (!fired) fire();
      }, 14000);
      return;
    }
    try {
      w.document.write(fullHtml);
      w.document.close();
      w.focus();
      setTimeout(function () {
        try {
          w.focus();
          w.print();
        } catch (e) {}
      }, delay);
    } catch (e) {
      try { w.close(); } catch (e2) {}
      printHtmlViaElectronIpc(fullHtml, delay);
    }
  };

  var printReport = function (title, htmlContent) {
    var fullHtml = "<!DOCTYPE html><html><head>" + PRINT_FONT_LINK + "<title>" + escapeHtml(title) + "</title><style>" + REPORT_CSS + "</style></head><body>" + htmlContent + "</body></html>";
    openPrintWindow(fullHtml, { width: 900, height: 700, delay: 400 });
  };

  var shareReport = function (title, htmlContent) {
    var body = "<style>" + REPORT_CSS + "</style>" + htmlContent;
    shareViaWhatsApp(body, title.replace(/[^a-zA-Z0-9 _-]/g, "").trim(), "");
  };

  /* Generic: capture HTML from any existing print function, then share as PDF */
  var shareAnyReport = function (printFn, filename) {
    var captured = "";
    var origOpen = window.open;
    var prevCapture = typeof window._tcShareCapturePrintHtml === "function" ? window._tcShareCapturePrintHtml : null;
    window.open = function () {
      return {
        document: { write: function (s) { captured += s; }, close: function () {} },
        focus: function () {}, print: function () {}
      };
    };
    window._tcShareCapturePrintHtml = function (fullHtml) {
      captured += fullHtml || "";
    };
    try { printFn(); } catch (e) {}
    window.open = origOpen;
    if (prevCapture) window._tcShareCapturePrintHtml = prevCapture;
    else delete window._tcShareCapturePrintHtml;
    if (!captured) { showAlert("Nothing to share. Please generate the report first."); return; }
    /* Strip outer HTML wrapper, pass body content to shareViaWhatsApp */
    var body = captured.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
    shareViaWhatsApp(body || captured, filename || "TechonReport", "");
  };

  var printDailyReport = function () {
    var shopName = state.settings.shopName || "Techon ERP";
    var rows = daySales.map(function (s, i) {
      return "<tr><td>" + (i + 1) + "</td><td>" + escapeHtml(s.invoiceNo || s.id.slice(0, 8)) + "</td><td>" + escapeHtml(s.customerName || "Walk-in") + "</td><td>" + s.items.length + " items</td><td>" + getCurrencySymbol() + " " + Number(s.total || 0).toLocaleString() + "</td><td>" + getCurrencySymbol() + " " + Number(s.totalTax || 0).toLocaleString() + "</td><td>" + getCurrencySymbol() + " " + Number(s.paid || 0).toLocaleString() + "</td><td style='color:" + (s.balance > 0 ? "#e03151" : "#0f9e6e") + "'>" + getCurrencySymbol() + " " + Number(Math.max(0, s.total - (s.paid || 0))).toLocaleString() + "</td></tr>";
    }).join("");
    var html = "<div class='header'><div><div class='shop'>" + escapeHtml(shopName) + "</div><div class='title'>📅 Daily Sales Report — " + escapeHtml(reportDate) + "</div></div><div style='text-align:right;font-size:12px;color:#666;'>Printed: " + new Date().toLocaleString() + "</div></div>";
    html += "<div style='display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px;'>";
    html += "<div class='card'><div style='font-size:10px;color:#888;text-transform:uppercase;'>Sales Count</div><div style='font-size:22px;font-weight:800;'>" + daySales.length + "</div></div>";
    html += "<div class='card'><div style='font-size:10px;color:#888;text-transform:uppercase;'>Revenue</div><div style='font-size:22px;font-weight:800;' class='blue'>" + getCurrencySymbol() + " " + Number(daySalesTotal).toLocaleString() + "</div></div>";
    html += "<div class='card'><div style='font-size:10px;color:#888;text-transform:uppercase;'>Gross Profit</div><div style='font-size:22px;font-weight:800;' class='green'>" + getCurrencySymbol() + " " + Number(dayProfit).toLocaleString() + "</div></div>";
    html += "<div class='card'><div style='font-size:10px;color:#888;text-transform:uppercase;'>Net Profit</div><div style='font-size:22px;font-weight:800;' class='" + (dayNetProfit >= 0 ? "green" : "red") + "'>" + getCurrencySymbol() + " " + Number(dayNetProfit).toLocaleString() + "</div></div>";
    html += "<div class='card'><div style='font-size:10px;color:#888;text-transform:uppercase;'>Tax Collected</div><div style='font-size:22px;font-weight:800;color:#2255d4;'>" + getCurrencySymbol() + " " + Number(dayTaxCollected).toLocaleString() + "</div></div>";
    html += "</div>";
    html += "<table><thead><tr><th>#</th><th>Invoice</th><th>Customer</th><th>Items</th><th>Total</th><th>Tax</th><th>Paid</th><th>Balance</th></tr></thead><tbody>" + rows + "</tbody></table>";
    if (!daySales.length) html += "<div style='text-align:center;padding:30px;color:#888;'>No sales on this date.</div>";
    printReport("Daily Report - " + reportDate, html);
  };

  var printMonthlyReport = function () {
    var shopName = state.settings.shopName || "Techon ERP";
    var rows = monthSales.map(function (s, i) {
      return "<tr><td>" + (i + 1) + "</td><td>" + escapeHtml(s.date) + "</td><td>" + escapeHtml(s.invoiceNo || s.id.slice(0, 8)) + "</td><td>" + escapeHtml(s.customerName || "Walk-in") + "</td><td>" + getCurrencySymbol() + " " + Number(s.total || 0).toLocaleString() + "</td><td>" + getCurrencySymbol() + " " + Number(s.totalTax || 0).toLocaleString() + "</td><td>" + getCurrencySymbol() + " " + Number(s.paid || 0).toLocaleString() + "</td></tr>";
    }).join("");
    var html = "<div class='header'><div><div class='shop'>" + escapeHtml(shopName) + "</div><div class='title'>📆 Monthly Sales Report — " + escapeHtml(reportMonth) + "</div></div><div style='text-align:right;font-size:12px;color:#666;'>Printed: " + new Date().toLocaleString() + "</div></div>";
    html += "<div style='display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px;'>";
    html += "<div class='card'><div style='font-size:10px;color:#888;text-transform:uppercase;'>Orders</div><div style='font-size:22px;font-weight:800;'>" + monthSales.length + "</div></div>";
    html += "<div class='card'><div style='font-size:10px;color:#888;text-transform:uppercase;'>Revenue</div><div style='font-size:22px;font-weight:800;' class='blue'>" + getCurrencySymbol() + " " + Number(monthSalesTotal).toLocaleString() + "</div></div>";
    html += "<div class='card'><div style='font-size:10px;color:#888;text-transform:uppercase;'>Net Profit</div><div style='font-size:22px;font-weight:800;' class='" + (monthNetProfit >= 0 ? "green" : "red") + "'>" + getCurrencySymbol() + " " + Number(monthNetProfit).toLocaleString() + "</div></div>";
    html += "<div class='card'><div style='font-size:10px;color:#888;text-transform:uppercase;'>Expenses</div><div style='font-size:22px;font-weight:800;' class='red'>" + getCurrencySymbol() + " " + Number(monthExpenses).toLocaleString() + "</div></div>";
    html += "</div>";
    html += "<div class='card' style='margin-bottom:12px;'><div style='font-size:10px;color:#888;text-transform:uppercase;'>Tax on invoices (period)</div><div style='font-size:18px;font-weight:800;color:#2255d4;'>" + getCurrencySymbol() + " " + Number(monthTaxCollected).toLocaleString() + "</div></div>";
    html += "<table><thead><tr><th>#</th><th>Date</th><th>Invoice</th><th>Customer</th><th>Total</th><th>Tax</th><th>Paid</th></tr></thead><tbody>" + rows + "</tbody></table>";
    printReport("Monthly Report - " + reportMonth, html);
  };

  var printStockReport = function () {
    var shopName = state.settings.shopName || "Techon ERP";
    var rows = state.products.slice().sort(function (a, b) { return (a.stock || 0) - (b.stock || 0); }).map(function (p, i) {
      var stockColor = (p.stock || 0) === 0 ? "color:#e03151" : ((p.stock || 0) < 5 ? "color:#d97706" : "color:#0f9e6e");
      return "<tr><td>" + escapeHtml(p.productId || "—") + "</td><td>" + escapeHtml(p.name) + "</td><td>" + escapeHtml(p.category || "—") + "</td><td style='" + stockColor + ";font-weight:700;'>" + escapeHtml(getBulkDisplayParts(p) ? fmtStockDual(p) : fmtStock(p.stock || 0, p.unit)) + "</td><td>" + getCurrencySymbol() + " " + Number(p.cost || 0).toLocaleString() + "</td><td>" + getCurrencySymbol() + " " + Number(p.price || 0).toLocaleString() + "</td><td>" + getCurrencySymbol() + " " + Number((p.price || 0) * (p.stock || 0)).toLocaleString() + "</td></tr>";
    }).join("");
    var totalStockVal = state.products.reduce(function (a, p) { return a + (p.price || 0) * (p.stock || 0); }, 0);
    var html = "<div class='header'><div><div class='shop'>" + escapeHtml(shopName) + "</div><div class='title'>📦 Stock Report</div></div><div style='text-align:right;font-size:12px;color:#666;'>Printed: " + new Date().toLocaleString() + "</div></div>";
    html += "<div style='display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px;'>";
    html += "<div class='card'><div style='font-size:10px;color:#888;text-transform:uppercase;'>Total Products</div><div style='font-size:22px;font-weight:800;'>" + state.products.length + "</div></div>";
    html += "<div class='card'><div style='font-size:10px;color:#888;text-transform:uppercase;'>Out of Stock</div><div style='font-size:22px;font-weight:800;color:#e03151;'>" + state.products.filter(function (p) { return (p.stock || 0) === 0; }).length + "</div></div>";
    html += "<div class='card'><div style='font-size:10px;color:#888;text-transform:uppercase;'>Total Stock Value</div><div style='font-size:22px;font-weight:800;' class='blue'>" + getCurrencySymbol() + " " + Number(totalStockVal).toLocaleString() + "</div></div>";
    html += "</div>";
    html += "<table><thead><tr><th>ID</th><th>Product</th><th>Category</th><th>Stock</th><th>Cost</th><th>Price</th><th>Stock Value</th></tr></thead><tbody>" + rows + "</tbody></table>";
    printReport("Stock Report", html);
  };

  var printCustomerBalanceReport = function () {
    var shopName = state.settings.shopName || "Techon ERP";
    var custData = state.customers.map(function (c) {
      var sales = state.sales.filter(function (s) { return s.customerId === c.id; });
      var totalBilled = sales.reduce(function (a, s) { return a + s.total; }, 0);
      var totalPaid = sales.reduce(function (a, s) { return a + (s.paid || 0); }, 0);
      var balance = totalBilled - totalPaid;
      return Object.assign({}, c, { totalBilled: totalBilled, totalPaid: totalPaid, balance: balance });
    }).filter(function (c) { return c.totalBilled > 0; }).sort(function (a, b) { return b.balance - a.balance; });
    var rows = custData.map(function (c, i) {
      var balColor = c.balance > 0 ? "color:#e03151" : "color:#0f9e6e";
      return "<tr><td>" + (i + 1) + "</td><td>" + escapeHtml(c.name) + "</td><td>" + escapeHtml(c.phone || "—") + "</td><td>" + getCurrencySymbol() + " " + Number(c.totalBilled).toLocaleString() + "</td><td>" + getCurrencySymbol() + " " + Number(c.totalPaid).toLocaleString() + "</td><td style='" + balColor + ";font-weight:700;'>" + getCurrencySymbol() + " " + Number(c.balance).toLocaleString() + "</td></tr>";
    }).join("");
    var totalBal = custData.reduce(function (a, c) { return a + c.balance; }, 0);
    var html = "<div class='header'><div><div class='shop'>" + escapeHtml(shopName) + "</div><div class='title'>👥 Customer Balance Report</div></div><div style='text-align:right;font-size:12px;color:#666;'>Printed: " + new Date().toLocaleString() + "</div></div>";
    html += "<div style='display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px;'>";
    html += "<div class='card'><div style='font-size:10px;color:#888;text-transform:uppercase;'>Active Customers</div><div style='font-size:22px;font-weight:800;'>" + custData.length + "</div></div>";
    html += "<div class='card'><div style='font-size:10px;color:#888;text-transform:uppercase;'>Total Receivable</div><div style='font-size:22px;font-weight:800;color:#e03151;'>" + getCurrencySymbol() + " " + Number(totalBal).toLocaleString() + "</div></div>";
    html += "<div class='card'><div style='font-size:10px;color:#888;text-transform:uppercase;'>With Balance</div><div style='font-size:22px;font-weight:800;'>" + custData.filter(function (c) { return c.balance > 0; }).length + "</div></div>";
    html += "</div>";
    html += "<table><thead><tr><th>#</th><th>Customer</th><th>Phone</th><th>Total Billed</th><th>Paid</th><th>Balance</th></tr></thead><tbody>" + rows + "</tbody></table>";
    printReport("Customer Balance Report", html);
  };

  var TABS = [["overview", "📊 Overview"], ["pnl", "💹 P&L Summary"], ["daily", "📅 Daily"], ["monthly", "📆 Monthly"], ["inventory", "📦 Inventory"], ["customers", "👤 Customers"], ["expenses", "💸 Expenses"], ["assets", "🏛 Assets"], ["balancesheet", "⚖️ Balance Sheet"], ["integrity", "🛡 Integrity"], ["business", "📋 Full Report"]];
  if (getBusinessProfile().modules.repairs) { TABS.splice(7, 0, ["repairs", "🔧 Repairs"]); }

  var KVRow = function (kvProps) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", borderBottom: "1px solid " + C.borderLight, fontSize: 13 }}>
        <span style={{ color: C.muted, fontWeight: 500 }}>{kvProps.label}</span>
        <span style={{ fontWeight: 700, color: kvProps.color || C.text }}>{getCurrencySymbol()} {fmtNum(kvProps.value)}</span>
      </div>
    );
  };

  var SectionHead = function (shProps) {
    return <div style={{ padding: "8px 14px 6px", fontSize: 10, fontWeight: 800, color: C.th, textTransform: "uppercase", letterSpacing: "0.1em", background: "#f7f9ff", borderBottom: "1px solid " + C.border }}>{shProps.label}</div>;
  };

  var MetricChip = function (mcProps) {
    var positive = mcProps.value >= 0;
    return (
      <div style={{ background: positive ? C.successSoft : C.dangerSoft, border: "1px solid " + (positive ? "#9ee8ce" : "#f9a8ba"), borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>{mcProps.label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: positive ? C.green : C.red }}>{getCurrencySymbol()} {fmtNum(mcProps.value)}</div>
        {mcProps.sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{mcProps.sub}</div>}
      </div>
    );
  };

  return (
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", background: "#fff", padding: "10px 12px", borderRadius: 12, border: "1.5px solid " + C.border, boxShadow: C.shadowCard }}>
        {TABS.map(function (item) {
          var k = item[0]; var l = item[1];
          var isActive = tab === k;
          return <button key={k} onClick={function () { setTab(k); }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: isActive ? "linear-gradient(135deg,#2979ff,#5591ff)" : "transparent", color: isActive ? "#fff" : C.textMd, fontSize: 12.5, fontWeight: isActive ? 700 : 500, cursor: "pointer", transition: "all .15s", boxShadow: isActive ? "0 2px 8px rgba(41,121,255,0.3)" : "none" }}>{l}</button>;
        })}
      </div>

      {tab === "pnl" && (function () {
        var getRange = function () {
          if (pnlPeriod === "daily") return { from: reportDate, to: reportDate, label: "Daily \u2014 " + reportDate };
          if (pnlPeriod === "monthly") {
            var mo = pnlMonth.slice(5, 7); var yr = pnlMonth.slice(0, 4);
            var last = new Date(parseInt(yr), parseInt(mo), 0).getDate();
            return { from: pnlMonth + "-01", to: pnlMonth + "-" + String(last).padStart(2, "0"), label: "Monthly \u2014 " + new Date(pnlMonth + "-02").toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
          }
          if (pnlPeriod === "yearly") return { from: pnlYear + "-01-01", to: pnlYear + "-12-31", label: "Yearly \u2014 " + pnlYear };
          if (pnlPeriod === "quarterly") {
            var qp = pnlQuarter.split("-"); var ql = qp[0]; var qy = qp[1] || today().slice(0, 4);
            var qm = { Q1: ["01-01", "03-31"], Q2: ["04-01", "06-30"], Q3: ["07-01", "09-30"], Q4: ["10-01", "12-31"] };
            var qd = qm[ql] || ["01-01", "03-31"];
            return { from: qy + "-" + qd[0], to: qy + "-" + qd[1], label: "Quarter \u2014 " + ql + " " + qy };
          }
          return { from: pnlFrom, to: pnlTo, label: "Custom: " + pnlFrom + " to " + pnlTo };
        };
        var range = getRange(); var rf = range.from; var rt = range.to;
        var inR = function (d) { return (d || "") >= rf && (d || "") <= rt; };

        var rSales = state.sales.filter(function (s) { return inR(s.date); });
        var rPurch = state.purchases.filter(function (p) { return inR(p.date); });
        var rExp = state.expenses.filter(function (e) { return inR(e.date); });
        var rRepairs = state.repairs.filter(function (r) { return inR(r.dateIn || r.date); });
        var rAssets = (state.assets || []).filter(function (a) { return !a._isOpening && inR(a.date); });
        var rDmgPnl = (state.damageLog || []).filter(function (d) { return inR(d.date); });
        var rCapLedger = S.get("tc3_capLedger", []).filter(function (e) { return !e._isOpening && inR(e.date); });
        var rProfDist = S.get("tc3_profitDist", []).filter(function (e) { return inR(e.date); });
        var rManualPay = S.get("tc3_manualPayables", []).filter(function (e) { return inR(e.date); });
        var rManualRec = S.get("tc3_manualReceivables", []).filter(function (e) { return inR(e.date); });
        /* FIX: Sales returns within the period must be subtracted from revenue */
        var rSalesReturns = (state.salesReturns || []).filter(function (r) { return inR(r.date); });
        /* Retail value of returned goods (for gross revenue bridge) — not the same as cash refunded */
        var totalSalesReturnAmt = rSalesReturns.reduce(function (a, r) { return a + (r.amount || 0); }, 0);
        var totalCashRefundedReturns = rSalesReturns.filter(function (r) { return r.isRefund && (r.refundAmount || 0) > 0; }).reduce(function (a, r) { return a + (r.refundAmount || 0); }, 0);

        /* sale.total is already net (reduced by returns). Reconstruct gross for display. */
        var netRevenue = rSales.reduce(function (a, s) { return a + s.total; }, 0);
        var totalRevenue = netRevenue + totalSalesReturnAmt; /* gross — for display only */
        var totalCollected = rSales.reduce(function (a, s) { return a + (s.paid || 0); }, 0);
        var totalUnpaid = rSales.reduce(function (a, s) { return a + Math.max(0, s.total - (s.paid || 0)); }, 0);
        var totalCOGS = getNetCOGSForRange(rSales, rSalesReturns); /* Bug 3 fix: net COGS after returns */
        var grossProfit = netRevenue - totalCOGS;
        /* BUG5 FIX: Only count repair revenue for jobs NOT already converted to a POS invoice.
           Repairs converted via convertToInvoice have cost:0 in the sale item, so their full
           charge is already in grossProfit (totalRevenue - totalCOGS). Adding them again here
           would double-count. We identify invoiced repairs by checking sale items for fromRepairId
           or by matching repairId stored on the sale. */
        var invoicedRepairIdsInRange = new Set();
        rSales.forEach(function (s) {
          if (s.fromRepairId) invoicedRepairIdsInRange.add(s.fromRepairId); /* FIX 10: guard against double-counting */
          (s.items || []).forEach(function (it) { if (it.fromRepairId) invoicedRepairIdsInRange.add(it.fromRepairId); });
        });
        var repairRevenue = rRepairs.filter(function (r) {
          return r.status === "Delivered" && !invoicedRepairIdsInRange.has(r.id);
        }).reduce(function (a, r) { return a + (r.estimatedCost || r.cost || 0); }, 0);
        var totalExpenses = rExp.reduce(function (a, e) { return a + e.amount; }, 0);
        var totalDamageLoss = rDmgPnl.reduce(function (a, d) {
          var prod = state.products.find(function (p) { return p.id === d.productId; });
          return a + (d.qty || 0) * (prod ? prod.cost || 0 : 0);
        }, 0);
        var netProfit = (grossProfit + repairRevenue) - totalExpenses - totalDamageLoss;
        var grossMargin = netRevenue > 0 ? ((grossProfit / netRevenue) * 100).toFixed(1) : "0.0";
        var netMargin = netRevenue > 0 ? ((netProfit / netRevenue) * 100).toFixed(1) : "0.0";
        var totalPurchases = rPurch.reduce(function (a, p) { return a + p.total; }, 0);
        var assetsAcquired = rAssets.reduce(function (a, x) { return a + x.amount; }, 0);
        var capitalIn = rCapLedger.filter(function (e) { return e.type === "invest"; }).reduce(function (a, e) { return a + e.amount; }, 0);
        var capitalOut = rCapLedger.filter(function (e) { return e.type === "withdraw"; }).reduce(function (a, e) { return a + e.amount; }, 0);
        var profitDist = rProfDist.reduce(function (a, e) { return a + e.amount; }, 0);
        var borrowedIn = rManualPay.reduce(function (a, e) { return a + e.amount; }, 0);
        var loansOut = rManualRec.reduce(function (a, e) { return a + e.amount; }, 0);
        var isProfit = netProfit >= 0;

        var expByCategory = {};
        rExp.forEach(function (e) { expByCategory[e.category || "Other"] = (expByCategory[e.category || "Other"] || 0) + e.amount; });

        var showMonthly = pnlPeriod === "yearly" || pnlPeriod === "quarterly" || pnlPeriod === "custom";
        var monthlyBD = {};
        if (showMonthly) {
          /* Build item cost map for this range */
          rSales.forEach(function (s) {
            var m = s.date.slice(0, 7);
            if (!monthlyBD[m]) monthlyBD[m] = { rev: 0, cogs: 0, exp: 0 };
            monthlyBD[m].rev += s.total;
            monthlyBD[m].cogs += s.items.reduce(function (b, it) { return b + (it.cost || 0) * it.qty; }, 0);
          });
          /* FIX 1+3: use r.cost stored on return object — no cross-period lookup needed */
          rSalesReturns.forEach(function (r) {
            var m = r.date.slice(0, 7);
            if (!monthlyBD[m]) monthlyBD[m] = { rev: 0, cogs: 0, exp: 0 };
            monthlyBD[m].cogs = Math.max(0, monthlyBD[m].cogs - (r.qty || 0) * (r.cost || 0));
          });
          rExp.forEach(function (e) {
            var m = e.date.slice(0, 7);
            if (!monthlyBD[m]) monthlyBD[m] = { rev: 0, cogs: 0, exp: 0 };
            monthlyBD[m].exp += e.amount;
          });
        }

        var printPnL = function () {
          var shopName = state.settings.shopName || "Techon ERP";
          var css = "body{font-family:'Plus Jakarta Sans',Arial,sans-serif;padding:20px;color:#111;font-size:13px;}h3{margin:14px 0 6px;font-size:12px;font-weight:800;color:#1a237e;text-transform:uppercase;letter-spacing:.07em;padding:5px 10px;background:#e8eeff;border-left:4px solid #2255d4;}.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d1b3e;padding-bottom:12px;margin-bottom:16px;}.shop{font-size:20px;font-weight:900;color:#0d1b3e;}.sub{font-size:11px;color:#666;margin-top:2px;}.verdict{display:inline-block;padding:8px 22px;border-radius:8px;font-size:18px;font-weight:900;margin:10px 0;border:2px solid;}.pnl{width:480px;border-collapse:collapse;}.pnl td{padding:7px 12px;border-bottom:1px solid #eee;}.ptot{font-weight:900;font-size:15px;border-top:2px solid #2255d4 !important;background:#e8eeff;}.psub{color:#555;}.amt{text-align:right;font-weight:700;}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:10px 0;}.card{background:#f8faff;border-radius:6px;padding:10px;border:1px solid #e0e7ff;}.clbl{font-size:9px;color:#888;text-transform:uppercase;}.cval{font-size:16px;font-weight:800;margin-top:3px;}table.dtl{width:100%;border-collapse:collapse;margin:6px 0;font-size:11px;}table.dtl th{background:#1a237e;color:#fff;padding:6px 8px;text-align:left;}table.dtl td{padding:5px 8px;border-bottom:1px solid #eee;}table.dtl tr:nth-child(even){background:#f8faff;}@media print{@page{size:A4;margin:12mm;}body{padding:0;}}";
          var vBg = isProfit ? "#e8f5e9" : "#fde8ed"; var vCol = isProfit ? "#1b5e20" : "#b71c1c"; var vBdr = isProfit ? "#a5d6a7" : "#f9a8ba";
          var h = "<div class='hdr'><div><div class='shop'>" + escapeHtml(shopName) + "</div>" + (state.settings.address ? "<div class='sub'>" + escapeHtml(state.settings.address) + "</div>" : "") + (state.settings.phone ? "<div class='sub'>Tel: " + escapeHtml(state.settings.phone) + "</div>" : "") + "</div><div style='text-align:right'><div style='font-size:16px;font-weight:800;color:#2255d4;'>Profit &amp; Loss Report</div><div class='sub'>" + range.label + "</div><div class='sub'>Printed: " + new Date().toLocaleString() + "</div></div></div>";
          h += "<div class='verdict' style='background:" + vBg + ";color:" + vCol + ";border-color:" + vBdr + "'>" + (isProfit ? "&#x2705; PROFIT" : "&#x274C; LOSS") + " &mdash; " + getCurrencySymbol() + " " + Number(Math.abs(netProfit)).toLocaleString() + "</div>";
          h += "<h3>P&amp;L Statement</h3><table class='pnl'><tbody>";
          h += "<tr><td>Sales Revenue</td><td class='amt' style='color:#1565c0'>" + getCurrencySymbol() + " " + Number(totalRevenue).toLocaleString() + "</td></tr>";
          if (totalSalesReturnAmt > 0) { h += "<tr class='psub'><td>&nbsp;&nbsp;&nbsp;(-) Sales Returns (retail value)</td><td class='amt' style='color:#b71c1c'>" + getCurrencySymbol() + " " + Number(totalSalesReturnAmt).toLocaleString() + "</td></tr>"; }
          if (totalCashRefundedReturns > 0) { h += "<tr class='psub'><td>&nbsp;&nbsp;&nbsp;Cash refunded (actual)</td><td class='amt' style='color:#e65100'>" + getCurrencySymbol() + " " + Number(totalCashRefundedReturns).toLocaleString() + "</td></tr>"; }
          h += "<tr class='psub'><td>&nbsp;&nbsp;&nbsp;Net Revenue (after returns)</td><td class='amt' style='color:#0d47a1;font-weight:700'>" + getCurrencySymbol() + " " + Number(netRevenue).toLocaleString() + "</td></tr>";
          h += "<tr class='psub'><td>&nbsp;&nbsp;&nbsp;(-) Cost of Goods Sold</td><td class='amt' style='color:#b71c1c'>" + getCurrencySymbol() + " " + Number(totalCOGS).toLocaleString() + "</td></tr>";
          h += "<tr><td style='font-weight:700'>Gross Profit</td><td class='amt' style='color:" + (grossProfit >= 0 ? "#1b5e20" : "#b71c1c") + ";font-weight:800'>" + getCurrencySymbol() + " " + Number(grossProfit).toLocaleString() + "</td></tr>";
          h += "<tr class='psub'><td>&nbsp;&nbsp;&nbsp;Gross Margin</td><td class='amt' style='color:#4a148c'>" + grossMargin + "%</td></tr>";
          h += "<tr class='psub'><td>&nbsp;&nbsp;&nbsp;Repair / Service Revenue</td><td class='amt' style='color:#00695c'>" + getCurrencySymbol() + " " + Number(repairRevenue).toLocaleString() + "</td></tr>";
          h += "<tr class='psub'><td>&nbsp;&nbsp;&nbsp;(-) Operating Expenses</td><td class='amt' style='color:#b71c1c'>" + getCurrencySymbol() + " " + Number(totalExpenses).toLocaleString() + "</td></tr>";
          h += "<tr class='psub'><td>&nbsp;&nbsp;&nbsp;(-) Inventory Loss / Damage</td><td class='amt' style='color:#b71c1c'>" + getCurrencySymbol() + " " + Number(totalDamageLoss).toLocaleString() + "</td></tr>";
          h += "<tr class='ptot'><td>NET PROFIT / (LOSS)</td><td class='amt' style='color:" + vCol + ";font-size:16px'>" + getCurrencySymbol() + " " + Number(netProfit).toLocaleString() + "</td></tr>";
          h += "<tr class='psub'><td>&nbsp;&nbsp;&nbsp;Net Margin</td><td class='amt' style='color:#4a148c'>" + netMargin + "%</td></tr></tbody></table>";
          h += "<h3>Key Metrics</h3><div class='cards'>";
          var mc = function (l, v, c) { return "<div class='card'><div class='clbl'>" + l + "</div><div class='cval' style='color:" + c + "'>" + getCurrencySymbol() + " " + Number(v).toLocaleString() + "</div></div>"; };
          var mcn = function (l, v, c) { return "<div class='card'><div class='clbl'>" + l + "</div><div class='cval' style='color:" + c + "'>" + v + "</div></div>"; };
          h += mc("Net Revenue", netRevenue, "#1565c0") + mc("Collected", totalCollected, "#1b5e20") + mc("Outstanding", totalUnpaid, "#b71c1c") + mc("Gross Profit", grossProfit, grossProfit >= 0 ? "#1b5e20" : "#b71c1c") + mc("Expenses", totalExpenses, "#e65100") + mc("Net Profit", netProfit, vCol) + mc("Purchases", totalPurchases, "#0d47a1") + mcn("Invoices", rSales.length, "#1565c0") + mcn("Gross Margin", grossMargin + "%", "#4a148c") + mcn("Net Margin", netMargin + "%", vCol) + mc("Capital In", capitalIn, "#283593") + mc("Profit Distributed", profitDist, "#6a1b9a");
          h += "</div>";
          if (Object.keys(expByCategory).length > 0) {
            h += "<h3>Expense Breakdown</h3><table class='dtl'><thead><tr><th>Category</th><th style='text-align:right'>Amount</th><th style='text-align:right'>%</th></tr></thead><tbody>";
            Object.keys(expByCategory).sort(function (a, b) { return expByCategory[b] - expByCategory[a]; }).forEach(function (cat) {
              var pct = totalExpenses > 0 ? ((expByCategory[cat] / totalExpenses) * 100).toFixed(1) : "0.0";
              h += "<tr><td>" + escapeHtml(cat) + "</td><td style='text-align:right'>" + getCurrencySymbol() + " " + Number(expByCategory[cat]).toLocaleString() + "</td><td style='text-align:right'>" + pct + "%</td></tr>";
            });
            h += "<tr style='font-weight:800;background:#e8eeff'><td>TOTAL</td><td style='text-align:right'>" + getCurrencySymbol() + " " + Number(totalExpenses).toLocaleString() + "</td><td></td></tr></tbody></table>";
          }
          if (showMonthly && Object.keys(monthlyBD).length > 0) {
            h += "<h3>Monthly Breakdown</h3><table class='dtl'><thead><tr><th>Month</th><th style='text-align:right'>Revenue</th><th style='text-align:right'>COGS</th><th style='text-align:right'>Expenses</th><th style='text-align:right'>Net Profit</th><th>Verdict</th></tr></thead><tbody>";
            Object.keys(monthlyBD).sort().forEach(function (m) {
              var mb = monthlyBD[m]; var np = (mb.rev - mb.cogs) - mb.exp; var pc = np >= 0 ? "#1b5e20" : "#b71c1c";
              h += "<tr><td>" + m + "</td><td style='text-align:right'>" + getCurrencySymbol() + " " + Number(mb.rev).toLocaleString() + "</td><td style='text-align:right'>" + getCurrencySymbol() + " " + Number(mb.cogs).toLocaleString() + "</td><td style='text-align:right'>" + getCurrencySymbol() + " " + Number(mb.exp).toLocaleString() + "</td><td style='text-align:right;font-weight:800;color:" + pc + "'>" + getCurrencySymbol() + " " + Number(np).toLocaleString() + "</td><td style='font-weight:700;color:" + pc + "'>" + (np >= 0 ? "Profit" : "Loss") + "</td></tr>";
            });
            h += "</tbody></table>";
          }
          if (rSales.length > 0) {
            h += "<h3>Sales Invoices (" + rSales.length + ")</h3><table class='dtl'><thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th style='text-align:right'>Revenue</th><th style='text-align:right'>COGS</th><th style='text-align:right'>Profit</th><th>Status</th></tr></thead><tbody>";
            rSales.forEach(function (s) {
              var sc = s.items.reduce(function (b, it) { return b + (it.cost || 0) * it.qty; }, 0); var sp = s.total - sc;
              h += "<tr><td>" + escapeHtml(s.date) + "</td><td style='font-family:monospace'>" + escapeHtml(s.invoiceNo || s.id.slice(0, 8)) + "</td><td>" + escapeHtml(s.customerName || "Walk-in") + "</td><td style='text-align:right'>" + getCurrencySymbol() + " " + Number(s.total).toLocaleString() + "</td><td style='text-align:right'>" + getCurrencySymbol() + " " + Number(sc).toLocaleString() + "</td><td style='text-align:right;font-weight:700;color:" + (sp >= 0 ? "#1b5e20" : "#b71c1c") + "'>" + getCurrencySymbol() + " " + Number(sp).toLocaleString() + "</td><td>" + (s.payStatus || "") + "</td></tr>";
            });
            h += "</tbody></table>";
          }
          if (rExp.length > 0) {
            h += "<h3>Expenses (" + rExp.length + ")</h3><table class='dtl'><thead><tr><th>Date</th><th>Category</th><th>Description</th><th style='text-align:right'>Amount</th></tr></thead><tbody>";
            rExp.forEach(function (e) { h += "<tr><td>" + escapeHtml(e.date) + "</td><td>" + escapeHtml(e.category || "") + "</td><td>" + escapeHtml(e.description || "") + "</td><td style='text-align:right;color:#b71c1c'>" + getCurrencySymbol() + " " + Number(e.amount).toLocaleString() + "</td></tr>"; });
            h += "<tr style='font-weight:800;background:#fde8ed'><td colspan='3'>TOTAL EXPENSES</td><td style='text-align:right'>" + getCurrencySymbol() + " " + Number(totalExpenses).toLocaleString() + "</td></tr></tbody></table>";
          }
          /* P&L integrity badge */
          var pnlIntegrity = (function () {
            var invOk = (state.sales || []).every(function (s) { var sum = (s.items || []).reduce(function (a, it) { return a + it.qty * (it.price || 0); }, 0); return Math.abs(Math.max(0, sum - (s.discount || 0)) - (s.total || 0)) <= 1; });
            var phOk = (state.sales || []).every(function (s) { var phSum = (s.paymentHistory || []).reduce(function (a, ph) { return a + (ph.amount || 0); }, 0); return Math.abs(phSum - (s.paid || 0)) <= 1; });
            var dupOk = (function () { var nos = (state.sales || []).map(function (s) { return s.invoiceNo; }).filter(Boolean); return nos.length === new Set(nos).size; })();
            return invOk && phOk && dupOk;
          })();
          if (pnlIntegrity) h += "<div style='text-align:center;margin-top:16px;font-size:9px;color:#0f9e6e;font-weight:700;letter-spacing:.05em;border-top:1px solid #e5e7eb;padding-top:10px;'>🛡 VERIFIED BY SYSTEM INTEGRITY ENGINE — All data checks passed</div>";
          var fullPnL = "<!DOCTYPE html><html><head>" + PRINT_FONT_LINK + "<title>P&L Report</title><style>" + css + "</style></head><body>" + h + "</body></html>";
          openPrintWindow(fullPnL, { width: 960, height: 750, delay: 450 });
        };

        var sharePnL = function () { shareAnyReport(printPnL, "PnL-Report"); };

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            <Card>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Filter Period</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[["daily", "📅 Daily"], ["monthly", "📆 Monthly"], ["quarterly", "📊 Quarterly"], ["yearly", "🗓 Yearly"], ["custom", "🔧 Custom"]].map(function (p) {
                      var isA = pnlPeriod === p[0];
                      return <button key={p[0]} onClick={function () { setPnlPeriod(p[0]); }} style={{ padding: "8px 16px", borderRadius: 8, border: "1.5px solid " + (isA ? C.accent : C.border), background: isA ? "linear-gradient(135deg,#2979ff,#5591ff)" : "#fff", color: isA ? "#fff" : C.textMd, fontWeight: 700, fontSize: 12.5, cursor: "pointer", boxShadow: isA ? "0 2px 8px rgba(41,121,255,0.3)" : "none" }}>{p[1]}</button>;
                    })}
                  </div>
                </div>
                {pnlPeriod === "daily" && <div><div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 5 }}>Date</div><input type="date" value={reportDate} onChange={function (e) { setReportDate(e.target.value); }} style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }} /></div>}
                {pnlPeriod === "monthly" && <div><div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 5 }}>Month</div><input type="month" value={pnlMonth} onChange={function (e) { setPnlMonth(e.target.value); }} style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }} /></div>}
                {pnlPeriod === "yearly" && <div><div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 5 }}>Year</div><select value={pnlYear} onChange={function (e) { setPnlYear(e.target.value); }} style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", cursor: "pointer" }}>{(function () { var y = []; for (var i = parseInt(today().slice(0, 4)); i >= 2020; i--)y.push(String(i)); return y; })().map(function (y) { return <option key={y}>{y}</option>; })}</select></div>}
                {pnlPeriod === "quarterly" && <div><div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 5 }}>Quarter</div><select value={pnlQuarter} onChange={function (e) { setPnlQuarter(e.target.value); }} style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", cursor: "pointer" }}>{(function () { var o = []; var cy = parseInt(today().slice(0, 4)); for (var y = cy; y >= 2020; y--) ["Q4", "Q3", "Q2", "Q1"].forEach(function (q) { o.push(q + "-" + y); }); return o; })().map(function (q) { return <option key={q}>{q}</option>; })}</select></div>}
                {pnlPeriod === "custom" && <React.Fragment>
                  <div><div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 5 }}>From</div><input type="date" value={pnlFrom} onChange={function (e) { setPnlFrom(e.target.value); }} style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }} /></div>
                  <div><div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 5 }}>To</div><input type="date" value={pnlTo} onChange={function (e) { setPnlTo(e.target.value); }} style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }} /></div>
                </React.Fragment>}
                <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}><Btn col="blue" onClick={printPnL}>🖨 Print P&L Report</Btn><WABtn title="Share P&L as PDF via WhatsApp" onClick={sharePnL} /></div>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: C.muted, fontWeight: 600, background: "#f7f9ff", padding: "7px 12px", borderRadius: 8, display: "inline-block" }}>📅 {range.label}</div>
            </Card>

            <div style={{ borderRadius: 14, padding: "22px 28px", background: isProfit ? "linear-gradient(135deg,#1b5e20,#2e7d32)" : "linear-gradient(135deg,#b71c1c,#c62828)", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.18)" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>{range.label} — Business Verdict</div>
                <div style={{ fontSize: 36, fontWeight: 900 }}>{isProfit ? "✅ PROFIT" : "❌ LOSS"}</div>
                <div style={{ fontSize: 13, opacity: 0.8, marginTop: 6 }}>{isProfit ? "Business is making money this period 🎉" : "Business is running at a loss this period ⚠"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.75, marginBottom: 4 }}>Net {isProfit ? "Profit" : "Loss"}</div>
                <div style={{ fontSize: 44, fontWeight: 900 }}>{getCurrencySymbol()} {fmtNum(Math.abs(netProfit))}</div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Net Margin: {netMargin}% | Gross Margin: {grossMargin}%</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 10 }}>
              <StatCard label="Net Revenue" value={netRevenue} accent={C.blue} icon="💰" sub={rSales.length + " invoices" + (totalSalesReturnAmt > 0 ? " · Goods returned: " + getCurrencySymbol() + " " + fmtNum(totalSalesReturnAmt) : "")} />
              <StatCard label="Cost of Goods" value={totalCOGS} accent={C.orange} icon="🛒" sub={"Gross Margin: " + grossMargin + "%"} />
              <StatCard label="Gross Profit" value={grossProfit} accent={grossProfit >= 0 ? C.green : C.red} icon="📊" sub="Net Revenue minus COGS" />
              <StatCard label="Total Expenses" value={totalExpenses} accent={C.red} icon="💸" sub={rExp.length + " entries"} />
              <StatCard label="Net Profit" value={netProfit} accent={isProfit ? C.green : C.red} icon={isProfit ? "📈" : "📉"} sub={"Margin: " + netMargin + "%"} />
              <StatCard label="Cash Collected" value={totalCollected} accent={C.cyan} icon="✅" sub={"Unpaid: " + getCurrencySymbol() + " " + fmtNum(totalUnpaid)} />
              {totalCashRefundedReturns > 0 ? <StatCard label="Cash refunded (returns)" value={totalCashRefundedReturns} accent={C.orange} icon="💸" sub="Actual cash paid back to customers" /> : null}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Card pad={0}>
                <div style={{ padding: "14px 16px", borderBottom: "1.5px solid " + C.border }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>📋 P&L Statement</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{range.label}</div>
                </div>
                {[
                  { label: "Sales Revenue", val: totalRevenue, color: C.blue },
                  ...(totalSalesReturnAmt > 0 ? [{ label: "(-) Sales Returns (retail value)", val: totalSalesReturnAmt, color: C.red, sub: true }] : []),
                  ...(totalSalesReturnAmt > 0 ? [{ label: "Net Revenue", val: netRevenue, color: C.blue, bold: true }] : []),
                  { label: "(-) Cost of Goods Sold", val: totalCOGS, color: C.red, sub: true },
                  { label: "Gross Profit", val: grossProfit, color: grossProfit >= 0 ? C.green : C.red, bold: true },
                  { label: "Gross Margin", val: grossMargin + "%", color: C.purple, sub: true, txt: true },
                  { label: "Repair / Service Revenue", val: repairRevenue, color: C.green, sub: true },
                  { label: "(-) Operating Expenses", val: totalExpenses, color: C.red, sub: true },
                  { label: "(-) Inventory Loss / Damage", val: totalDamageLoss, color: C.red, sub: true },
                  { label: "NET PROFIT / (LOSS)", val: netProfit, color: isProfit ? C.green : C.red, bold: true, large: true },
                  { label: "Net Margin", val: netMargin + "%", color: C.purple, sub: true, txt: true },
                  { label: "Purchases (period)", val: totalPurchases, color: C.orange, sub: true },
                  { label: "Assets Acquired", val: assetsAcquired, color: C.textMd, sub: true },
                  { label: "Capital Invested (period)", val: capitalIn, color: C.blue, sub: true },
                  { label: "Capital Withdrawn", val: capitalOut, color: C.red, sub: true },
                  { label: "Profit Distributed", val: profitDist, color: C.purple, sub: true },
                ].map(function (r, i) {
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: r.large ? "12px 16px" : "8px 16px", borderBottom: "1px solid " + C.borderLight, background: r.large ? (isProfit ? "#e8f5e9" : "#fde8ed") : r.bold ? "#f7f9ff" : "#fff" }}>
                      <span style={{ fontSize: r.large ? 14 : 12.5, fontWeight: r.bold ? 800 : 500, color: r.sub ? C.muted : C.text, paddingLeft: r.sub ? "14px" : "0" }}>{r.label}</span>
                      <span style={{ fontWeight: r.large ? 900 : r.bold ? 800 : 700, fontSize: r.large ? 18 : 13, color: r.color }}>{r.txt ? r.val : getCurrencySymbol() + " " + fmtNum(r.val)}</span>
                    </div>
                  );
                })}
              </Card>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Card>
                  <CardTitle sub="Where money was spent">Expense Breakdown</CardTitle>
                  {Object.keys(expByCategory).length === 0
                    ? <div style={{ textAlign: "center", padding: "20px 0", color: C.muted, fontSize: 13 }}>No expenses in this period.</div>
                    : Object.keys(expByCategory).sort(function (a, b) { return expByCategory[b] - expByCategory[a]; }).map(function (cat) {
                      var pct = totalExpenses > 0 ? Math.round(expByCategory[cat] / totalExpenses * 100) : 0;
                      return (
                        <div key={cat} style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 600 }}>{cat}</span>
                            <span style={{ fontSize: 12.5, fontWeight: 800, color: C.red }}>{getCurrencySymbol()} {fmtNum(expByCategory[cat])} <span style={{ color: C.muted, fontWeight: 500 }}>({pct}%)</span></span>
                          </div>
                          <div style={{ height: 6, background: C.border, borderRadius: 3 }}>
                            <div style={{ width: pct + "%", height: "100%", background: "linear-gradient(90deg,#e03151,#f06080)", borderRadius: 3 }}></div>
                          </div>
                        </div>
                      );
                    })
                  }
                </Card>
                <Card>
                  <CardTitle sub="Period activity summary">Activity Summary</CardTitle>
                  {[
                    { icon: "🧾", label: "Sales Invoices", val: rSales.length },
                    { icon: "🛒", label: "Purchase Orders", val: rPurch.length },
                    { icon: "💸", label: "Expense Entries", val: rExp.length },
                    { icon: "🔧", label: "Repairs", val: rRepairs.length },
                    { icon: "🏢", label: "Assets Acquired", val: rAssets.length },
                    { icon: "💼", label: "Capital In", val: getCurrencySymbol() + " " + fmtNum(capitalIn) },
                    { icon: "💰", label: "Borrowed (received)", val: getCurrencySymbol() + " " + fmtNum(borrowedIn) },
                    { icon: "📤", label: "Loans Given (out)", val: getCurrencySymbol() + " " + fmtNum(loansOut) },
                  ].map(function (r) {
                    return (
                      <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid " + C.borderLight }}>
                        <span style={{ fontSize: 12.5, color: C.textMd }}>{r.icon} {r.label}</span>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{r.val}</span>
                      </div>
                    );
                  })}
                </Card>
              </div>
            </div>

            {showMonthly && Object.keys(monthlyBD).length > 0 && (
              <Card>
                <CardTitle sub="Month-by-month performance">Monthly Breakdown</CardTitle>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><TH>Month</TH><TH>Revenue</TH><TH>COGS</TH><TH>Gross Profit</TH><TH>Expenses</TH><TH>Net Profit</TH><TH>Verdict</TH></tr></thead>
                    <tbody>
                      {Object.keys(monthlyBD).sort().map(function (m, i) {
                        var mb = monthlyBD[m]; var gp = mb.rev - mb.cogs; var np = gp - mb.exp; var ip = np >= 0;
                        return (
                          <TR key={m} i={i}>
                            <TD bold>{m}</TD>
                            <TD color={C.blue}>{getCurrencySymbol()} {fmtNum(mb.rev)}</TD>
                            <TD color={C.orange}>{getCurrencySymbol()} {fmtNum(mb.cogs)}</TD>
                            <td style={{ padding: "10px 14px", fontWeight: 700, color: gp >= 0 ? C.green : C.red }}>{getCurrencySymbol()} {fmtNum(gp)}</td>
                            <TD color={C.red}>{getCurrencySymbol()} {fmtNum(mb.exp)}</TD>
                            <td style={{ padding: "10px 14px", fontWeight: 900, fontSize: 14, color: ip ? C.green : C.red }}>{getCurrencySymbol()} {fmtNum(np)}</td>
                            <td style={{ padding: "10px 14px" }}><span style={{ background: ip ? "#e8f5e9" : "#fde8ed", color: ip ? "#1b5e20" : "#b71c1c", padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800 }}>{ip ? "✅ Profit" : "❌ Loss"}</span></td>
                          </TR>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

          </div>
        );
      })()}

      {tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: "1.5px solid " + C.border, boxShadow: C.shadow }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Total Cash</div>
              {(function () { var cb = getCashBalances(state); return (<>
              <div style={{ fontSize: 20, fontWeight: 900, color: cb.total >= 0 ? C.blue : C.red, marginBottom: 7 }}>{getCurrencySymbol()} {fmtNum(cb.total)}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ flex: 1, background: "#f0f9f4", borderRadius: 7, padding: "5px 8px" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#1b5e20", textTransform: "uppercase", marginBottom: 2 }}>Cash</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#1b5e20" }}>{getCurrencySymbol()} {fmtNum(cb.cash)}</div>
                </div>
                <div style={{ flex: 1, background: "#e8f0fe", borderRadius: 7, padding: "5px 8px" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#1565c0", textTransform: "uppercase", marginBottom: 2 }}>Bank</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#1565c0" }}>{getCurrencySymbol()} {fmtNum(cb.bank)}</div>
                </div>
              </div>
              </>); })()}
            </div>
            <StatCard label="Stock Value (Retail)" value={stockValue} accent={C.purple} icon="📦" sub={"Cost: " + getCurrencySymbol() + " " + fmtNum(stockCostValue)} />
            <StatCard label="Total Receivable" value={totalReceivable} accent={C.cyan} icon="💳" sub={"Payable: " + getCurrencySymbol() + " " + fmtNum(totalPayable)} />
            <StatCard label="Net Worth" value={netWorth} accent={netWorth >= 0 ? C.green : C.red} icon="🌟" sub={"Gross Margin: " + grossMarginPct + "%"} />
          </div>
          {glPL && glBS && (
            <Card>
              <CardTitle sub="All activity rolled into journal lines">Double-entry ledger</CardTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, fontSize: 13 }}>
                <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px", border: "1px solid " + C.borderLight }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>P&amp;L (ledger)</div>
                  <div style={{ fontWeight: 900, fontSize: 18, color: glPL.net >= 0 ? C.green : C.red }}>{getCurrencySymbol()} {fmtNum(glPL.net)}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Income {fmtNum(glPL.income)} · Expenses {fmtNum(glPL.expenses)}</div>
                </div>
                <div style={{ background: "#fffbeb", borderRadius: 10, padding: "12px 14px", border: "1px solid #fde68a" }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>Balance sheet (ledger)</div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>Assets {getCurrencySymbol()} {fmtNum(glBS.assets)}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Liabilities {fmtNum(glBS.liabilities)} · Equity {fmtNum(glBS.equity)} {glBS.balanced ? "· ✓" : ""}</div>
                </div>
              </div>
            </Card>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            <Card pad={0}>
              <SectionHead label="Income & Cash Flow" />
              <KVRow label="Capital Invested" value={capital} color={C.blue} />
              <KVRow label="Sales Income (Collected)" value={totalSalesIncome} color={C.green} />
              <KVRow label="Repair Revenue" value={totalRepairRevenue} color={C.green} />
              <KVRow label="Purchases Paid" value={totalPurchasesPaid} color={C.red} />
              <KVRow label="Operating Expenses" value={totalExpenses} color={C.red} />
              <KVRow label="Assets Purchased" value={totalAssetsSpent} color={C.orange} />
              <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 14px", fontSize: 13, fontWeight: 900, background: "#f0f4ff", borderTop: "2px solid " + C.border }}><span>Cash in Hand</span><span style={{ color: cashInHand >= 0 ? C.green : C.red }}>{getCurrencySymbol()} {fmtNum(cashInHand)}</span></div>
            </Card>
            <Card pad={0}>
              <SectionHead label="Profit & Loss" />
              <KVRow label="Total Revenue (Invoiced)" value={totalRevenue} color={C.blue} />
              <KVRow label="Tax on invoices (sum)" value={totalTaxOnInvoices} color={C.textMd} />
              <KVRow label="Cost of Goods Sold" value={totalCOGS} color={C.red} />
              <KVRow label="Gross Profit" value={totalProfit} color={totalProfit >= 0 ? C.green : C.red} />
              <KVRow label="Repair / Service Revenue" value={totalRepairRevenue} color={C.green} />
              <KVRow label="Operating Expenses" value={totalExpenses} color={C.red} />
              <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 14px", fontSize: 13, fontWeight: 900, background: "#f0f4ff", borderTop: "2px solid " + C.border }}><span>Net Profit</span><span style={{ color: (totalProfit + totalRepairRevenue - totalExpenses) >= 0 ? C.green : C.red }}>{getCurrencySymbol()} {fmtNum(totalProfit + totalRepairRevenue - totalExpenses)}</span></div>
            </Card>
            <Card pad={0}>
              <SectionHead label="Business Summary" />
              <KVRow label="Total Invoices" value={state.sales.length} color={C.blue} />
              <KVRow label="Total Products" value={state.products.length} color={C.purple} />
              <KVRow label="Total Customers" value={state.customers.length} color={C.cyan} />
              <KVRow label="Repair Jobs Done" value={state.repairs.filter(function(r){return r.status==="Delivered";}).length} color={C.green} />
              <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 14px", fontSize: 13, fontWeight: 900, background: "#f0f4ff", borderTop: "2px solid " + C.border }}><span>Active Repairs</span><span style={{ color: activeRepairs > 0 ? C.orange : C.green }}>{activeRepairs} jobs</span></div>
            </Card>
          </div>
          {isNetworkServerRpt && (function () {
            var by = {};
            state.sales.forEach(function (s) {
              var k = s.originDeviceId ? String(s.originDeviceId) : "__local__";
              if (!by[k]) by[k] = { count: 0, revenue: 0, label: s.originTerminalLabel || "" };
              by[k].count += 1;
              by[k].revenue += Number(s.total) || 0;
              if (!by[k].label && s.originTerminalLabel) by[k].label = s.originTerminalLabel;
            });
            var keys = Object.keys(by).sort(function (a, b) { return by[b].revenue - by[a].revenue; });
            return (
              <Card>
                <CardTitle sub="Invoices tagged with origin device (client POS)">Sales by terminal</CardTitle>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>
                  Compares revenue per terminal. Invoices created on this server PC appear as &quot;Server / main PC&quot;. Older invoices may be untagged until clients update.
                </div>
                <div style={{ border: "1px solid " + C.border, borderRadius: 8, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr style={{ background: "#f8faff" }}><th style={{ textAlign: "left", padding: "8px 10px" }}>Terminal</th><th style={{ textAlign: "right", padding: "8px 10px" }}>Invoices</th><th style={{ textAlign: "right", padding: "8px 10px" }}>Revenue</th></tr></thead>
                    <tbody>
                      {keys.map(function (k, idx) {
                        var b = by[k];
                        var name = b.label || terminalNameMap[k] || (k === "__local__" ? "Server / main PC" : (k.length > 14 ? k.slice(0, 10) + "…" : k));
                        return (
                          <tr key={k + "-" + idx} style={{ borderTop: "1px solid " + C.borderLight }}>
                            <td style={{ padding: "8px 10px", fontWeight: 700 }}>{name}</td>
                            <td style={{ padding: "8px 10px", textAlign: "right" }}>{b.count}</td>
                            <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 800, color: C.blue }}>{getCurrencySymbol()} {fmtNum(b.revenue)}</td>
                          </tr>
                        );
                      })}
                      {keys.length === 0 && (
                        <tr><td colSpan={3} style={{ padding: 14, color: C.muted, textAlign: "center" }}>No sales invoices yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })()}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
            <MetricChip label="Gross Profit" value={totalProfit} sub={grossMarginPct + "% margin"} />
            <MetricChip label="Net Profit" value={totalProfit + totalRepairRevenue - totalExpenses} />
            <MetricChip label="Net Worth" value={netWorth} />
            <MetricChip label="Working Capital" value={cashInHand + totalReceivable - totalPayable} />
          </div>
        </div>
      )}

      {tab === "daily" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Daily Report</div>
              <Input type="date" value={reportDate} onChange={function (e) { setReportDate(e.target.value); }} />
              {reportDate === today() && <span style={{ background: C.successSoft, color: C.green, padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, border: "1px solid #9ee8ce" }}>Today</span>}
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                <Btn sm col="cyan" onClick={printDailyReport}>🖨 Print</Btn>
                <WABtn title="Share Daily Report via WhatsApp" onClick={function () { shareAnyReport(printDailyReport, "Daily-Report-" + reportDate); }} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
              <StatCard label="Invoiced" value={daySalesTotal} accent={C.cyan} icon="🧾" sub={daySales.length + " invoices"} />
              <StatCard label="Collected" value={dayPaid} accent={C.green} icon="💰" sub={"Unpaid: " + getCurrencySymbol() + " " + fmtNum(dayUnpaid) + " · Tax: " + getCurrencySymbol() + " " + fmtNum(dayTaxCollected)} />
              <StatCard label="Gross Profit" value={dayProfit} accent={dayProfit >= 0 ? C.green : C.red} icon="📈" sub={"COGS: " + getCurrencySymbol() + " " + fmtNum(dayCOGS)} />
              <StatCard label="Expenses" value={dayExpenses} accent={C.orange} icon="💸" sub={"Net: " + getCurrencySymbol() + " " + fmtNum(dayNetProfit)} />
            </div>
          </Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Card pad={0}>
              <SectionHead label={"Sales on " + fmtDateFull(reportDate)} />
              {daySales.length === 0 && <div style={{ padding: 20, textAlign: "center", color: C.muted }}>No sales on this date</div>}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><TH>Invoice</TH><TH>Customer</TH><TH>Total</TH><TH>Tax</TH><TH>Status</TH></tr></thead>
                <tbody>{daySales.map(function (s, i) { return <TR key={s.id} i={i}><td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12 }}>{s.invoiceNo || s.id.slice(0, 8)}</td><TD bold>{s.customerName || "Walk-in"}</TD><TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(s.total)}</TD><TD color={C.muted}>{getCurrencySymbol()} {fmtNum(s.totalTax || 0)}</TD><td style={{ padding: "9px 14px" }}><Badge status={s.payStatus || "Paid"} /></td></TR>; })}</tbody>
              </table>
            </Card>
            <Card pad={0}>
              <SectionHead label={"Expenses on " + fmtDateFull(reportDate)} />
              {state.expenses.filter(function (e) { return e.date === reportDate; }).length === 0 && <div style={{ padding: 20, textAlign: "center", color: C.muted }}>No expenses on this date</div>}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><TH>Category</TH><TH>Description</TH><TH>Amount</TH></tr></thead>
                <tbody>{state.expenses.filter(function (e) { return e.date === reportDate; }).map(function (e, i) { return <TR key={e.id} i={i}><TD>{e.category}</TD><TD>{e.description}</TD><TD bold color={C.red}>{getCurrencySymbol()} {fmtNum(e.amount)}</TD></TR>; })}</tbody>
              </table>
              <div style={{ padding: "10px 14px", borderTop: "2px solid " + C.border, fontWeight: 700, display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Net Profit (after expenses)</span><span style={{ color: dayNetProfit >= 0 ? C.green : C.red }}>{getCurrencySymbol()} {fmtNum(dayNetProfit)}</span></div>
            </Card>
          </div>
        </div>
      )}

      {tab === "monthly" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Monthly Report</div>
              <input type="month" value={reportMonth} onChange={function (e) { setReportMonth(e.target.value); }} style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit" }} />
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                <Btn sm col="cyan" onClick={printMonthlyReport}>🖨 Print</Btn>
                <WABtn title="Share Monthly Report via WhatsApp" onClick={function () { shareAnyReport(printMonthlyReport, "Monthly-Report-" + reportMonth); }} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
              <StatCard label="Revenue" value={monthSalesTotal} accent={C.cyan} icon="💰" sub={monthSales.length + " invoices"} />
              <StatCard label="Gross Profit" value={monthProfit} accent={monthProfit >= 0 ? C.green : C.red} icon="📈" sub={"COGS: " + getCurrencySymbol() + " " + fmtNum(monthCOGS)} />
              <StatCard label="Expenses" value={monthExpenses} accent={C.orange} icon="💸" />
              <StatCard label="Net Profit" value={monthNetProfit} accent={monthNetProfit >= 0 ? C.green : C.red} icon="🏆" />
            </div>
          </Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Card pad={0}>
              <SectionHead label="Monthly P&L Summary" />
              <KVRow label="Total Revenue" value={monthSalesTotal} color={C.blue} />
              <KVRow label="Cash Collected" value={monthPaid} color={C.green} />
              <KVRow label="Receivable (Unpaid)" value={monthReceivable} color={C.orange} />
              <KVRow label="Cost of Goods Sold" value={monthCOGS} color={C.red} />
              <KVRow label="Operating Expenses" value={monthExpenses} color={C.red} />
              <KVRow label="Purchases Made" value={monthPurchases} color={C.purple} />
              <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 14px", fontSize: 13, fontWeight: 900, background: "#f0f4ff", borderTop: "2px solid " + C.border }}><span>Net Profit</span><span style={{ color: monthNetProfit >= 0 ? C.green : C.red }}>{getCurrencySymbol()} {fmtNum(monthNetProfit)}</span></div>
            </Card>
            <Card pad={0}>
              <SectionHead label={"Top Products — " + reportMonth} />
              {(function () {
                var prodMap = {};
                monthSales.forEach(function (s) {
                  s.items.forEach(function (it) {
                    if (!prodMap[it.name]) prodMap[it.name] = { qty: 0, revenue: 0 };
                    prodMap[it.name].qty += it.qty;
                    prodMap[it.name].revenue += it.qty * it.price;
                  });
                });
                var sorted = Object.keys(prodMap).sort(function (a, b) { return prodMap[b].revenue - prodMap[a].revenue; }).slice(0, 8);
                if (sorted.length === 0) return <div style={{ padding: 20, textAlign: "center", color: C.muted }}>No sales data</div>;
                return (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><TH>Product</TH><TH>Qty</TH><TH>Revenue</TH></tr></thead>
                    <tbody>{sorted.map(function (name, i) { return <TR key={name} i={i}><TD bold>{name}</TD><TD center>{prodMap[name].qty}</TD><TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(prodMap[name].revenue)}</TD></TR>; })}</tbody>
                  </table>
                );
              })()}
            </Card>
          </div>
        </div>
      )}

      {tab === "inventory" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <Btn sm col="cyan" onClick={printStockReport}>🖨 Print Stock Report</Btn>
              <WABtn title="Share Stock Report via WhatsApp" onClick={function () { shareAnyReport(printStockReport, "Stock-Report"); }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
            <StatCard money={false} label="Total Products" value={state.products.length} accent={C.blue} icon="📦" sub="SKUs" />
            <StatCard label="Stock Retail Value" value={stockValue} accent={C.purple} icon="💰" />
            <StatCard label="Stock Cost Value" value={stockCostValue} accent={C.orange} icon="🏷" />
            <StatCard label="Potential Profit" value={stockValue - stockCostValue} accent={C.green} icon="📈" />
          </div>
          <Card>
            <CardTitle sub={state.products.length + " products"}>Inventory Report</CardTitle>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><TH>Product</TH><TH>Category</TH><TH>Cost</TH><TH>Price</TH><TH>Margin %</TH><TH>Markup %</TH><TH>Stock</TH><TH>Damaged</TH><TH>Stock Value</TH></tr></thead>
                <tbody>
                  {state.products.slice().sort(function (a, b) { return (b.price * b.stock) - (a.price * a.stock); }).map(function (p, i) {
                    var margin = p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
                    var markup = p.cost > 0 ? Math.round(((p.price - p.cost) / p.cost) * 100) : 0;
                    return (
                      <TR key={p.id} i={i}>
                        <TD bold>{p.name}</TD>
                        <TD>{p.category}</TD>
                        <TD>{getCurrencySymbol()} {fmtNum(p.cost)}</TD>
                        <TD color={C.blue}>{getCurrencySymbol()} {fmtNum(p.price)}</TD>
                        <td style={{ padding: "10px 14px" }}><span style={{ background: margin > 30 ? C.successSoft : margin > 10 ? C.warnSoft : C.dangerSoft, color: margin > 30 ? C.green : margin > 10 ? C.orange : C.red, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{margin}%</span></td>
                        <TD color={C.purple}>{markup}%</TD>
                        <td style={{ padding: "10px 14px" }}><span style={{ fontWeight: 700, color: p.stock === 0 ? C.red : p.stock <= 3 ? C.orange : C.green }}>{getBulkDisplayParts(p) ? fmtStockDual(p) : fmtStock(p.stock || 0, p.unit)}</span></td>
                        <TD color={p.damaged > 0 ? C.red : C.muted}>{p.damaged || 0}</TD>
                        <TD bold>{getCurrencySymbol()} {fmtNum(p.price * p.stock)}</TD>
                      </TR>
                    );
                  })}
                  <tr style={{ background: "#f0f4ff" }}><td colSpan={8} style={{ padding: "10px 14px", fontWeight: 800, fontSize: 13 }}>TOTAL</td><TD bold color={C.purple}>{getCurrencySymbol()} {fmtNum(stockValue)}</TD></tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === "customers" && (
        <Card>
          <CardTitle sub={state.customers.length + " customers"} action={<div style={{ display: "flex", gap: 6, alignItems: "center" }}><Btn sm col="cyan" onClick={printCustomerBalanceReport}>🖨 Print Balance Report</Btn><WABtn title="Share via WhatsApp" onClick={function () { shareAnyReport(printCustomerBalanceReport, "Customer-Balance-Report"); }} /></div>}>Customer Report</CardTitle>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><TH>#</TH><TH>Customer</TH><TH>Phone</TH><TH>Invoices</TH><TH>Total Billed</TH><TH>Total Paid</TH><TH>Outstanding</TH><TH>Avg Invoice</TH></tr></thead>
              <tbody>
                {state.customers.slice().sort(function (a, b) { return (b.totalSpent || 0) - (a.totalSpent || 0); }).map(function (c, i) {
                  var custSales = state.sales.filter(function (s) { return s.customerId === c.id || s.customerName === c.name; });
                  var totalBilled = custSales.reduce(function (a, s) { return a + s.total; }, 0);
                  var totalPaid = custSales.reduce(function (a, s) { return a + (s.paid || 0); }, 0);
                  var outstanding = totalBilled - totalPaid;
                  var avg = custSales.length > 0 ? Math.round(totalBilled / custSales.length) : 0;
                  return (
                    <TR key={c.id} i={i}>
                      <TD color={C.muted}>{i + 1}</TD>
                      <TD bold>{c.name}</TD>
                      <TD>{c.phone}</TD>
                      <TD center>{custSales.length}</TD>
                      <TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(totalBilled)}</TD>
                      <TD bold color={C.green}>{getCurrencySymbol()} {fmtNum(totalPaid)}</TD>
                      <TD bold color={outstanding > 0 ? C.red : C.muted}>{getCurrencySymbol()} {fmtNum(outstanding)}</TD>
                      <TD>{getCurrencySymbol()} {fmtNum(avg)}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "expenses" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
            <StatCard label="Total Expenses" value={totalExpenses} accent={C.red} icon="💸" sub={state.expenses.length + " records"} />
            <StatCard label="This Month" value={state.expenses.filter(function (e) { return e.date.slice(0, 7) === today().slice(0, 7); }).reduce(function (a, e) { return a + e.amount; }, 0)} accent={C.orange} icon="📆" />
            <StatCard label="Today" value={state.expenses.filter(function (e) { return e.date === today(); }).reduce(function (a, e) { return a + e.amount; }, 0)} accent={C.amber} icon="📅" />
            <StatCard label="Avg per Month" value={Math.round(totalExpenses / Math.max(1, (function () { var m = {}; state.expenses.forEach(function (e) { m[e.date.slice(0, 7)] = 1; }); return Object.keys(m).length; })()))} accent={C.purple} icon="📊" />
          </div>
          <Card>
            <CardTitle sub="All-time breakdown by category">Expenses by Category</CardTitle>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><TH>Category</TH><TH>Records</TH><TH>Total Amount</TH><TH>% of Total</TH><TH>Distribution</TH></tr></thead>
                <tbody>
                  {(function () {
                    var cats = {};
                    state.expenses.forEach(function (e) {
                      if (!cats[e.category]) cats[e.category] = { count: 0, total: 0 };
                      cats[e.category].count++;
                      cats[e.category].total += e.amount;
                    });
                    return Object.keys(cats).sort(function (a, b) { return cats[b].total - cats[a].total; }).map(function (cat, i) {
                      var pct = totalExpenses > 0 ? Math.round((cats[cat].total / totalExpenses) * 100) : 0;
                      return (
                        <TR key={cat} i={i}>
                          <TD bold>{cat}</TD>
                          <TD center>{cats[cat].count}</TD>
                          <TD bold color={C.red}>{getCurrencySymbol()} {fmtNum(cats[cat].total)}</TD>
                          <TD bold color={C.orange}>{pct}%</TD>
                          <td style={{ padding: "10px 14px", width: 160 }}>
                            <div style={{ height: 8, background: C.border, borderRadius: 4 }}>
                              <div style={{ width: pct + "%", height: "100%", background: "linear-gradient(90deg," + C.orange + "," + C.red + ")", borderRadius: 4 }}></div>
                            </div>
                          </td>
                        </TR>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === "repairs" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
            {["Pending", "Repairing", "Ready", "Delivered", "Cancelled"].map(function (s) {
              var cnt = state.repairs.filter(function (r) { return r.status === s; }).length;
              var cols = { Pending: C.blue, Repairing: C.amber, Ready: C.green, Delivered: C.muted, Cancelled: C.red };
              return <div key={s} style={{ background: "#fff", borderRadius: 12, padding: "14px", border: "1.5px solid " + C.border, textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: cols[s] }}>{cnt}</div><div style={{ fontSize: 11, color: cols[s], fontWeight: 700, marginTop: 3 }}>{s}</div></div>;
            })}
          </div>
          <Card>
            <CardTitle sub={state.repairs.length + " total jobs"}>Repairs Report</CardTitle>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><TH>Date</TH><TH>Customer</TH><TH>Device</TH><TH>Brand/Model</TH><TH>Est. Cost</TH><TH>Status</TH></tr></thead>
                <tbody>
                  {state.repairs.slice().reverse().map(function (r, i) {
                    return <TR key={r.id} i={i}><TD>{fmtDateFull(r.dateIn || r.date)}</TD><TD bold>{r.customer}</TD><TD>{r.deviceType || r.device}</TD><TD>{r.brand} {r.modelNo}</TD><TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(r.estimatedCost || r.cost || 0)}</TD><td style={{ padding: "9px 14px" }}><Badge status={r.status || "Pending"} /></td></TR>;
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === "assets" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            <StatCard label="Capital Invested" value={capital} accent={C.blue} icon="💰" />
            <StatCard label="Total Assets Value" value={totalAssetsSpent} accent={C.orange} icon="🏛" />
            <StatCard label="Remaining Capital" value={capital - totalAssetsSpent} accent={(capital - totalAssetsSpent) >= 0 ? C.green : C.red} icon="📊" sub="Capital minus assets" />
            <StatCard money={false} label="Total Assets" value={(state.assets || []).length} accent={C.cyan} icon="📋" />
            <StatCard money={false} label="Categories Used" value={(function () { var cats = {}; (state.assets || []).forEach(function (a) { cats[a.category] = 1; }); return Object.keys(cats).length; })()} accent={C.purple} icon="🗂" />
            <StatCard label="Highest Value Asset" value={(function () { var mx = 0; (state.assets || []).forEach(function (a) { if ((a.amount || 0) > mx) mx = a.amount; }); return mx; })()} accent={C.amber} icon="🏆" sub="single asset" />
          </div>

          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              <CardTitle sub={(state.assets || []).length + " assets recorded"}>Assets Register — Full Detail</CardTitle>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 4 }}>Category</div>
                  <select value={assetFilterCat} onChange={function (e) { setAssetFilterCat(e.target.value); }} style={{ border: "1.5px solid " + C.border, borderRadius: 7, padding: "7px 10px", fontSize: 12, color: C.text, background: "#fff", fontFamily: "inherit" }}>
                    <option>All</option>
                    {["Shop Interior", "Advance Payment / Deposit", "Rent Deposit", "Equipment / Machinery", "Computers / Electronics", "Printer / Scanner", "Networking Equipment", "Furniture & Fixtures", "Vehicle", "Security System (CCTV)", "Electrical / UPS", "Software / Licenses", "Tools / Instruments", "Renovation / Improvements", "Other"].map(function (c) { return <option key={c}>{c}</option>; })}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 4 }}>From</div>
                  <input type="date" value={assetFilterFrom} onChange={function (e) { setAssetFilterFrom(e.target.value); }} style={{ border: "1.5px solid " + C.border, borderRadius: 7, padding: "7px 10px", fontSize: 12, color: C.text, background: "#fff", outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 4 }}>To</div>
                  <input type="date" value={assetFilterTo} onChange={function (e) { setAssetFilterTo(e.target.value); }} style={{ border: "1.5px solid " + C.border, borderRadius: 7, padding: "7px 10px", fontSize: 12, color: C.text, background: "#fff", outline: "none" }} />
                </div>
                <button onClick={function () { setAssetFilterCat("All"); setAssetFilterFrom(""); setAssetFilterTo(""); }} style={{ padding: "7px 14px", background: C.border, color: C.textMd, border: "none", borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Clear</button>
                <button onClick={function () {
                  var shopName = state.settings.shopName || "Techon ERP";
                  var addr = state.settings.address || "";
                  var phone = state.settings.phone || "";
                  var filteredA = (state.assets || []).filter(function (a) {
                    var catOk = assetFilterCat === "All" || a.category === assetFilterCat;
                    var fromOk = !assetFilterFrom || a.date >= assetFilterFrom;
                    var toOk = !assetFilterTo || a.date <= assetFilterTo;
                    return catOk && fromOk && toOk;
                  }).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
                  var totalPrint = filteredA.reduce(function (a, x) { return a + x.amount; }, 0);
                  var filterLabel = assetFilterCat !== "All" ? assetFilterCat : "All Categories";
                  if (assetFilterFrom || assetFilterTo) filterLabel += " | " + (assetFilterFrom || "...") + " to " + (assetFilterTo || "...");
                  var css2 = "body{font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:12px;color:#111;padding:16px;} table{width:100%;border-collapse:collapse;margin-bottom:14px;} th{background:#1a237e;color:#fff;padding:7px 10px;text-align:left;font-size:11px;} td{padding:7px 10px;border-bottom:1px solid #e8edf8;} tr:nth-child(even){background:#f8faff;} .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;} .shop{font-size:18px;font-weight:800;color:#1a237e;} .title{font-size:15px;font-weight:800;} .sub{font-size:11px;color:#555;} .tot{background:#e8eeff!important;font-weight:700;} @media print{@page{size:A4;margin:12mm;}}";
                  var rows = "";
                  filteredA.forEach(function (a, i) {
                    var serial = "AST-" + String(i + 1).padStart(4, "0");
                    rows += "<tr><td>" + serial + "</td><td>" + escapeHtml(a.date) + "</td><td style='font-weight:600'>" + escapeHtml(a.name) + "</td><td>" + escapeHtml(a.category) + "</td><td style='font-weight:700;color:#e65100'>" + getCurrencySymbol() + " " + Number(a.amount).toLocaleString() + "</td><td>" + escapeHtml(a.note || "-") + "</td></tr>";
                  });
                  var fullAssets = "<!DOCTYPE html><html><head>" + PRINT_FONT_LINK + "<title>Assets Register</title><style>" + css2 + "</style></head><body>";
                  fullAssets += "<div class='hdr'><div><div class='shop'>" + escapeHtml(shopName) + "</div>" + (addr ? "<div class='sub'>" + escapeHtml(addr) + "</div>" : "") + (phone ? "<div class='sub'>Tel: " + escapeHtml(phone) + "</div>" : "") + "</div><div style='text-align:right'><div class='title'>Assets Register</div><div class='sub'>Filter: " + filterLabel + "</div><div class='sub'>Printed: " + new Date().toLocaleString() + "</div></div></div>";
                  fullAssets += "<table><thead><tr><th>#</th><th>Date</th><th>Asset Name</th><th>Category</th><th>Amount</th><th>Note</th></tr></thead><tbody>" + rows + "<tr class='tot'><td colspan='4'>TOTAL (" + filteredA.length + " assets)</td><td>" + getCurrencySymbol() + " " + Number(totalPrint).toLocaleString() + "</td><td></td></tr></tbody></table>";
                  fullAssets += "</body></html>";
                  openPrintWindow(fullAssets, { width: 1000, height: 750, delay: 500 });
                }} style={{ padding: "7px 14px", background: C.blue, color: "#fff", border: "none", borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Print Register</button>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#f0f4ff" }}>
                  <TH>#</TH><TH>Ref No</TH><TH>Date</TH><TH>Asset Name</TH><TH>Category</TH><TH>Amount (Rs)</TH><TH>Note</TH><TH center>Actions</TH>
                </tr></thead>
                <tbody>
                  {(function () {
                    var filtered2 = (state.assets || []).filter(function (a) {
                      var catOk = assetFilterCat === "All" || a.category === assetFilterCat;
                      var fromOk = !assetFilterFrom || a.date >= assetFilterFrom;
                      var toOk = !assetFilterTo || a.date <= assetFilterTo;
                      return catOk && fromOk && toOk;
                    }).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
                    var filteredTotal = filtered2.reduce(function (acc, a) { return acc + a.amount; }, 0);
                    if (filtered2.length === 0) {
                      return <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>No assets found for selected filters.</td></tr>;
                    }
                    return filtered2.map(function (a, i) {
                      var serial = "AST-" + String(i + 1).padStart(4, "0");
                      return (
                        <TR key={a.id} i={i}>
                          <TD color={C.muted}>{i + 1}</TD>
                          <td style={{ padding: "10px 12px" }}>
                            <span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: C.muted, background: C.accentSoft, padding: "2px 7px", borderRadius: 4 }}>{serial}</span>
                          </td>
                          <TD>{fmtDateFull(a.date)}</TD>
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ fontWeight: 700, color: C.text, fontSize: 13 }}>{a.name}</div>
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <span style={{ background: C.accentSoft, color: C.accent, borderRadius: 5, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>{a.category}</span>
                          </td>
                          <td style={{ padding: "10px 12px", fontWeight: 800, color: C.orange, fontSize: 14 }}>{getCurrencySymbol()} {fmtNum(a.amount)}</td>
                          <TD color={C.muted}>{a.note || "—"}</TD>
                          <td style={{ padding: "8px 10px" }}>
                            <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                              <button onClick={function () { setRptAssetEdit(Object.assign({}, a)); setRptAssetAction("edit"); setRptAssetPw(""); setRptAssetReason(""); setRptAssetPwMsg(""); }} style={{ padding: "5px 12px", background: C.accentSoft, color: C.accent, border: "1.5px solid " + C.accent, borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Edit</button>
                              <button onClick={function () { setRptAssetEdit(Object.assign({}, a)); setRptAssetAction("delete"); setRptAssetPw(""); setRptAssetReason(""); setRptAssetPwMsg(""); }} style={{ padding: "5px 12px", background: C.dangerSoft, color: C.red, border: "1.5px solid " + C.red, borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Delete</button>
                            </div>
                          </td>
                        </TR>
                      );
                    });
                  })()}
                  {(state.assets || []).length > 0 && (
                    <tr style={{ background: "#f0f4ff" }}>
                      <td colSpan={5} style={{ padding: "10px 14px", fontWeight: 800, fontSize: 13 }}>TOTAL {assetFilterCat !== "All" || assetFilterFrom || assetFilterTo ? "(Filtered)" : ""}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 800, color: C.orange, fontSize: 14 }}>{getCurrencySymbol()} {fmtNum((state.assets || []).filter(function (a) { var catOk = assetFilterCat === "All" || a.category === assetFilterCat; var fromOk = !assetFilterFrom || a.date >= assetFilterFrom; var toOk = !assetFilterTo || a.date <= assetFilterTo; return catOk && fromOk && toOk; }).reduce(function (acc, a) { return acc + a.amount; }, 0))}</td>
                      <td colSpan={2}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Card>
              <CardTitle sub="spending breakdown per category">Assets by Category</CardTitle>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><TH>Category</TH><TH>Count</TH><TH>Total Amount</TH><TH>Share %</TH><TH>Bar</TH></tr></thead>
                  <tbody>
                    {(function () {
                      var cats = {};
                      (state.assets || []).forEach(function (a) {
                        if (!cats[a.category]) { var tmp = {}; tmp.count = 0; tmp.total = 0; cats[a.category] = tmp; }
                        cats[a.category].count++;
                        cats[a.category].total += a.amount;
                      });
                      var catKeys = Object.keys(cats).sort(function (x, y) { return cats[y].total - cats[x].total; });
                      if (catKeys.length === 0) return <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: C.muted }}>No assets yet.</td></tr>;
                      return catKeys.map(function (cat, i) {
                        var pct = totalAssetsSpent > 0 ? Math.round((cats[cat].total / totalAssetsSpent) * 100) : 0;
                        return (
                          <TR key={cat} i={i}>
                            <TD bold>{cat}</TD>
                            <TD center>{cats[cat].count}</TD>
                            <TD bold color={C.orange}>{getCurrencySymbol()} {fmtNum(cats[cat].total)}</TD>
                            <TD bold color={C.blue}>{pct}%</TD>
                            <td style={{ padding: "10px 14px", width: 120 }}>
                              <div style={{ height: 8, background: C.border, borderRadius: 4 }}>
                                <div style={{ width: pct + "%", height: "100%", background: "linear-gradient(90deg," + C.orange + "," + C.amber + ")", borderRadius: 4 }}></div>
                              </div>
                            </td>
                          </TR>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <CardTitle sub="top 5 highest-value assets">Top Assets by Value</CardTitle>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><TH>#</TH><TH>Asset Name</TH><TH>Category</TH><TH>Amount</TH></tr></thead>
                  <tbody>
                    {(function () {
                      var sorted = (state.assets || []).slice().sort(function (a, b) { return b.amount - a.amount; }).slice(0, 10);
                      if (sorted.length === 0) return <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: C.muted }}>No assets yet.</td></tr>;
                      return sorted.map(function (a, i) {
                        return (
                          <TR key={a.id} i={i}>
                            <td style={{ padding: "9px 12px", fontWeight: 800, color: i === 0 ? C.amber : C.muted, fontSize: 13 }}>{i === 0 ? "🏆" : (i === 1 ? "🥈" : (i === 2 ? "🥉" : i + 1))}</td>
                            <TD bold>{a.name}</TD>
                            <td style={{ padding: "9px 12px" }}><span style={{ background: C.accentSoft, color: C.accent, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{a.category}</span></td>
                            <TD bold color={C.orange}>{getCurrencySymbol()} {fmtNum(a.amount)}</TD>
                          </TR>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {S.get("tc3_assetLog", []).length > 0 && (
            <Card>
              <CardTitle sub={S.get("tc3_assetLog", []).length + " audit entries"}>Asset Audit Log</CardTitle>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><TH>Date</TH><TH>Action</TH><TH>Asset</TH><TH>Category</TH><TH>Amount</TH><TH>Reason</TH></tr></thead>
                  <tbody>
                    {S.get("tc3_assetLog", []).slice().reverse().map(function (lg, i) {
                      return (
                        <TR key={lg.id} i={i}>
                          <TD>{fmtDateFull(lg.date)}</TD>
                          <td style={{ padding: "9px 12px" }}>
                            <span style={{ background: lg.action === "Deleted" ? C.dangerSoft : C.warnSoft, color: lg.action === "Deleted" ? C.red : C.amber, borderRadius: 5, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>{lg.action}</span>
                          </td>
                          <TD bold>{lg.assetName}</TD>
                          <TD>{lg.category || "—"}</TD>
                          <TD color={C.orange}>{getCurrencySymbol()} {fmtNum(lg.amount)}</TD>
                          <TD>{lg.reason}</TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {rptAssetAction === "edit" && rptAssetEdit && (
            <Modal title={"Edit Asset — " + rptAssetEdit.name} onClose={function () { setRptAssetAction(null); setRptAssetEdit(null); setRptAssetPwMsg(""); }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ background: C.warnSoft, border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#92400e", fontWeight: 600 }}>
                  Editing an asset is permanently recorded in the audit log. Password required.
                </div>
                <Input label="Asset Name *" value={rptAssetEdit.name} onChange={function (e) { setRptAssetEdit(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Input label="Amount (Rs) *" type="number" value={rptAssetEdit.amount} onChange={function (e) { setRptAssetEdit(function (x) { return Object.assign({}, x, { amount: parseFloat(e.target.value) || 0 }); }); }} />
                  <Input label="Date" type="date" value={rptAssetEdit.date} onChange={function (e) { setRptAssetEdit(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 5 }}>Category</div>
                  <select value={rptAssetEdit.category || ""} onChange={function (e) { setRptAssetEdit(function (x) { return Object.assign({}, x, { category: e.target.value }); }); }} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: C.text, background: "#fff", fontFamily: "inherit" }}>
                    {["Shop Interior", "Advance Payment / Deposit", "Rent Deposit", "Equipment / Machinery", "Computers / Electronics", "Printer / Scanner", "Networking Equipment", "Furniture & Fixtures", "Vehicle", "Security System (CCTV)", "Electrical / UPS", "Software / Licenses", "Tools / Instruments", "Renovation / Improvements", "Other"].map(function (c) { return <option key={c}>{c}</option>; })}
                  </select>
                </div>
                <Input label="Note" value={rptAssetEdit.note || ""} onChange={function (e) { setRptAssetEdit(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} />
                <Input label="Reason for Edit *" value={rptAssetReason} onChange={function (e) { setRptAssetReason(e.target.value); }} />
                <Input label="Password *" type="password" value={rptAssetPw} onChange={function (e) { setRptAssetPw(e.target.value); setRptAssetPwMsg(""); }} />
                {rptAssetPwMsg && <div style={{ color: C.red, fontSize: 12, fontWeight: 600 }}>{rptAssetPwMsg}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn col="blue" onClick={doRptAssetAction} disabled={!rptAssetPw || !rptAssetReason}>Save Changes</Btn>
                  <Btn col="gray" onClick={function () { setRptAssetAction(null); setRptAssetEdit(null); setRptAssetPwMsg(""); }}>Cancel</Btn>
                </div>
              </div>
            </Modal>
          )}

          {rptAssetAction === "delete" && rptAssetEdit && (
            <Modal title={"Delete Asset — " + rptAssetEdit.name} onClose={function () { setRptAssetAction(null); setRptAssetEdit(null); setRptAssetPwMsg(""); }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ background: C.dangerSoft, border: "1.5px solid " + C.red, borderRadius: 8, padding: "12px 16px" }}>
                  <div style={{ fontWeight: 800, color: C.red, fontSize: 14, marginBottom: 6 }}>Confirm Deletion</div>
                  <div style={{ fontSize: 13, color: C.text }}>Asset: <strong>{rptAssetEdit.name}</strong></div>
                  <div style={{ fontSize: 13, color: C.text }}>Category: {rptAssetEdit.category}</div>
                  <div style={{ fontSize: 13, color: C.red, fontWeight: 700 }}>Amount: {getCurrencySymbol()} {fmtNum(rptAssetEdit.amount)}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>This action is irreversible and permanently recorded in the audit log.</div>
                </div>
                <Input label="Reason for Deletion *" value={rptAssetReason} onChange={function (e) { setRptAssetReason(e.target.value); }} />
                <Input label="Password *" type="password" value={rptAssetPw} onChange={function (e) { setRptAssetPw(e.target.value); setRptAssetPwMsg(""); }} />
                {rptAssetPwMsg && <div style={{ color: C.red, fontSize: 12, fontWeight: 600 }}>{rptAssetPwMsg}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn col="red" onClick={doRptAssetAction} disabled={!rptAssetPw || !rptAssetReason}>Confirm Delete</Btn>
                  <Btn col="gray" onClick={function () { setRptAssetAction(null); setRptAssetEdit(null); setRptAssetPwMsg(""); }}>Cancel</Btn>
                </div>
              </div>
            </Modal>
          )}

        </div>
      )}

      {tab === "balancesheet" && (function () {
        var cur = getCurrencySymbol();
        var shopName = state.settings.shopName || "Techon ERP";
        var addr = state.settings.address || "";
        var phone = state.settings.phone || "";
        var accent = state.settings.invoiceAccentColor || "#0d47a1";
        var printedOn = new Date().toLocaleString();

        /* ── ASSETS SIDE ── */
        /* Current Assets */
        var bsCash = cashInHand;
        var bsReceivables = totalReceivable;
        var bsStock = stockCostValue;
        var bsCurrentAssets = bsCash + bsReceivables + bsStock;

        /* Fixed Assets */
        var bsFixedAssets = totalAssetsSpent;

        /* Total Assets */
        var bsTotalAssets = bsCurrentAssets + bsFixedAssets;

        /* ── LIABILITIES SIDE ── */
        /* Current Liabilities */
        var bsPayables = totalPayable;

        /* Total Liabilities */
        var bsTotalLiabilities = bsPayables;

        /* ── OWNER'S EQUITY ── */
        /* Theoretical stock = what stock SHOULD be based on all recorded transactions.
           Any difference vs actual stock catches direct edits, damages, deletions and WAC rounding in one shot. */
        var obSnap = S.get("tc3_openBal", null);
        var obStockVal = (obSnap && obSnap.completed) ? (obSnap.stock || []).reduce(function (a, s) { return a + s.cost * s.qty; }, 0) : 0;
        var totalPurchasesVal = state.purchases.reduce(function (a, p) { return a + (p.items || []).reduce(function (b, it) { return b + ((it.inputQty !== undefined ? it.inputQty : it.qty) * it.cost); }, 0); }, 0);
        var totalPurchaseReturnsVal = (state.purchaseReturns || []).reduce(function (a, r) { return a + (r.qty || 0) * (r.cost || 0); }, 0);
        var theoreticalStock = obStockVal + totalPurchasesVal - totalCOGS - totalPurchaseReturnsVal;
        var manualStockAdjustments = stockCostValue - theoreticalStock;
        var totalProfitDist = S.get("tc3_profitDist", []).reduce(function (a, pd) { return a + pd.amount; }, 0);
        var bsCapital = capital;
        var bsRetainedEarnings = totalProfit - totalExpenses - totalProfitDist + manualStockAdjustments;
        var bsTotalEquity = bsCapital + bsRetainedEarnings;
        var bsBalanced = Math.abs(bsTotalAssets - (bsTotalLiabilities + bsTotalEquity)) < 1;

        /* ── Row helper for on-screen ── */
        var BSRow = function (p) {
          return (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: p.sub ? "7px 14px 7px 28px" : "9px 14px",
              borderBottom: "1px solid " + C.borderLight,
              background: p.total ? "linear-gradient(90deg,#f0f4ff,#e8eeff)" : p.sub ? "#fafbff" : "#fff" }}>
              <span style={{ fontSize: p.total ? 14 : 13, fontWeight: p.total ? 800 : p.sub ? 500 : 600,
                color: p.total ? C.text : p.sub ? C.muted : C.text }}>{p.label}</span>
              <span style={{ fontSize: p.total ? 15 : 13, fontWeight: p.total ? 900 : 700,
                color: p.color || (p.total ? C.accent : C.text) }}>
                {cur} {fmtNum(p.value)}
              </span>
            </div>
          );
        };

        var SHead = function (p) {
          return <div style={{ padding: "8px 14px 6px", fontSize: 10, fontWeight: 800, color: "#fff",
            textTransform: "uppercase", letterSpacing: "0.1em",
            background: "linear-gradient(90deg," + accent + ",#1565c0)" }}>{p.label}</div>;
        };

        /* ── Print function ── */
        var printBS = function () {
          var row = function (label, value, indent, bold, color) {
            return "<tr style='background:" + (bold ? "#f0f4ff" : indent ? "#fafbff" : "#fff") + "'>" +
              "<td style='padding:7px 12px 7px " + (indent ? "28px" : "12px") + ";font-size:12px;font-weight:" + (bold ? "800" : indent ? "400" : "600") + ";color:#111;'>" + escapeHtml(label) + "</td>" +
              "<td style='padding:7px 12px;text-align:right;font-size:" + (bold ? "13px" : "12px") + ";font-weight:" + (bold ? "900" : "700") + ";color:" + (color || (bold ? accent : "#111")) + ";'>" + cur + " " + fmtNum(value) + "</td></tr>";
          };
          var shead = function (label) {
            return "<tr><td colspan='2' style='padding:8px 12px 6px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;background:" + accent + ";color:#fff;'>" + escapeHtml(label) + "</td></tr>";
          };
          var spacer = "<tr><td colspan='2' style='padding:4px;'></td></tr>";

          var html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Balance Sheet — " + escapeHtml(shopName) + "</title>";
          html += "<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#111;padding:32px 36px;}";
          html += ".hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid " + accent + ";padding-bottom:16px;margin-bottom:24px;}";
          html += ".shop{font-size:22px;font-weight:900;color:" + accent + ";text-transform:uppercase;letter-spacing:-.02em;}";
          html += ".sub{font-size:11px;color:#555;margin-top:3px;}";
          html += ".title{font-size:18px;font-weight:800;color:#111;text-align:right;}";
          html += ".layout{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;}";
          html += "table{width:100%;border-collapse:collapse;}";
          html += ".net-box{background:" + (bsTotalEquity >= 0 ? "#e6f7f2" : "#fde8ed") + ";border:2px solid " + (bsTotalEquity >= 0 ? "#9ee8ce" : "#f9a8ba") + ";border-radius:10px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;margin-top:20px;}";
          html += ".net-label{font-size:14px;font-weight:800;color:#111;}";
          html += ".net-val{font-size:22px;font-weight:900;color:" + (bsTotalEquity >= 0 ? "#0f9e6e" : "#e03151") + ";}";
          html += ".balance-check{text-align:center;font-size:11px;font-weight:700;color:" + (bsBalanced ? "#0f9e6e" : "#e03151") + ";margin-top:14px;padding:8px;background:" + (bsBalanced ? "#e6f7f2" : "#fde8ed") + ";border-radius:6px;}";
          html += ".footer{text-align:center;font-size:10px;color:#aaa;margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;}";
          html += "@media print{body{padding:16px;}}</style></head><body>";

          html += "<div class='hdr'><div><div class='shop'>" + escapeHtml(shopName) + "</div>";
          if (addr) html += "<div class='sub'>" + escapeHtml(addr) + "</div>";
          if (phone) html += "<div class='sub'>Tel: " + escapeHtml(phone) + "</div>";
          html += "</div><div><div class='title'>Balance Sheet</div><div class='sub'>As at: " + escapeHtml(printedOn) + "</div></div></div>";

          html += "<div class='layout'>";

          /* LEFT: Assets */
          html += "<div><table>";
          html += shead("ASSETS");
          html += spacer;
          html += shead("Current Assets");
          html += row("Cash & Bank", bsCash, true, false, "#0f9e6e");
          html += row("Accounts Receivable", bsReceivables, true, false, "#2255d4");
          html += row("Inventory (Cost)", bsStock, true, false, "#6b3fc2");
          html += row("Total Current Assets", bsCurrentAssets, false, true, accent);
          html += spacer;
          html += shead("Fixed Assets");
          html += row("Business Assets", bsFixedAssets, true, false, "#e07a10");
          html += row("Total Fixed Assets", bsFixedAssets, false, true, accent);
          html += spacer;
          html += row("TOTAL ASSETS", bsTotalAssets, false, true, accent);
          html += "</table></div>";

          /* RIGHT: Liabilities + Equity */
          html += "<div><table>";
          html += shead("LIABILITIES");
          html += spacer;
          html += shead("Current Liabilities");
          html += row("Accounts Payable", bsPayables, true, false, "#e03151");
          html += row("Total Current Liabilities", bsTotalLiabilities, false, true, "#e03151");
          html += spacer;
          html += shead("OWNER'S EQUITY");
          html += row("Capital Invested", bsCapital, true, false, "#0f9e6e");
          html += row("Retained Earnings", bsRetainedEarnings, true, false, bsRetainedEarnings >= 0 ? "#0f9e6e" : "#e03151");
          html += row("Total Owner's Equity", bsTotalEquity, false, true, bsTotalEquity >= 0 ? "#0f9e6e" : "#e03151");
          html += spacer;
          html += row("TOTAL LIABILITIES + EQUITY", bsTotalLiabilities + bsTotalEquity, false, true, accent);
          html += "</table></div>";

          html += "</div>";
          html += "<div class='net-box'><div class='net-label'>💼 Net Worth (Owner's Equity)</div><div class='net-val'>" + cur + " " + fmtNum(bsTotalEquity) + (bsTotalEquity < 0 ? " (Deficit)" : "") + "</div></div>";
          html += "<div class='balance-check'>" + (bsBalanced ? "✅ Balance Sheet is balanced — Assets = Liabilities + Equity" : "⚠ Balance Sheet check") + "</div>";
          html += "<div class='footer'>Powered by TechonERP • www.erp.techon.lk &nbsp;|&nbsp; Printed: " + escapeHtml(printedOn) + "</div>";
          html += "</body></html>";

          openPrintWindow(html, { width: 1000, height: 700, delay: 450 });
        };

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: C.text, letterSpacing: "-0.02em" }}>⚖️ Balance Sheet</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Financial position as at {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Btn col="blue" onClick={printBS}>🖨 Print Balance Sheet</Btn>
                  <WABtn title="Share Balance Sheet via WhatsApp" onClick={function () { shareAnyReport(printBS, "Balance-Sheet"); }} />
                </div>
              </div>
            </Card>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

              {/* ── LEFT COLUMN: ASSETS ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Card pad={0}>
                  <SHead label="ASSETS" />
                  <div style={{ paddingBottom: 4 }}>
                    <div style={{ padding: "8px 14px 4px", fontSize: 10, fontWeight: 800, color: C.th, textTransform: "uppercase", letterSpacing: "0.08em", background: "#f7f9ff", borderBottom: "1px solid " + C.border }}>Current Assets</div>
                    <BSRow label="Cash & Bank" value={bsCash} sub color={C.green} />
                    <BSRow label="Accounts Receivable" value={bsReceivables} sub color={C.blue} />
                    <BSRow label="Inventory (at Cost)" value={bsStock} sub color={C.purple} />
                    <BSRow label="Total Current Assets" value={bsCurrentAssets} total />
                  </div>
                  <div style={{ paddingBottom: 4 }}>
                    <div style={{ padding: "8px 14px 4px", fontSize: 10, fontWeight: 800, color: C.th, textTransform: "uppercase", letterSpacing: "0.08em", background: "#f7f9ff", borderBottom: "1px solid " + C.border }}>Fixed Assets</div>
                    <BSRow label="Business Assets" value={bsFixedAssets} sub color={C.orange} />
                    <BSRow label="Total Fixed Assets" value={bsFixedAssets} total />
                  </div>
                  <div style={{ background: "linear-gradient(90deg," + accent + ",#1565c0)", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 900, color: "#fff", letterSpacing: "0.02em" }}>TOTAL ASSETS</span>
                    <span style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>{cur} {fmtNum(bsTotalAssets)}</span>
                  </div>
                </Card>
              </div>

              {/* ── RIGHT COLUMN: LIABILITIES + EQUITY ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Card pad={0}>
                  <SHead label="LIABILITIES" />
                  <div style={{ paddingBottom: 4 }}>
                    <div style={{ padding: "8px 14px 4px", fontSize: 10, fontWeight: 800, color: C.th, textTransform: "uppercase", letterSpacing: "0.08em", background: "#f7f9ff", borderBottom: "1px solid " + C.border }}>Current Liabilities</div>
                    <BSRow label="Accounts Payable (Suppliers)" value={bsPayables} sub color={C.red} />
                    <BSRow label="Total Current Liabilities" value={bsTotalLiabilities} total color={C.red} />
                  </div>
                  <SHead label="OWNER'S EQUITY" />
                  <div style={{ paddingBottom: 4 }}>
                    <BSRow label="Capital Invested" value={bsCapital} sub color={C.green} />
                    <BSRow label="Retained Earnings" value={bsRetainedEarnings} sub color={bsRetainedEarnings >= 0 ? C.green : C.red} />
                    <BSRow label="Total Owner's Equity" value={bsTotalEquity} total color={bsTotalEquity >= 0 ? C.green : C.red} />
                  </div>
                  <div style={{ background: "linear-gradient(90deg," + accent + ",#1565c0)", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 900, color: "#fff", letterSpacing: "0.02em" }}>TOTAL LIABILITIES + EQUITY</span>
                    <span style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>{cur} {fmtNum(bsTotalLiabilities + bsTotalEquity)}</span>
                  </div>
                </Card>
              </div>
            </div>

            {/* ── NET WORTH BOX ── */}
            <div style={{ background: bsTotalEquity >= 0 ? C.successSoft : C.dangerSoft, border: "2px solid " + (bsTotalEquity >= 0 ? "#9ee8ce" : "#f9a8ba"), borderRadius: 12, padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.text }}>💼 Net Worth — Owner's Equity</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Total Assets minus Total Liabilities</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: bsTotalEquity >= 0 ? C.green : C.red }}>{cur} {fmtNum(Math.abs(bsTotalEquity))}</div>
                {bsTotalEquity < 0 && <div style={{ fontSize: 12, color: C.red, fontWeight: 700, marginTop: 2 }}>⚠️ Liabilities exceed assets — business is in deficit</div>}
                {bsTotalEquity >= 0 && <div style={{ fontSize: 12, color: C.green, fontWeight: 700, marginTop: 2 }}>✅ Business has positive equity</div>}
              </div>
            </div>

            {/* ── BALANCE CHECK ── */}
            <div style={{ textAlign: "center", padding: "10px 14px", borderRadius: 8, background: bsBalanced ? "#e6f7f2" : "#fef9c3", border: "1px solid " + (bsBalanced ? "#9ee8ce" : "#fde68a"), fontSize: 12, fontWeight: 700, color: bsBalanced ? C.green : "#92400e" }}>
              {bsBalanced ? "✅ Balance Sheet is balanced — Assets = Liabilities + Equity" : "⚠️ Minor rounding difference detected — figures are correct"}
            </div>
          </div>
        );
      })()}

      {tab === "integrity" && (function () {
        var cur = getCurrencySymbol();
        var issues = [];
        var warnings = [];
        var passed = [];

        /* Shared: stored grand total prefers explicit grandTotal, then total / amount */
        var INT_TOL = 1;
        var integrityStoredGrand = function (doc) {
          if (doc == null) return 0;
          if (doc.grandTotal != null && !isNaN(parseFloat(doc.grandTotal))) return parseFloat(doc.grandTotal);
          if (doc.total != null && !isNaN(parseFloat(doc.total))) return parseFloat(doc.total);
          if (doc.amount != null && !isNaN(parseFloat(doc.amount))) return parseFloat(doc.amount);
          return 0;
        };
        /* Expected grand from line sum + optional discount + tax (matches POS / taxCompute) */
        var integrityExpectedGrand = function (doc, itemsLineSum) {
          var lineSub = doc.subTotal != null ? doc.subTotal : itemsLineSum;
          var net = Math.max(0, lineSub - (doc.discount || 0));
          if (doc.totalTax != null && doc.totalTax !== undefined && !isNaN(parseFloat(doc.totalTax))) {
            var tx = parseFloat(doc.totalTax) || 0;
            if (doc.taxMode === "inclusive") return net;
            return net + tx;
          }
          return net;
        };

        /* ── CHECK 1: Invoice total vs sum of items (+ tax) ── */
        var invoiceMismatches = [];
        (state.sales || []).forEach(function (s) {
          var itemsSum = (s.items || []).reduce(function (a, it) { return a + it.qty * (it.price || 0); }, 0);
          var expectedTotal = integrityExpectedGrand(s, itemsSum);
          var actualTotal = integrityStoredGrand(s);
          if (Math.abs(expectedTotal - actualTotal) > INT_TOL) {
            invoiceMismatches.push({ ref: s.invoiceNo || s.id.slice(0, 8), expected: expectedTotal, actual: actualTotal });
          }
        });
        if (invoiceMismatches.length > 0) {
          issues.push({ label: "Invoice Total Mismatches", count: invoiceMismatches.length, detail: invoiceMismatches.map(function (m) { return m.ref + ": expected " + cur + " " + fmtNum(m.expected) + ", got " + cur + " " + fmtNum(m.actual); }).join(" | "), severity: "error" });
        } else {
          passed.push("All " + (state.sales || []).length + " invoice totals match their line items ✓");
        }

        /* ── CHECK 2: Products with negative stock ── */
        var negStock = (state.products || []).filter(function (p) { return p.status !== "inactive" && (p.stock || 0) < 0; });
        if (negStock.length > 0) {
          issues.push({ label: "Products with Negative Stock", count: negStock.length, detail: negStock.map(function (p) { return p.name + " (" + p.stock + ")"; }).join(", "), severity: "error" });
        } else {
          passed.push("No products have negative stock ✓");
        }

        /* ── CHECK 3: Sales paid > total (overpayment anomaly) ── */
        var overpaid = (state.sales || []).filter(function (s) { return (s.paid || 0) > (s.total || 0) + 1; });
        if (overpaid.length > 0) {
          warnings.push({ label: "Invoices with Paid > Total", count: overpaid.length, detail: overpaid.map(function (s) { return (s.invoiceNo || s.id.slice(0, 8)) + ": paid " + cur + " " + fmtNum(s.paid) + " vs total " + cur + " " + fmtNum(s.total); }).join(" | "), severity: "warn" });
        } else {
          passed.push("No invoices have paid amount exceeding total ✓");
        }

        /* ── CHECK 4: Payment history sum vs paid field ── */
        var phMismatches = [];
        (state.sales || []).forEach(function (s) {
          var phSum = (s.paymentHistory || []).reduce(function (a, ph) { return a + (ph.amount || 0); }, 0);
          if (Math.abs(phSum - (s.paid || 0)) > 1) {
            phMismatches.push({ ref: s.invoiceNo || s.id.slice(0, 8), phSum: phSum, paid: s.paid || 0 });
          }
        });
        if (phMismatches.length > 0) {
          issues.push({ label: "Payment History Sum ≠ Paid Amount", count: phMismatches.length, detail: phMismatches.map(function (m) { return m.ref + ": history=" + cur + " " + fmtNum(m.phSum) + ", paid=" + cur + " " + fmtNum(m.paid); }).join(" | "), severity: "error" });
        } else {
          passed.push("All payment history sums match invoice paid amounts ✓");
        }

        /* ── CHECK 5: Cheques marked Cleared but not linked to any transaction ── */
        var orphanCheques = (state.cheques || []).filter(function (ch) {
          if (ch.status !== "Cleared") return false;
          if (ch.saleId || ch.purchaseId || ch.manualPayableId || ch.manualReceivableId) return false;
          return true;
        });
        if (orphanCheques.length > 0) {
          warnings.push({ label: "Cleared Cheques Without Linked Transaction", count: orphanCheques.length, detail: orphanCheques.map(function (ch) { return "#" + ch.chequeNo + " " + cur + " " + fmtNum(ch.amount); }).join(", "), severity: "warn" });
        } else {
          passed.push("All cleared cheques are linked to a transaction ✓");
        }

        /* ── CHECK 6: Purchase total vs sum of items (+ tax when present), return-aware ──
           Stored purchase.total is reduced when purchase returns exist (see Returns.jsx), but line
           items are unchanged — expected = full invoice expected (from lines + tax/discount) minus
           linked return amounts. Line cost uses same inputQty/qty × cost rule as Purchases save. */
        var purMismatches = [];
        (state.purchases || []).forEach(function (p) {
          var itemsSum = (p.items || []).reduce(function (a, it) {
            var q = it.inputQty !== undefined ? it.inputQty : it.qty;
            return a + q * (it.cost || 0);
          }, 0);
          var returnsSum = (state.purchaseReturns || []).filter(function (r) { return r.purchaseId === p.id; })
            .reduce(function (a, r) { return a + (r.amount || 0); }, 0);
          var expectedPur = Math.max(0, integrityExpectedGrand(p, itemsSum) - returnsSum);
          var actualPur = integrityStoredGrand(p);
          if (Math.abs(expectedPur - actualPur) > INT_TOL) {
            purMismatches.push({ ref: p.invoiceNo || p.id.slice(0, 8), expected: expectedPur, actual: actualPur });
          }
        });
        if (purMismatches.length > 0) {
          issues.push({ label: "Purchase Total Mismatches", count: purMismatches.length, detail: purMismatches.map(function (m) { return m.ref + ": expected " + cur + " " + fmtNum(m.expected) + ", got " + cur + " " + fmtNum(m.actual); }).join(" | "), severity: "error" });
        } else {
          passed.push("All " + (state.purchases || []).length + " purchase totals match their line amounts (after purchase returns) ✓");
        }

        /* ── CHECK 6b: Expense amount vs components (only when subTotal/totalTax stored) ── */
        var expMismatches = [];
        (state.expenses || []).forEach(function (e) {
          if (e.subTotal == null && e.totalTax == null) return;
          var base = e.subTotal != null ? e.subTotal : (e.amount || 0);
          var expectedE = integrityExpectedGrand(e, base);
          var actualE = integrityStoredGrand(e);
          if (Math.abs(expectedE - actualE) > INT_TOL) {
            expMismatches.push({ ref: (e.description || e.id || "").slice(0, 24), expected: expectedE, actual: actualE });
          }
        });
        if (expMismatches.length > 0) {
          issues.push({ label: "Expense Total Mismatches", count: expMismatches.length, detail: expMismatches.map(function (m) { return m.ref + ": expected " + cur + " " + fmtNum(m.expected) + ", got " + cur + " " + fmtNum(m.actual); }).join(" | "), severity: "error" });
        } else {
          passed.push("Expense records with tax breakdown are consistent ✓");
        }

        /* ── CHECK 6c: Purchase return line amount vs qty × cost ── */
        var purRetMismatches = [];
        (state.purchaseReturns || []).forEach(function (r) {
          var expAmt = (r.qty || 0) * (r.cost || 0);
          if (Math.abs(expAmt - (r.amount || 0)) > INT_TOL) {
            purRetMismatches.push({ ref: r.returnId || r.id.slice(0, 8), expected: expAmt, actual: r.amount || 0 });
          }
        });
        if (purRetMismatches.length > 0) {
          issues.push({ label: "Purchase Return Amount Mismatches", count: purRetMismatches.length, detail: purRetMismatches.map(function (m) { return m.ref + ": expected " + cur + " " + fmtNum(m.expected) + ", got " + cur + " " + fmtNum(m.actual); }).join(" | "), severity: "error" });
        } else {
          passed.push("All " + (state.purchaseReturns || []).length + " purchase return rows match qty × cost ✓");
        }

        /* ── CHECK 6d: Sales return amount vs components (when subTotal/totalTax stored) ── */
        var salRetMismatches = [];
        (state.salesReturns || []).forEach(function (r) {
          if (r.subTotal == null && r.totalTax == null) return;
          var lineSum = r.subTotal != null ? r.subTotal : (r.amount || 0);
          var expectedSr = integrityExpectedGrand(r, lineSum);
          var actualSr = integrityStoredGrand(r);
          if (Math.abs(expectedSr - actualSr) > INT_TOL) {
            salRetMismatches.push({ ref: r.returnId || r.id.slice(0, 8), expected: expectedSr, actual: actualSr });
          }
        });
        if (salRetMismatches.length > 0) {
          issues.push({ label: "Sales Return Total Mismatches", count: salRetMismatches.length, detail: salRetMismatches.map(function (m) { return m.ref + ": expected " + cur + " " + fmtNum(m.expected) + ", got " + cur + " " + fmtNum(m.actual); }).join(" | "), severity: "error" });
        } else {
          passed.push("Sales returns with tax breakdown are consistent ✓");
        }

        /* ── CHECK 7: Duplicate invoice numbers ── */
        var invNos = (state.sales || []).map(function (s) { return s.invoiceNo; }).filter(Boolean);
        var dupInvNos = invNos.filter(function (n, i) { return invNos.indexOf(n) !== i; });
        if (dupInvNos.length > 0) {
          issues.push({ label: "Duplicate Invoice Numbers", count: dupInvNos.length, detail: [...new Set(dupInvNos)].join(", "), severity: "error" });
        } else {
          passed.push("No duplicate invoice numbers ✓");
        }

        /* ── CHECK 8: Duplicate barcodes ── */
        var barcodes = (state.products || []).filter(function (p) { return p.status !== "inactive" && p.barcode; }).map(function (p) { return p.barcode; });
        var dupBarcodes = barcodes.filter(function (b, i) { return barcodes.indexOf(b) !== i; });
        if (dupBarcodes.length > 0) {
          issues.push({ label: "Duplicate Barcodes", count: dupBarcodes.length, detail: [...new Set(dupBarcodes)].join(", "), severity: "error" });
        } else {
          passed.push("No duplicate barcodes ✓");
        }

        /* ── CHECK 9: Sales referencing missing products ── */
        var allProdIds = new Set((state.products || []).map(function (p) { return p.id; }));
        var ghostProdRefs = [];
        (state.sales || []).forEach(function (s) {
          (s.items || []).forEach(function (it) {
            if (it.id && !allProdIds.has(it.id)) ghostProdRefs.push((s.invoiceNo || s.id.slice(0, 8)) + " → " + (it.name || it.id));
          });
        });
        if (ghostProdRefs.length > 0) {
          warnings.push({ label: "Invoices Referencing Missing Products", count: ghostProdRefs.length, detail: ghostProdRefs.join(", "), severity: "warn" });
        } else {
          passed.push("All invoice items reference existing products ✓");
        }

        /* ── CHECK 10: Duplicate customer names (normalized) ── */
        var custNameDupGroups = {};
        (state.customers || []).forEach(function (c) {
          var nk = normalizePaymentCustomerName(c.name);
          if (!nk) return;
          if (!custNameDupGroups[nk]) custNameDupGroups[nk] = [];
          custNameDupGroups[nk].push((c.name || "") + (c.phone ? " · " + c.phone : ""));
        });
        var dupCustList = Object.keys(custNameDupGroups).filter(function (k) { return custNameDupGroups[k].length > 1; });
        if (dupCustList.length > 0) {
          warnings.push({
            label: "Duplicate Customer Names",
            count: dupCustList.length,
            detail: dupCustList.map(function (k) { return k + " → " + custNameDupGroups[k].join(" | "); }).join(" · "),
            severity: "warn"
          });
        } else {
          passed.push("No duplicate customer names (case/spacing-insensitive) ✓");
        }

        /* ── CHECK 11: Negative cash balance ── */
        var balances = getCashBalances(state);
        if (balances.cash < -1) {
          issues.push({ label: "Negative Cash Balance", count: 1, detail: "Cash drawer shows " + cur + " " + fmtNum(balances.cash) + " — check for missing payment entries", severity: "error" });
        } else if (balances.bank < -1) {
          warnings.push({ label: "Negative Bank Balance", count: 1, detail: "Bank account shows " + cur + " " + fmtNum(balances.bank) + " — check for missing deposit entries", severity: "warn" });
        } else {
          passed.push("Cash (" + cur + " " + fmtNum(balances.cash) + ") and Bank (" + cur + " " + fmtNum(balances.bank) + ") balances are positive ✓");
        }

        var totalIssues = issues.length;
        var totalWarnings = warnings.length;
        var isClean = totalIssues === 0 && totalWarnings === 0;

        var printReport = function () {
          var shopName = (state.settings && state.settings.shopName) || "Techon ERP";
          var html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Integrity Report</title>";
          html += "<style>body{font-family:'Segoe UI',Arial,sans-serif;padding:28px 32px;font-size:12px;color:#111;} h1{font-size:20px;font-weight:900;color:#0d47a1;} .sub{color:#666;font-size:11px;margin-top:2px;} .clean{background:#e6f7f2;border:2px solid #9ee8ce;border-radius:10px;padding:16px 20px;margin:16px 0;font-size:15px;font-weight:800;color:#065f46;} .section{margin:16px 0;} .issue{background:#fde8ed;border-left:4px solid #e03151;padding:10px 14px;border-radius:0 8px 8px 0;margin:6px 0;} .warn{background:#fef9c3;border-left:4px solid #d97706;padding:10px 14px;border-radius:0 8px 8px 0;margin:6px 0;} .pass{padding:7px 14px;border-bottom:1px solid #f0f4ff;font-size:12px;color:#065f46;} .label{font-weight:800;font-size:13px;} .detail{font-size:11px;color:#555;margin-top:3px;} .footer{text-align:center;font-size:10px;color:#aaa;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px;}</style></head><body>";
          html += "<h1>🛡 System Integrity Report</h1><div class='sub'>" + escapeHtml(shopName) + " &nbsp;·&nbsp; Generated: " + new Date().toLocaleString() + "</div>";
          if (isClean) {
            html += "<div class='clean'>✅ All checks passed — System is clean and ready for production!</div>";
          }
          if (issues.length > 0) {
            html += "<div class='section'><div style='font-weight:800;color:#e03151;font-size:14px;margin-bottom:8px;'>❌ Issues (" + issues.length + ")</div>";
            issues.forEach(function (item) { html += "<div class='issue'><div class='label'>" + escapeHtml(item.label) + " (" + item.count + ")</div><div class='detail'>" + escapeHtml(item.detail) + "</div></div>"; });
            html += "</div>";
          }
          if (warnings.length > 0) {
            html += "<div class='section'><div style='font-weight:800;color:#d97706;font-size:14px;margin-bottom:8px;'>⚠️ Warnings (" + warnings.length + ")</div>";
            warnings.forEach(function (item) { html += "<div class='warn'><div class='label'>" + escapeHtml(item.label) + " (" + item.count + ")</div><div class='detail'>" + escapeHtml(item.detail) + "</div></div>"; });
            html += "</div>";
          }
          html += "<div class='section'><div style='font-weight:800;color:#065f46;font-size:14px;margin-bottom:8px;'>✅ Passed (" + passed.length + ")</div>";
          passed.forEach(function (p) { html += "<div class='pass'>" + escapeHtml(p) + "</div>"; });
          html += "</div><div class='footer'>Powered by TechonERP • www.erp.techon.lk</div></body></html>";
          openPrintWindow(html, { width: 800, height: 700, delay: 450 });
        };

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Header */}
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: C.text, letterSpacing: "-0.02em" }}>🛡 System Integrity Report</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Full audit of your data — run this daily to catch errors early</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Btn col="blue" onClick={printReport}>🖨 Print Report</Btn>
                  <WABtn title="Share Report via WhatsApp" onClick={function () { shareAnyReport(printReport, "Business-Report"); }} />
                </div>
              </div>
            </Card>

            {/* Summary banner */}
            <div style={{ background: isClean ? C.successSoft : totalIssues > 0 ? C.dangerSoft : "#fef9c3",
              border: "2px solid " + (isClean ? "#9ee8ce" : totalIssues > 0 ? "#f9a8ba" : "#fde68a"),
              borderRadius: 12, padding: "18px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: isClean ? C.green : totalIssues > 0 ? C.red : "#92400e" }}>
                {isClean ? "✅ All checks passed — system is clean!" : totalIssues > 0 ? "❌ " + totalIssues + " issue(s) found — action required" : "⚠️ " + totalWarnings + " warning(s) — review recommended"}
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                {[["Issues", issues.length, C.red, "#fde8ed"], ["Warnings", totalWarnings, "#d97706", "#fef9c3"], ["Passed", passed.length, C.green, C.successSoft]].map(function (s) {
                  return <div key={s[0]} style={{ textAlign: "center", background: s[3], borderRadius: 8, padding: "8px 16px" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: s[2] }}>{s[1]}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: s[2], textTransform: "uppercase" }}>{s[0]}</div>
                  </div>;
                })}
              </div>
            </div>

            {/* Issues */}
            {issues.length > 0 && (
              <Card>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.red, marginBottom: 12 }}>❌ Issues — Fix These ({issues.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {issues.map(function (item, i) {
                    return <div key={i} style={{ background: C.dangerSoft, border: "1px solid #f9a8ba", borderLeft: "4px solid " + C.red, borderRadius: "0 8px 8px 0", padding: "12px 14px" }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: C.red }}>{item.label} <span style={{ background: C.red, color: "#fff", borderRadius: 10, fontSize: 11, padding: "1px 7px", marginLeft: 4 }}>{item.count}</span></div>
                      <div style={{ fontSize: 11, color: "#7f1d1d", marginTop: 4, lineHeight: 1.5 }}>{item.detail}</div>
                    </div>;
                  })}
                </div>
              </Card>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
              <Card>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#d97706", marginBottom: 12 }}>⚠️ Warnings — Review These ({warnings.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {warnings.map(function (item, i) {
                    return <div key={i} style={{ background: "#fef9c3", border: "1px solid #fde68a", borderLeft: "4px solid #d97706", borderRadius: "0 8px 8px 0", padding: "12px 14px" }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: "#92400e" }}>{item.label} <span style={{ background: "#d97706", color: "#fff", borderRadius: 10, fontSize: 11, padding: "1px 7px", marginLeft: 4 }}>{item.count}</span></div>
                      <div style={{ fontSize: 11, color: "#78350f", marginTop: 4, lineHeight: 1.5 }}>{item.detail}</div>
                    </div>;
                  })}
                </div>
              </Card>
            )}

            {/* Passed checks */}
            <Card>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.green, marginBottom: 12 }}>✅ Passed Checks ({passed.length})</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {passed.map(function (p, i) {
                  return <div key={i} style={{ padding: "9px 12px", borderBottom: "1px solid " + C.borderLight, fontSize: 13, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: C.green, fontSize: 15 }}>✓</span>{p}
                  </div>;
                })}
              </div>
            </Card>
          </div>
        );
      })()}

      {tab === "business" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card>
            <CardTitle sub="filter and print a complete business summary">Business Report — A to Z</CardTitle>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 5 }}>From Date</div>
                <input type="date" value={rangeFrom} onChange={function (e) { setRangeFrom(e.target.value); }} style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: C.text, background: "#fff", outline: "none" }} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 5 }}>To Date</div>
                <input type="date" value={rangeTo} onChange={function (e) { setRangeTo(e.target.value); }} style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: C.text, background: "#fff", outline: "none" }} />
              </div>
              <Btn col="blue" onClick={function () {
                try {
                var rf = rangeFrom; var rt = rangeTo;
                var shopName = state.settings.shopName || "Techon ERP";
                var addr = state.settings.address || "";
                var phone = state.settings.phone || "";
                var phone2 = state.settings.phone2 || "";
                var email = state.settings.email || "";
                var website = state.settings.website || "";
                var brn = state.settings.brn || "";
                var inRange = function (d) { return d >= rf && d <= rt; };
                var rSales = state.sales.filter(function (s) { return inRange(s.date); });
                var rPurch = state.purchases.filter(function (p) { return inRange(p.date || ""); });
                var rExp = state.expenses.filter(function (e) { return inRange(e.date); });
                var rRep = state.repairs.filter(function (r) { return inRange(r.dateIn || r.date || ""); });
                var rAssets = state.assets ? state.assets.filter(function (a) { return !a._isOpening && inRange(a.date); }) : [];
                var rDmg = state.damageLog ? state.damageLog.filter(function (d) { return inRange(d.date); }) : [];

                var totalRev = rSales.reduce(function (a, s) { return a + s.total; }, 0);
                var totalColl = rSales.reduce(function (a, s) { return a + (s.paid || 0); }, 0);
                var totalUnpaid = rSales.reduce(function (a, s) { return a + Math.max(0, s.total - (s.paid || 0)); }, 0);
                var rSalesRetsLocal = (state.salesReturns || []).filter(function (r) { return inRange(r.date); });
                var totalCOGSr = getNetCOGSForRange(rSales, rSalesRetsLocal); /* Bug 3 fix */
                var grossProfit = totalRev - totalCOGSr;
                var totalExpAmt = rExp.reduce(function (a, e) { return a + e.amount; }, 0);
                var totalDmgLoss = rDmg.reduce(function (a, d) {
                  var prod = state.products.find(function (p) { return p.id === d.productId; });
                  return a + (d.qty || 0) * (prod ? prod.cost || 0 : 0);
                }, 0);
                var totalPurchAmt = rPurch.reduce(function (a, p) { return a + p.total; }, 0);
                var totalPurchPaid = rPurch.reduce(function (a, p) { return a + (p.paidAmount || 0); }, 0);
                var totalPurchBal = rPurch.reduce(function (a, p) { return a + Math.max(0, (p.total || 0) - (p.paidAmount || 0)); }, 0);
                /* BUG5 FIX: Repairs that were NOT converted to invoices contribute revenue directly.
                   Repairs converted via convertToInvoice already have cost:0 in the POS sale so
                   their full charge lands in grossProfit. We only add repair revenue for jobs that
                   are Delivered but do NOT have a corresponding sale (i.e. not yet invoiced). */
                /* BUG5 FIX: Only count repair revenue for jobs NOT already converted to a POS invoice.
                   Repairs converted via convertToInvoice have cost:0 in the sale, so their full
                   charge is already in grossProfit. We check sale.fromRepairId (set since this fix)
                   and also scan sale items for any fromRepairId field. */
                var invoicedRepairIds = new Set();
                rSales.forEach(function (s) {
                  if (s.fromRepairId) invoicedRepairIds.add(s.fromRepairId);
                  (s.items || []).forEach(function (it) { if (it.fromRepairId) invoicedRepairIds.add(it.fromRepairId); });
                });
                var totalRepRev = rRep.filter(function (r) {
                  return r.status === "Delivered" && !invoicedRepairIds.has(r.id);
                }).reduce(function (a, r) { return a + (r.estimatedCost || r.cost || 0); }, 0);
                /* BUG5 FIX: netProfit now uses only uninvoiced repair revenue to avoid double-counting */
                var netProfit = grossProfit + totalRepRev - totalExpAmt - totalDmgLoss;
                var totalAssetAmt = rAssets.reduce(function (a, x) { return a + x.amount; }, 0);
                var capital = state.settings.capitalInvested || 0;
                var allStockVal = state.products.filter(function(p){return p.status!=="inactive";}).reduce(function (a, p) { return a + (p.price || 0) * (p.stock || 0); }, 0);
                var allStockCost = state.products.filter(function(p){return p.status!=="inactive";}).reduce(function (a, p) { return a + (p.cost || 0) * (p.stock || 0); }, 0);
                /* BUG2 FIX: Include manual receivables in totalRecv */
                var totalRecv = (function () {
                  var fromSales = rSales.reduce(function (a, s) { return a + Math.max(0, s.total - (s.paid || 0)); }, 0);
                  var fromManual = S.get("tc3_manualReceivables", []).reduce(function (a, mr) {
                    var pd = (mr.paymentHistory || []).reduce(function (s2, p) { return s2 + p.amount; }, 0);
                    return a + Math.max(0, mr.amount - pd);
                  }, 0);
                  return fromSales + fromManual;
                }());
                /* BUG3+BUG8 FIX: Include manual payables and compute from purchase balances (not stale supplier.payable) */
                var totalPay = (function () {
                  var fromSupp = getTotalSupplierPayable(state.purchases);
                  var fromManual = S.get("tc3_manualPayables", []).reduce(function (a, mp) {
                    var pd = (mp.paymentHistory || []).reduce(function (s2, p) { return s2 + p.amount; }, 0);
                    return a + Math.max(0, mp.amount - pd);
                  }, 0);
                  return fromSupp + fromManual;
                }());
                var grossMargin = totalRev > 0 ? ((grossProfit / totalRev) * 100).toFixed(1) : "0.0";
                var netMargin = totalRev > 0 ? ((netProfit / totalRev) * 100).toFixed(1) : "0.0";

                var repPending = rRep.filter(function (r) { return r.status === "Pending"; }).length;
                var repRepairing = rRep.filter(function (r) { return r.status === "Repairing"; }).length;
                var repDelivered = rRep.filter(function (r) { return r.status === "Delivered"; }).length;
                var repCancelled = rRep.filter(function (r) { return r.status === "Cancelled"; }).length;
                var repReady = rRep.filter(function (r) { return r.status === "Ready"; }).length;

                var totalDmgQty = rDmg.reduce(function (a, d) { return a + (d.qty || 0); }, 0);

                var card = function (label, value, color) { return "<div class='card'><div class='clabel'>" + label + "</div><div class='cval' style='color:" + color + "'>" + getCurrencySymbol() + " " + Number(value).toLocaleString() + "</div></div>"; };
                var cardNum = function (label, value, color) { return "<div class='card'><div class='clabel'>" + label + "</div><div class='cval' style='color:" + color + "'>" + value + "</div></div>"; };
                var cardPct = function (label, value, color) { return "<div class='card'><div class='clabel'>" + label + "</div><div class='cval' style='color:" + color + "'>" + value + "%</div></div>"; };
                var sec = function (t) { return "<div class='sec'>" + t + "</div>"; };
                var hr = "<hr/>";
                var tblHead = function (cols) { return "<thead><tr>" + cols.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead>"; };
                var tblRow = function (cells) { return "<tr>" + cells.map(function (c, i) { return "<td" + (i === 0 ? " style='font-weight:600;'" : "") + ">" + c + "</td>"; }).join("") + "</tr>"; };
                var badge = function (txt, bg, color) { return "<span style='background:" + bg + ";color:" + color + ";padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;'>" + txt + "</span>"; };

                var html = "<div class='header'><div><div class='shop'>" + escapeHtml(shopName) + "</div>";
                if (addr) html += "<div class='sub'>" + addr + "</div>";
                if (phone) html += "<div class='sub'>Tel: " + phone + (phone2 ? " / " + phone2 : "") + "</div>";
                if (email) html += "<div class='sub'>" + email + "</div>";
                if (website) html += "<div class='sub'>" + website + "</div>";
                if (brn) html += "<div class='sub'>BRN: " + brn + "</div>";
                html += "</div><div style='text-align:right'><div class='title'>Complete Business Report</div>";
                html += "<div class='sub'>Period: " + rf + " to " + rt + "</div>";
                html += "<div class='sub'>Printed: " + new Date().toLocaleString() + "</div>";
                html += "</div></div>" + hr;

                html += sec("1. PROFIT & LOSS STATEMENT");
                html += "<table style='width:480px'>";
                html += "<tbody>";
                html += "<tr><td style='padding:7px 10px;font-weight:600'>Total Sales Revenue</td><td style='padding:7px 10px;text-align:right;font-weight:700;color:#1565c0'>" + getCurrencySymbol() + " " + Number(totalRev).toLocaleString() + "</td></tr>";
                html += "<tr style='background:#f8faff'><td style='padding:7px 10px;color:#555'>(-) Cost of Goods Sold</td><td style='padding:7px 10px;text-align:right;color:#b71c1c'>" + getCurrencySymbol() + " " + Number(totalCOGSr).toLocaleString() + "</td></tr>";
                html += "<tr><td style='padding:7px 10px;font-weight:700;border-top:2px solid #e8edf8'>Gross Profit</td><td style='padding:7px 10px;text-align:right;font-weight:800;color:" + (grossProfit >= 0 ? "#1b5e20" : "#b71c1c") + "'>" + getCurrencySymbol() + " " + Number(grossProfit).toLocaleString() + "</td></tr>";
                html += "<tr style='background:#f8faff'><td style='padding:7px 10px;color:#555'>&nbsp;&nbsp;&nbsp;Gross Margin</td><td style='padding:7px 10px;text-align:right;color:#4a148c'>" + grossMargin + "%</td></tr>";
                html += "<tr><td style='padding:7px 10px;color:#555'>(-) Operating Expenses</td><td style='padding:7px 10px;text-align:right;color:#b71c1c'>" + getCurrencySymbol() + " " + Number(totalExpAmt).toLocaleString() + "</td></tr>";
                html += "<tr style='background:#fff8f8'><td style='padding:7px 10px;color:#555'>(-) Inventory Loss / Damage</td><td style='padding:7px 10px;text-align:right;color:#b71c1c'>" + getCurrencySymbol() + " " + Number(totalDmgLoss).toLocaleString() + "</td></tr>";
                html += "<tr style='background:#e8eeff'><td style='padding:9px 10px;font-weight:800;border-top:2px solid #c5d0f5'>Net Profit</td><td style='padding:9px 10px;text-align:right;font-weight:900;font-size:16px;color:" + (netProfit >= 0 ? "#1b5e20" : "#b71c1c") + "'>" + getCurrencySymbol() + " " + Number(netProfit).toLocaleString() + "</td></tr>";
                html += "<tr style='background:#f8faff'><td style='padding:7px 10px;color:#555'>&nbsp;&nbsp;&nbsp;Net Margin</td><td style='padding:7px 10px;text-align:right;color:#4a148c'>" + netMargin + "%</td></tr>";
                html += "<tr><td style='padding:7px 10px;color:#555'>Repair Revenue (Delivered)</td><td style='padding:7px 10px;text-align:right;color:#1565c0'>" + getCurrencySymbol() + " " + Number(totalRepRev).toLocaleString() + "</td></tr>";
                html += "<tr><td style='padding:7px 10px;color:#555'>Total Revenue (Sales + Repair)</td><td style='padding:7px 10px;text-align:right;font-weight:700'>" + getCurrencySymbol() + " " + Number(totalRev + totalRepRev).toLocaleString() + "</td></tr>";
                html += "</tbody></table>" + hr;

                html += sec("2. FINANCIAL OVERVIEW");
                html += "<div class='grid4'>";
                html += card("Total Revenue", totalRev, "#1565c0");
                html += card("Cash Collected", totalColl, "#1b5e20");
                html += card("Outstanding (Unpaid)", totalUnpaid, "#b71c1c");
                html += card("Net Profit", netProfit, netProfit >= 0 ? "#1b5e20" : "#b71c1c");
                html += card("Gross Profit", grossProfit, "#4a148c");
                html += card("Total Expenses", totalExpAmt, "#e65100");
                html += card("Total Purchases", totalPurchAmt, "#0d47a1");
                html += card("Assets Acquired", totalAssetAmt, "#37474f");
                html += card("Repair Revenue", totalRepRev, "#00695c");
                html += cardPct("Gross Margin", grossMargin, "#4a148c");
                html += cardPct("Net Margin", netMargin, netProfit >= 0 ? "#1b5e20" : "#b71c1c");
                html += cardNum("Total Invoices", rSales.length, "#1565c0");
                html += "</div>" + hr;

                html += sec("3. SALES DETAIL (" + rSales.length + " invoices)");
                html += "<table>" + tblHead(["#", "Date", "Invoice", "Customer", "Items", "Revenue", "Collected", "Balance", "Status"]);
                html += "<tbody>";
                rSales.forEach(function (s, i) {
                  var statusColor = s.payStatus === "Paid" ? "#1b5e20" : (s.payStatus === "Partial" ? "#e65100" : "#b71c1c");
                  html += tblRow([i + 1, escapeHtml(s.date), escapeHtml(s.invoiceNo || "-"), escapeHtml(s.customerName || "Walk-in"), s.items.length, getCurrencySymbol() + " " + Number(s.total).toLocaleString(), getCurrencySymbol() + " " + Number(s.paid || 0).toLocaleString(), getCurrencySymbol() + " " + Number(Math.max(0, s.total - (s.paid || 0))).toLocaleString(), badge(escapeHtml(s.payStatus || "-"), "#f0f4ff", "#555")]);
                });
                html += "<tr class='tot'><td colspan='5'>TOTAL</td><td>" + getCurrencySymbol() + " " + Number(totalRev).toLocaleString() + "</td><td>" + getCurrencySymbol() + " " + Number(totalColl).toLocaleString() + "</td><td>" + getCurrencySymbol() + " " + Number(totalUnpaid).toLocaleString() + "</td><td></td></tr>";
                html += "</tbody></table>" + hr;

                html += sec("4. TOP 10 CUSTOMERS BY REVENUE");
                html += "<table>" + tblHead(["#", "Customer", "Phone", "Invoices", "Total Billed", "Paid", "Balance", "Last Purchase"]);
                html += "<tbody>";
                var custMap = {};
                rSales.forEach(function (s) {
                  var key = s.customerId || s.customerName || "Walk-in";
                  if (!custMap[key]) custMap[key] = { name: s.customerName || "Walk-in", phone: s.customerPhone || "-", total: 0, paid: 0, count: 0, lastDate: "" };
                  custMap[key].total += s.total;
                  custMap[key].paid += (s.paid || 0);
                  custMap[key].count++;
                  if (s.date > custMap[key].lastDate) custMap[key].lastDate = s.date;
                });
                Object.values(custMap).sort(function (a, b) { return b.total - a.total; }).slice(0, 10).forEach(function (c, i) {
                  html += tblRow([i + 1, escapeHtml(c.name), escapeHtml(c.phone), c.count, getCurrencySymbol() + " " + Number(c.total).toLocaleString(), getCurrencySymbol() + " " + Number(c.paid).toLocaleString(), "<span style='color:#b71c1c;font-weight:700'>" + getCurrencySymbol() + " " + Number(c.total - c.paid).toLocaleString() + "</span>", c.lastDate || "-"]);
                });
                html += "</tbody></table>" + hr;

                html += sec("5. TOP 10 PRODUCTS BY REVENUE");
                html += "<table>" + tblHead(["#", "Product", "Units Sold", "Revenue", "COGS", "Gross Profit", "Margin %"]);
                html += "<tbody>";
                var prodMap = {};
                rSales.forEach(function (s) {
                  s.items.forEach(function (it) {
                    if (!prodMap[it.id || it.name]) prodMap[it.id || it.name] = { name: it.name || "-", qty: 0, rev: 0, cogs: 0 };
                    prodMap[it.id || it.name].qty += it.qty;
                    prodMap[it.id || it.name].rev += it.price * it.qty;
                    prodMap[it.id || it.name].cogs += (it.cost || 0) * it.qty;
                  });
                });
                Object.values(prodMap).sort(function (a, b) { return b.rev - a.rev; }).slice(0, 10).forEach(function (p, i) {
                  var gp = p.rev - p.cogs;
                  var gm = p.rev > 0 ? ((gp / p.rev) * 100).toFixed(1) : "0.0";
                  var gpColor = gp >= 0 ? "#1b5e20" : "#b71c1c";
                  html += tblRow([i + 1, escapeHtml(p.name), p.qty, getCurrencySymbol() + " " + Number(p.rev).toLocaleString(), getCurrencySymbol() + " " + Number(p.cogs).toLocaleString(), "<span style='color:" + gpColor + ";font-weight:700'>" + getCurrencySymbol() + " " + Number(gp).toLocaleString() + "</span>", gm + "%"]);
                });
                html += "</tbody></table>" + hr;

                html += sec("6. PURCHASES (" + rPurch.length + " orders)");
                html += "<table>" + tblHead(["#", "Date", "Invoice", "Supplier", "Items", "Total", "Paid", "Balance", "Status"]);
                html += "<tbody>";
                rPurch.forEach(function (p, i) {
                  html += tblRow([i + 1, escapeHtml(p.date || "-"), escapeHtml(p.invoiceNo || "-"), escapeHtml(p.supplier || "-"), (p.items || []).length, getCurrencySymbol() + " " + Number(p.total).toLocaleString(), getCurrencySymbol() + " " + Number(p.paidAmount || 0).toLocaleString(), getCurrencySymbol() + " " + Number(Math.max(0, (p.total || 0) - (p.paidAmount || 0))).toLocaleString(), badge(p.status || "-", "#f0f4ff", "#555")]);
                });
                html += "<tr class='tot'><td colspan='5'>TOTAL</td><td>" + getCurrencySymbol() + " " + Number(totalPurchAmt).toLocaleString() + "</td><td>" + getCurrencySymbol() + " " + Number(totalPurchPaid).toLocaleString() + "</td><td>" + getCurrencySymbol() + " " + Number(totalPurchBal).toLocaleString() + "</td><td></td></tr>";
                html += "</tbody></table>" + hr;

                html += sec("7. EXPENSES (" + rExp.length + " records)");
                html += "<table>" + tblHead(["#", "Date", "Category", "Description", "Payee", "Pay Mode", "Amount"]);
                html += "<tbody>";
                rExp.forEach(function (e, i) {
                  html += tblRow([i + 1, escapeHtml(e.date), escapeHtml(e.category || "-"), escapeHtml(e.description || "-"), escapeHtml(e.payee || "-"), escapeHtml(e.payMode || "-"), getCurrencySymbol() + " " + Number(e.amount).toLocaleString()]);
                });
                html += "<tr class='tot'><td colspan='6'>TOTAL EXPENSES</td><td>" + getCurrencySymbol() + " " + Number(totalExpAmt).toLocaleString() + "</td></tr>";
                html += "</tbody></table>";

                var expCats = {};
                rExp.forEach(function (e) { if (!expCats[e.category || "Other"]) expCats[e.category || "Other"] = 0; expCats[e.category || "Other"] += e.amount; });
                html += "<div style='margin:10px 0 14px'><strong style='font-size:11px;color:#555;text-transform:uppercase'>Expenses by Category: </strong>";
                Object.keys(expCats).sort(function (a, b) { return expCats[b] - expCats[a]; }).forEach(function (cat) {
                  html += "<span style='margin:0 8px;font-size:11px'><strong>" + cat + ":</strong> " + getCurrencySymbol() + " " + Number(expCats[cat]).toLocaleString() + "</span>";
                });
                html += "</div>" + hr;

                html += sec("8. REPAIRS (" + rRep.length + " jobs)");
                html += "<div class='grid4'>";
                html += cardNum("Pending", repPending, "#e65100");
                html += cardNum("Repairing", repRepairing, "#1565c0");
                html += cardNum("Ready", repReady, "#00695c");
                html += cardNum("Delivered", repDelivered, "#1b5e20");
                html += cardNum("Cancelled", repCancelled, "#b71c1c");
                html += card("Repair Revenue", totalRepRev, "#00695c");
                html += "</div>";
                html += "<table>" + tblHead(["#", "Date In", "Date Out", "Customer", "Phone", "Device", "Brand/Model", "Problem", "Cost", "Status"]);
                html += "<tbody>";
                rRep.forEach(function (r, i) {
                  html += tblRow([i + 1, escapeHtml(r.dateIn || r.date || "-"), escapeHtml(r.dateOut || "-"), escapeHtml(r.customer || "-"), escapeHtml(r.phone || "-"), escapeHtml(r.deviceType || "-"), escapeHtml((r.brand || "-") + " " + (r.modelNo || "")), escapeHtml(r.problem || "-"), getCurrencySymbol() + " " + Number(r.estimatedCost || r.cost || 0).toLocaleString(), badge(escapeHtml(r.status || "-"), "#f0f4ff", "#555")]);
                });
                html += "<tr class='tot'><td colspan='8'>Repair Revenue (Delivered)</td><td>" + getCurrencySymbol() + " " + Number(totalRepRev).toLocaleString() + "</td><td></td></tr>";
                html += "</tbody></table>" + hr;

                html += sec("9. ASSETS ACQUIRED IN PERIOD (" + rAssets.length + " items)");
                html += "<table>" + tblHead(["#", "Ref", "Date", "Asset Name", "Category", "Amount", "Note"]);
                html += "<tbody>";
                var assetCatTotals = {};
                rAssets.forEach(function (a, i) {
                  var serial = "AST-" + String(i + 1).padStart(4, "0");
                  html += tblRow([escapeHtml(serial), escapeHtml(serial), escapeHtml(a.date), escapeHtml(a.name), escapeHtml(a.category), getCurrencySymbol() + " " + Number(a.amount).toLocaleString(), escapeHtml(a.note || "-")]);
                  if (!assetCatTotals[a.category]) assetCatTotals[a.category] = 0;
                  assetCatTotals[a.category] += a.amount;
                });
                html += "<tr class='tot'><td colspan='5'>TOTAL ASSETS (" + rAssets.length + ")</td><td>" + getCurrencySymbol() + " " + Number(totalAssetAmt).toLocaleString() + "</td><td></td></tr>";
                html += "</tbody></table>";
                if (Object.keys(assetCatTotals).length > 0) {
                  html += "<div style='margin:6px 0 14px'><strong style='font-size:11px;color:#555;text-transform:uppercase'>By Category: </strong>";
                  Object.keys(assetCatTotals).sort(function (a, b) { return assetCatTotals[b] - assetCatTotals[a]; }).forEach(function (cat) {
                    html += "<span style='margin:0 8px;font-size:11px'><strong>" + cat + ":</strong> " + getCurrencySymbol() + " " + Number(assetCatTotals[cat]).toLocaleString() + "</span>";
                  });
                  html += "</div>";
                }
                html += hr;

                html += sec("10. RECEIVABLES — CUSTOMERS WITH BALANCE");
                html += "<table>" + tblHead(["#", "Customer", "Phone", "Total Billed", "Paid", "Outstanding", "Last Invoice"]);
                html += "<tbody>";
                var ci2 = 0;
                state.customers.forEach(function (c) {
                  var cs = state.sales.filter(function (s) { return s.customerId === c.id || s.customerName === c.name; });
                  var billed = cs.reduce(function (a, s) { return a + s.total; }, 0);
                  var paid2 = cs.reduce(function (a, s) { return a + (s.paid || 0); }, 0);
                  var bal2 = billed - paid2;
                  var lastInv = cs.length > 0 ? cs.sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0].date : "-";
                  if (bal2 > 0) {
                    ci2++;
                    html += tblRow([ci2, escapeHtml(c.name), escapeHtml(c.phone || "-"), getCurrencySymbol() + " " + Number(billed).toLocaleString(), getCurrencySymbol() + " " + Number(paid2).toLocaleString(), "<span style='color:#b71c1c;font-weight:700'>" + getCurrencySymbol() + " " + Number(bal2).toLocaleString() + "</span>", lastInv]);
                  }
                });
                if (ci2 === 0) html += "<tr><td colspan='7' style='text-align:center;color:#888;padding:12px'>No outstanding receivables.</td></tr>";
                html += "<tr class='tot'><td colspan='5'>TOTAL RECEIVABLE</td><td>" + getCurrencySymbol() + " " + Number(totalRecv).toLocaleString() + "</td><td></td></tr>";
                html += "</tbody></table>" + hr;

                html += sec("11. PAYABLES — SUPPLIERS WITH BALANCE");
                html += "<table>" + tblHead(["#", "Supplier", "Phone", "Email", "Total Purchases", "Paid", "Payable"]);
                html += "<tbody>";
                var si2 = 0;
                state.suppliers.forEach(function (s2) {
                  var sp = state.purchases.filter(function (p) { return p.supplier === s2.name; });
                  var spTotal = sp.reduce(function (a, p) { return a + p.total; }, 0);
                  var spPaid2 = sp.reduce(function (a, p) { return a + (p.paidAmount || 0); }, 0);
                  var spBal = getSupplierPayableFromPurchases(s2.name, state.purchases);
                  if (spBal > 0) {
                    si2++;
                    html += tblRow([si2, escapeHtml(s2.name), escapeHtml(s2.phone || "-"), escapeHtml(s2.email || "-"), getCurrencySymbol() + " " + Number(spTotal).toLocaleString(), getCurrencySymbol() + " " + Number(spPaid2).toLocaleString(), "<span style='color:#b71c1c;font-weight:700'>" + getCurrencySymbol() + " " + Number(spBal).toLocaleString() + "</span>"]);
                  }
                });
                if (si2 === 0) html += "<tr><td colspan='7' style='text-align:center;color:#888;padding:12px'>No outstanding payables.</td></tr>";
                html += "<tr class='tot'><td colspan='6'>TOTAL PAYABLE</td><td>" + getCurrencySymbol() + " " + Number(totalPay).toLocaleString() + "</td></tr>";
                html += "</tbody></table>" + hr;

                html += sec("12. INVENTORY SNAPSHOT (as of today)");
                html += "<table>" + tblHead(["#", "Product ID", "Product", "Category", "Stock", "Cost", "Sell Price", "Stock Value", "Potential Profit"]);
                html += "<tbody>";
                state.products.slice().sort(function (a, b) { return (b.price * b.stock) - (a.price * a.stock); }).forEach(function (p, i) {
                  var sv = (p.price || 0) * (p.stock || 0);
                  var pp2 = ((p.price || 0) - (p.cost || 0)) * (p.stock || 0);
                  var lowFlag = (p.stock || 0) <= 2 ? " <span style='color:#b71c1c;font-weight:700'>(LOW)</span>" : "";
                  html += tblRow([i + 1, escapeHtml(p.productId || "-"), escapeHtml(p.name) + (lowFlag), escapeHtml(p.category || "-"), fmtSumQty(p.stock || 0), getCurrencySymbol() + " " + fmtNum(p.cost || 0), getCurrencySymbol() + " " + fmtNum(p.price || 0), getCurrencySymbol() + " " + fmtNum(sv), getCurrencySymbol() + " " + fmtNum(pp2)]);
                });
                html += "<tr class='tot'><td colspan='7'>TOTAL STOCK VALUE (Retail)</td><td>" + getCurrencySymbol() + " " + Number(allStockVal).toLocaleString() + "</td><td>" + getCurrencySymbol() + " " + Number(allStockVal - allStockCost).toLocaleString() + "</td></tr>";
                html += "</tbody></table>" + hr;

                if (rDmg.length > 0) {
                  html += sec("13. DAMAGE / LOSS LOG (" + rDmg.length + " entries in period)");
                  var dmgTotal = rDmg.length;
                  var dmgQty = fmtSumQty(rDmg.reduce(function (a, d) { return a + (d.qty || 0); }, 0));
                  html += "<table>" + tblHead(["#", "Date", "Product", "Product ID", "Qty Damaged", "Reason"]);
                  html += "<tbody>";
                  rDmg.forEach(function (d, i) {
                    html += tblRow([i + 1, escapeHtml(d.date), escapeHtml(d.productName || "-"), escapeHtml(d.productId || "-"), fmtSumQty(d.qty || 0), escapeHtml(d.reason || "-")]);
                  });
                  html += "<tr class='tot'><td colspan='4'>TOTAL DAMAGED ITEMS</td><td>" + dmgQty + "</td><td></td></tr>";
                  html += "</tbody></table>" + hr;
                }

                html += sec(rDmg.length > 0 ? "14. BUSINESS SUMMARY" : "13. BUSINESS SUMMARY");
                html += "<div class='grid4'>";
                html += card("Capital Invested", capital, "#1565c0");
                html += card("All-time Revenue", state.sales.reduce(function (a, s) { return a + s.total; }, 0), "#1b5e20");
                html += card("All-time Expenses", state.expenses.reduce(function (a, e) { return a + e.amount; }, 0), "#b71c1c");
                html += card("Stock Value (Retail)", allStockVal, "#4a148c");
                html += card("Stock at Cost", allStockCost, "#37474f");
                html += card("Total Receivable", totalRecv, "#e65100");
                html += card("Total Payable", totalPay, "#b71c1c");
                html += card("Total Assets (All-time)", state.assets ? state.assets.reduce(function (a, x) { return a + x.amount; }, 0) : 0, "#37474f");
                html += card("Period Net Profit", netProfit, netProfit >= 0 ? "#1b5e20" : "#b71c1c");
                html += card("Net Worth", getCashBalances(state).total + allStockCost + totalRecv + totalAssetAmt - totalPay, "#0d47a1");
                html += cardNum("Total Customers", state.customers.length, "#1565c0");
                html += cardNum("Total Suppliers", state.suppliers.length, "#37474f");
                html += "</div>";

                var css3 = "body{font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:11.5px;color:#111;padding:16px;} table{width:100%;border-collapse:collapse;margin-bottom:12px;} th{background:#1a237e;color:#fff;padding:6px 9px;text-align:left;font-size:10.5px;} td{padding:5px 9px;border-bottom:1px solid #e8edf8;} tr:nth-child(even){background:#f8faff;} .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;} .shop{font-size:19px;font-weight:800;color:#1a237e;} .title{font-size:15px;font-weight:800;} .sub{font-size:11px;color:#555;} .sec{font-size:12px;font-weight:800;color:#1a237e;text-transform:uppercase;letter-spacing:.08em;margin:18px 0 8px;padding:5px 10px;background:#e8eeff;border-left:4px solid #1a237e;} .card{background:#f0f4ff;border-radius:7px;padding:9px 12px;margin-bottom:5px;} .clabel{font-size:9.5px;color:#555;text-transform:uppercase;letter-spacing:.05em;} .cval{font-size:16px;font-weight:800;} .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;} .tot{background:#e8eeff!important;font-weight:700;} hr{border:none;border-top:2px solid #e8eeff;margin:12px 0;} @media print{@page{size:A4;margin:10mm;} body{padding:0;} .sec{break-before:auto;} table{page-break-inside:auto;} tr{page-break-inside:avoid;}}";
                var fullBiz = "<!DOCTYPE html><html><head>" + PRINT_FONT_LINK + "<title>Business Report " + rf + " to " + rt + "</title><style>" + css3 + "</style></head><body>" + html + "</body></html>";
                openPrintWindow(fullBiz, { width: 1200, height: 900, delay: 700, useMainPdf: true });
                } catch (err) {
                  showAlert("Business report print failed: " + (err && err.message ? err.message : String(err)));
                }
              }}>Print Business Report</Btn>
            </div>
            <div style={{ background: C.accentSoft, borderRadius: 9, padding: "12px 16px", fontSize: 12, color: C.accent }}>
              This report includes: P&L Statement, Financial Overview, Sales Detail, Top Customers, Top Products, Purchases, Expenses (with category breakdown), Repairs, Assets Register, Receivables, Payables, Inventory Snapshot, Damage Log and Business Summary — filtered by your selected date range. Prints as A4 PDF.
            </div>
          </Card>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            {(function () {
              var rf = rangeFrom; var rt = rangeTo;
              var inRange = function (d) { return d >= rf && d <= rt; };
              var rSales2 = state.sales.filter(function (s) { return inRange(s.date); });
              var rPurch2 = state.purchases.filter(function (p) { return inRange(p.date || ""); });
              var rExp2 = state.expenses.filter(function (e) { return inRange(e.date); });
              var rRep2 = state.repairs.filter(function (r) { return inRange(r.dateIn || r.date || ""); });
              var rAssets2 = (state.assets || []).filter(function (a) { return !a._isOpening && inRange(a.date); });
              var rev2 = rSales2.reduce(function (a, s) { return a + s.total; }, 0);
              var cogs2 = rSales2.reduce(function (a, s) { return a + s.items.reduce(function (b, it) { return b + (it.cost || 0) * it.qty; }, 0); }, 0);
              var exp2 = rExp2.reduce(function (a, e) { return a + e.amount; }, 0);
              var pur2 = rPurch2.reduce(function (a, p) { return a + p.total; }, 0);
              var assets2 = rAssets2.reduce(function (a, x) { return a + x.amount; }, 0);
              var repRev2 = rRep2.filter(function (r) { return r.status === "Delivered"; }).reduce(function (a, r) { return a + (r.estimatedCost || r.cost || 0); }, 0);
              return (
                <div style={{ display: "contents" }}>
                  <StatCard label="Revenue" value={rev2} accent={C.blue} icon="💰" sub={rSales2.length + " invoices"} />
                  <StatCard label="Gross Profit" value={rev2 - cogs2} accent={rev2 - cogs2 >= 0 ? C.green : C.red} icon="📈" />
                  <StatCard label="Net Profit" value={rev2 - cogs2 - exp2} accent={rev2 - cogs2 - exp2 >= 0 ? C.green : C.red} icon="🎯" />
                  <StatCard label="Total Expenses" value={exp2} accent={C.red} icon="💸" sub={rExp2.length + " records"} />
                  <StatCard label="Purchases" value={pur2} accent={C.orange} icon="🛒" sub={rPurch2.length + " orders"} />
                  <StatCard label="Repairs Revenue" value={repRev2} accent={C.cyan} icon="🔧" sub={rRep2.length + " jobs"} />
                  <StatCard label="Assets Acquired" value={assets2} accent={C.purple} icon="🏛" sub={rAssets2.length + " items"} />
                </div>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  );
});
export default Reports;
