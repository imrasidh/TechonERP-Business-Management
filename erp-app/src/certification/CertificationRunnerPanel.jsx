/**
 * Settings → Developer Tools → Certification Runner UI
 */
import React, { useState } from "react";
import { runCertification, getAllSuites } from "./runner/runCertification.js";

export default function CertificationRunnerPanel(props) {
  var C = props.C || {};
  var suites = getAllSuites();
  var [selected, setSelected] = useState(function () {
    var m = {};
    suites.forEach(function (s) { m[s.id] = true; });
    return m;
  });
  var [busy, setBusy] = useState(false);
  var [progress, setProgress] = useState(null);
  var [report, setReport] = useState(null);
  var [error, setError] = useState("");

  var toggle = function (id) {
    setSelected(function (prev) {
      var next = Object.assign({}, prev);
      next[id] = !next[id];
      return next;
    });
  };

  var selectAll = function (on) {
    var m = {};
    suites.forEach(function (s) { m[s.id] = on; });
    setSelected(m);
  };

  var run = function (suiteIds) {
    if (busy) return;
    setBusy(true);
    setError("");
    setReport(null);
    setProgress({ phase: "Starting…", pct: 1, passed: 0, failed: 0 });

    setTimeout(function () {
      runCertification({
        suiteIds: suiteIds,
        onProgress: function (p) { setProgress(p); },
      }).then(function (out) {
        setReport(out);
        setBusy(false);
        setProgress({ phase: "Complete", pct: 100, passed: out.totalPassed, failed: out.totalFailed });
      }).catch(function (e) {
        setBusy(false);
        setError((e && e.message) || String(e));
        setProgress(null);
      });
    }, 30);
  };

  var runSelected = function () {
    var ids = suites.filter(function (s) { return selected[s.id]; }).map(function (s) { return s.id; });
    if (!ids.length) {
      if (typeof props.showAlert === "function") props.showAlert("Select at least one suite.");
      return;
    }
    run(ids);
  };

  var runOne = function (id) {
    run([id]);
  };

  var downloadReport = function () {
    if (!report) return;
    var blob = new Blob([report.reportText || ""], { type: "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "techon-certification-report-" + new Date().toISOString().slice(0, 10) + ".txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text || "#0f172a" }}>Certification Runner</div>
        <div style={{ fontSize: 12, color: C.muted || "#64748b", marginTop: 4, maxWidth: 740, lineHeight: 1.45 }}>
          Automated regression suites that execute business workflows through production document shapes
          and verify books with the live GL / inventory engines. Does not bypass validations.
        </div>
      </div>

      <div style={{
        display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
        padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0",
      }}>
        <button type="button" disabled={busy} onClick={function () { run(null); }}
          style={btnStyle(busy ? "#94a3b8" : "#2563eb", "#fff")}>
          {busy ? "Running…" : "Run All Suites"}
        </button>
        <button type="button" disabled={busy} onClick={runSelected}
          style={btnStyle("#fff", "#0f172a", "#cbd5e1")}>
          Run Selected
        </button>
        <button type="button" disabled={busy} onClick={function () { selectAll(true); }}
          style={btnStyle("#fff", "#334155", "#e2e8f0")}>Select All</button>
        <button type="button" disabled={busy} onClick={function () { selectAll(false); }}
          style={btnStyle("#fff", "#334155", "#e2e8f0")}>Clear</button>
        {report && (
          <button type="button" onClick={downloadReport} style={btnStyle("#fff", "#0f172a", "#cbd5e1")}>
            Download Report
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
        {suites.map(function (s) {
          return (
            <div key={s.id} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
              borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff",
            }}>
              <input type="checkbox" checked={!!selected[s.id]} disabled={busy}
                onChange={function () { toggle(s.id); }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{s.label}</div>
                <div style={{ fontSize: 10, color: "#64748b" }}>{s.tests.length} tests</div>
              </div>
              <button type="button" disabled={busy} onClick={function () { runOne(s.id); }}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer" }}>
                Run
              </button>
            </div>
          );
        })}
      </div>

      {progress && (
        <div style={{ padding: 12, borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
            <span style={{ fontWeight: 600, color: "#1e40af" }}>{progress.phase}</span>
            <span style={{ color: "#1e40af" }}>
              {Math.round(progress.pct || 0)}% · {progress.passed || 0}✓ {progress.failed || 0}✗
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "#dbeafe", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: Math.min(100, Math.max(0, progress.pct || 0)) + "%",
              background: (progress.failed || 0) > 0 ? "#dc2626" : "#2563eb",
              transition: "width 0.15s ease",
            }} />
          </div>
        </div>
      )}

      {error ? (
        <div style={{ padding: 12, borderRadius: 8, background: "#fef2f2", color: "#991b1b", fontSize: 13 }}>{error}</div>
      ) : null}

      {report && (
        <div style={{
          padding: 14, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Certification Report</div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 6,
              background: report.ok ? "#dcfce7" : "#fee2e2",
              color: report.ok ? "#166534" : "#991b1b",
            }}>
              {report.ok ? "ALL PASSED" : "FAILURES DETECTED"}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8, marginBottom: 12 }}>
            {report.suites.map(function (s) {
              return (
                <div key={s.id} style={{ padding: "8px 10px", borderRadius: 8, background: "#f8fafc" }}>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>{s.label}</div>
                  <div style={{ fontSize: 12, marginTop: 2 }}>
                    <span style={{ color: "#16a34a", fontWeight: 700 }}>{s.passed} Passed</span>
                    {" · "}
                    <span style={{ color: s.failed ? "#dc2626" : "#64748b", fontWeight: 700 }}>{s.failed} Failed</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{
            padding: 10, borderRadius: 8, background: report.ok ? "#f0fdf4" : "#fff7ed",
            fontSize: 13, fontWeight: 700, marginBottom: 10,
          }}>
            TOTAL — {report.totalPassed} Passed · {report.totalFailed} Failed
          </div>

          {report.failures && report.failures.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#991b1b", marginBottom: 6 }}>Failures</div>
              {report.failures.map(function (f, i) {
                return (
                  <div key={i} style={{
                    padding: 10, borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2",
                    marginBottom: 8, fontSize: 12,
                  }}>
                    <div style={{ fontWeight: 700 }}>{f.suiteLabel} — {f.name}</div>
                    <div style={{ marginTop: 4 }}><strong>Reason:</strong> {f.reason}</div>
                    {f.expected != null && (
                      <div><strong>Expected:</strong> {typeof f.expected === "string" ? f.expected : JSON.stringify(f.expected)}</div>
                    )}
                    {f.actual != null && (
                      <div><strong>Actual:</strong> {typeof f.actual === "string" ? f.actual : JSON.stringify(f.actual)}</div>
                    )}
                    {f.stack && (
                      <pre style={{
                        marginTop: 6, fontSize: 10, whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto",
                        background: "#fff", padding: 6, borderRadius: 4,
                      }}>{f.stack}</pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <pre style={{
            marginTop: 10, fontSize: 11, background: "#0f172a", color: "#e2e8f0",
            padding: 12, borderRadius: 8, overflow: "auto", maxHeight: 280, whiteSpace: "pre-wrap",
          }}>{report.reportText}</pre>
        </div>
      )}
    </div>
  );
}

function btnStyle(bg, color, border) {
  return {
    padding: "9px 14px",
    borderRadius: 8,
    border: border ? ("1px solid " + border) : "none",
    background: bg,
    color: color,
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  };
}
