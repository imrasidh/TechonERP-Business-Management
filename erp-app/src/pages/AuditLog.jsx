import React, { useState, useEffect } from "react";

import { LIST_PAGE_SIZE } from "../utils/listPage.js";
import { SourceDocLink } from "../components/SourceDocLink.jsx";
import { auditEntryNav } from "../utils/sourceDocumentNav.js";

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
  var state = props.state || {};
  var openSourceDocument = props.openSourceDocument;
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

  var saleEvents = log.filter(function (e) { return e.action.includes("Sale"); }).length;
  var purchaseEvents = log.filter(function (e) { return e.action.includes("Purchase"); }).length;
  var paymentEvents = log.filter(function (e) { return e.action.includes("Payment"); }).length;
  var totalPages = Math.max(1, Math.ceil(filtered.length / AUDIT_PAGE_SIZE));

  return (
    <div className="erp-page erp-arap-modern is-audit">
      <div className="erp-arap-chrome">
        <div className="erp-arap-topbar">
          <div className="erp-arap-topbar-brand">
            <div className="erp-arap-brand-ico" aria-hidden="true">AL</div>
            <div>
              <h1 className="erp-arap-header-title">Audit Log</h1>
              <p className="erp-arap-header-sub">Activity trail · sales, purchases &amp; payments</p>
            </div>
          </div>
          <div className="erp-arap-kpi-row" aria-label="Audit totals">
            <div className="erp-arap-kpi is-slate">
              <span className="erp-arap-kpi-lbl">Total entries</span>
              <span className="erp-arap-kpi-val">{log.length}</span>
              <span className="erp-arap-kpi-sub">all recorded actions</span>
            </div>
            <div className="erp-arap-kpi is-blue">
              <span className="erp-arap-kpi-lbl">Sale events</span>
              <span className="erp-arap-kpi-val">{saleEvents}</span>
              <span className="erp-arap-kpi-sub">creates + edits</span>
            </div>
            <div className="erp-arap-kpi is-purple">
              <span className="erp-arap-kpi-lbl">Purchase events</span>
              <span className="erp-arap-kpi-val">{purchaseEvents}</span>
              <span className="erp-arap-kpi-sub">creates + edits</span>
            </div>
            <div className="erp-arap-kpi is-green">
              <span className="erp-arap-kpi-lbl">Payment events</span>
              <span className="erp-arap-kpi-val">{paymentEvents}</span>
              <span className="erp-arap-kpi-sub">receivables + payables</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button type="button" className="erp-arap-btn-clear" onClick={refresh}>Refresh</button>
            <button type="button" className="erp-arap-add is-out" onClick={clearLog} style={{ background: "linear-gradient(180deg,#f87171 0%,#b91c1c 100%)" }}>
              <span className="erp-arap-add-ico" aria-hidden="true">×</span>
              <span>Clear Log</span>
            </button>
          </div>
        </div>
        <div className="erp-arap-tabs" role="tablist" aria-label="Audit action filters">
          {ACTION_TYPES.map(function (t) {
            var active = filterType === t;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={active}
                className={"erp-arap-tab" + (active ? " is-active" : "")}
                onClick={function () { setFilterType(t); }}
              >
                <span>{t}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="erp-arap-body">
        <div className="erp-arap-panel">
          <div className="erp-arap-toolbar">
            <div className="erp-arap-search-wrap">
              <input
                className="erp-arap-field"
                value={search}
                onChange={function (e) { setSearch(e.target.value); }}
                placeholder="Search action or reference…"
                aria-label="Search audit log"
              />
            </div>
            {search ? (
              <button type="button" className="erp-arap-btn-clear" onClick={function () { setSearch(""); }}>Clear</button>
            ) : null}
            <span className="erp-arap-filter-meta">{filtered.length} shown · {log.length} total</span>
          </div>
          <div className="erp-arap-table-wrap">
            <table className="erp-arap-table">
              <thead>
                <tr>
                  <th style={{ width: "22%" }}>Timestamp</th>
                  <th style={{ width: "34%" }}>Action</th>
                  <th style={{ width: "22%" }}>Reference</th>
                  <th style={{ width: "12%" }}>User</th>
                  <th style={{ width: "10%" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="erp-arap-empty">
                      {log.length === 0 ? "No audit entries yet. Actions will be logged as you use the ERP." : "No matching entries found."}
                    </td>
                  </tr>
                )}
                {filtered.slice(auditPage * AUDIT_PAGE_SIZE, (auditPage + 1) * AUDIT_PAGE_SIZE).map(function (e) {
                  var color = ACTION_COLOR(e.action);
                  return (
                    <tr key={e.id} className="table-row-hover" style={{ cursor: "pointer" }} onClick={function () { setViewEntry(e); }}>
                      <td style={{ whiteSpace: "nowrap", color: "#64748b", fontSize: 12 }}>{e.timestamp}</td>
                      <td>
                        <span className="erp-arap-action-tone" style={{ color: color }}>
                          <span aria-hidden="true">{ACTION_ICON(e.action)}</span>
                          {e.action}
                        </span>
                      </td>
                      <td onClick={function (ev) { ev.stopPropagation(); }}>
                        <SourceDocLink
                          nav={auditEntryNav(e, state, S)}
                          label={e.reference || "—"}
                          openSourceDocument={openSourceDocument}
                          className="erp-stmt-ref-btn erp-arap-ref-pill"
                        />
                      </td>
                      <td style={{ color: "#64748b" }}>{e.user || "Admin"}</td>
                      <td style={{ color: "var(--arap-accent)", fontWeight: 700, fontSize: 11 }}>View →</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > AUDIT_PAGE_SIZE ? (
            <div className="erp-arap-foot">
              <span className="erp-arap-filter-meta">
                Showing {auditPage * AUDIT_PAGE_SIZE + 1}–{Math.min((auditPage + 1) * AUDIT_PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button type="button" className="erp-arap-btn-clear" disabled={auditPage === 0} onClick={function () { setAuditPage(0); }}>«</button>
                <button type="button" className="erp-arap-btn-clear" disabled={auditPage === 0} onClick={function () { setAuditPage(function (p) { return Math.max(0, p - 1); }); }}>Prev</button>
                <span className="erp-arap-filter-meta">Page {auditPage + 1} / {totalPages}</span>
                <button type="button" className="erp-arap-btn-clear" disabled={(auditPage + 1) * AUDIT_PAGE_SIZE >= filtered.length} onClick={function () { setAuditPage(function (p) { return Math.min(totalPages - 1, p + 1); }); }}>Next</button>
                <button type="button" className="erp-arap-btn-clear" disabled={(auditPage + 1) * AUDIT_PAGE_SIZE >= filtered.length} onClick={function () { setAuditPage(totalPages - 1); }}>»</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

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
