import React, { useState } from "react";

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
    var e = { id: uid(), date: f.date || today(), category: f.category, description: f.description, amount: parseFloat(f.amount) || 0, payee: f.payee || "", payMode: f.payMode || "Cash", reference: f.reference || "" };
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

  var filtered = allExp.slice().reverse().filter(function (e) {
    var matchCat = filterCat === "All" || e.category === filterCat;
    var matchMonth = !filterMonth || e.date.slice(0, 7) === filterMonth;
    var q = search.toLowerCase();
    var matchQ = !q || e.description.toLowerCase().includes(q) || (e.payee || "").toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
    return matchCat && matchMonth && matchQ;
  });
  var expPager = usePager(filtered, 50);
  var filteredTotal = filtered.reduce(function (a, e) { return a + e.amount; }, 0);

  return (
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
        <StatCard label="Today" value={todayTotal} accent={C.orange} icon="📅" sub={fmtDate(t)} />
        <StatCard label="This Month" value={monthTotal} accent={C.purple} icon="📆" sub={thisMonthStr} />
        <StatCard label="All Time" value={allTotal} accent={C.red} icon="📊" sub={allExp.length + " records"} />
        <div style={{ background: "#fff", borderRadius: 14, padding: "18px 20px", border: "1.5px solid " + C.border, boxShadow: C.shadowCard }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Top Category</div>
          {topCat.slice(0, 1).map(function (cn) {
            var ci = catInfo(cn);
            return <div key={cn}><div style={{ fontSize: 22, fontWeight: 800, color: ci.color }}>{ci.icon} {ci.name}</div><div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{getCurrencySymbol()} {fmtNum(catTotals[cn] || 0)} total</div></div>;
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
        {topCat.map(function (cn) {
          var ci = catInfo(cn);
          var pct = allTotal > 0 ? Math.round((catTotals[cn] / allTotal) * 100) : 0;
          var isActive = filterCat === cn;
          return (
            <div key={cn} onClick={function () { setFilterCat(isActive ? "All" : cn); }} style={{ background: isActive ? ci.color + "18" : "#fff", borderRadius: 12, padding: "12px 14px", border: "2px solid " + (isActive ? ci.color : C.border), cursor: "pointer", transition: "all .15s" }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{ci.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: isActive ? ci.color : C.textMd, marginBottom: 2 }}>{cn}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: isActive ? ci.color : C.text }}>{getCurrencySymbol()} {fmtNum(catTotals[cn] || 0)}</div>
              <div style={{ marginTop: 6, height: 4, background: C.border, borderRadius: 2 }}>
                <div style={{ width: pct + "%", height: "100%", background: ci.color, borderRadius: 2 }}></div>
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{pct}% of total</div>
            </div>
          );
        })}
      </div>

      <Card>
        <CardTitle sub={filtered.length.toLocaleString() + " records — " + getCurrencySymbol() + " " + fmtNum(filteredTotal)} action={<Btn sm col="orange" onClick={function () { setShow(true); }}>+ Add Expense</Btn>}>Expense Records</CardTitle>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 2 }}><Input value={search} onChange={function (e) { setSearch(e.target.value); }} placeholder="Search description, payee, category..." /></div>
          <div style={{ flex: 1 }}>
            <select value={filterCat} onChange={function (e) { setFilterCat(e.target.value); }} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit" }}>
              <option value="All">All Categories</option>
              {ECAT_NAMES.map(function (cn) { return <option key={cn}>{cn}</option>; })}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <input type="month" value={filterMonth} onChange={function (e) { setFilterMonth(e.target.value); }} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit" }} placeholder="Filter month" />
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><TH>Date</TH><TH>Category</TH><TH>Description</TH><TH>Payee</TH><TH>Pay Mode</TH><TH>Ref</TH><TH>Amount</TH><TH></TH></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: C.muted }}>No expenses found</td></tr>}
            {expPager.slice.map(function (e, i) {
              var ci = catInfo(e.category);
              return (
                <TR key={e.id} i={i}>
                  <TD>{fmtDateFull(e.date)}</TD>
                  <TD><span style={{ background: ci.color + "18", color: ci.color, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>{ci.icon} {e.category}</span></TD>
                  <TD bold>{e.description}</TD>
                  <TD>{e.payee || "—"}</TD>
                  <TD>{e.payMode || "—"}</TD>
                  <TD>{e.reference || "—"}</TD>
                  <TD bold color={C.red}>{getCurrencySymbol()} {fmtNum(e.amount)}</TD>
                  <td style={{ padding: "9px 12px" }}>
                    <Btn sm col="red" onClick={function () { setDeleteId(e.id); }}>Del</Btn>
                  </td>
                </TR>
              );
            })}
          </tbody>
        </table>
        <Pager pager={expPager} />
      </Card>

      {show && (
        <Modal title="Add Expense" onClose={function () { setShow(false); }} wide>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Date" type="date" value={f.date} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }} />
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
