import React from "react";
import "../styles/erpDashboard.css";
import { round2 } from "../utils/moneyRound.js";
import { activeSales, activePurchases } from "../utils/voidInvoice.js";
import { sortNewestFirst } from "../utils/listPage.js";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function shiftDateIso(iso, days) {
  var d = new Date(String(iso || "") + "T12:00:00");
  if (isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function saleNet(s) {
  return Math.max(0, (Number(s.total) || 0) - (Number(s.totalTax) || 0));
}

function saleCogs(s) {
  return (s.items || []).reduce(function (a, it) {
    var cost = Number(it.cost) || 0;
    /* Glass COGS = sheet cost × sheets (qty), matching GL saleLineCOGS — not cost × sqFt. */
    return a + cost * (Number(it.qty) || 0);
  }, 0);
}

function pctChange(cur, prev) {
  var c = Number(cur) || 0;
  var p = Number(prev) || 0;
  if (p === 0) return c === 0 ? 0 : 100;
  return ((c - p) / Math.abs(p)) * 100;
}

function fmtPct(n) {
  var v = Math.abs(Number(n) || 0);
  return (v >= 10 ? v.toFixed(1) : v.toFixed(1)) + "%";
}

function deltaSub(cur, prev) {
  var d = pctChange(cur, prev);
  var up = d >= 0;
  return (up ? "▲ " : "▼ ") + fmtPct(d) + " vs yesterday";
}

function DashStatWrap(props) {
  return (
    <div
      role={props.onClick ? "button" : undefined}
      tabIndex={props.onClick ? 0 : undefined}
      onClick={props.onClick}
      onKeyDown={function (e) {
        if (!props.onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onClick();
        }
      }}
      style={{ cursor: props.onClick ? "pointer" : "default", minWidth: 0 }}
    >
      {props.children}
    </div>
  );
}

function IconSvg(props) {
  var name = props.name;
  var paths = {
    sales: "M3 17l6-6 4 4 8-8M14 7h6v6",
    profit: "M12 3v18M7 10l5-5 5 5M7 14l5 5 5-5",
    cash: "M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
    bank: "M3 10l9-7 9 7M5 10v10h14V10M9 20v-6h6v6",
    recv: "M12 8v8M8 12h8M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    pay: "M12 8v8M8 12h8M3 12a9 9 0 1018 0 9 9 0 00-18 0z",
    cart: "M6 6h15l-1.5 9h-12zM6 6L5 3H2M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z",
    bag: "M6 8h12l-1 12H7L6 8zm3 0V6a3 3 0 016 0v2",
    bill: "M14 2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2V8z",
    users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
    truck: "M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm13 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
    box: "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z",
    wrench: "M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z",
    sync: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15",
    db: "M12 2C6.48 2 2 3.79 2 6v12c0 2.21 4.48 4 10 4s10-1.79 10-4V6c0-2.21-4.48-4-10-4zm0 2c4.42 0 8 .9 8 2s-3.58 2-8 2-8-.9-8-2 3.58-2 8-2zm0 16c-4.42 0-8-.9-8-2v-2.07C5.05 16.58 8.17 17 12 17s6.95-.42 8-1.07V18c0 1.1-3.58 2-8 2z",
    wifi: "M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01",
    backup: "M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8",
    license: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    printer: "M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z",
    refresh: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15",
    order: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  };
  return (
    <svg viewBox="0 0 24 24" width={props.size || 18} height={props.size || 18} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] || paths.sales} />
    </svg>
  );
}


function SalesChart(props) {
  var points = props.points || [];
  var w = 560;
  var h = 200;
  var padL = 44;
  var padR = 12;
  var padT = 16;
  var padB = 28;
  var plotW = w - padL - padR;
  var plotH = h - padT - padB;
  var vals = points.map(function (p) { return p.value; });
  var max = Math.max.apply(null, vals.concat([1]));
  var niceMax = Math.ceil(max / 5) * 5 || 1;
  if (niceMax < max) niceMax = max;
  var coords = points.map(function (p, i) {
    var x = padL + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
    var y = padT + plotH - (p.value / niceMax) * plotH;
    return { x: x, y: y, label: p.label, value: p.value };
  });
  var line = coords.map(function (c, i) {
    return (i === 0 ? "M" : "L") + c.x.toFixed(1) + " " + c.y.toFixed(1);
  }).join(" ");
  var area = coords.length
    ? line + " L" + coords[coords.length - 1].x.toFixed(1) + " " + (padT + plotH) +
      " L" + coords[0].x.toFixed(1) + " " + (padT + plotH) + " Z"
    : "";
  var yTicks = [0, 0.25, 0.5, 0.75, 1].map(function (f) {
    return { y: padT + plotH - f * plotH, label: Math.round(niceMax * f) };
  });
  var xLabels = coords.filter(function (_, i) {
    if (coords.length <= 8) return true;
    var step = Math.ceil(coords.length / 6);
    return i % step === 0 || i === coords.length - 1;
  });

  return (
    <svg className="erp-md-chart-svg" viewBox={"0 0 " + w + " " + h} preserveAspectRatio="none" role="img" aria-label="Sales overview chart">
      <defs>
        <linearGradient id="erpDashArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2979ff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#2979ff" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="erpDashLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2979ff" />
          <stop offset="100%" stopColor="#2255d4" />
        </linearGradient>
      </defs>
      {yTicks.map(function (t, i) {
        return (
          <g key={"y" + i}>
            <line x1={padL} y1={t.y} x2={w - padR} y2={t.y} stroke="#e1e8f5" strokeWidth="1" />
            <text x={padL - 6} y={t.y + 3} textAnchor="end" className="erp-md-chart-axis">{t.label >= 1000 ? Math.round(t.label / 1000) + "K" : t.label}</text>
          </g>
        );
      })}
      {area ? <path d={area} fill="url(#erpDashArea)" /> : null}
      {line ? <path d={line} fill="none" stroke="url(#erpDashLine)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" /> : null}
      {coords.map(function (c, i) {
        return <circle key={"c" + i} cx={c.x} cy={c.y} r="3.5" fill="#fff" stroke="#2979ff" strokeWidth="2" />;
      })}
      {xLabels.map(function (c, i) {
        return <text key={"x" + i} x={c.x} y={h - 8} textAnchor="middle" className="erp-md-chart-axis">{c.label}</text>;
      })}
    </svg>
  );
}

var Dashboard = function (props) {
  var state = props.state;
  var setActive = props.setActive;
  var StatCard = props.StatCard;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var C = props.C;
  var TR = props.TR;
  var TD = props.TD;
  var getCashBalances = props.getCashBalances;
  var getTotalReceivableDerived = props.getTotalReceivableDerived;
  var getTotalPayableDerived = props.getTotalPayableDerived;
  var getTotalSupplierPayable = props.getTotalSupplierPayable;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var fmtDate = props.fmtDate;
  var today = props.today;
  var licenseInfo = props.licenseInfo;
  var cur = getCurrencySymbol();
  var t = today();
  var yday = shiftDateIso(t, -1);
  var monthKey = t.slice(0, 7);
  var [chartPeriod, setChartPeriod] = React.useState("month");

  var balancesRaw = getCashBalances(state);
  var cash = round2(balancesRaw.cash);
  var bank = round2(balancesRaw.bank);

  var liveSales = activeSales(state.sales);
  var livePurchases = activePurchases(state.purchases || []);

  function salesOn(day) {
    return liveSales.filter(function (s) { return s.date === day; });
  }
  function sumSales(list) {
    return round2(list.reduce(function (a, s) { return a + saleNet(s); }, 0));
  }
  function sumProfit(list) {
    return round2(list.reduce(function (a, s) { return a + (saleNet(s) - saleCogs(s)); }, 0));
  }

  var todaySalesList = salesOn(t);
  var ydaySalesList = salesOn(yday);
  var todaySales = sumSales(todaySalesList);
  var ydaySales = sumSales(ydaySalesList);
  var todayProfit = sumProfit(todaySalesList);
  var ydayProfit = sumProfit(ydaySalesList);

  var monthSalesList = liveSales.filter(function (s) {
    return String(s.date || "").slice(0, 7) === monthKey;
  });
  var monthSales = sumSales(monthSalesList);
  var monthPurchases = round2(livePurchases.filter(function (p) {
    return String(p.date || "").slice(0, 7) === monthKey;
  }).reduce(function (a, p) { return a + (Number(p.total) || 0); }, 0));
  var monthExpenses = round2((state.expenses || []).filter(function (e) {
    return String(e.date || "").slice(0, 7) === monthKey;
  }).reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0));

  var totalReceivable = typeof getTotalReceivableDerived === "function"
    ? round2(getTotalReceivableDerived(state))
    : 0;
  var totalPayable = typeof getTotalPayableDerived === "function"
    ? round2(getTotalPayableDerived(state))
    : (typeof getTotalSupplierPayable === "function"
      ? round2(getTotalSupplierPayable(state.purchases))
      : 0);

  var stockProducts = (state.products || []).filter(function (p) {
    return p && p.status !== "inactive";
  });
  var inventoryValue = round2(stockProducts.reduce(function (a, p) {
    return a + (Number(p.stock) || 0) * (Number(p.cost) || 0);
  }, 0));
  var lowStockAll = stockProducts
    .filter(function (p) { return (Number(p.stock) || 0) <= 5; })
    .sort(function (a, b) { return (Number(a.stock) || 0) - (Number(b.stock) || 0); });
  var lowStock = lowStockAll.slice(0, 5);
  var lowStockTotal = lowStockAll.length;

  var recentSales = sortNewestFirst(liveSales).slice(0, 5);
  var recentPurchases = sortNewestFirst(livePurchases).slice(0, 5);
  var recentRepairs = sortNewestFirst(state.repairs || []).slice(0, 5);

  var last7 = [];
  for (var di = 6; di >= 0; di--) {
    var day = shiftDateIso(t, -di);
    last7.push(sumSales(salesOn(day)));
  }

  function buildChartPoints() {
    var pts = [];
    if (chartPeriod === "today") {
      var hours = {};
      todaySalesList.forEach(function (s) {
        var hr = 12;
        var ts = s.createdAt || s.time || s.timestamp || "";
        var m = String(ts).match(/T(\d{2})/) || String(ts).match(/(\d{1,2}):/);
        if (m) hr = Math.min(23, parseInt(m[1], 10) || 12);
        hours[hr] = (hours[hr] || 0) + saleNet(s);
      });
      for (var h = 8; h <= 20; h++) {
        pts.push({ label: pad2(h) + ":00", value: round2(hours[h] || 0) });
      }
      if (!todaySalesList.length) {
        pts = [{ label: "Today", value: 0 }];
      }
    } else if (chartPeriod === "week") {
      for (var wi = 6; wi >= 0; wi--) {
        var wd = shiftDateIso(t, -wi);
        var dObj = new Date(wd + "T12:00:00");
        pts.push({
          label: dObj.toLocaleDateString("en-GB", { weekday: "short" }),
          value: sumSales(salesOn(wd)),
        });
      }
    } else if (chartPeriod === "year") {
      for (var mi = 11; mi >= 0; mi--) {
        var md = new Date(t + "T12:00:00");
        md.setMonth(md.getMonth() - mi);
        var key = md.getFullYear() + "-" + pad2(md.getMonth() + 1);
        var val = sumSales(liveSales.filter(function (s) {
          return String(s.date || "").slice(0, 7) === key;
        }));
        pts.push({
          label: md.toLocaleDateString("en-GB", { month: "short" }),
          value: val,
        });
      }
    } else {
      for (var i = 29; i >= 0; i--) {
        var dd = shiftDateIso(t, -i);
        var dob = new Date(dd + "T12:00:00");
        pts.push({
          label: pad2(dob.getDate()) + "/" + pad2(dob.getMonth() + 1),
          value: sumSales(salesOn(dd)),
        });
      }
    }
    return pts;
  }

  var chartPoints = buildChartPoints();

  function go(page) {
    if (page) setActive(page);
  }

  function money(n) {
    return cur + " " + fmtNum(n);
  }

  function invThStyle(align) {
    return {
      textAlign: align || "left",
      padding: "10px 12px",
      fontWeight: 700,
      color: C.th,
      fontSize: 10.5,
      textTransform: "uppercase",
      letterSpacing: "0.07em",
      borderBottom: "2px solid " + C.border,
      whiteSpace: "nowrap",
      background: "#f8fafc",
    };
  }

  function dashMoneyTd(children, color, bold) {
    return (
      <td style={{ padding: "5px 8px", textAlign: "right", color: color || C.text, fontWeight: bold ? 700 : 500, whiteSpace: "nowrap", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
        {children}
      </td>
    );
  }

  function repairDevice(r) {
    if (r.devices && r.devices[0]) {
      var d = r.devices[0];
      return [d.brand, d.modelNo || d.deviceType].filter(Boolean).join(" ") || "Device";
    }
    return [r.brand, r.modelNo || r.deviceType].filter(Boolean).join(" ") || "Device";
  }

  function stockMeta(p) {
    var qty = Number(p.stock) || 0;
    var limit = Math.max(Number(p.reorderLevel) || 5, 5);
    var pct = Math.max(0, Math.min(100, (qty / limit) * 100));
    if (qty <= 0) return { label: "Out of Stock", cls: "out", pct: 22 };
    if (qty <= limit) return { label: "Low Stock", cls: "low", pct: Math.max(18, pct) };
    return { label: "In Stock", cls: "ok", pct: pct };
  }

  var summaryRows = [
    { icon: "🛒", label: "Month sales", value: money(monthSales), page: "invoices", tone: "blue" },
    { icon: "📦", label: "Purchases", value: money(monthPurchases), page: "purchases", tone: "orange" },
    { icon: "💸", label: "Expenses", value: money(monthExpenses), page: "expenses", tone: "red" },
    { icon: "👥", label: "Parties", value: String((state.customers || []).length + (state.suppliers || []).length + (state.others || []).length), page: "parties", tone: "teal" },
    { icon: "📊", label: "Stock value", value: money(inventoryValue), page: "inventory", tone: "purple" },
  ];

  var chartPeriodSub = chartPeriod === "today"
    ? "Today by hour"
    : chartPeriod === "week"
      ? "Last 7 days"
      : chartPeriod === "year"
        ? "Last 12 months"
        : "Last 30 days";

  var chartSeg = (
    <div className="erp-dash-seg">
      {[["today", "Today"], ["week", "Week"], ["month", "Month"], ["year", "Year"]].map(function (opt) {
        return (
          <button
            key={opt[0]}
            type="button"
            className={"erp-dash-seg-btn" + (chartPeriod === opt[0] ? " active" : "")}
            onClick={function () { setChartPeriod(opt[0]); }}
          >
            {opt[1]}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="erp-page erp-dash erp-md-dash">
      {props.setupIncomplete && props.onRequestSetupWizard ? (
        <div
          className="erp-md-alert warn"
          role="button"
          tabIndex={0}
          onClick={props.onRequestSetupWizard}
          onKeyDown={function (e) {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              props.onRequestSetupWizard();
            }
          }}
        >
          <span>Add shop name and contact in Settings to unlock sales and POS.</span>
          <strong>Open Settings →</strong>
        </div>
      ) : null}

      {(function () {
        if (!licenseInfo || licenseInfo.status !== "trial") return null;
        var MAX = licenseInfo.trialMaxRecords || 20;
        var counts = [
          liveSales.length,
          (state.products || []).length,
          (state.customers || []).length,
          (state.purchases || []).length,
        ];
        var maxCount = counts.reduce(function (a, n) { return Math.max(a, n); }, 0);
        var remaining = Math.max(0, MAX - maxCount);
        var pct = Math.round((maxCount / MAX) * 100);
        var barColor = pct >= 80 ? "#dc2626" : pct >= 60 ? "#ea580c" : "#2563eb";
        return (
          <div className="erp-md-trial">
            <div className="erp-md-trial-row">
              <span>Free trial usage</span>
              <span style={{ color: barColor }}>{maxCount}/{MAX} · {remaining} left</span>
            </div>
            <div className="erp-md-trial-track">
              <div className="erp-md-trial-fill" style={{ width: Math.min(pct, 100) + "%", background: barColor }} />
            </div>
          </div>
        );
      })()}

      <div className="erp-md-dash-body">
      <div className="erp-md-stat-row">
        <DashStatWrap onClick={function () { go("pos"); }}>
          <StatCard label="Today's Sales" value={todaySales} accent={C.blue} valueColor={C.blue} icon="💰" sub={deltaSub(todaySales, ydaySales)} />
        </DashStatWrap>
        <DashStatWrap onClick={function () { go("reports"); }}>
          <StatCard label="Today's Profit" value={todayProfit} accent={todayProfit >= 0 ? C.green : C.red} valueColor={todayProfit >= 0 ? C.green : C.red} icon="📈" sub={deltaSub(todayProfit, ydayProfit)} />
        </DashStatWrap>
        <DashStatWrap onClick={function () { go("accounts"); }}>
          <StatCard label="Cash in Hand" value={cash} accent={C.purple} valueColor={C.purple} icon="💵" sub="Current balance" />
        </DashStatWrap>
        <DashStatWrap onClick={function () { go("accounts"); }}>
          <StatCard label="Bank Balance" value={bank} accent={C.cyan} valueColor={C.cyan} icon="🏦" sub="Current balance" />
        </DashStatWrap>
        <DashStatWrap onClick={function () { go("receivables"); }}>
          <StatCard label="Receivables" value={totalReceivable} accent={C.orange} valueColor={C.orange} icon="💳" sub="Money owed to you" />
        </DashStatWrap>
        <DashStatWrap onClick={function () { go("payables"); }}>
          <StatCard label="Payables" value={totalPayable} accent={totalPayable > 0 ? C.red : C.green} valueColor={totalPayable > 0 ? C.red : C.green} icon={totalPayable > 0 ? "💸" : "✓"} sub="Money you owe" />
        </DashStatWrap>
      </div>

      <div className="erp-md-mid">
        <div className="erp-dash-panel erp-dash-panel-chart">
          <Card pad={10}>
            <CardTitle sub={chartPeriodSub} action={chartSeg}>Sales Overview</CardTitle>
            <div className="erp-dash-chart-panel">
              <SalesChart points={chartPoints} />
            </div>
          </Card>
        </div>

        <div className="erp-dash-panel erp-dash-panel-summary">
          <Card pad={10} className="erp-dash-side-card">
            <div className="erp-dash-side-head tone-summary">
              <span className="erp-dash-side-head-ico" aria-hidden="true">📊</span>
              <div className="erp-dash-side-head-text">
                <div className="erp-dash-side-head-title">Quick Summary</div>
                <div className="erp-dash-side-head-sub">This month at a glance</div>
              </div>
            </div>
            <div className="erp-dash-summary-grid">
              {summaryRows.map(function (row) {
                return (
                  <button key={row.label} type="button" className={"erp-dash-sum-tile tone-" + row.tone} onClick={function () { go(row.page); }}>
                    <span className="erp-dash-sum-tile-ico" aria-hidden="true">{row.icon}</span>
                    <span className="erp-dash-sum-tile-body">
                      <span className="erp-dash-sum-tile-label">{row.label}</span>
                      <span className="erp-dash-sum-tile-val">{row.value}</span>
                    </span>
                    <span className="erp-dash-sum-tile-chevron" aria-hidden="true">›</span>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="erp-dash-panel erp-dash-panel-stock">
          <Card pad={10} className="erp-dash-side-card">
            <div className="erp-dash-side-head tone-stock">
              <span className="erp-dash-side-head-ico" aria-hidden="true">⚠️</span>
              <div className="erp-dash-side-head-text">
                <div className="erp-dash-side-head-title">Low Stock</div>
                <div className="erp-dash-side-head-sub">
                  {lowStockTotal === 0
                    ? "All levels look good"
                    : lowStockTotal + " item" + (lowStockTotal === 1 ? "" : "s") + " need attention"
                      + (lowStockTotal > 5 ? " · top 5 shown" : "")}
                </div>
              </div>
              <button type="button" className="erp-dash-side-head-link" onClick={function () { go("inventory"); }}>View all</button>
            </div>
            <div className={"erp-dash-stock-grid" + (lowStock.length > 0 ? " is-filled" : "")}>
              {lowStock.length === 0 ? (
                <div className="erp-dash-stock-ok">
                  <span className="erp-dash-stock-ok-ico" aria-hidden="true">✓</span>
                  <span className="erp-dash-stock-ok-title">Stock healthy</span>
                  <span className="erp-dash-stock-ok-sub">No low or out-of-stock items</span>
                </div>
              ) : lowStock.map(function (p) {
                var meta = stockMeta(p);
                var qty = Number(p.stock) || 0;
                var isOut = qty <= 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={"erp-dash-stock-tile " + (isOut ? "is-out" : "is-low")}
                    onClick={function () { go("inventory"); }}
                  >
                    <div className="erp-dash-stock-tile-top">
                      <span className="erp-dash-stock-tile-ico" aria-hidden="true">{isOut ? "🔴" : "🟠"}</span>
                      <span className="erp-dash-stock-tile-name" title={p.name || "Item"}>{p.name || "Item"}</span>
                      <span className={"erp-dash-stock-tile-badge " + (isOut ? "out" : "low")}>
                        {isOut ? "OUT" : qty + " left"}
                      </span>
                    </div>
                    <div className="erp-dash-stock-tile-bar" aria-hidden="true">
                      <div
                        className={"erp-dash-stock-tile-bar-fill " + meta.cls}
                        style={{ width: Math.max(8, Math.min(100, meta.pct)) + "%" }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <div className="erp-md-tables">
        <div className="erp-dash-panel">
          <Card pad={10}>
            <CardTitle
              sub="Latest 5 invoices"
              action={<button type="button" className="erp-dash-link" onClick={function () { go("invoices"); }}>View all →</button>}
            >
              Recent Sales
            </CardTitle>
            <div className="erp-dash-inv-table-wrap">
            <table className="erp-dash-inv-table" style={{ minWidth: 420 }}>
              <thead>
                <tr>
                  <th style={Object.assign({}, invThStyle(), { width: "26%" })}>Invoice #</th>
                  <th style={Object.assign({}, invThStyle(), { width: "34%" })}>Customer</th>
                  <th style={Object.assign({}, invThStyle(), { width: "18%" })}>Date</th>
                  <th style={Object.assign({}, invThStyle("right"), { width: "22%" })}>Total</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 13 }}>
                      <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>🧾</div>
                      No sales yet.
                    </td>
                  </tr>
                ) : recentSales.map(function (s, i) {
                  var invNo = s.invoiceNo || String(s.id).slice(0, 8);
                  return (
                    <TR key={s.id} i={i} onClick={function () { go("invoices"); }}>
                      <td style={{ padding: "10px 12px", maxWidth: 0 }}>
                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: C.accent, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{invNo}</span>
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: C.text, fontSize: 13, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.customerName || s.customer || "Walk-in"}>
                        {s.customerName || s.customer || "Walk-in"}
                      </td>
                      <TD color={C.muted}>{fmtDate(s.date)}</TD>
                      {dashMoneyTd(money(s.total), C.blue, true)}
                    </TR>
                  );
                })}
              </tbody>
            </table>
          </div>
          </Card>
        </div>

        <div className="erp-dash-panel">
          <Card pad={10}>
            <CardTitle
              sub="Latest purchase bills"
              action={<button type="button" className="erp-dash-link" onClick={function () { go("purchases"); }}>View all →</button>}
            >
              Recent Purchases
            </CardTitle>
            <div className="erp-dash-inv-table-wrap">
            <table className="erp-dash-inv-table" style={{ minWidth: 460 }}>
              <thead>
                <tr>
                  <th style={Object.assign({}, invThStyle(), { width: "24%" })}>Invoice #</th>
                  <th style={Object.assign({}, invThStyle(), { width: "32%" })}>Supplier</th>
                  <th style={Object.assign({}, invThStyle(), { width: "18%" })}>Date</th>
                  <th style={Object.assign({}, invThStyle("right"), { width: "26%" })}>Total</th>
                </tr>
              </thead>
              <tbody>
                {recentPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 13 }}>
                      <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>📦</div>
                      No purchases yet.
                    </td>
                  </tr>
                ) : recentPurchases.map(function (p, i) {
                  var invNo = p.invoiceNo || p.billNo || String(p.id).slice(0, 8);
                  return (
                    <TR key={p.id} i={i} onClick={function () { go("purchases"); }}>
                      <td style={{ padding: "10px 12px", maxWidth: 0 }}>
                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: C.accent, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{invNo}</span>
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: C.text, fontSize: 13, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.supplierName || p.supplier || "—"}>
                        {p.supplierName || p.supplier || "—"}
                      </td>
                      <TD color={C.muted}>{fmtDate(p.date)}</TD>
                      {dashMoneyTd(money(p.total), C.blue, true)}
                    </TR>
                  );
                })}
              </tbody>
            </table>
          </div>
          </Card>
        </div>

        <div className="erp-dash-panel">
          <Card pad={10}>
            <CardTitle
              sub="Latest repair jobs"
              action={<button type="button" className="erp-dash-link" onClick={function () { go("repairs"); }}>View all →</button>}
            >
              Recent Repairs
            </CardTitle>
            <div className="erp-dash-inv-table-wrap">
            <table className="erp-dash-inv-table" style={{ minWidth: 440 }}>
              <thead>
                <tr>
                  <th style={Object.assign({}, invThStyle(), { width: "22%" })}>Job No.</th>
                  <th style={Object.assign({}, invThStyle(), { width: "28%" })}>Customer</th>
                  <th style={Object.assign({}, invThStyle(), { width: "30%" })}>Device</th>
                  <th style={Object.assign({}, invThStyle(), { width: "20%" })}>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentRepairs.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 13 }}>
                      <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>🔧</div>
                      No repairs yet.
                    </td>
                  </tr>
                ) : recentRepairs.map(function (r, i) {
                  var jobNo = r.jobNo || r.repairNo || String(r.id).slice(0, 8);
                  return (
                    <TR key={r.id} i={i} onClick={function () { go("repairs"); }}>
                      <td style={{ padding: "10px 12px", maxWidth: 0 }}>
                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: C.accent, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{jobNo}</span>
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: C.text, fontSize: 13, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.customer || r.customerName || "—"}>
                        {r.customer || r.customerName || "—"}
                      </td>
                      <TD color={C.textMd}>{repairDevice(r)}</TD>
                      <TD color={C.muted}>{fmtDate(r.dateIn || r.date)}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </table>
          </div>
          </Card>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Dashboard;
