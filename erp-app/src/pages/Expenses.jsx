import React, { useState } from "react";
import { ActBtn, ActBtnGroup, actBtnCellStyle } from "../components/ActBtn.jsx";
import { LIST_PAGE_SIZE, sortNewestFirst } from "../utils/listPage.js";
import { stampTransactionIsoDateTime } from "../utils/stampUpdatedAt.js";

var Expenses = function (props) {
  var state = props.state;
  var setState = props.setState;
  var today = props.today;
  var uid = props.uid;
  var tcTrialGuard = props.tcTrialGuard;
  var S = props.S;
  var usePager = props.usePager;
  var StatCard = props.StatCard;
  var fmtDate = props.fmtDate;
  var C = props.C;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var Btn = props.Btn;
  var Input = props.Input;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var Pager = props.Pager;
  var Modal = props.Modal;
  var Sel = props.Sel;
  var fmtDateFull = props.fmtDateFull;
  var BLANK = { date: today(), category: "Rent", description: "", amount: "", payee: "", payMode: "Cash", reference: "" };
  var [show, setShow] = useState(false);
  var [f, setF] = useState(BLANK);
  var [filterCat, setFilterCat] = useState("All");
  var [filterMonth, setFilterMonth] = useState("");
  var [search, setSearch] = useState("");
  var [deleteId, setDeleteId] = useState(null);

  var ECATS = [
    { name: "Rent", icon: "🏠", color: "#7c3aed" },
    { name: "Utilities", icon: "💡", color: "#d97706" },
    { name: "Salary", icon: "👷", color: "#0284c7" },
    { name: "Internet & Phone", icon: "📡", color: "#0891b2" },
    { name: "Marketing & Ads", icon: "📢", color: "#db2777" },
    { name: "Transport", icon: "🚗", color: "#059669" },
    { name: "Maintenance", icon: "🔧", color: "#64748b" },
    { name: "Purchases", icon: "🛒", color: "#7c3aed" },
    { name: "Stationery", icon: "📎", color: "#0284c7" },
    { name: "Packaging", icon: "📦", color: "#d97706" },
    { name: "Cleaning", icon: "🧹", color: "#059669" },
    { name: "Software & License", icon: "💻", color: "#6366f1" },
    { name: "Food & Entertainment", icon: "🍽", color: "#f59e0b" },
    { name: "Insurance", icon: "🛡", color: "#0f766e" },
    { name: "Tax & Govt Fees", icon: "🏛", color: "#b45309" },
    { name: "Loan Repayment", icon: "🏦", color: "#b91c1c" },
    { name: "Other", icon: "💼", color: "#64748b" }
  ];
  var ECAT_NAMES = ECATS.map(function (c) { return c.name; });
  var catInfo = function (name) {
    var found = null;
    ECATS.forEach(function (c) { if (c.name === name) found = c; });
    return found || { name: name, icon: "💼", color: "#64748b" };
  };

  var saveNew = function () {
    if (!f.description || !f.amount) return;
    var expTs = new Date().toISOString();
    var e = stampTransactionIsoDateTime({ id: uid(), date: f.date || today(), category: f.category, description: f.description, amount: parseFloat(f.amount) || 0, payee: f.payee || "", payMode: f.payMode || "Cash", reference: f.reference || "", createdAt: expTs, updatedAt: expTs }, expTs);
    if (!tcTrialGuard(state.expenses, 'expenses')) return;
    var ne = state.expenses.concat([e]);
    S.set("tc3_expenses", ne);
    setState(function (st) { return Object.assign({}, st, { expenses: ne }); });
    setShow(false); setF(BLANK);
  };

  var doDelete = function (id) {
    var ne = state.expenses.filter(function (e) { return e.id !== id; });
    S.set("tc3_expenses", ne);
    setState(function (st) { return Object.assign({}, st, { expenses: ne }); });
    setDeleteId(null);
  };

  var t = today();
  var allExp = state.expenses;
  var todayTotal = allExp.filter(function (e) { return e.date === t; }).reduce(function (a, e) { return a + e.amount; }, 0);
  var thisMonthStr = t.slice(0, 7);
  var monthTotal = allExp.filter(function (e) { return e.date.slice(0, 7) === thisMonthStr; }).reduce(function (a, e) { return a + e.amount; }, 0);
  var allTotal = allExp.reduce(function (a, e) { return a + e.amount; }, 0);

  var catTotals = {};
  ECAT_NAMES.forEach(function (cn) {
    catTotals[cn] = allExp.filter(function (e) { return e.category === cn; }).reduce(function (a, e) { return a + e.amount; }, 0);
  });

  var topCat = ECAT_NAMES.slice().sort(function (a, b) { return (catTotals[b] || 0) - (catTotals[a] || 0); }).slice(0, 5);

  var filtered = sortNewestFirst(allExp).filter(function (e) {
    var matchCat = filterCat === "All" || e.category === filterCat;
    var matchMonth = !filterMonth || e.date.slice(0, 7) === filterMonth;
    var q = search.toLowerCase();
    var matchQ = !q || e.description.toLowerCase().includes(q) || (e.payee || "").toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
    return matchCat && matchMonth && matchQ;
  });
  var expPager = usePager(filtered, LIST_PAGE_SIZE);
  var filteredTotal = filtered.reduce(function (a, e) { return a + e.amount; }, 0);

  var topCi = topCat.length ? catInfo(topCat[0]) : null;

  return (
    <div className="erp-page erp-arap-modern is-exp">
      <div className="erp-arap-chrome">
        <div className="erp-arap-topbar">
          <div className="erp-arap-topbar-brand">
            <div className="erp-arap-brand-ico" aria-hidden="true">EX</div>
            <div>
              <h1 className="erp-arap-header-title">Expenses</h1>
              <p className="erp-arap-header-sub">Operating costs · categories &amp; payees</p>
            </div>
          </div>
          <div className="erp-arap-kpi-row" aria-label="Expense totals">
            <div className="erp-arap-kpi is-orange">
              <span className="erp-arap-kpi-lbl">Today</span>
              <span className="erp-arap-kpi-val">{getCurrencySymbol()} {fmtNum(todayTotal)}</span>
              <span className="erp-arap-kpi-sub">{fmtDate(t)}</span>
            </div>
            <div className="erp-arap-kpi is-purple">
              <span className="erp-arap-kpi-lbl">This month</span>
              <span className="erp-arap-kpi-val">{getCurrencySymbol()} {fmtNum(monthTotal)}</span>
              <span className="erp-arap-kpi-sub">{thisMonthStr}</span>
            </div>
            <div className="erp-arap-kpi is-red">
              <span className="erp-arap-kpi-lbl">All time</span>
              <span className="erp-arap-kpi-val">{getCurrencySymbol()} {fmtNum(allTotal)}</span>
              <span className="erp-arap-kpi-sub">{allExp.length} records</span>
            </div>
            <div className="erp-arap-kpi is-blue">
              <span className="erp-arap-kpi-lbl">Top category</span>
              <span className="erp-arap-kpi-val">{topCi ? topCi.name : "—"}</span>
              <span className="erp-arap-kpi-sub">{topCi ? (getCurrencySymbol() + " " + fmtNum(catTotals[topCat[0]] || 0)) : "no spend yet"}</span>
            </div>
          </div>
          <button type="button" className="erp-arap-add" onClick={function () { setShow(true); }}>
            <span className="erp-arap-add-ico" aria-hidden="true">+</span>
            <span>Add Expense</span>
          </button>
        </div>
        {topCat.length > 0 ? (
          <div className="erp-arap-cat-row" aria-label="Top spending categories">
            {topCat.map(function (cn) {
              var ci = catInfo(cn);
              var pct = allTotal > 0 ? Math.round((catTotals[cn] / allTotal) * 100) : 0;
              var isActive = filterCat === cn;
              return (
                <button
                  key={cn}
                  type="button"
                  className={"erp-arap-cat-chip" + (isActive ? " is-active" : "")}
                  style={{ color: ci.color }}
                  onClick={function () { setFilterCat(isActive ? "All" : cn); }}
                >
                  <span className="erp-arap-cat-ico" aria-hidden="true">{ci.icon}</span>
                  <span className="erp-arap-cat-meta">
                    <span className="erp-arap-cat-name">{cn}</span>
                    <span className="erp-arap-cat-amt">{getCurrencySymbol()} {fmtNum(catTotals[cn] || 0)} · {pct}%</span>
                  </span>
                  <span className="erp-arap-cat-bar" aria-hidden="true"><i style={{ width: pct + "%", background: ci.color }} /></span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="erp-arap-body">
        <div className="erp-arap-panel">
          <div className="erp-arap-toolbar">
            <div className="erp-arap-search-wrap">
              <input
                className="erp-arap-field"
                value={search}
                onChange={function (e) { setSearch(e.target.value); }}
                placeholder="Search description, payee, category…"
                aria-label="Search expenses"
              />
            </div>
            <select
              className="erp-arap-field"
              value={filterCat}
              onChange={function (e) { setFilterCat(e.target.value); }}
              aria-label="Filter category"
              style={{ maxWidth: 180 }}
            >
              <option value="All">All categories</option>
              {ECAT_NAMES.map(function (cn) { return <option key={cn} value={cn}>{cn}</option>; })}
            </select>
            <input
              className="erp-arap-field"
              type="month"
              value={filterMonth}
              onChange={function (e) { setFilterMonth(e.target.value); }}
              aria-label="Filter month"
              style={{ maxWidth: 150 }}
            />
            {(search || filterCat !== "All" || filterMonth) ? (
              <button type="button" className="erp-arap-btn-clear" onClick={function () { setSearch(""); setFilterCat("All"); setFilterMonth(""); }}>Clear</button>
            ) : null}
            <span className="erp-arap-filter-meta">{filtered.length} shown · {getCurrencySymbol()} {fmtNum(filteredTotal)}</span>
          </div>
          <div className="erp-arap-table-wrap">
            <table className="erp-arap-table">
              <thead>
                <tr>
                  <th style={{ width: "10%" }}>Date</th>
                  <th style={{ width: "14%" }}>Category</th>
                  <th style={{ width: "22%" }}>Description</th>
                  <th style={{ width: "12%" }}>Payee</th>
                  <th style={{ width: "11%" }}>Pay Mode</th>
                  <th style={{ width: "10%" }}>Ref</th>
                  <th style={{ width: "12%" }}>Amount</th>
                  <th style={{ width: "9%" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={8} className="erp-arap-empty">No expenses found</td></tr>}
                {expPager.slice.map(function (e) {
                  var ci = catInfo(e.category);
                  return (
                    <tr key={e.id} className="table-row-hover">
                      <td>{fmtDateFull(e.date)}</td>
                      <td>
                        <span className="erp-arap-badge-cat" style={{ background: ci.color + "18", color: ci.color }}>
                          <span aria-hidden="true">{ci.icon}</span> {e.category}
                        </span>
                      </td>
                      <td className="erp-arap-src" title={e.description}>{e.description}</td>
                      <td>{e.payee || "—"}</td>
                      <td>{e.payMode || "—"}</td>
                      <td>{e.reference || "—"}</td>
                      <td className="erp-arap-amt" style={{ color: "#b91c1c", fontWeight: 800 }}>{getCurrencySymbol()} {fmtNum(e.amount)}</td>
                      <td style={actBtnCellStyle}>
                        <ActBtn tone="red" title="Delete expense" onClick={function () { setDeleteId(e.id); }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="erp-arap-foot">
            <div className="erp-arap-pager-wrap"><Pager pager={expPager} /></div>
          </div>
        </div>
      </div>

      {show && (
        <Modal title="Add Expense" onClose={function () { setShow(false); }} wide>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Date" type="date" value={f.date} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }} applyPeriodLockMin={!!props.periodLockTransactionMinDate} periodLockTransactionMinDate={props.periodLockTransactionMinDate} />
              <Sel label="Category" value={f.category} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { category: e.target.value }); }); }}>
                {ECATS.map(function (c) { return <option key={c.name} value={c.name}>{c.icon} {c.name}</option>; })}
              </Sel>
            </div>
            <Input label="Description" value={f.description} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { description: e.target.value }); }); }} placeholder="What was this expense for?" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
              <Input label="Amount (Rs)" type="number" value={f.amount} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { amount: e.target.value }); }); }} />
              <Input label="Paid To (Payee)" value={f.payee} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { payee: e.target.value }); }); }} placeholder="Landlord, CEB, etc." />
              <Sel label="Payment Mode" value={f.payMode} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { payMode: e.target.value }); }); }}>
                {["Cash", "Bank Transfer", "Cheque", "Card", "Online"].map(function (m) { return <option key={m}>{m}</option>; })}
              </Sel>
            </div>
            <Input label="Reference / Receipt No." value={f.reference} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { reference: e.target.value }); }); }} placeholder="Optional receipt or reference number" />
            <div style={{ display: "flex", gap: 8 }}>
              <Btn col="orange" onClick={saveNew} disabled={!f.description || !f.amount}>Save Expense</Btn>
              <Btn col="gray" onClick={function () { setShow(false); }}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      {deleteId && (
        <Modal title="Confirm Delete" onClose={function () { setDeleteId(null); }}>
          <div style={{ background: "#fde8ed", border: "1px solid #f9a8ba", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#c0152e" }}>This expense record will be permanently deleted.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn col="red" onClick={function () { doDelete(deleteId); }}>Delete</Btn>
            <Btn col="gray" onClick={function () { setDeleteId(null); }}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Expenses;
