import React, { useState } from "react";
import { round2 } from "../utils/moneyRound.js";
import { activeSalesReturns } from "../utils/voidInvoice.js";
import { sumRawMaterialKitchenCostInRange } from "../utils/ingredientUsageCost.js";
import { buildDocPrintHeaderHtml, buildDocPrintFooterHtml, DOC_PRINT_ACCENT } from "../components/DocPrintHeader.jsx";
import UniversalPrintPreview from "../components/UniversalPrintPreview.jsx";

/**
 * Report Generate: pick report → set period → Generate → A4 print preview
 * with Print / WhatsApp / Save PDF (same chrome as Sales View & Print).
 */
var ReportsAccountsHub = function (props) {
  var state = props.state;
  var WABtn = props.WABtn;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var escapeHtml = props.escapeHtml;
  var openPrintWindow = props.openPrintWindow;
  var PRINT_FONT_LINK = props.PRINT_FONT_LINK || "";
  var shareViaWhatsApp = props.shareViaWhatsApp;
  var showAlert = props.showAlert || function () {};
  var getNetCOGSForRange = props.getNetCOGSForRange;
  var getCashBalances = props.getCashBalances;
  var getTotalReceivableDerived = props.getTotalReceivableDerived;
  var getTotalPayableDerived = props.getTotalPayableDerived;
  var getTotalSupplierPayable = props.getTotalSupplierPayable;
  var getProfitAndLossFromLedger = props.getProfitAndLossFromLedger;
  var getBalanceSheetFromLedger = props.getBalanceSheetFromLedger;
  var S = props.S;
  var liveSalesRpt = props.liveSalesRpt || [];
  var livePurchasesRpt = props.livePurchasesRpt || [];
  var hasRepairs = props.hasRepairs === true;
  var today = props.today;

  var reportDate = props.reportDate;
  var setReportDate = props.setReportDate;
  var pnlMonth = props.pnlMonth;
  var setPnlMonth = props.setPnlMonth;
  var pnlYear = props.pnlYear;
  var setPnlYear = props.setPnlYear;
  var rangeFrom = props.rangeFrom;
  var setRangeFrom = props.setRangeFrom;
  var rangeTo = props.rangeTo;
  var setRangeTo = props.setRangeTo;
  var acctPeriod = props.acctPeriod;
  var setAcctPeriod = props.setAcctPeriod;

  var [selectedId, setSelectedId] = useState("summary");
  var [preview, setPreview] = useState(null);
  var [genBusy, setGenBusy] = useState(false);

  var REPORTS = [
    { id: "summary", label: "Business Performance Report", date: "period", group: "Summary" },
    { id: "business-full", label: "Business Full Report", date: "none", group: "Summary" },
    { id: "sales", label: "Sales Report", date: "period", group: "Sales" },
    { id: "daily", label: "Daily Sales Report", date: "day", group: "Sales" },
    { id: "monthly", label: "Monthly Sales Report", date: "month", group: "Sales" },
    { id: "purchases", label: "Purchases Report", date: "period", group: "Purchases" },
    { id: "expenses", label: "Expenses Report", date: "period", group: "Expenses" },
    { id: "assets", label: "Assets Report", date: "period", group: "Assets" },
    { id: "stock", label: "Stock / Inventory Report", date: "none", group: "Inventory" },
    { id: "parties", label: "Parties Report", date: "none", group: "Parties" },
    { id: "customer-balance", label: "Customer Balance Report", date: "none", group: "Parties" },
  ];
  if (hasRepairs) {
    REPORTS.splice(8, 0, { id: "repairs", label: "Repairs Report", date: "period", group: "Repairs" });
  }

  var selected = REPORTS.find(function (r) { return r.id === selectedId; }) || REPORTS[0];

  var resolvePeriod = function () {
    if (selected.date === "day") return "daily";
    if (selected.date === "month") return "monthly";
    if (selected.date === "none") return "range";
    return acctPeriod || "monthly";
  };

  var getRange = function () {
    var period = resolvePeriod();
    if (selected.date === "none") {
      return { from: "", to: "", label: "As of today", period: "none" };
    }
    if (period === "daily") {
      return { from: reportDate, to: reportDate, label: "Day — " + reportDate, period: period };
    }
    if (period === "monthly") {
      var mo = pnlMonth.slice(5, 7);
      var yr = pnlMonth.slice(0, 4);
      var last = new Date(parseInt(yr, 10), parseInt(mo, 10), 0).getDate();
      var monthLabel = pnlMonth;
      try {
        monthLabel = new Date(pnlMonth + "-02").toLocaleDateString("en-US", { month: "long", year: "numeric" });
      } catch (e) {}
      return {
        from: pnlMonth + "-01",
        to: pnlMonth + "-" + String(last).padStart(2, "0"),
        label: "Month — " + monthLabel,
        period: period,
      };
    }
    if (period === "yearly") {
      return { from: pnlYear + "-01-01", to: pnlYear + "-12-31", label: "Year — " + pnlYear, period: period };
    }
    return { from: rangeFrom, to: rangeTo, label: "Custom — " + rangeFrom + " to " + rangeTo, period: period };
  };

  var money = function (n) { return getCurrencySymbol() + " " + fmtNum(n); };

  var wrapA4 = function (title, rangeLabel, bodyHtml) {
    var settings = state.settings || {};
    var printedOn = new Date().toLocaleString();
    var accent = DOC_PRINT_ACCENT;
    var css = "";
    css += "*{margin:0;padding:0;box-sizing:border-box;}";
    css += "body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#111;background:#fff;padding:16mm 14mm;}";
    css += "@page{size:A4;margin:12mm;}";
    css += ".sheet{max-width:182mm;margin:0 auto;min-height:265mm;display:flex;flex-direction:column;}";
    css += ".period-box{background:#f4f6fa;border:1px solid #d8dee9;padding:7px 11px;margin-bottom:12px;font-size:12px;}";
    css += ".period-box b{color:" + accent + ";}";
    css += ".off-stmt{width:100%;border-collapse:collapse;margin:0 0 12px;border:1.5px solid " + accent + ";}";
    css += ".off-stmt td{padding:10px 14px;border-bottom:1px solid #d8dee9;font-size:13px;}";
    css += ".off-stmt tr:last-child td{border-bottom:none;}";
    css += ".off-stmt .lbl{font-weight:650;color:#1e293b;}";
    css += ".off-stmt .lbl small{display:block;font-size:10px;font-weight:600;color:#94a3b8;margin-top:2px;letter-spacing:.02em;}";
    css += ".off-stmt .amt{text-align:right;font-weight:800;font-variant-numeric:tabular-nums;font-size:14px;white-space:nowrap;}";
    css += ".off-stmt tr.is-line td{background:#fff;}";
    css += ".off-stmt tr.is-result td{background:#f0fdf4;border-top:2px solid #0f9e6e;}";
    css += ".off-stmt tr.is-result.is-neg td{background:#fef2f2;border-top-color:#e03151;}";
    css += ".off-stmt tr.is-gross td{background:#f8fafc;border-top:1.5px solid #94a3b8;}";
    css += ".off-stmt tr.is-deduct td{background:#fffaf5;}";
    css += ".off-head{background:" + accent + ";color:#fff;padding:9px 14px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;}";
    css += ".off-head.sub{background:#1e3a5f;margin-top:14px;}";
    css += ".off-note{font-size:10.5px;color:#64748b;margin-top:8px;line-height:1.45;}";
    css += ".off-banner{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;margin:0 0 12px;border:1.5px solid #bbf7d0;background:#f0fdf4;}";
    css += ".off-banner.is-neg{border-color:#fecaca;background:#fef2f2;}";
    css += ".off-banner .bl{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#475569;}";
    css += ".off-banner .bs{font-size:11px;color:#64748b;margin-top:2px;font-weight:600;}";
    css += ".off-banner .bv{font-size:22px;font-weight:900;font-variant-numeric:tabular-nums;}";
    css += ".off-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 12px;}";
    css += ".off-card{border:1px solid #d8dee9;background:#fff;}";
    css += ".off-card .ch{background:#f4f6fa;border-bottom:1px solid #d8dee9;padding:7px 11px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#475569;}";
    css += ".off-card .cr{display:flex;justify-content:space-between;gap:8px;padding:7px 11px;font-size:12px;border-bottom:1px solid #f1f5f9;}";
    css += ".off-card .cr:last-child{border-bottom:none;}";
    css += ".off-card .cr.strong{font-weight:800;background:#f8fafc;}";
    css += ".off-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 12px;}";
    css += ".off-metrics .m{border:1px solid #d8dee9;background:#f8fafc;padding:8px 10px;text-align:center;}";
    css += ".off-metrics .ml{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#64748b;}";
    css += ".off-metrics .mv{font-size:15px;font-weight:800;margin-top:3px;font-variant-numeric:tabular-nums;}";
    css += "h3{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#fff;background:" + accent + ";padding:7px 10px;margin:0;}";
    css += "table.data{width:100%;border-collapse:collapse;margin-bottom:12px;border:1px solid #cfd6e4;font-size:12px;}";
    css += "table.data th{background:#0d1b3e;color:#fff;padding:7px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;}";
    css += "table.data td{padding:7px 10px;border-bottom:1px solid #e8ecf3;}";
    css += "table.data tr:nth-child(even) td{background:#fafbfe;}";
    css += "table.stmt{width:100%;border-collapse:collapse;margin-bottom:12px;border:1px solid #cfd6e4;}";
    css += "table.stmt td{padding:8px 11px;border-bottom:1px solid #e8ecf3;font-size:12.5px;}";
    css += ".sec{background:#f7f9fc;font-weight:700;}";
    css += ".amt{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;}";
    css += ".note{font-size:10.5px;color:#777;}";
    css += ".total-row td{background:#eef2ff;border-top:2px solid " + accent + ";font-weight:800;}";
    css += ".net-row td{background:#e8f7f0;border-top:2px solid #0f9e6e;font-weight:900;font-size:13.5px;}";
    css += ".net-row.is-neg td{background:#fdecee;border-top-color:#e03151;}";
    css += ".green{color:#0f9e6e;} .red{color:#e03151;} .blue{color:#1d4ed8;} .navy{color:" + accent + ";}";
    css += ".kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 12px;}";
    css += ".kpi .box{border:1px solid #d8dee9;background:#f8fafc;padding:8px 10px;}";
    css += ".kpi .l{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-weight:700;}";
    css += ".kpi .v{font-size:15px;font-weight:800;margin-top:3px;}";
    css += ".cond-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;}";
    css += ".cond-card{border:1px solid #d8dee9;padding:10px 12px;background:#fff;}";
    css += ".cond-card .hl{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:6px;}";
    css += ".cond-card .row{display:flex;justify-content:space-between;gap:8px;padding:4px 0;font-size:12px;border-bottom:1px solid #f1f5f9;}";
    css += ".cond-card .row:last-child{border-bottom:none;font-weight:800;padding-top:6px;}";
    css += ".verdict{margin:10px 0 14px;padding:12px 14px;border:2px solid #bbf7d0;background:#f0fdf4;display:flex;justify-content:space-between;align-items:center;gap:12px;}";
    css += ".verdict.is-neg{border-color:#fecaca;background:#fef2f2;}";
    css += ".verdict .vl{font-size:12px;font-weight:800;color:#334155;}";
    css += ".verdict .vv{font-size:22px;font-weight:900;}";
    css += ".sign{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:26px;}";
    css += ".sign .box{border-top:1px solid #999;padding-top:6px;font-size:11px;color:#555;}";
    css += ".footer{margin-top:18px;padding-top:9px;border-top:1px solid #d8dee9;text-align:center;font-size:10px;color:#888;}";
    css += ".empty{text-align:center;padding:28px;color:#888;font-size:12px;}";
    css += "@media print{body{padding:0;}}";

    var html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>" + escapeHtml(title) + "</title>" + PRINT_FONT_LINK + "<style>" + css + "</style></head><body><div class='sheet'>";
    html += buildDocPrintHeaderHtml({
      settings: settings,
      title: title,
      escapeHtml: escapeHtml,
      printedOn: printedOn,
      showTopbar: true,
      showLogo: false,
    });
    if (rangeLabel) html += "<div class='period-box'><b>Reporting period:</b> " + escapeHtml(rangeLabel) + "</div>";
    html += bodyHtml;
    html += "<div class='sign'><div class='box'>Prepared by</div><div class='box'>Authorised / Checked by</div></div>";
    html += buildDocPrintFooterHtml({ settings: settings, escapeHtml: escapeHtml, padPx: 0, withSpacer: true, kind: "report" });
    html += "<div class='footer'>Generated by TechonERP &nbsp;•&nbsp; Confidential &nbsp;•&nbsp; " + escapeHtml(printedOn) + "</div>";
    html += "</div></body></html>";
    return html;
  };

  var buildBusinessFullHtml = function () {
    var bal = typeof getCashBalances === "function" ? getCashBalances(state) : { cash: 0, bank: 0, total: 0 };
    var cashHand = round2(bal.cash || 0);
    var cashBank = round2(bal.bank || 0);
    var cashTotal = round2(bal.total != null ? bal.total : cashHand + cashBank);

    var receivable = typeof getTotalReceivableDerived === "function"
      ? round2(getTotalReceivableDerived(state))
      : round2(liveSalesRpt.reduce(function (a, s) { return a + Math.max(0, (s.total || 0) - (s.paid || 0)); }, 0));

    var payable = typeof getTotalPayableDerived === "function"
      ? round2(getTotalPayableDerived(state))
      : (typeof getTotalSupplierPayable === "function"
        ? round2(getTotalSupplierPayable(state.purchases || livePurchasesRpt))
        : round2(livePurchasesRpt.reduce(function (a, p) { return a + Math.max(0, (p.total || 0) - (p.paidAmount || 0)); }, 0)));

    var products = (state.products || []).filter(function (p) { return p.status !== "inactive"; });
    var stockCost = round2(products.reduce(function (a, p) { return a + (p.cost || 0) * (p.stock || 0); }, 0));
    var stockRetail = round2(products.reduce(function (a, p) { return a + (p.price || 0) * (p.stock || 0); }, 0));
    var assetsTotal = round2((state.assets || []).reduce(function (a, x) { return a + (x.amount || x.value || 0); }, 0));

    var sourceNote = "ops snapshot";
    /* Prefer GL inventory / fixed assets / net position when journal exists. */
    try {
      var jFull = (S && typeof S.get === "function") ? (S.get("tc3_journal_lines", []) || []) : [];
      if (jFull.length) {
        var acctNet = function (id) {
          var d = 0;
          var c = 0;
          jFull.forEach(function (ln) {
            if (!ln || String(ln.accountId || "") !== id) return;
            d += Number(ln.debit) || 0;
            c += Number(ln.credit) || 0;
          });
          return round2(d - c);
        };
        stockCost = acctNet("1200");
        assetsTotal = acctNet("1500");
        if (typeof getBalanceSheetFromLedger === "function") {
          var bsFull = getBalanceSheetFromLedger(null);
          if (bsFull && typeof bsFull.assets === "number") {
            sourceNote = "General Ledger";
          }
        } else {
          sourceNote = "General Ledger";
        }
      }
    } catch (_eFull) { /* keep ops stock/assets */ }

    var liquid = cashTotal;
    var currentAssets = round2(cashTotal + receivable + stockCost);
    var totalAssetsPos = round2(currentAssets + assetsTotal);
    var netPosition = round2(totalAssetsPos - payable);
    try {
      if (sourceNote === "General Ledger" && typeof getBalanceSheetFromLedger === "function") {
        var bsPos = getBalanceSheetFromLedger(null);
        if (bsPos && typeof bsPos.assets === "number") {
          totalAssetsPos = round2(bsPos.assets);
          currentAssets = round2(cashTotal + receivable + stockCost);
          if (typeof bsPos.equityWithCurrentEarnings === "number") {
            netPosition = round2(bsPos.equityWithCurrentEarnings);
          } else {
            netPosition = round2(totalAssetsPos - payable);
          }
        }
      }
    } catch (_eBs) { /* keep assembled position */ }

    var body = "";
    body += "<div class='verdict" + (netPosition < 0 ? " is-neg" : "") + "'>";
    body += "<div class='vl'>Business position" + (sourceNote === "General Ledger" ? " (GL equity)" : " (Assets − Payables)") + "</div>";
    body += "<div class='vv " + (netPosition >= 0 ? "green" : "red") + "'>" + money(netPosition) + "</div>";
    body += "</div>";

    body += "<div class='cond-grid'>";
    body += "<div class='cond-card'><div class='hl'>Cash &amp; Bank</div>";
    body += "<div class='row'><span>Cash in hand</span><span class='green'>" + money(cashHand) + "</span></div>";
    body += "<div class='row'><span>Bank balance</span><span class='blue'>" + money(cashBank) + "</span></div>";
    body += "<div class='row'><span>Total cash</span><span>" + money(cashTotal) + "</span></div></div>";

    body += "<div class='cond-card'><div class='hl'>People owe / You owe</div>";
    body += "<div class='row'><span>Receivable (to collect)</span><span class='blue'>" + money(receivable) + "</span></div>";
    body += "<div class='row'><span>Payable (to pay)</span><span class='red'>" + money(payable) + "</span></div>";
    body += "<div class='row'><span>Net AR − AP</span><span>" + money(round2(receivable - payable)) + "</span></div></div>";

    body += "<div class='cond-card'><div class='hl'>Stock &amp; Assets</div>";
    body += "<div class='row'><span>Goods in stock (cost)</span><span>" + money(stockCost) + "</span></div>";
    body += "<div class='row'><span>Stock retail value</span><span class='note'>" + money(stockRetail) + "</span></div>";
    body += "<div class='row'><span>Fixed / business assets</span><span>" + money(assetsTotal) + "</span></div></div>";

    body += "<div class='cond-card'><div class='hl'>Position summary</div>";
    body += "<div class='row'><span>Liquid cash</span><span class='green'>" + money(liquid) + "</span></div>";
    body += "<div class='row'><span>Current assets</span><span>" + money(currentAssets) + "</span></div>";
    body += "<div class='row'><span>Total assets</span><span class='navy'>" + money(totalAssetsPos) + "</span></div></div>";
    body += "</div>";

    body += "<h3>Business Condition Statement</h3><table class='stmt'><tbody>";
    body += "<tr class='sec'><td colspan='2'>What the business holds</td></tr>";
    body += "<tr><td>Cash in hand</td><td class='amt green'>" + money(cashHand) + "</td></tr>";
    body += "<tr><td>Bank</td><td class='amt blue'>" + money(cashBank) + "</td></tr>";
    body += "<tr><td>Total cash</td><td class='amt'>" + money(cashTotal) + "</td></tr>";
    body += "<tr><td>Receivables (customers owe you)</td><td class='amt blue'>" + money(receivable) + "</td></tr>";
    body += "<tr><td>Goods in stock (at cost)</td><td class='amt'>" + money(stockCost) + "</td></tr>";
    body += "<tr><td>Business assets</td><td class='amt'>" + money(assetsTotal) + "</td></tr>";
    body += "<tr class='total-row'><td>Total assets</td><td class='amt navy'>" + money(totalAssetsPos) + "</td></tr>";
    body += "<tr class='sec'><td colspan='2'>What the business owes</td></tr>";
    body += "<tr><td>Payables (you owe suppliers / others)</td><td class='amt red'>" + money(payable) + "</td></tr>";
    body += "<tr class='net-row" + (netPosition < 0 ? " is-neg" : "") + "'><td>Net business position</td><td class='amt " + (netPosition >= 0 ? "green" : "red") + "'>" + money(netPosition) + "</td></tr>";
    body += "</tbody></table>";
    body += "<p class='note' style='margin-top:8px;'>Snapshot as of today — " + (sourceNote === "General Ledger" ? "stock/assets/position from General Ledger; retail stock is informational only." : "cash, stock, assets, money to collect and money to pay.") + "</p>";
    return wrapA4("Business Full Report", "As of today", body);
  };

  var buildHtml = function () {
    if (selected.id === "business-full") return buildBusinessFullHtml();

    var range = getRange();
    var rf = range.from;
    var rt = range.to;
    var inR = function (d) {
      if (range.period === "none") return true;
      return (d || "") >= rf && (d || "") <= rt;
    };
    var salesRows = liveSalesRpt.filter(function (s) { return inR(s.date); });
    var purchRows = livePurchasesRpt.filter(function (p) { return inR(p.date); });
    var expRows = (state.expenses || []).filter(function (e) { return inR(e.date); });
    var assetRows = (state.assets || []).filter(function (a) { return !a._isOpening && inR(a.date); });
    var repairRows = hasRepairs ? (state.repairs || []).filter(function (r) { return inR(r.dateIn || r.date); }) : [];
    var partyCustomers = (state.customers || []).slice().sort(function (a, b) {
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    var partySuppliers = state.suppliers || [];

    var salesTotal = round2(salesRows.reduce(function (a, s) { return a + (s.total || 0); }, 0));
    var salesPaid = round2(salesRows.reduce(function (a, s) { return a + (s.paid || 0); }, 0));
    var purchTotal = round2(purchRows.reduce(function (a, p) { return a + (p.total || 0); }, 0));
    var purchPaid = round2(purchRows.reduce(function (a, p) { return a + (p.paidAmount || 0); }, 0));
    var expTotal = round2(expRows.reduce(function (a, e) { return a + (e.amount || 0); }, 0));
    var assetTotal = round2(assetRows.reduce(function (a, x) { return a + (x.amount || x.value || 0); }, 0));
    var repairTotal = round2(repairRows.reduce(function (a, r) { return a + (r.estimatedCost || r.cost || 0); }, 0));
    var rSalesReturns = activeSalesReturns(state.sales, (state.salesReturns || []).filter(function (r) {
      return range.period === "none" ? true : inR(r.date);
    }));
    var netRev = round2(salesRows.reduce(function (a, s) { return a + Math.max(0, (s.total || 0) - (s.totalTax || 0)); }, 0));
    var cogs = round2(
      (typeof getNetCOGSForRange === "function" ? getNetCOGSForRange(salesRows, rSalesReturns) : 0) +
      sumRawMaterialKitchenCostInRange(state, rf || "1900-01-01", rt || "2999-12-31")
    );
    var grossP = round2(netRev - cogs);
    var netP = round2(grossP - expTotal);
    var id = selected.id;
    var title = selected.label;
    var body = "";

    if (id === "summary") {
      var salesDue = round2(Math.max(0, salesTotal - salesPaid));
      var purchDue = round2(Math.max(0, purchTotal - purchPaid));
      var ledgerNote = "";
      /* Prefer ledger P&L for the period when journal exists (single source of truth). */
      try {
        if (typeof getProfitAndLossFromLedger === "function" && S && typeof S.get === "function") {
          var jlines = S.get("tc3_journal_lines", []) || [];
          if (jlines.length) {
            var plL = getProfitAndLossFromLedger(rf || null, rt || null);
            if (plL && typeof plL.net === "number") {
              netP = plL.net;
              if (typeof plL.income === "number") {
                salesTotal = plL.income;
                netRev = plL.income;
              }
              if (typeof plL.expenses === "number") {
                expTotal = plL.expenses;
                cogs = 0;
                grossP = round2(netRev - expTotal + netP);
                grossP = netRev;
              }
              ledgerNote = " · figures from General Ledger";
            }
          }
        }
      } catch (_e) { /* keep ops */ }
      var grossMargin = salesTotal > 0 ? round2((grossP / salesTotal) * 100) : 0;
      var netMargin = salesTotal > 0 ? round2((netP / salesTotal) * 100) : 0;
      var avgSale = salesRows.length ? round2(salesTotal / salesRows.length) : 0;

      body += "<div class='off-banner" + (netP < 0 ? " is-neg" : "") + "'>";
      body += "<div><div class='bl'>Net result for period</div>";
      body += "<div class='bs'>" + escapeHtml(range.label) + " · " + salesRows.length + " sales · " + purchRows.length + " purchases · " + expRows.length + " expenses" + escapeHtml(ledgerNote) + "</div></div>";
      body += "<div class='bv " + (netP >= 0 ? "green" : "red") + "'>" + money(netP) + "</div>";
      body += "</div>";

      body += "<div class='off-metrics'>";
      body += "<div class='m'><div class='ml'>" + (ledgerNote ? "Income (GL)" : "Total Sales") + "</div><div class='mv blue'>" + money(salesTotal) + "</div></div>";
      body += "<div class='m'><div class='ml'>Total Purchases</div><div class='mv navy'>" + money(purchTotal) + "</div></div>";
      body += "<div class='m'><div class='ml'>" + (ledgerNote ? "Expenses (GL)" : "Total Expenses") + "</div><div class='mv red'>" + money(expTotal) + "</div></div>";
      body += "<div class='m'><div class='ml'>" + (ledgerNote ? "Net (GL)" : "Gross Profit") + "</div><div class='mv " + (netP >= 0 ? "green" : "red") + "'>" + money(ledgerNote ? netP : grossP) + "</div></div>";
      body += "</div>";

      body += "<div class='off-head'>Performance Statement" + (ledgerNote ? " (General Ledger)" : "") + "</div>";
      body += "<table class='off-stmt'><tbody>";
      if (ledgerNote) {
        body += "<tr class='is-line'><td class='lbl'>Income<small>From ledger income accounts</small></td><td class='amt blue'>" + money(salesTotal) + "</td></tr>";
        body += "<tr class='is-deduct'><td class='lbl'>Less: Expenses<small>COGS + operating (ledger)</small></td><td class='amt red'>" + money(expTotal) + "</td></tr>";
        body += "<tr class='is-result" + (netP < 0 ? " is-neg" : "") + "'><td class='lbl'>Net Profit" + (netP < 0 ? " / (Loss)" : "") + "<small>Matches Accounts → GL / Trial</small></td><td class='amt " + (netP >= 0 ? "green" : "red") + "'>" + money(netP) + "</td></tr>";
      } else {
        body += "<tr class='is-line'><td class='lbl'>Total Sales<small>" + salesRows.length + " invoice" + (salesRows.length === 1 ? "" : "s") + (avgSale ? " · avg " + money(avgSale) : "") + "</small></td><td class='amt blue'>" + money(salesTotal) + "</td></tr>";
        body += "<tr class='is-deduct'><td class='lbl'>Less: Cost of Goods Sold<small>Stock cost of items sold</small></td><td class='amt red'>" + money(cogs) + "</td></tr>";
        body += "<tr class='is-gross'><td class='lbl'>Gross Profit<small>Margin " + grossMargin + "%</small></td><td class='amt " + (grossP >= 0 ? "green" : "red") + "'>" + money(grossP) + "</td></tr>";
        body += "<tr class='is-line'><td class='lbl'>Total Purchases<small>" + purchRows.length + " purchase" + (purchRows.length === 1 ? "" : "s") + " (stock bought)</small></td><td class='amt navy'>" + money(purchTotal) + "</td></tr>";
        body += "<tr class='is-deduct'><td class='lbl'>Less: Operating Expenses<small>" + expRows.length + " expense" + (expRows.length === 1 ? "" : "s") + "</small></td><td class='amt red'>" + money(expTotal) + "</td></tr>";
        body += "<tr class='is-result" + (netP < 0 ? " is-neg" : "") + "'><td class='lbl'>Net Profit" + (netP < 0 ? " / (Loss)" : "") + "<small>Margin " + netMargin + "% of sales</small></td><td class='amt " + (netP >= 0 ? "green" : "red") + "'>" + money(netP) + "</td></tr>";
      }
      body += "</tbody></table>";

      body += "<div class='off-grid'>";
      body += "<div class='off-card'><div class='ch'>Sales collection <span class='note'>(invoice activity)</span></div>";
      body += "<div class='cr'><span>Collected</span><span class='green'>" + money(salesPaid) + "</span></div>";
      body += "<div class='cr'><span>Outstanding</span><span class='red'>" + money(salesDue) + "</span></div>";
      body += "<div class='cr strong'><span>Total sales (invoices)</span><span class='blue'>" + money(round2(salesRows.reduce(function (a, s) { return a + (s.total || 0); }, 0))) + "</span></div></div>";

      body += "<div class='off-card'><div class='ch'>Purchase payments <span class='note'>(invoice activity)</span></div>";
      body += "<div class='cr'><span>Paid to suppliers</span><span class='green'>" + money(purchPaid) + "</span></div>";
      body += "<div class='cr'><span>Still payable</span><span class='red'>" + money(purchDue) + "</span></div>";
      body += "<div class='cr strong'><span>Total purchases</span><span class='navy'>" + money(purchTotal) + "</span></div></div>";
      body += "</div>";

      body += "<p class='off-note'>" + (ledgerNote
        ? "Net profit is taken from the General Ledger for this period. Invoice collection cards remain operational activity lists."
        : "Gross profit = sales − cost of goods sold. Net profit = gross profit − operating expenses. Purchases are shown for stock buying activity and are separate from COGS.") + "</p>";
      return wrapA4(title, range.label, body);
    }

    if (id === "sales" || id === "daily" || id === "monthly") {
      body += "<div class='kpi'>";
      body += "<div class='box'><div class='l'>Invoices</div><div class='v'>" + salesRows.length + "</div></div>";
      body += "<div class='box'><div class='l'>Sales Total</div><div class='v blue'>" + money(salesTotal) + "</div></div>";
      body += "<div class='box'><div class='l'>Collected</div><div class='v green'>" + money(salesPaid) + "</div></div>";
      body += "<div class='box'><div class='l'>Outstanding</div><div class='v red'>" + money(Math.max(0, salesTotal - salesPaid)) + "</div></div>";
      body += "</div>";
      body += "<h3>Sales Detail</h3><table class='data'><thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead><tbody>";
      if (!salesRows.length) body += "<tr><td colspan='6' class='empty'>No sales in this period</td></tr>";
      salesRows.forEach(function (s) {
        body += "<tr><td>" + escapeHtml(s.date || "") + "</td><td>" + escapeHtml(s.invoiceNo || String(s.id || "").slice(0, 8)) + "</td><td>" + escapeHtml(s.customerName || "Walk-in") + "</td><td class='amt blue'>" + money(s.total) + "</td><td class='amt'>" + money(s.paid || 0) + "</td><td>" + escapeHtml(s.payStatus || "") + "</td></tr>";
      });
      body += "</tbody></table>";
      return wrapA4(title, range.label, body);
    }

    if (id === "purchases") {
      body += "<div class='kpi'>";
      body += "<div class='box'><div class='l'>Orders</div><div class='v'>" + purchRows.length + "</div></div>";
      body += "<div class='box'><div class='l'>Purchase Total</div><div class='v blue'>" + money(purchTotal) + "</div></div>";
      body += "<div class='box'><div class='l'>Paid</div><div class='v green'>" + money(purchPaid) + "</div></div>";
      body += "<div class='box'><div class='l'>Payable</div><div class='v red'>" + money(Math.max(0, purchTotal - purchPaid)) + "</div></div>";
      body += "</div>";
      body += "<h3>Purchase Detail</h3><table class='data'><thead><tr><th>Date</th><th>Supplier</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead><tbody>";
      if (!purchRows.length) body += "<tr><td colspan='5' class='empty'>No purchases in this period</td></tr>";
      purchRows.forEach(function (p) {
        body += "<tr><td>" + escapeHtml(p.date || "") + "</td><td>" + escapeHtml(p.supplier || "—") + "</td><td class='amt blue'>" + money(p.total) + "</td><td class='amt'>" + money(p.paidAmount || 0) + "</td><td class='amt red'>" + money(Math.max(0, (p.total || 0) - (p.paidAmount || 0))) + "</td></tr>";
      });
      body += "</tbody></table>";
      return wrapA4(title, range.label, body);
    }

    if (id === "expenses") {
      body += "<div class='kpi' style='grid-template-columns:1fr 1fr;max-width:420px;'>";
      body += "<div class='box'><div class='l'>Entries</div><div class='v'>" + expRows.length + "</div></div>";
      body += "<div class='box'><div class='l'>Total Expenses</div><div class='v red'>" + money(expTotal) + "</div></div>";
      body += "</div>";
      body += "<h3>Expense Detail</h3><table class='data'><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>";
      if (!expRows.length) body += "<tr><td colspan='4' class='empty'>No expenses in this period</td></tr>";
      expRows.forEach(function (e) {
        body += "<tr><td>" + escapeHtml(e.date || "") + "</td><td>" + escapeHtml(e.category || "") + "</td><td>" + escapeHtml(e.description || "") + "</td><td class='amt red'>" + money(e.amount) + "</td></tr>";
      });
      body += "</tbody></table>";
      return wrapA4(title, range.label, body);
    }

    if (id === "assets") {
      body += "<div class='kpi' style='grid-template-columns:1fr 1fr;max-width:420px;'>";
      body += "<div class='box'><div class='l'>Assets</div><div class='v'>" + assetRows.length + "</div></div>";
      body += "<div class='box'><div class='l'>Total Value</div><div class='v'>" + money(assetTotal) + "</div></div>";
      body += "</div>";
      body += "<h3>Assets Detail</h3><table class='data'><thead><tr><th>Date</th><th>Name</th><th>Category</th><th>Amount</th></tr></thead><tbody>";
      if (!assetRows.length) body += "<tr><td colspan='4' class='empty'>No assets in this period</td></tr>";
      assetRows.forEach(function (a) {
        body += "<tr><td>" + escapeHtml(a.date || "") + "</td><td>" + escapeHtml(a.name || a.title || "—") + "</td><td>" + escapeHtml(a.category || "—") + "</td><td class='amt'>" + money(a.amount || a.value || 0) + "</td></tr>";
      });
      body += "</tbody></table>";
      return wrapA4(title, range.label, body);
    }

    if (id === "repairs") {
      body += "<div class='kpi' style='grid-template-columns:1fr 1fr;max-width:420px;'>";
      body += "<div class='box'><div class='l'>Jobs</div><div class='v'>" + repairRows.length + "</div></div>";
      body += "<div class='box'><div class='l'>Est. Value</div><div class='v'>" + money(repairTotal) + "</div></div>";
      body += "</div>";
      body += "<h3>Repairs Detail</h3><table class='data'><thead><tr><th>Date</th><th>Customer</th><th>Device</th><th>Status</th><th>Amount</th></tr></thead><tbody>";
      if (!repairRows.length) body += "<tr><td colspan='5' class='empty'>No repairs in this period</td></tr>";
      repairRows.forEach(function (r) {
        body += "<tr><td>" + escapeHtml(r.dateIn || r.date || "") + "</td><td>" + escapeHtml(r.customerName || "—") + "</td><td>" + escapeHtml(r.device || r.item || "—") + "</td><td>" + escapeHtml(r.status || "") + "</td><td class='amt'>" + money(r.estimatedCost || r.cost || 0) + "</td></tr>";
      });
      body += "</tbody></table>";
      return wrapA4(title, range.label, body);
    }

    if (id === "parties") {
      body += "<div class='kpi' style='grid-template-columns:1fr 1fr;max-width:420px;'>";
      body += "<div class='box'><div class='l'>Customers</div><div class='v'>" + partyCustomers.length + "</div></div>";
      body += "<div class='box'><div class='l'>Suppliers</div><div class='v'>" + partySuppliers.length + "</div></div>";
      body += "</div>";
      body += "<h3>Parties Directory</h3><table class='data'><thead><tr><th>Name</th><th>Phone</th><th>Type</th></tr></thead><tbody>";
      if (!partyCustomers.length && !partySuppliers.length) body += "<tr><td colspan='3' class='empty'>No parties found</td></tr>";
      partyCustomers.forEach(function (c) {
        body += "<tr><td>" + escapeHtml(c.name || "") + "</td><td>" + escapeHtml(c.phone || "—") + "</td><td>Customer</td></tr>";
      });
      partySuppliers.forEach(function (s) {
        body += "<tr><td>" + escapeHtml(s.name || "") + "</td><td>" + escapeHtml(s.phone || "—") + "</td><td>Supplier</td></tr>";
      });
      body += "</tbody></table>";
      return wrapA4(title, "As of today", body);
    }

    if (id === "stock") {
      var stockProducts = (state.products || []).filter(function (p) { return p && p.status !== "inactive"; })
        .slice().sort(function (a, b) { return (a.stock || 0) - (b.stock || 0); });
      var stockCostVal = round2(stockProducts.reduce(function (a, p) { return a + (p.cost || 0) * (p.stock || 0); }, 0));
      var stockRetailVal = round2(stockProducts.reduce(function (a, p) { return a + (p.price || 0) * (p.stock || 0); }, 0));
      body += "<div class='kpi' style='grid-template-columns:1fr 1fr 1fr;max-width:640px;'>";
      body += "<div class='box'><div class='l'>Products</div><div class='v'>" + stockProducts.length + "</div></div>";
      body += "<div class='box'><div class='l'>Stock at cost (GL-aligned)</div><div class='v blue'>" + money(stockCostVal) + "</div></div>";
      body += "<div class='box'><div class='l'>Stock at retail</div><div class='v'>" + money(stockRetailVal) + "</div></div>";
      body += "</div>";
      body += "<h3>Stock Detail</h3><table class='data'><thead><tr><th>Code</th><th>Product</th><th>Category</th><th>Stock</th><th>Cost</th><th>Price</th><th>Cost value</th><th>Retail value</th></tr></thead><tbody>";
      if (!stockProducts.length) body += "<tr><td colspan='8' class='empty'>No products</td></tr>";
      stockProducts.forEach(function (p) {
        var st = p.stock || 0;
        var col = st === 0 ? "red" : (st < 5 ? "" : "green");
        body += "<tr><td>" + escapeHtml(p.productId || "—") + "</td><td>" + escapeHtml(p.name || "") + "</td><td>" + escapeHtml(p.category || "—") + "</td><td class='amt " + col + "'>" + st + "</td><td class='amt'>" + money(p.cost || 0) + "</td><td class='amt'>" + money(p.price || 0) + "</td><td class='amt'>" + money((p.cost || 0) * st) + "</td><td class='amt'>" + money((p.price || 0) * st) + "</td></tr>";
      });
      body += "</tbody></table>";
      body += "<p class='off-note'>Primary valuation is at cost (aligns with GL inventory). Retail is informational only.</p>";
      return wrapA4(title, "As of today", body);
    }

    if (id === "customer-balance") {
      /* Live open AR from invoices + manuals — do not trust denormalized customers[].balance. */
      var balByKey = {};
      var nameByKey = {};
      var phoneByKey = {};
      (liveSalesRpt || []).forEach(function (s) {
        if (!s) return;
        var open = Math.max(0, round2((s.total || 0) - (s.paid || 0)));
        if (open <= 0.005) return;
        /* Pending cheque float is still in paid for some flows; keep paid as source of payStatus. */
        var key = s.customerId ? ("id:" + String(s.customerId)) : ("n:" + String(s.customerName || "Walk-in").toLowerCase());
        balByKey[key] = round2((balByKey[key] || 0) + open);
        nameByKey[key] = s.customerName || nameByKey[key] || "Walk-in";
        if (s.customerPhone) phoneByKey[key] = s.customerPhone;
      });
      (state.customers || []).forEach(function (c) {
        if (!c) return;
        var key = c.id ? ("id:" + String(c.id)) : ("n:" + String(c.name || "").toLowerCase());
        if (!nameByKey[key]) nameByKey[key] = c.name || "";
        if (c.phone) phoneByKey[key] = c.phone;
      });
      var manuals = (typeof S !== "undefined" && S.get) ? (S.get("tc3_manualReceivables", []) || []) : [];
      manuals.forEach(function (mr) {
        if (!mr || mr._isOpening) return;
        var paidM = (mr.paymentHistory || []).reduce(function (a, p) {
          var cm = String((p && p.cashMethod) || "");
          if (cm === "Cheque" || cm === "Adjustment") return a;
          return a + (Number(p && p.amount) || 0);
        }, 0);
        var openM = Math.max(0, round2((mr.amount || 0) - paidM));
        if (openM <= 0.005) return;
        var key = mr.customerId ? ("id:" + String(mr.customerId)) : ("n:" + String(mr.person || mr.customer || mr.customerName || "Manual").toLowerCase());
        balByKey[key] = round2((balByKey[key] || 0) + openM);
        nameByKey[key] = mr.person || mr.customer || mr.customerName || nameByKey[key] || "Manual";
      });
      var custs = Object.keys(balByKey).map(function (key) {
        return {
          name: nameByKey[key] || "",
          phone: phoneByKey[key] || "",
          balance: balByKey[key] || 0,
        };
      }).filter(function (c) { return (c.balance || 0) > 0.005; })
        .sort(function (a, b) { return (b.balance || 0) - (a.balance || 0); });
      var balTotal = round2(custs.reduce(function (a, c) { return a + Math.max(0, c.balance || 0); }, 0));
      body += "<div class='kpi' style='grid-template-columns:1fr 1fr;max-width:420px;'>";
      body += "<div class='box'><div class='l'>Customers with balance</div><div class='v'>" + custs.length + "</div></div>";
      body += "<div class='box'><div class='l'>Total Outstanding</div><div class='v red'>" + money(balTotal) + "</div></div>";
      body += "</div>";
      body += "<h3>Customer Balances</h3><table class='data'><thead><tr><th>Customer</th><th>Phone</th><th>Balance</th></tr></thead><tbody>";
      if (!custs.length) body += "<tr><td colspan='3' class='empty'>No outstanding balances</td></tr>";
      custs.forEach(function (c) {
        body += "<tr><td>" + escapeHtml(c.name || "") + "</td><td>" + escapeHtml(c.phone || "—") + "</td><td class='amt " + ((c.balance || 0) > 0 ? "red" : "") + "'>" + money(c.balance || 0) + "</td></tr>";
      });
      body += "</tbody></table>";
      return wrapA4(title, "As of today · from open invoices", body);
    }

    return wrapA4(title, range.label, "<div class='empty'>Report not available.</div>");
  };

  var onSelectReport = function (id) {
    setSelectedId(id);
    var r = REPORTS.find(function (x) { return x.id === id; });
    if (!r) return;
    if (r.date === "day") setAcctPeriod("daily");
    else if (r.date === "month") setAcctPeriod("monthly");
  };

  var onGenerate = function () {
    setGenBusy(true);
    try {
      var html = buildHtml();
      var range = getRange();
      var fname = String(selected.label || "Report").replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "Report";
      if (range.from) fname += "-" + range.from;
      if (range.to && range.to !== range.from) fname += "-" + range.to;
      setPreview({ title: selected.label, html: html, filename: fname, period: range.label });
    } catch (e) {
      showAlert("Could not generate report. " + (e && e.message ? e.message : ""));
    }
    setGenBusy(false);
  };

  var closePreview = function () { setPreview(null); };

  var showPeriodChips = selected.date === "period";
  var showDay = selected.date === "day" || (showPeriodChips && acctPeriod === "daily");
  var showMonth = selected.date === "month" || (showPeriodChips && acctPeriod === "monthly");
  var showYear = showPeriodChips && acctPeriod === "yearly";
  var showRange = showPeriodChips && acctPeriod === "range";
  var needsDates = selected.date !== "none";

  var groups = [];
  REPORTS.forEach(function (r) {
    if (groups.indexOf(r.group) < 0) groups.push(r.group);
  });

  var previewUi = preview ? (
    <UniversalPrintPreview
      open
      badge="RPT"
      kicker="Print preview"
      title={preview.title}
      subtitle={preview.period || ""}
      filename={preview.filename || "TechonReport"}
      html={preview.html}
      settings={state.settings}
      WABtn={WABtn}
      showAlert={showAlert}
      shareViaWhatsApp={shareViaWhatsApp}
      PRINT_FONT_LINK={PRINT_FONT_LINK}
      escapeHtml={escapeHtml}
      openPrintWindow={openPrintWindow}
      onClose={closePreview}
    />
  ) : null;

  return (
    <div className="erp-tab-content erp-rpt-accounts erp-rpt-generate">
      <div className="erp-rpt-gen-card">
        <div className="erp-rpt-gen-title">Report Generate</div>
        <div className="erp-rpt-gen-sub">Choose a report, set dates, then generate an A4 preview to print, save PDF, or share on WhatsApp.</div>

        <div className="erp-rpt-gen-form">
          <label className="erp-rpt-gen-field is-report">
            <span>Report</span>
            <select value={selectedId} onChange={function (e) { onSelectReport(e.target.value); }}>
              {groups.map(function (g) {
                return (
                  <optgroup key={g} label={g}>
                    {REPORTS.filter(function (r) { return r.group === g; }).map(function (r) {
                      return <option key={r.id} value={r.id}>{r.label}</option>;
                    })}
                  </optgroup>
                );
              })}
            </select>
          </label>

          {showPeriodChips && (
            <div className="erp-rpt-gen-field">
              <span>Period</span>
              <div className="erp-rpt-period-seg" role="tablist" aria-label="Period">
                {[["daily", "Day"], ["monthly", "Month"], ["yearly", "Year"], ["range", "Range"]].map(function (p) {
                  return (
                    <button
                      key={p[0]}
                      type="button"
                      role="tab"
                      aria-selected={acctPeriod === p[0]}
                      className={"erp-rpt-period" + (acctPeriod === p[0] ? " is-active" : "")}
                      onClick={function () { setAcctPeriod(p[0]); }}
                    >{p[1]}</button>
                  );
                })}
              </div>
            </div>
          )}

          {needsDates && (
            <div className="erp-rpt-gen-dates">
              {showDay && (
                <label className="erp-rpt-gen-field">
                  <span>Date</span>
                  <input type="date" value={reportDate} onChange={function (e) { setReportDate(e.target.value); }} />
                </label>
              )}
              {showMonth && (
                <label className="erp-rpt-gen-field">
                  <span>Month</span>
                  <input type="month" value={pnlMonth} onChange={function (e) { setPnlMonth(e.target.value); }} />
                </label>
              )}
              {showYear && (
                <label className="erp-rpt-gen-field">
                  <span>Year</span>
                  <select value={pnlYear} onChange={function (e) { setPnlYear(e.target.value); }}>
                    {(function () {
                      var y = [];
                      var cy = parseInt(String(today()).slice(0, 4), 10);
                      for (var i = cy; i >= 2020; i--) y.push(String(i));
                      return y;
                    })().map(function (y) { return <option key={y} value={y}>{y}</option>; })}
                  </select>
                </label>
              )}
              {showRange && (
                <React.Fragment>
                  <label className="erp-rpt-gen-field">
                    <span>From</span>
                    <input type="date" value={rangeFrom} onChange={function (e) { setRangeFrom(e.target.value); }} />
                  </label>
                  <label className="erp-rpt-gen-field">
                    <span>To</span>
                    <input type="date" value={rangeTo} onChange={function (e) { setRangeTo(e.target.value); }} />
                  </label>
                </React.Fragment>
              )}
            </div>
          )}

          {!needsDates && (
            <div className="erp-rpt-gen-field is-hint">
              <span>&nbsp;</span>
              <div className="erp-rpt-gen-hint">Snapshot — current figures (no date filter)</div>
            </div>
          )}

          <div className="erp-rpt-gen-field is-action">
            <span>&nbsp;</span>
            <button type="button" className="erp-rpt-gen-btn" disabled={genBusy} onClick={onGenerate}>
              {genBusy ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>
      </div>

      <div className="erp-rpt-gen-empty">
        <div className="erp-rpt-gen-empty-title">Ready to generate</div>
        <div className="erp-rpt-gen-empty-sub">Select a report above and click Generate to open the print preview.</div>
      </div>

      {previewUi}
    </div>
  );
};

export default ReportsAccountsHub;
