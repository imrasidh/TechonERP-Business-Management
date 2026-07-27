import React, { useState } from "react";
import { buildCertificationDataset, CERT_ADMIN_PASSWORD } from "./buildCertificationDataset.js";
import { CERT_DATASET_SIZES } from "./sizes.js";
import { validateJsonBackupPayload } from "../productionConfig.js";

/**
 * Settings → Developer Tools → Certification Dataset Generator
 */
var REPLACE_PHRASE = "REPLACE";

export default function CertificationDatasetPanel(props) {
  var C = props.C || {};
  var showAlert = typeof props.showAlert === "function" ? props.showAlert : function () {};
  var applyBackupRestore = typeof props.applyBackupRestore === "function" ? props.applyBackupRestore : null;
  var buildCurrentBackup = typeof props.buildCurrentBackup === "function" ? props.buildCurrentBackup : null;

  var [businessType, setBusinessType] = useState("computer_shop");
  var [country, setCountry] = useState("Sri Lanka");
  var [currency, setCurrency] = useState("Rs");
  var [costing, setCosting] = useState("wac");
  var [taxMode, setTaxMode] = useState("OFF");
  var [taxPercent, setTaxPercent] = useState("15");
  var [negativeStock, setNegativeStock] = useState("block");
  var [datasetSize, setDatasetSize] = useState("medium");
  var [busy, setBusy] = useState(false);
  var [progress, setProgress] = useState(null);
  var [result, setResult] = useState(null);
  var [lastBackup, setLastBackup] = useState(null);
  var [error, setError] = useState("");
  var [replaceOpen, setReplaceOpen] = useState(false);
  var [replaceConfirm, setReplaceConfirm] = useState("");

  var downloadJson = function (backup, filename) {
    var blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  var runGenerate = function () {
    if (busy) return;
    if (businessType !== "computer_shop") {
      showAlert("Only Computer Shop is available in Phase 1.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    setProgress({ phase: "Starting…", pct: 1 });

    var opts = {
      businessType: businessType,
      country: country,
      currency: currency,
      inventoryCosting: costing,
      taxEnabled: taxMode === "ON",
      taxPercent: parseFloat(taxPercent) || 15,
      negativeStock: negativeStock,
      datasetSize: datasetSize,
    };

    /* Yield to UI so progress paints */
    setTimeout(function () {
      buildCertificationDataset(opts, function (p) {
        setProgress(p);
      }).then(function (out) {
        setLastBackup(out.backup);
        setResult(out);
        setBusy(false);
        setProgress({ phase: "Complete", pct: 100 });
      }).catch(function (e) {
        setBusy(false);
        setError((e && e.message) || String(e));
        setProgress(null);
      });
    }, 40);
  };

  var downloadBackup = function () {
    if (!lastBackup) return;
    if (!validateJsonBackupPayload(lastBackup)) {
      showAlert("Generated backup failed validation — not downloaded.");
      return;
    }
    var ts = new Date().toISOString().slice(0, 10);
    var size = (result && result.summary && result.summary.datasetSize) || datasetSize;
    downloadJson(lastBackup, "techon-certification-dataset-" + String(size).toLowerCase() + "-" + ts + ".json");
  };

  var restoreIntoCompany = function () {
    if (busy) return;
    if (!lastBackup || !applyBackupRestore) {
      showAlert("Restore is not available in this session.");
      return;
    }
    if (String(replaceConfirm).trim().toUpperCase() !== REPLACE_PHRASE) {
      showAlert('Type ' + REPLACE_PHRASE + " to confirm replacing this company's data.");
      return;
    }
    var safety = null;
    try {
      safety = buildCurrentBackup ? buildCurrentBackup() : null;
    } catch (eSafety) {
      safety = null;
    }
    if (!safety) {
      showAlert("Safety backup of the current company could not be created — restore cancelled.");
      return;
    }
    try {
      var ts = new Date().toISOString().split(":").join("-").split(".").join("-").slice(0, 19);
      downloadJson(safety, "techon-safety-before-cert-restore-" + ts + ".json");
    } catch (eDl) {
      showAlert("Safety backup could not be saved — restore cancelled.");
      return;
    }
    setBusy(true);
    Promise.resolve()
      .then(function () { return applyBackupRestore(lastBackup.data || lastBackup); })
      .then(function () {
        setBusy(false);
        setReplaceOpen(false);
        setReplaceConfirm("");
        showAlert("Certification dataset loaded. Login: admin / " + CERT_ADMIN_PASSWORD);
      })
      .catch(function (e) {
        setBusy(false);
        showAlert("Restore failed: " + ((e && e.message) || String(e)));
      });
  };

  var fieldStyle = {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 160,
    flex: "1 1 160px",
  };
  var labelStyle = { fontSize: 11, fontWeight: 600, color: C.muted || "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" };
  var selectStyle = {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid " + (C.border || "#e2e8f0"),
    background: "#fff",
    fontSize: 13,
  };
  var inputStyle = selectStyle;

  var summary = result && result.summary;
  var verification = result && result.verification;
  var warnList = (result && result.warnings) || [];

  return (
    <div className="erp-cert-panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text || "#0f172a" }}>Certification Dataset Generator</div>
        <div style={{ fontSize: 12, color: C.muted || "#64748b", marginTop: 4, maxWidth: 720, lineHeight: 1.45 }}>
          Official TechonERP regression / release certification dataset. Generates a realistic interconnected
          computer sales &amp; repair company through production accounting and inventory engines.
          This is <strong>not</strong> demo or sample data.
        </div>
      </div>

      <div style={{
        display: "flex", flexWrap: "wrap", gap: 12,
        padding: 14, borderRadius: 10, background: "#f8fafc",
        border: "1px solid " + (C.border || "#e2e8f0"),
      }}>
        <label style={fieldStyle}>
          <span style={labelStyle}>Business Type</span>
          <select style={selectStyle} value={businessType} onChange={function (e) { setBusinessType(e.target.value); }} disabled={busy}>
            <option value="computer_shop">Computer Shop (Phase 1)</option>
            <option value="glass" disabled>Glass Industry (Future)</option>
            <option value="trading" disabled>General Trading (Future)</option>
          </select>
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Country</span>
          <input style={inputStyle} value={country} onChange={function (e) { setCountry(e.target.value); }} disabled={busy} />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Currency</span>
          <input style={inputStyle} value={currency} onChange={function (e) { setCurrency(e.target.value); }} disabled={busy} />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Inventory Costing</span>
          <select style={selectStyle} value={costing} onChange={function (e) { setCosting(e.target.value); }} disabled={busy}>
            <option value="wac">WAC</option>
            <option value="fifo">FIFO</option>
          </select>
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Tax</span>
          <select style={selectStyle} value={taxMode} onChange={function (e) { setTaxMode(e.target.value); }} disabled={busy}>
            <option value="OFF">OFF</option>
            <option value="ON">ON</option>
          </select>
        </label>
        {taxMode === "ON" && (
          <label style={fieldStyle}>
            <span style={labelStyle}>Tax %</span>
            <input style={inputStyle} type="number" min="0" max="100" step="0.01" value={taxPercent}
              onChange={function (e) { setTaxPercent(e.target.value); }} disabled={busy} />
          </label>
        )}
        <label style={fieldStyle}>
          <span style={labelStyle}>Negative Stock</span>
          <select style={selectStyle} value={negativeStock} onChange={function (e) { setNegativeStock(e.target.value); }} disabled={busy}>
            <option value="block">Block (default)</option>
            <option value="allow">Allow</option>
          </select>
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Dataset Size</span>
          <select style={selectStyle} value={datasetSize} onChange={function (e) { setDatasetSize(e.target.value); }} disabled={busy}>
            {Object.keys(CERT_DATASET_SIZES).map(function (k) {
              var s = CERT_DATASET_SIZES[k];
              return <option key={k} value={k}>{s.label} ({s.months} mo · ~{s.sales} sales)</option>;
            })}
          </select>
        </label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          className="erp-btn"
          disabled={busy}
          onClick={runGenerate}
          style={{
            padding: "10px 16px", borderRadius: 8, border: "none", cursor: busy ? "wait" : "pointer",
            background: busy ? "#94a3b8" : (C.accent || "#2563eb"), color: "#fff", fontWeight: 700, fontSize: 13,
          }}
        >
          {busy ? "Generating…" : "Generate Certification Dataset"}
        </button>
        {lastBackup && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={downloadBackup}
              style={{
                padding: "10px 16px", borderRadius: 8, border: "1px solid #cbd5e1", cursor: "pointer",
                background: "#fff", fontWeight: 600, fontSize: 13,
              }}
            >
              Backup Company (Download JSON)
            </button>
            {applyBackupRestore && (
              <button
                type="button"
                disabled={busy}
                onClick={function () { setReplaceConfirm(""); setReplaceOpen(!replaceOpen); }}
                style={{
                  padding: "10px 16px", borderRadius: 8, border: "1px solid #f59e0b", cursor: "pointer",
                  background: "#fffbeb", color: "#92400e", fontWeight: 600, fontSize: 13,
                }}
              >
                Load into this company
              </button>
            )}
          </>
        )}
      </div>

      {lastBackup && applyBackupRestore && replaceOpen && (
        <div style={{ padding: 12, borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#991b1b", marginBottom: 4 }}>
            This permanently replaces every record in this company
          </div>
          <div style={{ fontSize: 12, color: "#7f1d1d", marginBottom: 8 }}>
            A safety backup of the current company is downloaded first; the restore is cancelled if it cannot be created.
            After the restore you must log in as <b>admin / {CERT_ADMIN_PASSWORD}</b> — change that password before using
            this installation for real business data.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              value={replaceConfirm}
              onChange={function (e) { setReplaceConfirm(e.target.value); }}
              placeholder={"Type " + REPLACE_PHRASE + " to confirm"}
              style={{ ...inputStyle, minWidth: 220 }}
            />
            <button
              type="button"
              disabled={busy || String(replaceConfirm).trim().toUpperCase() !== REPLACE_PHRASE}
              onClick={restoreIntoCompany}
              style={{
                padding: "10px 16px", borderRadius: 8, border: "none",
                cursor: String(replaceConfirm).trim().toUpperCase() === REPLACE_PHRASE && !busy ? "pointer" : "not-allowed",
                background: String(replaceConfirm).trim().toUpperCase() === REPLACE_PHRASE && !busy ? "#dc2626" : "#fca5a5",
                color: "#fff", fontWeight: 700, fontSize: 13,
              }}
            >
              {busy ? "Restoring…" : "Replace company data"}
            </button>
            <button
              type="button"
              onClick={function () { setReplaceOpen(false); setReplaceConfirm(""); }}
              style={{
                padding: "10px 16px", borderRadius: 8, border: "1px solid #cbd5e1", cursor: "pointer",
                background: "#fff", fontWeight: 600, fontSize: 13,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {progress && (
        <div style={{ padding: 12, borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
            <span style={{ fontWeight: 600, color: "#1e40af" }}>{progress.phase}</span>
            <span style={{ color: "#1e40af" }}>{Math.round(progress.pct || 0)}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "#dbeafe", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: Math.min(100, Math.max(0, progress.pct || 0)) + "%",
              background: "#2563eb", transition: "width 0.2s ease",
            }} />
          </div>
          {progress.detail ? <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>{progress.detail}</div> : null}
        </div>
      )}

      {error ? (
        <div style={{ padding: 12, borderRadius: 8, background: "#fef2f2", color: "#991b1b", fontSize: 13 }}>{error}</div>
      ) : null}

      {summary && (
        <div style={{
          padding: 14, borderRadius: 10, background: "#fff",
          border: "1px solid " + (C.border || "#e2e8f0"),
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Summary report</div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 6,
              background: verification && verification.ok ? "#dcfce7" : "#fee2e2",
              color: verification && verification.ok ? "#166534" : "#991b1b",
            }}>
              {verification && verification.ok ? "VERIFICATION PASSED" : "VERIFICATION FAILED"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, fontSize: 12 }}>
            {[
              ["Products", summary.products],
              ["Customers", summary.customers],
              ["Suppliers", summary.suppliers],
              ["Purchases", summary.purchases],
              ["Sales", summary.sales],
              ["Repairs", summary.repairs],
              ["Sales returns", summary.salesReturns],
              ["Purchase returns", summary.purchaseReturns],
              ["Expenses", summary.expenses],
              ["Cheques", summary.cheques],
              ["Quotations", summary.quotations],
              ["Opening cash", summary.currency + " " + Number(summary.openingCash || 0).toLocaleString()],
              ["Opening bank", summary.currency + " " + Number(summary.openingBank || 0).toLocaleString()],
              ["Inventory value", summary.currency + " " + Number(summary.totalInventoryValue || 0).toLocaleString()],
              ["Total sales", summary.currency + " " + Number(summary.totalSales || 0).toLocaleString()],
              ["Total purchases", summary.currency + " " + Number(summary.totalPurchases || 0).toLocaleString()],
              ["Profit (P&L)", summary.profit != null ? (summary.currency + " " + Number(summary.profit).toLocaleString()) : "—"],
              ["Costing", summary.inventoryCosting],
              ["Tax", summary.tax],
              ["Size", summary.datasetSize],
            ].map(function (row) {
              return (
                <div key={row[0]} style={{ padding: "8px 10px", background: "#f8fafc", borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>{row[0]}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{row[1]}</div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>
            Restore login: <strong>admin</strong> / <strong>{CERT_ADMIN_PASSWORD}</strong>
          </div>
        </div>
      )}

      {verification && Array.isArray(verification.checks) && (
        <div style={{ padding: 14, borderRadius: 10, border: "1px solid " + (C.border || "#e2e8f0") }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Verification checks</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflow: "auto" }}>
            {verification.checks.map(function (c) {
              return (
                <div key={c.code} style={{ fontSize: 12, display: "flex", gap: 8 }}>
                  <span style={{ color: c.ok ? "#16a34a" : "#dc2626", fontWeight: 700, width: 14 }}>{c.ok ? "✓" : "✗"}</span>
                  <span style={{ color: c.ok ? "#334155" : "#991b1b" }}>{c.message}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {warnList.length > 0 && (
        <div style={{ padding: 12, borderRadius: 10, background: "#fffbeb", border: "1px solid #fcd34d" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>Warnings ({warnList.length})</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#78350f", maxHeight: 160, overflow: "auto" }}>
            {warnList.slice(0, 40).map(function (w, idx) {
              return <li key={idx}>{w}</li>;
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
