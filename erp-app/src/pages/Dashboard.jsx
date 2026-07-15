import React from "react";
import { round2 } from "../utils/moneyRound.js";
import { sumRawMaterialKitchenCostInRange } from "../utils/ingredientUsageCost.js";
import { activeSales } from "../utils/voidInvoice.js";
import { sortNewestFirst } from "../utils/listPage.js";
import { isRepair3pInternalProduct } from "../utils/repair3pProduct.js";

var dashTileStyle = {
  background: "#fff",
  borderRadius: 12,
  padding: "16px 18px",
  border: "1px solid #e8ecf4",
  boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
  cursor: "pointer",
  transition: "box-shadow .15s, border-color .15s",
};

var dashLabelStyle = {
  fontSize: 10,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

var dashValueStyle = {
  fontSize: 22,
  fontWeight: 800,
  color: "#0f172a",
  marginTop: 8,
  letterSpacing: "-0.02em",
  fontVariantNumeric: "tabular-nums",
};

var dashSubStyle = { fontSize: 11, color: "#94a3b8", marginTop: 4, fontWeight: 500 };

var DashTile = function (props) {
  return (
    <div
      className="stat-card-hover"
      onClick={props.onClick}
      style={Object.assign({}, dashTileStyle, props.style || {}, { cursor: props.onClick ? "pointer" : "default" })}
    >
      <div style={dashLabelStyle}>{props.label}</div>
      <div style={Object.assign({}, dashValueStyle, props.valueColor ? { color: props.valueColor } : {})}>{props.value}</div>
      {props.sub ? <div style={dashSubStyle}>{props.sub}</div> : null}
      {props.footer || null}
    </div>
  );
};

var DashLink = function (props) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        border: "none",
        background: "transparent",
        color: "#64748b",
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
        padding: "4px 0",
        fontFamily: "inherit",
      }}
    >{props.children}</button>
  );
};
var Dashboard = function (props) {
  var state = props.state;
  var setActive = props.setActive;
  var S = props.S;
  var today = props.today;
  var getCashBalances = props.getCashBalances;
  var getTotalSupplierPayable = props.getTotalSupplierPayable;
  var getTotalReceivableDerived = props.getTotalReceivableDerived;
  var getTotalPayableDerived = props.getTotalPayableDerived;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var fmtDate = props.fmtDate;
  var C = props.C;
  var Card = props.Card;
  var Badge = props.Badge;
  var getBulkDisplayParts = props.getBulkDisplayParts;
  var fmtStockDual = props.fmtStockDual;
  var fmtStock = props.fmtStock;
  var getBusinessProfile = props.getBusinessProfile;
  var currentUser = props.currentUser || null;
  var t = today();
  var liveSales = activeSales(state.sales);
  var todaySales = round2(liveSales.filter(function (s) { return s.date === t; }).reduce(function (a, s) { return a + Math.max(0, (s.total || 0) - (s.totalTax || 0)); }, 0));
  var todayInvoicedCost = round2(liveSales.filter(function (s) { return s.date === t; }).reduce(function (a, s) { return a + s.items.reduce(function (b, it) { return b + (it.cost || 0) * it.qty; }, 0); }, 0));
  var todayIngredientCost = round2(sumRawMaterialKitchenCostInRange(state, t, t));
  var todayCost = round2(todayInvoicedCost + todayIngredientCost);
  var todayProfit = round2(todaySales - todayCost);
  /* BUG1 FIX: Use getCashBalances() as the single source of truth for cash/bank.
     The old formula (capital + salesIncome - purchases - expenses - assets) was
     incomplete — it ignored manual payables, manual receivables, capital ledger
     entries, profit distributions and opening balance seeds. */
  var balancesRaw = getCashBalances(state);
  var balances = { total: round2(balancesRaw.total), cash: round2(balancesRaw.cash), bank: round2(balancesRaw.bank) };
  /* BUG2 FIX: Include manual receivables — GL AR when ledger synced */
  var totalReceivable = typeof getTotalReceivableDerived === "function"
    ? round2(getTotalReceivableDerived(state))
    : (function () {
      var fromSales = liveSales.reduce(function (a, s) { return a + Math.max(0, s.total - (s.paid || 0)); }, 0);
      var fromManual = S.get("tc3_manualReceivables", []).reduce(function (a, mr) {
        var paid = (mr.paymentHistory || []).reduce(function (s2, p) { return s2 + p.amount; }, 0);
        return a + Math.max(0, mr.amount - paid);
      }, 0);
      return round2(fromSales + fromManual);
    }());
  /* BUG3 FIX: manual + supplier payables — GL AP when ledger synced */
  var totalPayable = typeof getTotalPayableDerived === "function"
    ? round2(getTotalPayableDerived(state))
    : (function () {
      var fromSupp = getTotalSupplierPayable(state.purchases);
      var fromManual = S.get("tc3_manualPayables", []).reduce(function (a, mp) {
        var paid = (mp.paymentHistory || []).reduce(function (s2, p) { return s2 + p.amount; }, 0);
        return a + Math.max(0, mp.amount - paid);
      }, 0);
      return round2(fromSupp + fromManual);
    }());
  /* FIX 1: Exclude soft-deleted (inactive) products from all stock calculations */
  var activeProducts = state.products.filter(function (p) { return p.status !== "inactive"; });
  /* Service products are not stocked like inventory — omit from stock value / low / out-of-stock / reorder (matches Inventory tab). */
  var stockableProducts = activeProducts.filter(function (p) {
    if (isRepair3pInternalProduct(p)) return false;
    return String((p && p.type) || "stock").toLowerCase() !== "service";
  });
  var stockValue = round2(stockableProducts.reduce(function (a, p) { return a + (p.cost || 0) * (p.stock || 0); }, 0));
  var stockRetailValue = round2(stockableProducts.reduce(function (a, p) { return a + (p.price || 0) * (p.stock || 0); }, 0));
  var recentSales = sortNewestFirst(liveSales).slice(0, 5);
  var recentRepairs = sortNewestFirst(state.repairs || []).slice(0, 5);
  var lowStock = stockableProducts.filter(function (p) { return p.stock > 0 && p.stock <= 5; });
  var outOfStockProducts = stockableProducts.filter(function (p) { return (p.stock || 0) === 0; });
  var reorderSuggestions = lowStock.slice(0, 8).map(function (p) {
    return {
      id: p.id,
      name: p.name,
      current: p.stock || 0,
      suggested: Math.max(6, 12 - (p.stock || 0)),
      unit: p.unit,
    };
  });
  var weeklyTrend = (function () {
    var out = [];
    for (var i = 6; i >= 0; i--) {
      var dt = new Date();
      dt.setDate(dt.getDate() - i);
      var key = dt.toISOString().slice(0, 10);
      var label = dt.toLocaleDateString("en-US", { weekday: "short" });
      var total = round2(liveSales.filter(function (s) { return s.date === key; }).reduce(function (a, s) { return a + (s.total || 0); }, 0));
      out.push({ key: key, label: label, total: total });
    }
    return out;
  })();
  var weeklyMax = weeklyTrend.reduce(function (m, x) { return Math.max(m, x.total || 0); }, 1);
  var topProducts = (function () {
    var map = {};
    (liveSales || []).forEach(function (s) {
      (s.items || []).forEach(function (it) {
        var k = it.id || it.name || "unknown";
        if (!map[k]) map[k] = { name: it.name || "Unknown", qty: 0, revenue: 0 };
        map[k].qty += Number(it.qty || 0);
        map[k].revenue = round2(map[k].revenue + Number((it.price || 0) * (it.qty || 0)));
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.qty - a.qty; }).slice(0, 5);
  })();

  /* ── Cheque alerts ── */
  var allCheques = state.cheques || [];
  var dueAlertCheques = allCheques.filter(function (ch) {
    if (ch.status !== "Pending") return false;
    var diffDays = Math.ceil((new Date(ch.dueDate) - new Date(t)) / 86400000);
    return diffDays <= 7; /* today + 7 days ahead, plus overdue */
  }).sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : 1; });

  /* ── Fix 4: Data Integrity Checks ── */
  var integrityWarnings = (function () {
    var warns = [];
    /* Negative stock */
    state.products.filter(function (p) { return p.status !== "inactive"; }).forEach(function (p) {
      if ((p.stock || 0) < 0) warns.push({ type: "inventory", msg: "Negative stock: \"" + p.name + "\" (stock: " + p.stock + ")" });
    });
    /* Sales referencing missing/deleted products */
    /* FIX: Only check against active products — soft-deleted (inactive) products are still in state.products */
    /* FIX: include ALL products (active + inactive/soft-deleted) in the ID set.
       Inactive products are soft-deleted by design — historical invoices referencing
       them are valid records, not integrity errors. Only warn for truly missing IDs. */
    var productIds = new Set(state.products.map(function (p) { return p.id; }));
    state.sales.forEach(function (s) {
      (s.items || []).forEach(function (it) {
        if (it.id && !productIds.has(it.id)) {
          warns.push({ type: "invoice", msg: "Invoice " + (s.invoiceNo || s.id.slice(0, 8)) + " references deleted product \"" + (it.name || it.id) + "\"" });
        }
      });
    });
    /* Manual receivables without a person name */
    S.get("tc3_manualReceivables", []).forEach(function (mr) {
      if (!mr.person || !String(mr.person).trim()) {
        warns.push({ type: "receivable", msg: "Manual receivable (" + getCurrencySymbol() + " " + fmtNum(mr.amount) + ") has no customer name" });
      }
    });
    /* Manual payables without a source */
    S.get("tc3_manualPayables", []).forEach(function (mp) {
      if (!mp.source || !String(mp.source).trim()) {
        warns.push({ type: "payable", msg: "Manual payable (" + getCurrencySymbol() + " " + fmtNum(mp.amount) + ") has no supplier/source name" });
      }
    });
    return warns;
  }());
    var WARN_COLORS = { inventory: C.red, invoice: C.orange, receivable: C.cyan, payable: C.purple };
  var shopName = (state.settings && state.settings.shopName) ? state.settings.shopName : "Your business";
  var displayDate = (function () {
    try {
      return new Date(t + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    } catch (e) {
      return fmtDate(t);
    }
  }());

  return (
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Dashboard</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em", lineHeight: 1.15 }}>{shopName}</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 6, fontWeight: 500 }}>{displayDate}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={function () { setActive("pos"); }} style={{ border: "none", borderRadius: 9, padding: "9px 16px", background: "linear-gradient(135deg,#2979ff,#2255d4)", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px rgba(41,121,255,0.25)" }}>Open POS</button>
          <button type="button" onClick={function () { setActive("invoices"); }} style={{ border: "1px solid #e2e8f0", borderRadius: 9, padding: "9px 16px", background: "#fff", color: "#334155", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Invoices</button>
          <button type="button" onClick={function () { setActive("reports"); }} style={{ border: "1px solid #e2e8f0", borderRadius: 9, padding: "9px 16px", background: "#fff", color: "#334155", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Reports</button>
        </div>
      </div>

      {(function () {
        var welcomeDismissed = !!S.get("tc3_dashboard_welcome_dismissed", false);
        if (welcomeDismissed) return null;
        var name = currentUser && (currentUser.name || currentUser.username) ? (currentUser.name || currentUser.username) : "there";
        return (
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontSize: 13, color: "#475569" }}>Welcome back, <strong style={{ color: "#0f172a" }}>{name}</strong>. Your key numbers and alerts are below.</div>
            <button type="button" onClick={function () { S.set("tc3_dashboard_welcome_dismissed", true); props.setState(function (s) { return Object.assign({}, s); }); }} style={{ border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", borderRadius: 7, fontWeight: 600, fontSize: 11, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Dismiss</button>
          </div>
        );
      })()}

      {props.setupIncomplete && props.onRequestSetupWizard && (
        <div
          role="button"
          tabIndex={0}
          title="Complete setup to use sales, POS, and invoicing"
          onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onRequestSetupWizard(); } }}
          onClick={props.onRequestSetupWizard}
          style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
        >
          <div style={{ fontSize: 13, color: "#92400e", fontWeight: 600 }}>Add shop name and contact in Settings to unlock sales and POS.</div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#b45309", flexShrink: 0 }}>Open Settings →</span>
        </div>
      )}

      {/* ── Primary KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <DashTile
          label="Total cash"
          value={getCurrencySymbol() + " " + fmtNum(balances.total)}
          sub="Cash + bank balance"
          onClick={function () { setActive("reports"); }}
          footer={(
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <div style={{ flex: 1, background: "#f0fdf4", borderRadius: 8, padding: "6px 8px", border: "1px solid #dcfce7" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#15803d", textTransform: "uppercase" }}>Cash</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#166534", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{getCurrencySymbol()} {fmtNum(balances.cash)}</div>
              </div>
              <div style={{ flex: 1, background: "#eff6ff", borderRadius: 8, padding: "6px 8px", border: "1px solid #dbeafe" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase" }}>Bank</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#1e40af", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{getCurrencySymbol()} {fmtNum(balances.bank)}</div>
              </div>
            </div>
          )}
        />
        <DashTile label="Today sales" value={getCurrencySymbol() + " " + fmtNum(todaySales)} sub={fmtDate(t)} valueColor={C.cyan} onClick={function () { setActive("pos"); }} />
        <DashTile label="Today profit" value={getCurrencySymbol() + " " + fmtNum(todayProfit)} sub={"Cost " + getCurrencySymbol() + " " + fmtNum(todayCost)} valueColor={todayProfit >= 0 ? C.green : C.red} onClick={function () { setActive("reports"); }} />
        <DashTile label="Stock value" value={getCurrencySymbol() + " " + fmtNum(stockValue)} sub={lowStock.length + " low · " + outOfStockProducts.length + " out"} valueColor={C.purple} onClick={function () { setActive("inventory"); }} />
      </div>

      {/* ── Receivable / Payable ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        <DashTile label="Receivables" value={getCurrencySymbol() + " " + fmtNum(totalReceivable)} sub="Money owed to you" valueColor={C.cyan} onClick={function () { setActive("receivables"); }} />
        <DashTile label="Payables" value={getCurrencySymbol() + " " + fmtNum(totalPayable)} sub="Money you owe" valueColor={C.orange} onClick={function () { setActive("payables"); }} />
        <DashTile label="Retail stock value" value={getCurrencySymbol() + " " + fmtNum(stockRetailValue)} sub="At selling price" onClick={function () { setActive("inventory"); }} />
      </div>

      {/* ── Trial usage ── */}
      {(function() {
        var licenseInfo = props.licenseInfo;
        if (!licenseInfo || licenseInfo.status !== 'trial') return null;
        var MAX = licenseInfo.trialMaxRecords || 20;
        var allMods = [
          { label: 'Sales',      count: liveSales.length                  },
          { label: 'Products',   count: state.products.length               },
          { label: 'Customers',  count: state.customers.length              },
          { label: 'Expenses',   count: (state.expenses   || []).length     },
          { label: 'Purchases',  count: (state.purchases  || []).length     },
          { label: 'Suppliers',  count: (state.suppliers  || []).length     },
          { label: 'Quotations', count: (state.quotations || []).length     },
          { label: 'Repairs',    count: (state.repairs    || []).length     },
        ];
        var maxCount  = allMods.reduce(function(a, m) { return Math.max(a, m.count); }, 0);
        var topModule = allMods.reduce(function(a, b)  { return b.count > a.count ? b : a; }, allMods[0]);
        var remaining = Math.max(0, MAX - maxCount);
        var pct       = Math.round((maxCount / MAX) * 100);
        var isCritical = pct >= 80;
        var barColor   = pct >= 80 ? '#e03151' : pct >= 60 ? '#d97706' : '#2979ff';
        var borderCol  = pct >= 80 ? '#fca5a5' : pct >= 60 ? '#fde68a' : '#bfdbfe';
        var bgCol      = pct >= 80 ? '#fff5f7' : pct >= 60 ? '#fffbeb' : '#f8faff';
        var primary   = allMods.slice(0, 5);
        var secondary = allMods.slice(5).filter(function(m) { return m.count > 0; });
        var SUPPORT_WA_LINK = 'https://wa.me/94701234678?text=' + encodeURIComponent('Hi, I need help with TechonERP license.');
        return (
          <div style={{ background: bgCol, borderRadius: 10, border: "1px solid " + borderCol, padding: "14px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 10, flexWrap: "wrap" }}>
              <span style={dashLabelStyle}>Free trial usage</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: barColor, fontVariantNumeric: "tabular-nums" }}>
                {maxCount}/{MAX} · {remaining} left
              </span>
            </div>
            <div style={{ background: "#e2e8f0", borderRadius: 99, height: 6, overflow: "hidden", marginBottom: 10 }}>
              <div style={{ height: "100%", borderRadius: 99, width: Math.min(pct, 100) + "%", background: barColor, transition: "width 0.4s ease" }} />
            </div>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 500, marginBottom: 12, lineHeight: 1.5 }}>
              Highest: <strong style={{ color: barColor }}>{topModule.label}</strong>
              {" · "}
              {primary.map(function (m) { return m.label + " " + m.count; }).join(" · ")}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={function () { props.onActivate && props.onActivate(); }} style={{ flex: 1, padding: "9px", border: "none", borderRadius: 8, background: "linear-gradient(135deg,#2255d4,#2979ff)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", animation: isCritical ? "tcPulse 1.6s ease-in-out infinite" : "none" }}>Activate license</button>
              <button type="button" onClick={function () { window.open && window.open(SUPPORT_WA_LINK, "_blank"); }} style={{ padding: "9px 14px", border: "none", borderRadius: 8, background: "#25D366", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>WhatsApp</button>
            </div>
          </div>
        );
      })()}

      {integrityWarnings.length > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#92400e" }}>Data warnings ({integrityWarnings.length})</div>
            <DashLink onClick={function () { setActive("auditlog"); }}>Audit log →</DashLink>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {integrityWarnings.slice(0, 4).map(function (w, i) {
              return (
                <div key={i} style={{ fontSize: 12, color: WARN_COLORS[w.type] || C.text, fontWeight: 600, padding: "8px 10px", background: "#fff", borderRadius: 8, border: "1px solid #fde68a" }}>{w.msg}</div>
              );
            })}
            {integrityWarnings.length > 4 ? <div style={{ fontSize: 11, color: C.muted, paddingLeft: 4 }}>+{integrityWarnings.length - 4} more</div> : null}
          </div>
        </div>
      )}

      {dueAlertCheques.length > 0 && (
        <Card pad={18}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 10 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Cheque alerts</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{dueAlertCheques.length} due within 7 days</div>
            </div>
            <DashLink onClick={function () { setActive("cheques"); }}>Open register →</DashLink>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dueAlertCheques.slice(0, 5).map(function (ch) {
              var isOut = ch.type === "outgoing";
              var party = isOut ? (ch.supplierName || ch.partyName || "—") : (ch.customerName || ch.partyName || "—");
              var diffDays = Math.ceil((new Date(ch.dueDate) - new Date(t)) / 86400000);
              var overdue = diffDays < 0;
              return (
                <div key={ch.id} onClick={function () { setActive("cheques"); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e8ecf4", cursor: "pointer" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{party} · #{ch.chequeNo}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      Due {ch.dueDate}
                      {overdue ? <span style={{ color: C.red, fontWeight: 700 }}> · {Math.abs(diffDays)}d overdue</span> : diffDays === 0 ? <span style={{ color: C.orange, fontWeight: 700 }}> · today</span> : <span> · {diffDays}d left</span>}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: isOut ? C.red : C.green, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{getCurrencySymbol()} {fmtNum(ch.amount)}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", gap: 14 }}>
        <Card pad={18}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Recent sales</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Latest 5 invoices</div>
            </div>
            <DashLink onClick={function () { setActive("invoices"); }}>View all →</DashLink>
          </div>
          {recentSales.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13, padding: "12px 0" }}>No sales yet — open POS to record your first sale.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, fontWeight: 700, color: C.th, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #e8ecf4" }}>Invoice</th>
                    <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, fontWeight: 700, color: C.th, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #e8ecf4" }}>Customer</th>
                    <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 10, fontWeight: 700, color: C.th, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #e8ecf4" }}>Total</th>
                    <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, fontWeight: 700, color: C.th, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #e8ecf4", width: "22%" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map(function (s, i) {
                    return (
                      <tr key={s.id} onClick={function () { setActive("invoices"); }} className="table-row-hover" style={{ cursor: "pointer", borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafbff" }}>
                        <td style={{ padding: "9px 10px", fontFamily: "monospace", fontSize: 12, color: C.cyan, whiteSpace: "nowrap" }}>{s.invoiceNo || s.id.slice(0, 8)}</td>
                        <td style={{ padding: "9px 10px", fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.customerName || s.customer || "Walk-in"}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", fontSize: 13, fontWeight: 700, color: C.blue, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{getCurrencySymbol()} {fmtNum(s.total)}</td>
                        <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}><Badge status={s.payStatus || "Paid"} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card pad={18}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Stock attention</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{lowStock.length} low · {outOfStockProducts.length} out</div>
            </div>
            <DashLink onClick={function () { setActive("inventory"); }}>Inventory →</DashLink>
          </div>
          {lowStock.length === 0 && outOfStockProducts.length === 0 ? (
            <div style={{ color: C.green, fontSize: 13, padding: "8px 0" }}>All stock levels look good.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {lowStock.slice(0, 5).map(function (p) {
                return (
                  <div key={p.id} onClick={function () { setActive("inventory"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a", fontSize: 12, cursor: "pointer" }}>
                    <span style={{ fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>{p.name}</span>
                    <span style={{ fontWeight: 800, color: p.stock <= 2 ? C.red : C.amber, flexShrink: 0 }}>{getBulkDisplayParts(p) ? fmtStockDual(p) : fmtStock(p.stock, p.unit)}</span>
                  </div>
                );
              })}
              {outOfStockProducts.slice(0, Math.max(0, 5 - lowStock.length)).map(function (p) {
                return (
                  <div key={p.id} onClick={function () { setActive("inventory"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca", fontSize: 12, cursor: "pointer" }}>
                    <span style={{ fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>{p.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: C.red, background: "#fff", border: "1px solid #fecaca", borderRadius: 20, padding: "2px 8px" }}>OUT</span>
                  </div>
                );
              })}
            </div>
          )}
          {recentRepairs.length > 0 && getBusinessProfile().modules.repairs && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #e8ecf4" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>Recent repairs</div>
                <DashLink onClick={function () { setActive("repairs"); }}>View all →</DashLink>
              </div>
              {recentRepairs.map(function (r) {
                return (
                  <div key={r.id} onClick={function () { setActive("repairs"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12, padding: "7px 0", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}>
                    <span style={{ fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.customer}</span>
                    <Badge status={r.status} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 14 }}>
        <Card pad={18}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Sales trend</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Past 7 days</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 10, alignItems: "end", minHeight: 120 }}>
            {weeklyTrend.map(function (w) {
              var h = Math.max(4, Math.round((w.total / weeklyMax) * 96));
              return (
                <div key={w.key} style={{ textAlign: "center" }}>
                  <div title={w.label + ": " + getCurrencySymbol() + " " + fmtNum(w.total)} style={{ margin: "0 auto", width: "100%", maxWidth: 28, height: h, borderRadius: 6, background: w.total > 0 ? "linear-gradient(180deg,#93c5fd,#2563eb)" : "#e2e8f0" }} />
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 8, fontWeight: 600 }}>{w.label}</div>
                  <div style={{ fontSize: 10, color: C.textMd, fontWeight: 700, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{fmtNum(w.total)}</div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card pad={18}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Top products</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>By quantity sold</div>
          </div>
          {topProducts.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13 }}>No sales data yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {topProducts.map(function (tp, idx) {
                return (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: idx < topProducts.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tp.name}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{tp.qty} sold</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.blue, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{getCurrencySymbol()} {fmtNum(tp.revenue)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {reorderSuggestions.length > 0 && (
        <Card pad={18}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Reorder suggestions</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Suggested quantities to restock</div>
            </div>
            <DashLink onClick={function () { setActive("purchases"); }}>New purchase →</DashLink>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 8 }}>
            {reorderSuggestions.map(function (r) {
              return (
                <div key={r.id} onClick={function () { setActive("inventory"); }} style={{ cursor: "pointer", border: "1px solid #e8ecf4", background: "#f8fafc", borderRadius: 8, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>On hand: {r.current}</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 11, color: "#b45309", flexShrink: 0 }}>+{r.suggested}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
};
export default Dashboard;
