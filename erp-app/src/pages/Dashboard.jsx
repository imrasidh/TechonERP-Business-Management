import React from "react";

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
  var StatCard = props.StatCard;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var Btn = props.Btn;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var Badge = props.Badge;
  var getBulkDisplayParts = props.getBulkDisplayParts;
  var fmtStockDual = props.fmtStockDual;
  var fmtStock = props.fmtStock;
  var getBusinessProfile = props.getBusinessProfile;
  var currentUser = props.currentUser || null;
  var t = today();
  var todaySales = state.sales.filter(function (s) { return s.date === t; }).reduce(function (a, s) { return a + s.total; }, 0);
  var todayCost = state.sales.filter(function (s) { return s.date === t; }).reduce(function (a, s) { return a + s.items.reduce(function (b, it) { return b + (it.cost || 0) * it.qty; }, 0); }, 0);
  var todayProfit = todaySales - todayCost;
  /* BUG1 FIX: Use getCashBalances() as the single source of truth for cash/bank.
     The old formula (capital + salesIncome - purchases - expenses - assets) was
     incomplete — it ignored manual payables, manual receivables, capital ledger
     entries, profit distributions and opening balance seeds. */
  var balances = getCashBalances(state);
  /* BUG2 FIX: Include manual receivables — GL AR when ledger synced */
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
  /* BUG3 FIX: manual + supplier payables — GL AP when ledger synced */
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
  /* FIX 1: Exclude soft-deleted (inactive) products from all stock calculations */
  var activeProducts = state.products.filter(function (p) { return p.status !== "inactive"; });
  var stockValue = activeProducts.reduce(function (a, p) { return a + (p.cost || 0) * (p.stock || 0); }, 0);
  var stockRetailValue = activeProducts.reduce(function (a, p) { return a + (p.price || 0) * (p.stock || 0); }, 0);
  var recentSales = state.sales.slice().reverse().slice(0, 5);
  var recentRepairs = state.repairs.slice().reverse().slice(0, 5);
  var lowStock = activeProducts.filter(function (p) { return p.stock > 0 && p.stock <= 5; });
  var outOfStockProducts = activeProducts.filter(function (p) { return (p.stock || 0) === 0; });
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
      var total = state.sales.filter(function (s) { return s.date === key; }).reduce(function (a, s) { return a + (s.total || 0); }, 0);
      out.push({ key: key, label: label, total: total });
    }
    return out;
  })();
  var weeklyMax = weeklyTrend.reduce(function (m, x) { return Math.max(m, x.total || 0); }, 1);
  var topProducts = (function () {
    var map = {};
    (state.sales || []).forEach(function (s) {
      (s.items || []).forEach(function (it) {
        var k = it.id || it.name || "unknown";
        if (!map[k]) map[k] = { name: it.name || "Unknown", qty: 0, revenue: 0 };
        map[k].qty += Number(it.qty || 0);
        map[k].revenue += Number((it.price || 0) * (it.qty || 0));
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
  var overdueCheques = dueAlertCheques.filter(function (ch) { return ch.dueDate < t; });
  var dueTodayCheques = dueAlertCheques.filter(function (ch) { return ch.dueDate === t; });

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
  var WARN_ICONS = { inventory: "📦", invoice: "🧾", receivable: "📥", payable: "📤" };
  var WARN_COLORS = { inventory: C.red, invoice: C.orange, receivable: C.cyan, payable: C.purple };
  return (
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {(function () {
        var welcomeDismissed = !!S.get("tc3_dashboard_welcome_dismissed", false);
        if (welcomeDismissed) return null;
        var name = currentUser && (currentUser.name || currentUser.username) ? (currentUser.name || currentUser.username) : "there";
        return (
          <div style={{ background: "linear-gradient(135deg,#eff6ff,#f8fafc)", border: "1.5px solid #bfdbfe", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#1e3a8a" }}>Welcome, {name}</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>Quick shortcuts and business insights appear here as your data grows.</div>
            </div>
            <button onClick={function () { S.set("tc3_dashboard_welcome_dismissed", true); props.setState(function (s) { return Object.assign({}, s); }); }} style={{ border: "1px solid #93c5fd", background: "#fff", color: "#1d4ed8", borderRadius: 8, fontWeight: 700, fontSize: 12, padding: "6px 10px", cursor: "pointer" }}>Dismiss</button>
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
          style={{
            background: "linear-gradient(135deg,#fff7ed,#fef3c7)",
            border: "1.5px solid #fcd34d",
            borderRadius: 12,
            padding: "12px 16px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            boxShadow: "0 2px 8px rgba(245,158,11,0.12)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>⚙️</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#92400e" }}>Complete your setup</div>
              <div style={{ fontSize: 12, color: "#a16207", marginTop: 2, lineHeight: 1.45 }}>Add your shop name and a phone number or address to use sales and POS.</div>
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#b45309", flexShrink: 0 }}>Continue →</span>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        <div onClick={function () { setActive("reports"); }} style={{ cursor: "pointer" }}>
          <div className="stat-card-hover" style={{ background: "#fff", borderRadius: 14, padding: "18px 20px", border: "1.5px solid " + C.border, position: "relative", overflow: "hidden", boxShadow: C.shadowCard }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: C.orange, borderRadius: "14px 14px 0 0" }}></div>
            <div style={{ position: "absolute", top: 0, right: 0, width: 80, height: 80, background: C.orange + "10", borderRadius: "0 14px 0 80px" }}></div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}><span style={{ fontSize: 14 }}>💰</span> Total Cash</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 6, letterSpacing: "-0.02em" }}>{getCurrencySymbol()} {fmtNum(balances.total)}</div>
            <div style={{ display: "flex", gap: 5 }}>
              <div style={{ flex: 1, background: "#f0f9f4", borderRadius: 7, padding: "4px 7px", border: "1px solid #c8edd8" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#2e7d32", textTransform: "uppercase", marginBottom: 1 }}>Cash</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#2e7d32" }}>{getCurrencySymbol()} {fmtNum(balances.cash)}</div>
              </div>
              <div style={{ flex: 1, background: "#e8f0fe", borderRadius: 7, padding: "4px 7px", border: "1px solid #c5d4f5" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#1565c0", textTransform: "uppercase", marginBottom: 1 }}>Bank</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#1565c0" }}>{getCurrencySymbol()} {fmtNum(balances.bank)}</div>
              </div>
            </div>
          </div>
        </div>
        <div onClick={function () { setActive("inventory"); }} style={{ cursor: "pointer" }}><StatCard label="Stock Value" value={stockValue} accent={C.purple} icon="📦" sub={"Low stock: " + lowStock.length} /></div>
        <div onClick={function () { setActive("pos"); }} style={{ cursor: "pointer" }}><StatCard label="Today Sales" value={todaySales} accent={C.cyan} icon="💰" sub={fmtDate(t)} /></div>
        <div onClick={function () { setActive("reports"); }} style={{ cursor: "pointer" }}><StatCard label="Today Profit" value={todayProfit} accent={todayProfit >= 0 ? C.green : C.red} icon="📈" /></div>
      </div>
      {/* ── Trial Usage Widget (visible in trial mode only) ── */}
      {(function() {
        var licenseInfo = props.licenseInfo;
        if (!licenseInfo || licenseInfo.status !== 'trial') return null;
        var MAX = licenseInfo.trialMaxRecords || 20;
        var allMods = [
          { label: 'Sales',      count: state.sales.length                  },
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
          <div style={{ background: bgCol, borderRadius: 12, border: '1.5px solid ' + borderCol, padding: '14px 18px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Free Trial Usage
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: barColor }}>
                {maxCount}/{MAX} used &middot; <span style={{ fontWeight: 600 }}>{remaining} remaining</span>
              </span>
            </div>
            <div style={{ background: '#e2e8f0', borderRadius: 99, height: 8, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', borderRadius: 99, width: Math.min(pct, 100) + '%', background: barColor, transition: 'width 0.4s ease' }} />
            </div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 10 }}>
              Highest: <span style={{ color: barColor, fontWeight: 800 }}>{topModule.label} ({topModule.count}/{MAX})</span>
              {' \u2013 '}
              {primary.map(function(m) { return m.label + '\u00a0' + m.count + '/' + MAX; }).join(' \u00b7 ')}
              {secondary.length > 0 && ' \u00b7 ' + secondary.map(function(m) { return m.label + '\u00a0' + m.count; }).join(' \u00b7 ')}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={function() { props.onActivate && props.onActivate(); }} style={{ flex: 1, padding: '9px', border: 'none', borderRadius: 9, background: 'linear-gradient(135deg,#2255d4,#2979ff)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", animation: isCritical ? 'tcPulse 1.6s ease-in-out infinite' : 'none' }}>Activate License</button>
              <button onClick={function() { window.open && window.open(SUPPORT_WA_LINK, '_blank'); }} style={{ padding: '9px 14px', border: 'none', borderRadius: 9, background: '#25D366', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>WhatsApp</button>
            </div>
          </div>
        );
      })()}<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div onClick={function () { setActive("receivables"); }} style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", border: "1px solid " + C.border, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>💳</span>
          <div><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>Receivables</div><div style={{ fontSize: 18, fontWeight: 800, color: C.cyan }}>{getCurrencySymbol()} {fmtNum(totalReceivable)}</div></div>
        </div>
        <div onClick={function () { setActive("payables"); }} style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", border: "1px solid " + C.border, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🏭</span>
          <div><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>Payables</div><div style={{ fontSize: 18, fontWeight: 800, color: C.orange }}>{getCurrencySymbol()} {fmtNum(totalPayable)}</div></div>
        </div>
      </div>
      {/* ── Fix 4: Data Integrity Warning Panel — only shows when issues exist ── */}
      {integrityWarnings.length > 0 && (
        <div style={{ background: "#fff8e1", border: "2px solid #fcd34d", borderRadius: 12, padding: "14px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#92400e", display: "flex", alignItems: "center", gap: 8 }}>
              ⚠️ Data Integrity Warnings ({integrityWarnings.length})
            </div>
            <button onClick={function () { setActive("auditlog"); }} style={{ fontSize: 11, color: C.accent, fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}>View Audit Log →</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {integrityWarnings.slice(0, 5).map(function (w, i) {
              return (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px", background: "#fff", borderRadius: 8, border: "1px solid " + (WARN_COLORS[w.type] || C.border) + "44" }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{WARN_ICONS[w.type] || "⚠"}</span>
                  <span style={{ fontSize: 13, color: WARN_COLORS[w.type] || C.text, fontWeight: 600 }}>{w.msg}</span>
                </div>
              );
            })}
            {integrityWarnings.length > 5 && (
              <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, padding: "4px 12px" }}>+{integrityWarnings.length - 5} more issues found</div>
            )}
          </div>
        </div>
      )}

      {/* ── Cheque Alerts Panel ── */}
      {dueAlertCheques.length > 0 && (
        <Card>
          <CardTitle
            sub={dueAlertCheques.length + " cheque" + (dueAlertCheques.length > 1 ? "s" : "") + " need attention"}
            action={<Btn sm col="blue" onClick={function () { setActive("cheques"); }}>Open Register →</Btn>}
          >🏷 Cheque Alerts</CardTitle>
          {overdueCheques.length > 0 && (
            <div style={{ background: "#fde8ed", border: "1px solid #f9a8ba", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
              <div style={{ fontWeight: 800, color: C.red, fontSize: 13 }}>🔴 {overdueCheques.length} overdue cheque{overdueCheques.length > 1 ? "s" : ""} — update status now!</div>
            </div>
          )}
          {dueTodayCheques.length > 0 && (
            <div style={{ background: "#fff3e0", border: "1px solid #f7c97a", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
              <div style={{ fontWeight: 800, color: C.orange, fontSize: 13 }}>⚠ {dueTodayCheques.length} cheque{dueTodayCheques.length > 1 ? "s" : ""} due TODAY — did you pay/receive?</div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {dueAlertCheques.map(function (ch) {
              var isOut = ch.type === "outgoing";
              var party = isOut ? (ch.supplierName || ch.partyName || "—") : (ch.customerName || ch.partyName || "—");
              var diffDays = Math.ceil((new Date(ch.dueDate) - new Date(t)) / 86400000);
              var overdue = diffDays < 0;
              var bgCol = overdue ? "#fde8ed" : diffDays === 0 ? "#fff3e0" : "#f7f9ff";
              var bdCol = overdue ? "#f9a8ba" : diffDays === 0 ? "#f7c97a" : C.border;
              return (
                <div key={ch.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: bgCol, borderRadius: 10, border: "1px solid " + bdCol }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{isOut ? "📤" : "📥"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      {isOut ? "Pay to: " : "Receive from: "}
                      <span style={{ color: isOut ? C.red : C.green }}>{party}</span>
                      {"  "}
                      <span style={{ color: C.purple, fontSize: 12 }}>#{ch.chequeNo}</span>
                      {ch.bankName ? <span style={{ color: C.muted, fontSize: 11, fontWeight: 500 }}> · {ch.bankName}</span> : null}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {(ch.purchaseNo || ch.invoiceNo) ? "Ref: " + (ch.purchaseNo || ch.invoiceNo) + " · " : ""}
                      Due: <strong style={{ color: overdue ? C.red : diffDays === 0 ? C.orange : C.text }}>{ch.dueDate}</strong>
                      {overdue
                        ? <span style={{ color: C.red, fontWeight: 700 }}> ({Math.abs(diffDays)}d overdue!)</span>
                        : diffDays === 0
                          ? <span style={{ color: C.orange, fontWeight: 700 }}> (TODAY!)</span>
                          : <span style={{ color: C.muted }}> ({diffDays}d left)</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: 15, color: isOut ? C.red : C.green }}>{getCurrencySymbol()} {fmtNum(ch.amount)}</div>
                    <Btn sm col={overdue || diffDays === 0 ? "green" : "gray"} onClick={function () { setActive("cheques"); }} style={{ marginTop: 4 }}>
                      {overdue || diffDays === 0 ? "Update Now" : "View"}
                    </Btn>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <Card>
          <CardTitle sub="Last 5 sales" action={<Btn sm col="gray" onClick={function () { setActive("invoices"); }}>View All →</Btn>}>Recent Sales</CardTitle>
          {recentSales.length === 0 ? <div style={{ color: C.muted, fontSize: 13, padding: "8px 0" }}>No sales yet</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr><TH>Customer</TH><TH>Items</TH><TH>Total</TH><TH>Status</TH></tr></thead>
              <tbody>{recentSales.map(function (s, i) {
                return (
                  <TR key={s.id} i={i} onClick={function () { setActive("invoices"); }} style={{ cursor: "pointer" }}>
                    <TD bold>{s.customerName || s.customer || "Walk-in"}</TD>
                    <TD center>{s.items.length}</TD>
                    <TD color={C.blue}>{getCurrencySymbol()} {fmtNum(s.total)}</TD>
                    <td style={{ padding: "8px 10px" }}><Badge status={s.payStatus || "Paid"} /></td>
                  </TR>
                );
              })}</tbody>
            </table>
          )}
        </Card>
        <Card>
          <CardTitle sub={lowStock.length + " items"}>Low Stock Products</CardTitle>
          {lowStock.length === 0 ? <div style={{ color: C.green, fontSize: 13 }}>All stock levels OK</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {lowStock.map(function (p) {
                return (
                  <div key={p.id} onClick={function () { setActive("inventory"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: "#fef9c3", borderRadius: 7, fontSize: 13, cursor: "pointer", transition: "opacity .15s" }}>
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    <span style={{ fontWeight: 800, color: p.stock <= 2 ? C.red : C.amber }}>{getBulkDisplayParts(p) ? fmtStockDual(p) : fmtStock(p.stock, p.unit)} left</span>
                  </div>
                );
              })}
            </div>
          )}
          {recentRepairs.length > 0 && getBusinessProfile().modules.repairs && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>Recent Repairs</div><button onClick={function () { setActive("repairs"); }} style={{ fontSize: 11, color: C.accent, fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}>View All →</button></div>
              {recentRepairs.map(function (r) {
                return (
                  <div key={r.id} onClick={function () { setActive("repairs"); }} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "7px 8px", borderRadius: 6, marginBottom: 2, cursor: "pointer", background: "transparent", transition: "background .12s" }}
                    onMouseEnter={function (e) { e.currentTarget.style.background = "#f0f4ff"; }}
                    onMouseLeave={function (e) { e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ fontWeight: 600 }}>{r.customer} — {r.deviceType || r.device || ""} {r.brand || ""}</span>
                    <Badge status={r.status} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
        <Card>
          <CardTitle sub="Past 7 days sales trend">Sales Trend (Weekly)</CardTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 8, alignItems: "end", minHeight: 150 }}>
            {weeklyTrend.map(function (w) {
              var h = Math.max(6, Math.round((w.total / weeklyMax) * 110));
              return (
                <div key={w.key} style={{ textAlign: "center" }}>
                  <div title={w.label + ": " + getCurrencySymbol() + " " + fmtNum(w.total)} style={{ margin: "0 auto", width: 22, height: h, borderRadius: 6, background: "linear-gradient(180deg,#60a5fa,#2563eb)" }} />
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>{w.label}</div>
                  <div style={{ fontSize: 10.5, color: C.textMd, fontWeight: 700 }}>{fmtNum(w.total)}</div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <CardTitle sub="By sold quantity">Top Selling Products</CardTitle>
          {topProducts.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13 }}>No sales data yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {topProducts.map(function (tp, idx) {
                return (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", border: "1px solid " + C.border, borderRadius: 8, padding: "8px 10px" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{idx + 1}. {tp.name}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{tp.qty} sold</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.blue }}>{getCurrencySymbol()} {fmtNum(tp.revenue)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle sub={outOfStockProducts.length + " product" + (outOfStockProducts.length !== 1 ? "s" : "") + " with zero stock"} action={outOfStockProducts.length > 0 ? <Btn sm col="red" onClick={function () { setActive("inventory"); }}>View in Inventory →</Btn> : null}>
          🚫 Out of Stock Products
        </CardTitle>
        {outOfStockProducts.length === 0 ? (
          <div style={{ color: C.green, fontSize: 13 }}>✅ No out of stock products!</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
            {outOfStockProducts.map(function (p) {
              return (
                <div key={p.id} onClick={function () { setActive("inventory"); }}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", background: "#fde8ed", border: "1px solid #fbb6c4", borderRadius: 8, fontSize: 13, cursor: "pointer", transition: "background .12s" }}
                  onMouseEnter={function (e) { e.currentTarget.style.background = "#fbd0d9"; }}
                  onMouseLeave={function (e) { e.currentTarget.style.background = "#fde8ed"; }}>
                  <div>
                    <div style={{ fontWeight: 700, color: C.text }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{p.category || "—"}</div>
                  </div>
                  <span style={{ background: C.red, color: "#fff", padding: "2px 8px", borderRadius: 20, fontWeight: 800, fontSize: 11, flexShrink: 0, marginLeft: 8 }}>OUT</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      {reorderSuggestions.length > 0 && (
        <Card>
          <CardTitle sub="Suggested quantities to avoid stockouts">Reorder Suggestions</CardTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 8 }}>
            {reorderSuggestions.map(function (r) {
              return (
                <div key={r.id} onClick={function () { setActive("inventory"); }} style={{ cursor: "pointer", border: "1px solid #fde68a", background: "#fffbeb", borderRadius: 8, padding: "9px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: "#92400e" }}>On hand: {r.current}</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 12, color: "#b45309" }}>Order +{r.suggested} {r.unit || "pcs"}</div>
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
