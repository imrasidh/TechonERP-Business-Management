import React, { useState, useEffect } from "react";

import { LIST_PAGE_SIZE } from "../utils/listPage.js";

var AUDIT_PAGE_SIZE = LIST_PAGE_SIZE;
var AuditLog = function (props) {
  var S = props.S;
  var showConfirm = props.showConfirm;
  var C = props.C;
  var StatCard = props.StatCard;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var Btn = props.Btn;
  var Input = props.Input;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var Modal = props.Modal;
  var [search, setSearch] = useState("");
  var [filterType, setFilterType] = useState("All");
  var [auditPage, setAuditPage] = useState(0);
  var [viewEntry, setViewEntry] = useState(null);
  var [log, setLog] = useState(function () {
    return S.get("tc3_auditLog", []);
  });

  var refresh = function () {
    setLog(S.get("tc3_auditLog", []));
  };

  var clearLog = function () {
    showConfirm("Clear all audit log entries? This cannot be undone.", function () {
      S.set("tc3_auditLog", []);
      setLog([]);
    });
  };

  var ACTION_TYPES = ["All", "Sale", "Purchase", "Product", "Repair", "Payment"];
  /* Reset to page 0 when search or filter changes */
  useEffect(function () { setAuditPage(0); }, [search, filterType]);

  var matchType = function (entry) {
    if (filterType === "All") return true;
    if (filterType === "Sale") return entry.action.includes("Sale");
    if (filterType === "Purchase") return entry.action.includes("Purchase");
    if (filterType === "Product") return entry.action.includes("Product");
    if (filterType === "Repair") return entry.action.includes("Repair");
    if (filterType === "Payment") return entry.action.includes("Payment");
    return true;
  };

  var filtered = log.filter(function (e) {
    var q = search.toLowerCase();
    var matchQ = !q || e.action.toLowerCase().includes(q) || (e.reference || "").toLowerCase().includes(q);
    return matchQ && matchType(e);
  });

  var ACTION_COLOR = function (action) {
    if (action.includes("Sale")) return C.blue;
    if (action.includes("Purchase")) return C.purple;
    if (action.includes("Product")) return C.orange;
    if (action.includes("Repair")) return C.cyan;
    if (action.includes("Payment")) return C.green;
    return C.muted;
  };

  var ACTION_ICON = function (action) {
    if (action.includes("Created Sale")) return "🧾";
    if (action.includes("Edited Sale")) return "✏️";
    if (action.includes("Created Purchase")) return "🛒";
    if (action.includes("Edited Purchase")) return "✏️";
    if (action.includes("Product")) return "📦";
    if (action.includes("Repair")) return "🔧";
    if (action.includes("Payment")) return "💳";
    return "📝";
  };

  return (
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
        <StatCard money={false} label="Total Entries" value={log.length} accent={C.blue} icon="📋" sub="all recorded actions" />
        <StatCard money={false} label="Sale Events" value={log.filter(function (e) { return e.action.includes("Sale"); }).length} accent={C.cyan} icon="🧾" sub="creates + edits" />
        <StatCard money={false} label="Purchase Events" value={log.filter(function (e) { return e.action.includes("Purchase"); }).length} accent={C.purple} icon="🛒" sub="creates + edits" />
        <StatCard money={false} label="Payment Events" value={log.filter(function (e) { return e.action.includes("Payment"); }).length} accent={C.green} icon="💳" sub="receivables + payables" />
      </div>

      <Card>
        <CardTitle
          sub={filtered.length + " entries"}
          action={
            <div style={{ display: "flex", gap: 6 }}>
              <Btn sm col="gray" onClick={refresh}>↻ Refresh</Btn>
              <Btn sm col="red" onClick={clearLog}>🗑 Clear Log</Btn>
            </div>
          }
        >Audit Log</CardTitle>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <Input value={search} onChange={function (e) { setSearch(e.target.value); }} placeholder="Search action or reference..." />
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            {ACTION_TYPES.map(function (t) {
              return (
                <button key={t} onClick={function () { setFilterType(t); }}
                  style={{ padding: "7px 12px", borderRadius: 7, border: "1.5px solid " + (filterType === t ? C.accent : C.border), background: filterType === t ? C.accentSoft : "#fff", color: filterType === t ? C.accent : C.muted, fontWeight: 700, fontSize: 11.5, cursor: "pointer" }}>
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: C.muted }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontWeight: 600 }}>{log.length === 0 ? "No audit entries yet. Actions will be logged as you use the ERP." : "No matching entries found."}</div>
          </div>
        ) : (
          <React.Fragment>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr><TH>Timestamp</TH><TH>Action</TH><TH>Reference</TH><TH>User</TH><TH></TH></tr>
                </thead>
                <tbody>
                  {filtered.slice(auditPage * AUDIT_PAGE_SIZE, (auditPage + 1) * AUDIT_PAGE_SIZE).map(function (e, i) {
                    var color = ACTION_COLOR(e.action);
                    return (
                      <TR key={e.id} i={i} onClick={function () { setViewEntry(e); }} style={{ cursor: "pointer" }}>
                        <td style={{ padding: "10px 14px", fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{e.timestamp}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 14 }}>{ACTION_ICON(e.action)}</span>
                            <span style={{ fontWeight: 700, color: color, fontSize: 13 }}>{e.action}</span>
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ fontFamily: "monospace", fontSize: 12, background: C.accentSoft, color: C.accent, padding: "2px 8px", borderRadius: 5 }}>{e.reference || "—"}</span>
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: 12, color: C.muted }}>{e.user || "Admin"}</td>
                        <td style={{ padding: "10px 14px", fontSize: 11, color: C.accent }}>View →</td>
                      </TR>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Pagination controls */}
            {filtered.length > AUDIT_PAGE_SIZE && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 4px", marginTop: 8 }}>
                <div style={{ fontSize: 12, color: C.muted }}>
                  Showing {auditPage * AUDIT_PAGE_SIZE + 1}–{Math.min((auditPage + 1) * AUDIT_PAGE_SIZE, filtered.length)} of {filtered.length} entries
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={function () { setAuditPage(0); }} disabled={auditPage === 0}
                    style={{ padding: "6px 12px", borderRadius: 7, border: "1.5px solid " + C.border, background: auditPage === 0 ? C.borderLight : "#fff", cursor: auditPage === 0 ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 12 }}>«</button>
                  <button onClick={function () { setAuditPage(function (p) { return Math.max(0, p - 1); }); }} disabled={auditPage === 0}
                    style={{ padding: "6px 14px", borderRadius: 7, border: "1.5px solid " + C.border, background: auditPage === 0 ? C.borderLight : "#fff", cursor: auditPage === 0 ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 12 }}>‹ Prev</button>
                  <span style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, color: C.text }}>
                    Page {auditPage + 1} / {Math.ceil(filtered.length / AUDIT_PAGE_SIZE)}
                  </span>
                  <button onClick={function () { setAuditPage(function (p) { return Math.min(Math.ceil(filtered.length / AUDIT_PAGE_SIZE) - 1, p + 1); }); }} disabled={(auditPage + 1) * AUDIT_PAGE_SIZE >= filtered.length}
                    style={{ padding: "6px 14px", borderRadius: 7, border: "1.5px solid " + C.border, background: (auditPage + 1) * AUDIT_PAGE_SIZE >= filtered.length ? C.borderLight : "#fff", cursor: (auditPage + 1) * AUDIT_PAGE_SIZE >= filtered.length ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 12 }}>Next ›</button>
                  <button onClick={function () { setAuditPage(Math.ceil(filtered.length / AUDIT_PAGE_SIZE) - 1); }} disabled={(auditPage + 1) * AUDIT_PAGE_SIZE >= filtered.length}
                    style={{ padding: "6px 12px", borderRadius: 7, border: "1.5px solid " + C.border, background: (auditPage + 1) * AUDIT_PAGE_SIZE >= filtered.length ? C.borderLight : "#fff", cursor: (auditPage + 1) * AUDIT_PAGE_SIZE >= filtered.length ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 12 }}>»</button>
                </div>
              </div>
            )}
          </React.Fragment>
        )}
      </Card>

      {viewEntry && (
        <Modal title={"Audit Entry — " + viewEntry.action} onClose={function () { setViewEntry(null); }} medium>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{ background: C.accentSoft, borderRadius: 10, padding: "14px 18px", marginBottom: 14, display: "flex", gap: 16, alignItems: "center" }}>
              <span style={{ fontSize: 28 }}>{ACTION_ICON(viewEntry.action)}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: ACTION_COLOR(viewEntry.action) }}>{viewEntry.action}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{viewEntry.timestamp}</div>
              </div>
            </div>
            {[
              { label: "Entry ID", val: viewEntry.id, mono: true },
              { label: "Date", val: viewEntry.date || (viewEntry.timestamp ? viewEntry.timestamp.split(",")[0] : "—") },
              { label: "Full Timestamp", val: viewEntry.timestamp },
              { label: "Action", val: viewEntry.action },
              { label: "Reference / Invoice", val: viewEntry.reference || "—", mono: true, accent: true },
              { label: "Performed By", val: viewEntry.user || "Admin" },
              { label: "Category", val: (function () {
                var a = viewEntry.action;
                if (a.includes("Sale")) return "🧾 Sales";
                if (a.includes("Purchase")) return "🛒 Purchases";
                if (a.includes("Product")) return "📦 Inventory";
                if (a.includes("Repair")) return "🔧 Repairs";
                if (a.includes("Payment") || a.includes("Cheque")) return "💳 Payments";
                if (a.includes("Return")) return "↩ Returns";
                if (a.includes("Expense")) return "💸 Expenses";
                return "📝 General";
              })() },
            ].map(function (row) {
              return (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 4px", borderBottom: "1px solid " + C.borderLight }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", minWidth: 150 }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: row.accent ? 800 : 600, color: row.accent ? C.accent : C.text, fontFamily: row.mono ? "monospace" : "inherit", background: row.accent ? C.accentSoft : "transparent", padding: row.accent ? "2px 8px" : "0", borderRadius: row.accent ? 5 : 0, textAlign: "right", maxWidth: 280, wordBreak: "break-all" }}>{row.val}</span>
                </div>
              );
            })}
            {viewEntry.details && (
              <div style={{ marginTop: 12, background: "#f7f9ff", borderRadius: 9, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>Additional Details</div>
                <pre style={{ fontSize: 12, color: C.text, margin: 0, whiteSpace: "pre-wrap", fontFamily: "monospace" }}>{typeof viewEntry.details === "object" ? JSON.stringify(viewEntry.details, null, 2) : String(viewEntry.details)}</pre>
              </div>
            )}
          </div>
          <div style={{ marginTop: 14 }}>
            <Btn col="gray" onClick={function () { setViewEntry(null); }}>Close</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AuditLog;
