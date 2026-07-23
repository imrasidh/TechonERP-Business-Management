import React, { useState, useMemo, useEffect, useRef } from "react";
import { ActBtn, ActBtnGroup } from "../components/ActBtn.jsx";
import {
  COD_DELIVERY_STATUSES,
  COD_WITHDRAWAL_FUNDS,
  codWithdrawalFundLabel,
  withdrawalFund,
  computeCodFundBalances,
  sumWithdrawalsByFund,
  ensureCodProfitSettings,
  isCodStatusLocked,
  partnerProfitBreakdown,
  recalcCodRecordProfit,
  computeShareholderBalances,
  emptyShareholder,
  emptyCodProfitSettings,
  hydrateProfitSettings,
  activeShareholders,
  shareholderInvestmentPct,
  sumShareholderInvestments,
  withdrawalMatchesMonth,
  currentMonthKey,
  activeCodRecords,
  getPaidItemsCost,
  summarizeCodPoolBalance,
} from "../utils/codTracking.js";
import { LIST_PAGE_SIZE, sortNewestFirst } from "../utils/listPage.js";
import { isCodCostProfitEnabled } from "../utils/featureFlags.js";
import { printCodAddressLabel, codAddressLabelTotal, buildCodAddressLabelHtml, codAddressLabelStyleTag } from "../utils/codAddressLabelPrint.js";
import CloseIconButton from "../components/CloseIconButton.jsx";
import { modalShellStyle, modalBodyStyle } from "../components/modalChrome.js";
import { stampUpdatedAt } from "../utils/stampUpdatedAt.js";

var STATUS_COLORS = { Accepted: "#2979ff", Dispatched: "#f59e0b", Delivered: "#16a34a", Returned: "#dc2626", All: "#64748b" };

var CodDatabase = function (props) {
  var state = props.state;
  var setState = props.setState;
  var S = props.S;
  var uid = props.uid;
  var today = props.today;
  var fmtNum = props.fmtNum;
  var fmtDate = props.fmtDate;
  var getCurrencySymbol = props.getCurrencySymbol;
  var showAlert = props.showAlert;
  var showConfirm = props.showConfirm;
  var addAudit = props.addAudit;
  var tcTrialGuard = props.tcTrialGuard;
  var pwMatchesAsync = props.pwMatchesAsync;
  var isNetworkClient = props.isNetworkClient;
  var businessType = props.businessType;
  var getBusinessProfile = props.getBusinessProfile;
  var C = props.C;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var StatCard = props.StatCard;
  var Btn = props.Btn;
  var Input = props.Input;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var Sel = props.Sel;
  var usePager = props.usePager;
  var Pager = props.Pager;

  var sym = getCurrencySymbol();
  var shopName = (state.settings && state.settings.shopName) || "Shop";
  var netRole = (props.systemConfig && props.systemConfig.role) || (isNetworkClient ? "network_client" : "standalone");
  var costProfitEnabled = isCodCostProfitEnabled(
    state.settings,
    businessType,
    getBusinessProfile ? getBusinessProfile() : null,
    netRole,
    props.currentUserRole
  );
  var [tab, setTab] = useState("tracker");
  var [financeSubTab, setFinanceSubTab] = useState("breakdown");
  var focusPartnerIdRef = useRef(null);
  var partnerEditAtRef = useRef(0);
  var [partnerLocalSettings, setPartnerLocalSettings] = useState(null);
  var [search, setSearch] = useState("");
  var [statusFilter, setStatusFilter] = useState("All");
  var [editRow, setEditRow] = useState(null);
  var [editRowOrigStatus, setEditRowOrigStatus] = useState("");
  var [statusPwModal, setStatusPwModal] = useState(null);
  var [statusPwEntry, setStatusPwEntry] = useState("");
  var [statusPwErr, setStatusPwErr] = useState("");
  var [withdrawMonth, setWithdrawMonth] = useState(function () { return currentMonthKey(today && today()); });
  var [wdForm, setWdForm] = useState(function () {
    return { shareholderId: "", withdrawFrom: "paidItems", date: today ? today() : "", amount: "", note: "" };
  });
  var [wdQuickPayee, setWdQuickPayee] = useState("");
  var [labelPreview, setLabelPreview] = useState(null);
  var [wdModal, setWdModal] = useState(null);
  var [wdFilterFund, setWdFilterFund] = useState("all");
  var [wdFilterPartner, setWdFilterPartner] = useState("");
  var [showPartnerDetail, setShowPartnerDetail] = useState(false);

  var gridTableStyle = function (fontSize) {
    return { width: "100%", borderCollapse: "collapse", fontSize: fontSize || 12, border: "1px solid " + C.border };
  };
  var gridCell = { border: "1px solid " + C.border, padding: "6px 8px", verticalAlign: "middle" };
  var gridHead = Object.assign({}, gridCell, { background: "#f8fafc", fontWeight: 800, fontSize: 10 });
  var shortInvoiceNo = function (no) {
    var s = String(no || "—");
    if (s.length <= 18) return s;
    return s.slice(0, 12) + "…" + s.slice(-4);
  };

  useEffect(function () {
    if (!costProfitEnabled && (tab === "finance" || tab === "partners")) setTab("tracker");
  }, [costProfitEnabled, tab]);

  var records = activeCodRecords(state.codRecords || S.get("tc3_codRecords", []) || [], state.sales || []);
  var withdrawals = state.codWithdrawals || S.get("tc3_codWithdrawals", []) || [];
  var profitSettings = useMemo(function () {
    var raw = state.codProfitSettings;
    if (!raw || typeof raw !== "object") {
      raw = S.get("tc3_codProfitSettings", null);
    }
    if (!raw || typeof raw !== "object") {
      raw = emptyCodProfitSettings();
    }
    return hydrateProfitSettings(raw);
  }, [state.codProfitSettings]);
  /* While Saving/sync pulls, keep the last local partner edit so rows don't vanish/reappear. */
  var liveProfitSettings = (partnerLocalSettings
    && (Date.now() - partnerEditAtRef.current) < 20000)
    ? partnerLocalSettings
    : profitSettings;
  var shareholders = liveProfitSettings.shareholders || [];
  var sortedShareholders = useMemo(function () {
    return shareholders.slice().sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
  }, [shareholders]);
  var totalInvestment = Number(liveProfitSettings.totalInvestment) || 0;
  var investedSum = sumShareholderInvestments(shareholders);

  useEffect(function () {
    if (!partnerLocalSettings) return;
    if ((Date.now() - partnerEditAtRef.current) < 20000) return;
    setPartnerLocalSettings(null);
  }, [profitSettings, partnerLocalSettings]);

  useEffect(function () {
    if (state.codProfitSettings) return;
    var stored = S.get("tc3_codProfitSettings", null);
    if (stored && typeof stored === "object") {
      setState(function (st) {
        if (st.codProfitSettings) return st;
        return Object.assign({}, st, {
          codProfitSettings: hydrateProfitSettings(stored),
          codPartners: (stored.shareholders || []).slice(),
        });
      });
      return;
    }
    var ensured = ensureCodProfitSettings(S);
    setState(function (st) {
      if (st.codProfitSettings) return st;
      return Object.assign({}, st, {
        codProfitSettings: ensured,
        codPartners: (ensured.shareholders || []).slice(),
      });
    });
  }, [state.codProfitSettings]);

  useEffect(function () {
    var id = focusPartnerIdRef.current;
    if (!id) return;
    focusPartnerIdRef.current = null;
    var el = document.querySelector('input[data-partner-field="name"][data-partner-id="' + id + '"]');
    if (el && typeof el.focus === "function") {
      el.focus();
      if (typeof el.select === "function") el.select();
    }
  }, [sortedShareholders]);

  var applyProfitSettings = function (buildNext) {
    var hydratedOut = null;
    setState(function (st) {
      var current = hydrateProfitSettings(st.codProfitSettings || S.get("tc3_codProfitSettings", null) || emptyCodProfitSettings());
      var merged = buildNext(current);
      var hydrated = hydrateProfitSettings(merged);
      hydrated.updatedAt = new Date().toISOString();
      hydratedOut = hydrated;
      /* Write settings first (UI source of truth), then legacy partners mirror. */
      S.set("tc3_codProfitSettings", hydrated);
      S.set("tc3_codPartners", hydrated.shareholders.slice());
      return Object.assign({}, st, {
        codProfitSettings: hydrated,
        codPartners: hydrated.shareholders.slice(),
      });
    });
    if (hydratedOut) {
      partnerEditAtRef.current = Date.now();
      setPartnerLocalSettings(hydratedOut);
    }
  };

  var updateSettings = function (patch) {
    applyProfitSettings(function (current) { return Object.assign({}, current, patch); });
  };

  var updateShareholder = function (shId, patch) {
    applyProfitSettings(function (current) {
      var nextSh = (current.shareholders || []).map(function (sh) {
        if (sh.id !== shId) return sh;
        var merged = Object.assign({}, sh, patch);
        if (patch.userSharePercentage != null) {
          var pct = Number(patch.userSharePercentage);
          if (isNaN(pct)) pct = 0;
          merged.userSharePercentage = pct;
          merged.partnerSharePercentage = Math.max(0, 100 - pct);
        }
        return stampUpdatedAt(merged);
      });
      return Object.assign({}, current, { shareholders: nextSh });
    });
  };

  var commitPartnerText = function (shId, field, raw) {
    if (field === "name") {
      updateShareholder(shId, { name: String(raw == null ? "" : raw) });
      return;
    }
    var n = String(raw == null ? "" : raw).trim() === "" ? 0 : parseFloat(raw);
    if (isNaN(n)) n = 0;
    var patch = {};
    patch[field] = n;
    updateShareholder(shId, patch);
  };

  var addShareholder = function () {
    var sh = emptyShareholder(uid());
    sh.sortOrder = shareholders.length + 1;
    focusPartnerIdRef.current = sh.id;
    applyProfitSettings(function (current) {
      return Object.assign({}, current, { shareholders: (current.shareholders || []).concat([stampUpdatedAt(sh)]) });
    });
  };

  var persistRecords = function (next) {
    var cur = state.codRecords || S.get("tc3_codRecords", []) || [];
    if (next.length > cur.length && typeof tcTrialGuard === "function" && !tcTrialGuard(cur, "codRecords")) return;
    S.set("tc3_codRecords", next);
    setState(function (st) { return Object.assign({}, st, { codRecords: next }); });
  };

  var persistWithdrawals = function (next) {
    var cur = state.codWithdrawals || S.get("tc3_codWithdrawals", []) || [];
    if (next.length > cur.length && typeof tcTrialGuard === "function" && !tcTrialGuard(cur, "codWithdrawals")) return;
    S.set("tc3_codWithdrawals", next);
    setState(function (st) { return Object.assign({}, st, { codWithdrawals: next }); });
  };

  var removeShareholder = function (shId) {
    showConfirm("Remove this shareholder from profit sharing?", function () {
      applyProfitSettings(function (current) {
        return Object.assign({}, current, {
          shareholders: (current.shareholders || []).filter(function (sh) { return sh.id !== shId; }),
        });
      });
    });
  };

  var verifyAdminPassword = function (input) {
    if (!pwMatchesAsync) return Promise.resolve(false);
    if (isNetworkClient) {
      var st = S.get("tc3_settings", {}) || {};
      if (st.mainAdminPassHash) return pwMatchesAsync(input, st.mainAdminPassHash);
      return Promise.resolve(false);
    }
    var stored = S.get("tc3_apppass", "");
    if (!stored) return Promise.resolve(false);
    return pwMatchesAsync(input, stored);
  };

  var openEditRow = function (r) {
    setEditRow(Object.assign({}, r));
    setEditRowOrigStatus(r.deliveryStatus || "Accepted");
  };

  var applyStatusChange = function (newStatus) {
    if (!editRow) return;
    setEditRow(recalcCodRecordProfit(Object.assign({}, editRow, { deliveryStatus: newStatus })));
    setStatusPwModal(null);
    setStatusPwEntry("");
    setStatusPwErr("");
  };

  var requestStatusChange = function (newStatus) {
    if (!editRow || newStatus === editRow.deliveryStatus) return;
    if (isCodStatusLocked(editRowOrigStatus)) {
      setStatusPwModal({ newStatus: newStatus, fromStatus: editRowOrigStatus });
      setStatusPwEntry("");
      setStatusPwErr("");
      return;
    }
    applyStatusChange(newStatus);
  };

  var submitStatusPassword = function () {
    if (!statusPwModal) return;
    if (!statusPwEntry) {
      setStatusPwErr("Enter admin password.");
      return;
    }
    verifyAdminPassword(statusPwEntry).then(function (ok) {
      if (!ok) {
        setStatusPwErr("Incorrect password.");
        setStatusPwEntry("");
        return;
      }
      applyStatusChange(statusPwModal.newStatus);
      addAudit("COD status unlocked", (editRow && editRow.invoiceNo) || "");
    });
  };

  var filtered = useMemo(function () {
    var q = String(search || "").trim().toLowerCase();
    return sortNewestFirst(records.slice()).filter(function (r) {
      if (statusFilter !== "All" && r.deliveryStatus !== statusFilter) return false;
      if (!q) return true;
      var blob = [r.invoiceNo, r.customerName, r.customerPhone, r.altPhone, r.trackingNumber, r.customerAddress, r.itemsSummary].join(" ").toLowerCase();
      return blob.indexOf(q) >= 0;
    });
  }, [records, search, statusFilter]);

  var pager = usePager(filtered, LIST_PAGE_SIZE);
  var balanceRows = useMemo(function () {
    return computeShareholderBalances(liveProfitSettings, records, withdrawals);
  }, [liveProfitSettings, records, withdrawals]);

  var poolTotals = useMemo(function () {
    return summarizeCodPoolBalance(records, withdrawals, liveProfitSettings);
  }, [records, withdrawals, liveProfitSettings]);

  var fundBalances = useMemo(function () {
    return computeCodFundBalances(records, withdrawals, liveProfitSettings);
  }, [records, withdrawals, liveProfitSettings]);

  var wdSelectedFund = useMemo(function () {
    var fid = wdForm.withdrawFrom || "profit";
    return fundBalances.find(function (f) { return f.id === fid; }) || null;
  }, [wdForm.withdrawFrom, fundBalances]);

  var wdSelectedBalance = useMemo(function () {
    if (wdForm.withdrawFrom === "profit" && wdForm.shareholderId) {
      var row = balanceRows.find(function (b) { return b.shareholderId === wdForm.shareholderId; });
      return row ? row.canWithdrawMore : 0;
    }
    if (wdSelectedFund) return wdSelectedFund.remaining;
    return null;
  }, [wdForm.withdrawFrom, wdForm.shareholderId, balanceRows, wdSelectedFund]);

  var filteredWithdrawals = useMemo(function () {
    return sortNewestFirst(withdrawals.slice()).filter(function (w) {
      if (!withdrawalMatchesMonth(w, withdrawMonth)) return false;
      if (wdFilterFund !== "all" && withdrawalFund(w) !== wdFilterFund) return false;
      if (wdFilterPartner) {
        if (withdrawalFund(w) !== "profit" || w.shareholderId !== wdFilterPartner) return false;
      }
      return true;
    });
  }, [withdrawals, withdrawMonth, wdFilterFund, wdFilterPartner]);

  var saveEditRow = function () {
    if (!editRow) return;
    if (isCodStatusLocked(editRowOrigStatus) && editRow.deliveryStatus !== editRowOrigStatus) {
      showAlert("Changing status from " + editRowOrigStatus + " requires admin password. Use the status dropdown.");
      return;
    }
    var next = records.map(function (r) {
      if (r.id !== editRow.id) return r;
      return recalcCodRecordProfit(Object.assign({}, editRow, {
        courierCost: parseFloat(editRow.courierCost) || 0,
        otherCost: parseFloat(editRow.otherCost) || 0,
        updatedAt: new Date().toISOString(),
      }));
    });
    persistRecords(next);
    addAudit("COD record updated", editRow.invoiceNo || editRow.id);
    setEditRow(null);
    setEditRowOrigStatus("");
  };

  var deleteRow = function (row) {
    if (!row) return;
    showConfirm("Remove COD record for " + (row.invoiceNo || row.customerName) + "?\n\nThe original sale invoice is not deleted.", function () {
      var next = records.filter(function (r) { return r.id !== row.id; });
      persistRecords(next);
      addAudit("COD record removed", row.invoiceNo || row.id);
    });
  };

  var addWithdrawal = function () {
    var shId = wdForm.shareholderId;
    var fund = wdForm.withdrawFrom || "profit";
    var amt = parseFloat(wdForm.amount) || 0;
    if (fund === "profit" && !shId) { showAlert("Select a partner for partner profit withdrawal."); return; }
    if (amt <= 0) { showAlert("Enter withdrawal amount."); return; }
    var sh = shareholders.find(function (x) { return x.id === shId; });
    var funds = computeCodFundBalances(records, withdrawals, profitSettings);
    var fundRow = funds.find(function (f) { return f.id === fund; });
    var maxAmt = fundRow ? fundRow.remaining : 0;
    if (fund === "profit" && shId) {
      var bal = computeShareholderBalances(profitSettings, records, withdrawals);
      var row = bal.find(function (b) { return b.shareholderId === shId; });
      maxAmt = row ? row.canWithdrawMore : 0;
    }
    if (amt > maxAmt + 0.005) {
      showAlert("Amount exceeds available balance for " + codWithdrawalFundLabel(fund) + " (" + sym + " " + fmtNum(maxAmt) + " can withdraw more).");
      return;
    }
    var fundAfter = Math.round((maxAmt - amt) * 100) / 100;
    var payeeAfter = fundAfter;
    var entry = stampUpdatedAt({
      id: uid(),
      shareholderId: shId || "",
      shareholderName: fund === "profit" && sh ? sh.name : (fund === "yourProfit" ? shopName : "Shop"),
      withdrawFrom: fund,
      date: wdForm.date || today(),
      amount: amt,
      note: String(wdForm.note || "").trim(),
      balanceAfter: payeeAfter,
      fundBalanceAfter: fundAfter,
      createdAt: new Date().toISOString(),
    });
    var next = [entry].concat(withdrawals);
    persistWithdrawals(next);
    addAudit("COD withdrawal", codWithdrawalFundLabel(fund) + " " + sym + " " + fmtNum(amt));
    setWdModal(null);
    setWdForm({ shareholderId: "", withdrawFrom: fund, date: today(), amount: "", note: "" });
    showAlert("Withdrawal recorded.");
  };

  var openWithdrawModal = function (fund, shareholderId) {
    setWdForm({
      shareholderId: shareholderId || "",
      withdrawFrom: fund || "yourProfit",
      date: today ? today() : "",
      amount: "",
      note: "",
    });
    setWdModal({ fund: fund || "yourProfit" });
  };

  var removeWithdrawal = function (w) {
    showConfirm("Remove this withdrawal record?", function () {
      persistWithdrawals(withdrawals.filter(function (x) { return x.id !== w.id; }));
      addAudit("COD withdrawal removed", w.shareholderName + " " + sym + " " + fmtNum(w.amount));
    });
  };

  var openLabelPreview = function (record) {
    if (!record) return;
    var open = function () { setLabelPreview(Object.assign({}, record)); };
    if (!String(record.customerAddress || "").trim()) {
      showConfirm("Customer address is empty. Open print preview anyway?", open);
      return;
    }
    open();
  };

  var runLabelPrint = function (record) {
    if (!record) return;
    var ok = printCodAddressLabel(record, state.settings, function () {
      showAlert("Popup blocked. Allow popups to print the address label.");
    });
    if (ok) {
      addAudit("COD address label printed", record.invoiceNo || record.customerName);
      setLabelPreview(null);
    }
  };

  var addQuickPayee = function () {
    var name = String(wdQuickPayee || "").trim();
    if (!name) { showAlert("Enter payee name."); return; }
    var sh = stampUpdatedAt(Object.assign(emptyShareholder(uid()), { name: name, sortOrder: shareholders.length + 1 }));
    applyProfitSettings(function (current) {
      return Object.assign({}, current, { shareholders: (current.shareholders || []).concat([sh]) });
    });
    setWdForm(Object.assign({}, wdForm, { shareholderId: sh.id }));
    setWdQuickPayee("");
    addAudit("COD payee added", name);
  };

  var renderPartnersPanel = function () {
    var activeCount = shareholders.filter(function (sh) { return sh.isActive !== false; }).length;
    var investDiff = totalInvestment > 0 ? investedSum - totalInvestment : 0;
    return (
      <React.Fragment>
        <div className="erp-cod-partners-hero">
          {StatCard ? (
            <React.Fragment>
              <StatCard
                label="Partners"
                value={activeCount + " / " + shareholders.length}
                money={false}
                accent={C.blue || "#3b82f6"}
                valueColor={C.blue || "#1d4ed8"}
                icon="👥"
                sub={activeCount === shareholders.length ? "All active" : (activeCount + " active")}
              />
              <StatCard
                label="Total investment"
                value={totalInvestment}
                accent={C.purple || "#8b5cf6"}
                valueColor={C.purple || "#7c3aed"}
                icon="💰"
                sub="Capital base"
              />
              <StatCard
                label="Partners invested"
                value={investedSum}
                accent={totalInvestment > 0 && Math.abs(investDiff) > 0.01 ? (C.orange || "#f97316") : (C.green || "#16a34a")}
                valueColor={totalInvestment > 0 && Math.abs(investDiff) > 0.01 ? (C.orange || "#c2410c") : (C.green || "#047857")}
                icon="📈"
                sub={totalInvestment > 0 && Math.abs(investDiff) > 0.01
                  ? ((investDiff > 0 ? "+" : "") + sym + " " + fmtNum(investDiff) + " vs total")
                  : "Matches total"}
              />
            </React.Fragment>
          ) : (
            <React.Fragment>
              <div className="erp-cod-partners-stat">
                <span className="erp-cod-partners-stat-lbl">Partners</span>
                <span className="erp-cod-partners-stat-val">{activeCount}<span className="erp-cod-partners-stat-sub"> / {shareholders.length}</span></span>
              </div>
              <div className="erp-cod-partners-stat">
                <span className="erp-cod-partners-stat-lbl">Total investment</span>
                <span className="erp-cod-partners-stat-val">{sym} {fmtNum(totalInvestment)}</span>
              </div>
              <div className="erp-cod-partners-stat">
                <span className="erp-cod-partners-stat-lbl">Partners invested</span>
                <span className="erp-cod-partners-stat-val">{sym} {fmtNum(investedSum)}</span>
              </div>
            </React.Fragment>
          )}
        </div>

        <div className="erp-arap-toolbar erp-cod-partners-toolbar">
          <div className="erp-cod-filter-field">
            <label>Total investment ({sym})</label>
            <input
              key={"cod-total-inv-" + String(totalInvestment)}
              type="text"
              inputMode="decimal"
              className="erp-arap-field"
              defaultValue={totalInvestment ? String(totalInvestment) : ""}
              onBlur={function (e) {
                var raw = e.target.value;
                var n = String(raw || "").trim() === "" ? 0 : parseFloat(raw);
                if (isNaN(n)) n = 0;
                if (n !== totalInvestment) updateSettings({ totalInvestment: n });
              }}
              onKeyDown={function (e) {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              placeholder="e.g. 500000"
              style={{ width: 140 }}
            />
          </div>
          <button type="button" className="erp-arap-add is-cod" onClick={function (e) { e.preventDefault(); addShareholder(); }}>+ Add partner</button>
        </div>

        <div className="erp-arap-table-wrap">
          <table className="erp-arap-table erp-cod-partners-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="is-num">Invested</th>
                <th className="is-num">Old owed</th>
                <th className="is-num">Capital %</th>
                <th className="is-num">Shop %</th>
                <th className="is-num">Partner %</th>
                <th className="is-num">Can withdraw</th>
                <th style={{ width: 72 }}>Active</th>
                <th style={{ width: 64 }}></th>
              </tr>
            </thead>
            <tbody>
              {sortedShareholders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="erp-cod-table-empty">No partners yet. Click <strong>Add partner</strong> to start.</td>
                </tr>
              ) : (
                sortedShareholders.map(function (sh) {
                  var invPct = shareholderInvestmentPct(sh, totalInvestment);
                  var balRow = balanceRows.find(function (b) { return b.shareholderId === sh.id; });
                  var canWd = balRow ? balRow.canWithdrawMore : 0;
                  return (
                    <tr key={sh.id} className={sh.isActive === false ? "is-off" : ""}>
                      <td>
                        <input
                          type="text"
                          className="erp-arap-field erp-cod-partner-inp"
                          data-partner-id={sh.id}
                          data-partner-field="name"
                          defaultValue={sh.name || ""}
                          onBlur={function (e) {
                            var next = String(e.target.value || "");
                            if (next !== String(sh.name || "")) commitPartnerText(sh.id, "name", next);
                          }}
                          onKeyDown={function (e) {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                          }}
                          placeholder="Partner name"
                          autoComplete="off"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="erp-arap-field erp-cod-partner-inp is-num"
                          data-partner-id={sh.id}
                          data-partner-field="investmentAmount"
                          defaultValue={sh.investmentAmount ? String(sh.investmentAmount) : ""}
                          onBlur={function (e) {
                            var raw = e.target.value;
                            var n = String(raw || "").trim() === "" ? 0 : parseFloat(raw);
                            if (isNaN(n)) n = 0;
                            if (n !== (Number(sh.investmentAmount) || 0)) commitPartnerText(sh.id, "investmentAmount", raw);
                          }}
                          onKeyDown={function (e) {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                          }}
                          placeholder="0"
                          autoComplete="off"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="erp-arap-field erp-cod-partner-inp is-num"
                          data-partner-id={sh.id}
                          data-partner-field="openingBalanceOwed"
                          defaultValue={sh.openingBalanceOwed ? String(sh.openingBalanceOwed) : ""}
                          onBlur={function (e) {
                            var raw = e.target.value;
                            var n = String(raw || "").trim() === "" ? 0 : parseFloat(raw);
                            if (isNaN(n)) n = 0;
                            if (n !== (Number(sh.openingBalanceOwed) || 0)) commitPartnerText(sh.id, "openingBalanceOwed", raw);
                          }}
                          onKeyDown={function (e) {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                          }}
                          placeholder="0"
                          autoComplete="off"
                        />
                      </td>
                      <td className="erp-arap-amt">{totalInvestment > 0 ? (fmtNum(invPct) + "%") : "—"}</td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="erp-arap-field erp-cod-partner-inp is-num"
                          data-partner-id={sh.id}
                          data-partner-field="userSharePercentage"
                          defaultValue={sh.userSharePercentage != null ? String(sh.userSharePercentage) : "60"}
                          onBlur={function (e) {
                            var raw = e.target.value;
                            var n = String(raw || "").trim() === "" ? 0 : parseFloat(raw);
                            if (isNaN(n)) n = 0;
                            if (n !== (Number(sh.userSharePercentage) || 0)) commitPartnerText(sh.id, "userSharePercentage", raw);
                          }}
                          onKeyDown={function (e) {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                          }}
                          placeholder="60"
                          autoComplete="off"
                        />
                      </td>
                      <td className="erp-arap-amt">{sh.partnerSharePercentage}%</td>
                      <td className="erp-arap-amt" style={{ fontWeight: 800, color: canWd > 0 ? "#1d4ed8" : "#94a3b8" }}>
                        {sym} {fmtNum(canWd)}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={sh.isActive !== false}
                          onChange={function (e) { updateShareholder(sh.id, { isActive: e.target.checked }); }}
                        />
                      </td>
                      <td>
                        <Btn sm col="red" type="button" onClick={function (e) { e.preventDefault(); e.stopPropagation(); removeShareholder(sh.id); }}>Remove</Btn>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="erp-cod-partners-foot">
          Capital % is from invested amount vs total investment. Shop / partner % split profit on each delivered order. Old owed = balance before COD tracking.
        </p>
      </React.Fragment>
    );
  };

  var renderCodPoolSummary = function () {
    var pt = poolTotals;
    var funds = pt.fundBalances || fundBalances;
    var costFunds = funds.filter(function (f) { return f.group === "cost"; });
    var shopFund = funds.find(function (f) { return f.id === "yourProfit"; });
    var partnerFund = funds.find(function (f) { return f.id === "profit"; });
    var shopTotal = shopFund ? shopFund.total : pt.yourProfitTotal;
    var shopRemaining = shopFund ? shopFund.remaining : pt.yourProfitRemaining;
    var shopWithdrawn = shopFund ? shopFund.withdrawn : pt.yourProfitWithdrawn;
    var partnerTotal = partnerFund ? partnerFund.total : (pt.totalOpeningOwed + pt.totalProfitOwed);
    var partnerRemaining = partnerFund ? partnerFund.remaining : pt.totalBalanceRemaining;
    var partnerWithdrawn = partnerFund ? partnerFund.withdrawn : sumWithdrawalsByFund(withdrawals, "profit");

    return (
      <div className="erp-cod-money">
        <div className="erp-cod-money-hero">
          <div className="erp-cod-money-hero-text">
            <span className="erp-cod-money-hero-lbl">Net profit · delivered COD</span>
            <span className="erp-cod-money-hero-val">{sym} {fmtNum(pt.netProfitDelivered)}</span>
            <span className="erp-cod-money-hero-sub">
              Shop {sym} {fmtNum(shopTotal)}
              <span className="erp-cod-dot">·</span>
              Partners {sym} {fmtNum(pt.totalProfitOwed)}
              {pt.totalOpeningOwed > 0 ? (
                <React.Fragment>
                  <span className="erp-cod-dot">·</span>
                  Old balance {sym} {fmtNum(pt.totalOpeningOwed)}
                </React.Fragment>
              ) : null}
            </span>
          </div>
        </div>

        <div className="erp-cod-money-grid">
          <div className="erp-cod-money-card is-shop">
            <div className="erp-cod-money-card-head">
              <span className="erp-cod-money-card-title">{shopName}</span>
              <button type="button" className="erp-cod-wd-btn" onClick={function () { openWithdrawModal("yourProfit"); }}>Withdraw</button>
            </div>
            <div className="erp-cod-money-card-avail">{sym} {fmtNum(shopRemaining)}</div>
            <div className="erp-cod-money-card-hint">Available to withdraw</div>
            <div className="erp-cod-money-card-meta">
              <span>Total <b>{sym} {fmtNum(shopTotal)}</b></span>
              <span>Out <b>{sym} {fmtNum(shopWithdrawn)}</b></span>
            </div>
          </div>

          <div className="erp-cod-money-card is-partner">
            <div className="erp-cod-money-card-head">
              <span className="erp-cod-money-card-title">Partners</span>
              <button type="button" className="erp-cod-wd-btn" onClick={function () { openWithdrawModal("profit"); }}>Withdraw</button>
            </div>
            <div className="erp-cod-money-card-avail">{sym} {fmtNum(partnerRemaining)}</div>
            <div className="erp-cod-money-card-hint">Available to withdraw</div>
            <div className="erp-cod-money-card-meta">
              <span>Owed <b>{sym} {fmtNum(partnerTotal)}</b></span>
              <span>Out <b>{sym} {fmtNum(partnerWithdrawn)}</b></span>
            </div>
            {balanceRows.length > 0 ? (
              <div className="erp-cod-partner-mini">
                <button
                  type="button"
                  className="erp-cod-partner-toggle"
                  onClick={function () { setShowPartnerDetail(function (v) { return !v; }); }}
                >
                  {showPartnerDetail ? "Hide partners" : "Show " + balanceRows.length + " partner" + (balanceRows.length === 1 ? "" : "s")}
                </button>
                {showPartnerDetail ? (
                  <ul className="erp-cod-partner-list">
                    {balanceRows.map(function (row) {
                      return (
                        <li key={"pd-" + row.shareholderId}>
                          <span className="erp-cod-partner-name">{row.name || "—"}</span>
                          <span className="erp-cod-partner-amt">{sym} {fmtNum(row.canWithdrawMore)}</span>
                          <button
                            type="button"
                            className="erp-cod-wd-btn is-tiny"
                            onClick={function () { openWithdrawModal("profit", row.shareholderId); }}
                          >
                            Pay
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            ) : (
              <div className="erp-cod-money-card-empty">No partners yet — add under Partners tab</div>
            )}
          </div>
        </div>

        <div className="erp-cod-cost-box">
          <div className="erp-cod-cost-box-title">Cost recovery</div>
          <div className="erp-cod-cost-rows">
            {costFunds.map(function (f) {
              return (
                <div key={f.id} className="erp-cod-cost-row">
                  <div className="erp-cod-cost-row-main">
                    <span className="erp-cod-cost-lbl" style={{ color: f.color || "#334155" }}>{f.label}</span>
                    <span className="erp-cod-cost-avail">{sym} {fmtNum(f.remaining)}</span>
                  </div>
                  <div className="erp-cod-cost-row-sub">
                    <span>Total {sym} {fmtNum(f.total)} · Out {sym} {fmtNum(f.withdrawn)}</span>
                    <button type="button" className="erp-cod-wd-btn is-tiny" onClick={function () { openWithdrawModal(f.id); }}>Withdraw</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  var activeSh = activeShareholders(liveProfitSettings);
  var statusCounts = useMemo(function () {
    var counts = { All: records.length };
    COD_DELIVERY_STATUSES.forEach(function (s) {
      counts[s] = records.filter(function (r) { return r.deliveryStatus === s; }).length;
    });
    return counts;
  }, [records]);

  return (
    <div className="erp-page erp-arap-modern is-cod">
      <div className="erp-arap-chrome">
        <div className="erp-arap-topbar">
          <div className="erp-arap-topbar-brand">
            <div className="erp-arap-brand-ico" aria-hidden="true">CD</div>
            <div>
              <h1 className="erp-arap-header-title">COD Database</h1>
              <p className="erp-arap-header-sub">Delivery tracker · costs &amp; profit</p>
            </div>
          </div>
          <div className="erp-arap-kpi-row" aria-label="COD status overview">
            {["All"].concat(COD_DELIVERY_STATUSES).map(function (s) {
              var count = statusCounts[s] || 0;
              var active = tab === "tracker" && statusFilter === s;
              var kpiTone = s === "Accepted" ? "is-blue"
                : s === "Dispatched" ? "is-orange"
                : s === "Delivered" ? "is-green"
                : s === "Returned" ? "is-red"
                : "is-purple";
              return (
                <div
                  key={s}
                  className={"erp-arap-kpi " + kpiTone}
                  role="button"
                  tabIndex={0}
                  onClick={function () { setTab("tracker"); setStatusFilter(s); }}
                  onKeyDown={function (e) {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTab("tracker"); setStatusFilter(s); }
                  }}
                  style={active ? { outline: "2px solid var(--arap-accent)", outlineOffset: 1 } : undefined}
                  title={"Show " + s}
                >
                  <span className="erp-arap-kpi-lbl">{s}</span>
                  <span className="erp-arap-kpi-val">{count}</span>
                  <span className="erp-arap-kpi-sub">{s === "All" ? "orders" : "status"}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="erp-arap-tabs" role="tablist" aria-label="COD main tabs">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "tracker"}
            className={"erp-arap-tab" + (tab === "tracker" ? " is-active" : "")}
            onClick={function () { setTab("tracker"); }}
          >
            <span>Tracker</span>
            <span className="erp-arap-tab-count">{records.length}</span>
          </button>
          {costProfitEnabled ? (
            <React.Fragment>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "finance"}
                className={"erp-arap-tab" + (tab === "finance" ? " is-active" : "")}
                onClick={function () { setTab("finance"); }}
              >
                <span>Costs &amp; profit</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "partners"}
                className={"erp-arap-tab" + (tab === "partners" ? " is-active" : "")}
                onClick={function () { setTab("partners"); }}
              >
                <span>Partners</span>
                <span className="erp-arap-tab-count">{shareholders.length}</span>
              </button>
            </React.Fragment>
          ) : null}
        </div>
        {tab === "tracker" ? (
          <div className="erp-arap-tabs is-sub" role="tablist" aria-label="Delivery status filter">
            {["All"].concat(COD_DELIVERY_STATUSES).map(function (s) {
              var active = statusFilter === s;
              return (
                <button
                  key={"st-" + s}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={"erp-arap-tab" + (active ? " is-active" : "")}
                  onClick={function () { setStatusFilter(s); }}
                >
                  <span>{s}</span>
                  <span className="erp-arap-tab-count">{statusCounts[s] || 0}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        {costProfitEnabled && tab === "finance" ? (
          <div className="erp-arap-tabs is-sub" role="tablist" aria-label="Finance sub tabs">
            {[
              ["breakdown", "Order costs"],
              ["withdrawals", "Withdrawals"],
              ["profitSplit", "Profit split"]
            ].map(function (t) {
              var active = financeSubTab === t[0];
              return (
                <button
                  key={t[0]}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={"erp-arap-tab" + (active ? " is-active" : "")}
                  onClick={function () { setFinanceSubTab(t[0]); }}
                >
                  <span>{t[1]}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="erp-arap-body">
      {tab === "tracker" && (
        <div className="erp-arap-panel">
          <div className="erp-arap-toolbar">
            <div className="erp-arap-search-wrap">
              <input
                className="erp-arap-field"
                value={search}
                onChange={function (e) { setSearch(e.target.value); }}
                placeholder="Search invoice, customer, tracking, address…"
                aria-label="Search COD records"
              />
            </div>
            {search ? (
              <button type="button" className="erp-arap-btn-clear" onClick={function () { setSearch(""); }}>Clear</button>
            ) : null}
            <span className="erp-arap-filter-meta">
              {statusFilter} · {filtered.length.toLocaleString()} orders
            </span>
          </div>
          <div className="erp-arap-table-wrap">
            {filtered.length === 0 ? (
              <div className="erp-arap-empty" style={{ padding: 28 }}>
                {records.length === 0
                  ? <span>No COD records yet. Enable <strong>COD track (Sales)</strong> in Settings → Modules.</span>
                  : <span>No records with status <strong>{statusFilter}</strong>.</span>}
              </div>
            ) : (
              <table className="erp-arap-table" style={{ minWidth: 980, tableLayout: "auto" }}>
                <thead>
                  <tr>
                    <th style={{ width: 78 }}>Date</th>
                    <th style={{ width: 110 }}>Invoice</th>
                    <th style={{ minWidth: 160 }}>Customer</th>
                    <th style={{ width: 64 }}>Type</th>
                    <th style={{ width: 90 }}>Track</th>
                    <th style={{ width: 92 }}>Status</th>
                    <th style={{ width: 88, textAlign: "right" }}>Sold</th>
                    <th style={{ width: 80, textAlign: "right" }}>Cost</th>
                    <th style={{ width: 72, textAlign: "right" }}>COD</th>
                    <th style={{ width: 84, textAlign: "right" }}>Profit</th>
                    <th style={{ width: 100 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pager.slice.map(function (r) {
                    var stColor = STATUS_COLORS[r.deliveryStatus] || C.muted;
                    var addr = String(r.customerAddress || "").trim();
                    var phoneLine = [r.customerPhone, r.altPhone ? ("alt " + r.altPhone) : ""].filter(Boolean).join(" · ");
                    return (
                      <tr key={r.id} className="table-row-hover">
                        <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.saleDate || r.createdAt)}</td>
                        <td className="erp-arap-ref" title={r.invoiceNo || ""}>{shortInvoiceNo(r.invoiceNo)}</td>
                        <td style={{ whiteSpace: "normal" }}>
                          <div className="erp-arap-src" style={{ fontSize: 12 }}>{r.customerName}</div>
                          {addr ? <div className="erp-arap-device-sub">{addr}</div> : null}
                          {phoneLine ? <div className="erp-arap-device-sub">{phoneLine}</div> : null}
                        </td>
                        <td style={{ fontSize: 11 }}>{r.saleType}</td>
                        <td style={{ fontSize: 11 }}>{r.trackingNumber || "—"}</td>
                        <td>
                          <span className="erp-cod-status" style={{ color: stColor, background: stColor + "18", borderColor: stColor + "44" }}>
                            {r.deliveryStatus}
                          </span>
                        </td>
                        <td className="erp-arap-amt">{sym} {fmtNum(r.soldTotal)}</td>
                        <td className="erp-arap-amt">{sym} {fmtNum(r.costTotal)}</td>
                        <td className="erp-arap-amt">{sym} {fmtNum(r.courierCost)}</td>
                        <td className="erp-arap-amt" style={{ fontWeight: 800, color: (r.netProfit || 0) >= 0 ? "#047857" : "#b91c1c" }}>
                          {sym} {fmtNum(r.netProfit)}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <ActBtnGroup gap={3}>
                            <ActBtn wide tone="orange" onClick={function () { openLabelPreview(r); }} title={"A5 label · " + sym + " " + fmtNum(codAddressLabelTotal(r))}>Label</ActBtn>
                            <ActBtn wide tone="blue" onClick={function () { openEditRow(r); }}>Edit</ActBtn>
                          </ActBtnGroup>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {filtered.length > 0 ? (
            <div className="erp-arap-foot">
              <div className="erp-arap-pager-wrap">
                <Pager pager={pager} />
              </div>
            </div>
          ) : null}
        </div>
      )}

      {costProfitEnabled && tab === "finance" && (
        <div className="erp-arap-panel">
          <div className="erp-cod-finance-scroll">
          {renderCodPoolSummary()}
          {financeSubTab === "breakdown" && (
            <React.Fragment>
              <div className="erp-cod-section-head">
                <h3>Order costs</h3>
                <p>Sold, paid, free, and COD cost per order.</p>
              </div>
              <div className="erp-arap-table-wrap" style={{ marginBottom: 10 }}>
                <table className="erp-arap-table erp-cod-fin-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Invoice</th>
                      <th>Customer</th>
                      <th>Items</th>
                      <th className="is-num">Sold</th>
                      <th className="is-num">Paid</th>
                      <th className="is-num">Free</th>
                      <th className="is-num">COD</th>
                      <th className="is-num">Other</th>
                      <th className="is-num">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="erp-cod-table-empty">No COD records yet.</td>
                      </tr>
                    ) : (
                      sortNewestFirst(records.slice()).map(function (r) {
                        var paid = getPaidItemsCost(r);
                        var free = Number(r.freeItemsCost) || 0;
                        var cod = Number(r.courierCost) || 0;
                        var other = Number(r.otherCost) || 0;
                        return (
                          <tr key={"cb-" + r.id}>
                            <td>{fmtDate(r.saleDate || r.createdAt)}</td>
                            <td className="erp-arap-ref">{r.invoiceNo || "—"}</td>
                            <td>
                              <div className="erp-arap-src" style={{ fontSize: 12 }}>{r.customerName}</div>
                              <div className="erp-arap-device-sub">{r.customerPhone || "—"}</div>
                            </td>
                            <td style={{ maxWidth: 160, wordBreak: "break-word" }}>{r.itemsSummary || "—"}</td>
                            <td className="erp-arap-amt">{sym} {fmtNum(r.soldTotal)}</td>
                            <td className="erp-arap-amt">{sym} {fmtNum(paid)}</td>
                            <td className="erp-arap-amt">{sym} {fmtNum(free)}</td>
                            <td className="erp-arap-amt">{sym} {fmtNum(cod)}</td>
                            <td className="erp-arap-amt">{sym} {fmtNum(other)}</td>
                            <td className="erp-arap-amt" style={{ fontWeight: 800, color: (r.netProfit || 0) >= 0 ? "#047857" : "#b91c1c" }}>
                              {sym} {fmtNum(r.netProfit)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {records.length > 0 ? (function () {
                    var deliveredCount = records.filter(function (r) { return r.deliveryStatus === "Delivered"; }).length;
                    return (
                      <div className="erp-cod-totals-strip">
                        <div className="erp-cod-totals-main">
                          <span><b>{records.length}</b> orders</span>
                          <span>Sold <b>{sym} {fmtNum(poolTotals.soldTotal)}</b></span>
                          <span>Paid <b>{sym} {fmtNum(poolTotals.paidItemsCost)}</b></span>
                          <span>Free <b>{sym} {fmtNum(poolTotals.freeItemsCost)}</b></span>
                          <span>COD <b>{sym} {fmtNum(poolTotals.courierCost)}</b></span>
                          <span className="erp-cod-totals-profit">Profit <b>{sym} {fmtNum(poolTotals.netProfitAll)}</b></span>
                        </div>
                        <div className="erp-cod-totals-sub">
                          Delivered {deliveredCount} · net {sym} {fmtNum(poolTotals.netProfitDelivered)}
                        </div>
                      </div>
                    );
              })() : null}
            </React.Fragment>
          )}

          {financeSubTab === "withdrawals" && (
            <React.Fragment>
              <div className="erp-cod-section-head">
                <h3>Withdrawals</h3>
                <p>History of COD payouts. Use Withdraw on the cards above to record new ones.</p>
              </div>
              <div className="erp-arap-toolbar erp-cod-wd-filters">
                <div className="erp-cod-filter-field">
                  <label>Month</label>
                  <input
                    type="month"
                    className="erp-arap-field"
                    value={withdrawMonth === "all" ? "" : withdrawMonth}
                    onChange={function (e) { setWithdrawMonth(e.target.value || "all"); }}
                  />
                </div>
                <div className="erp-cod-filter-field">
                  <label>Type</label>
                  <Sel value={wdFilterFund} onChange={function (e) { setWdFilterFund(e.target.value); if (e.target.value !== "profit") setWdFilterPartner(""); }} style={{ minWidth: 150 }}>
                    <option value="all">All types</option>
                    <option value="yourProfit">Shop profit</option>
                    <option value="profit">Partner profit</option>
                    <option value="paidItems">Paid items cost</option>
                    <option value="freeItems">Free items cost</option>
                    <option value="courier">COD / delivery cost</option>
                  </Sel>
                </div>
                {(wdFilterFund === "all" || wdFilterFund === "profit") && activeSh.length > 0 ? (
                  <div className="erp-cod-filter-field">
                    <label>Partner</label>
                    <Sel value={wdFilterPartner} onChange={function (e) { setWdFilterPartner(e.target.value); }} style={{ minWidth: 130 }}>
                      <option value="">All partners</option>
                      {activeSh.map(function (sh) {
                        return <option key={sh.id} value={sh.id}>{sh.name || "Unnamed"}</option>;
                      })}
                    </Sel>
                  </div>
                ) : null}
                <button type="button" className="erp-arap-btn-clear" onClick={function () { setWithdrawMonth("all"); setWdFilterFund("all"); setWdFilterPartner(""); }}>Clear</button>
              </div>
              <div className="erp-arap-table-wrap">
                <table className="erp-arap-table erp-cod-fin-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Payee</th>
                      <th className="is-num">Amount</th>
                      <th>Note</th>
                      <th className="is-num">Balance after</th>
                      <th style={{ width: 72 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWithdrawals.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="erp-cod-table-empty">No withdrawals match these filters.</td>
                      </tr>
                    ) : (
                      filteredWithdrawals.map(function (w) {
                        return (
                          <tr key={w.id}>
                            <td>{fmtDate(w.date)}</td>
                            <td style={{ fontWeight: 700 }}>{codWithdrawalFundLabel(withdrawalFund(w))}</td>
                            <td style={{ fontWeight: 600 }}>{w.shareholderName || "—"}</td>
                            <td className="erp-arap-amt" style={{ color: "#b91c1c", fontWeight: 800 }}>{sym} {fmtNum(w.amount)}</td>
                            <td style={{ maxWidth: 200, wordBreak: "break-word" }}>{w.note || "—"}</td>
                            <td className="erp-arap-amt" style={{ fontWeight: 700, color: "#1d4ed8" }}>
                              {sym} {fmtNum(w.fundBalanceAfter != null ? w.fundBalanceAfter : w.balanceAfter)}
                            </td>
                            <td>
                              <Btn sm col="red" onClick={function () { removeWithdrawal(w); }}>Remove</Btn>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </React.Fragment>
          )}

          {financeSubTab === "profitSplit" && (
            <React.Fragment>
              <div className="erp-cod-section-head">
                <h3>Profit split</h3>
                <p>Delivered orders — shop vs partners.</p>
              </div>
              <div className="erp-arap-table-wrap">
                <table className="erp-arap-table erp-cod-fin-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Customer</th>
                      <th className="is-num">Net profit</th>
                      <th className="is-num">{shopName}</th>
                      {activeSh.map(function (sh) {
                        return <th key={sh.id} className="is-num">{sh.name || "—"}</th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {activeSh.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="erp-cod-table-empty">Add partners under <strong>Partners</strong> first.</td>
                      </tr>
                    ) : records.filter(function (r) { return r.deliveryStatus === "Delivered"; }).length === 0 ? (
                      <tr>
                        <td colSpan={4 + activeSh.length} className="erp-cod-table-empty">No delivered orders yet.</td>
                      </tr>
                    ) : (
                      records.filter(function (r) { return r.deliveryStatus === "Delivered"; }).map(function (r) {
                        var br = partnerProfitBreakdown(r.netProfit, profitSettings);
                        var shopShare = Math.round(((Number(r.netProfit) || 0) - br.reduce(function (a, b) { return a + (Number(b.partnerShare) || 0); }, 0)) * 100) / 100;
                        return (
                          <tr key={"p-" + r.id}>
                            <td className="erp-arap-ref">{r.invoiceNo}</td>
                            <td>{r.customerName}</td>
                            <td className="erp-arap-amt" style={{ fontWeight: 700 }}>{sym} {fmtNum(r.netProfit)}</td>
                            <td className="erp-arap-amt" style={{ fontWeight: 700, color: "#0d9488" }}>{sym} {fmtNum(shopShare)}</td>
                            {activeSh.map(function (sh) {
                              var brow = br.find(function (b) { return b.partnerId === sh.id; });
                              return <td key={sh.id + r.id} className="erp-arap-amt">{sym} {fmtNum(brow ? brow.partnerShare : 0)}</td>;
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </React.Fragment>
          )}
          </div>
        </div>
      )}

      {costProfitEnabled && tab === "partners" && (
        <div className="erp-arap-panel erp-cod-partners-panel">
          {renderPartnersPanel()}
        </div>
      )}
      </div>

      {editRow && (
        <div className="erp-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={function () { setEditRow(null); setEditRowOrigStatus(""); }}>
          <div className="erp-modal-shell erp-cod-wd-modal" style={modalShellStyle({ width: "100%", maxWidth: 520, maxHeight: "90vh" })} onClick={function (e) { e.stopPropagation(); }}>
            <div className="erp-modal-header">
              <div className="erp-modal-title">Edit COD record</div>
              <CloseIconButton onClick={function () { setEditRow(null); setEditRowOrigStatus(""); }} size={32} bg="rgba(255,255,255,0.12)" color="#fff" borderRadius={8} />
            </div>
            <div className="erp-modal-body" style={modalBodyStyle({ padding: "14px 16px 16px" })}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>{editRow.invoiceNo} · {editRow.customerName}</div>
            {isCodStatusLocked(editRowOrigStatus) && (
              <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 10px", marginBottom: 12 }}>
                Status was <strong>{editRowOrigStatus}</strong> — changing it requires admin password.
              </div>
            )}
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd }}>Tracking number</label>
                <Input value={editRow.trackingNumber || ""} onChange={function (e) { setEditRow(Object.assign({}, editRow, { trackingNumber: e.target.value })); }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd }}>Customer address</label>
                <Input value={editRow.customerAddress || ""} onChange={function (e) { setEditRow(Object.assign({}, editRow, { customerAddress: e.target.value })); }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd }}>Alt phone</label>
                <Input value={editRow.altPhone || ""} onChange={function (e) { setEditRow(Object.assign({}, editRow, { altPhone: e.target.value })); }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd }}>Courier cost</label>
                  <Input type="number" step="0.01" value={editRow.courierCost} onChange={function (e) { setEditRow(Object.assign({}, editRow, { courierCost: e.target.value })); }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd }}>Other cost</label>
                  <Input type="number" step="0.01" value={editRow.otherCost || ""} onChange={function (e) { setEditRow(Object.assign({}, editRow, { otherCost: e.target.value })); }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd }}>Delivery status</label>
                <Sel value={editRow.deliveryStatus} onChange={function (e) { requestStatusChange(e.target.value); }}>
                  {COD_DELIVERY_STATUSES.map(function (s) { return <option key={s} value={s}>{s}</option>; })}
                </Sel>
              </div>
              <div style={{ fontSize: 12, padding: 10, background: "#f8fafc", borderRadius: 8 }}>
                <div>Sold: {sym} {fmtNum(editRow.soldTotal)}</div>
                <div style={{ marginTop: 4 }}>
                  Paid items: {sym} {fmtNum(getPaidItemsCost(editRow))} · Free items: {sym} {fmtNum(editRow.freeItemsCost || 0)} · COD: {sym} {fmtNum(editRow.courierCost || 0)}
                </div>
                <div style={{ fontWeight: 800, marginTop: 4, color: (editRow.netProfit || 0) >= 0 ? C.green : C.red }}>
                  Net profit: {sym} {fmtNum(recalcCodRecordProfit(editRow).netProfit)}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "space-between", flexWrap: "wrap" }}>
              <Btn col="orange" onClick={function () { openLabelPreview(editRow); }}>Print address (A5)</Btn>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn col="red" onClick={function () { deleteRow(editRow); setEditRow(null); setEditRowOrigStatus(""); }}>Remove</Btn>
              <Btn col="gray" onClick={function () { setEditRow(null); setEditRowOrigStatus(""); }}>Cancel</Btn>
              <Btn col="green" onClick={saveEditRow}>Save</Btn>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}

      {wdModal && (
        <div className="erp-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 10003, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={function () { setWdModal(null); }}>
          <div className="erp-modal-shell erp-cod-wd-modal" style={modalShellStyle({ width: "100%", maxWidth: 420 })} onClick={function (e) { e.stopPropagation(); }}>
            <div className="erp-modal-header">
              <div className="erp-modal-title">
                {wdForm.withdrawFrom === "yourProfit" ? "Shop profit withdrawal" :
                  wdForm.withdrawFrom === "profit" ? "Partner profit withdrawal" :
                  "Cost recovery withdrawal"}
              </div>
              <CloseIconButton onClick={function () { setWdModal(null); }} size={32} bg="rgba(255,255,255,0.12)" color="#fff" borderRadius={8} />
            </div>
            <div className="erp-modal-body" style={modalBodyStyle({ padding: "12px 14px 14px" })}>
            <div className="erp-cod-wd-note">COD-only payout — does not affect main ERP Accounts or cash.</div>
            {["paidItems", "freeItems", "courier"].indexOf(wdForm.withdrawFrom) >= 0 ? (
              <div className="erp-cod-wd-field">
                <label>Cost type</label>
                <Sel value={wdForm.withdrawFrom} onChange={function (e) { setWdForm(Object.assign({}, wdForm, { withdrawFrom: e.target.value })); }} style={{ width: "100%" }}>
                  <option value="paidItems">Paid items cost</option>
                  <option value="freeItems">Free items cost</option>
                  <option value="courier">COD / delivery cost</option>
                </Sel>
              </div>
            ) : null}
            {wdForm.withdrawFrom === "profit" && (
              <div className="erp-cod-wd-field">
                <label>Partner name</label>
                {activeSh.length === 0 ? (
                  <div className="erp-cod-wd-add-row">
                    <Input value={wdQuickPayee} onChange={function (e) { setWdQuickPayee(e.target.value); }} placeholder="Partner name" style={{ flex: 1, minWidth: 0 }} />
                    <Btn col="blue" sm onClick={addQuickPayee}>Add</Btn>
                  </div>
                ) : (
                  <Sel value={wdForm.shareholderId} onChange={function (e) { setWdForm(Object.assign({}, wdForm, { shareholderId: e.target.value })); }} style={{ width: "100%" }}>
                    <option value="">Select partner…</option>
                    {activeSh.map(function (sh) {
                      return <option key={sh.id} value={sh.id}>{sh.name || "Unnamed"}</option>;
                    })}
                  </Sel>
                )}
              </div>
            )}
            {wdSelectedBalance != null && (
              <div className="erp-cod-wd-balance">
                <span>Can withdraw more</span>
                <strong>{sym} {fmtNum(wdSelectedBalance)}</strong>
              </div>
            )}
            <div className="erp-cod-wd-field">
              <label>Date</label>
              <Input type="date" value={wdForm.date} onChange={function (e) { setWdForm(Object.assign({}, wdForm, { date: e.target.value })); }} style={{ width: "100%" }} />
            </div>
            <div className="erp-cod-wd-field">
              <label>Amount ({sym})</label>
              <Input type="number" step="0.01" min="0" value={wdForm.amount} onChange={function (e) { setWdForm(Object.assign({}, wdForm, { amount: e.target.value })); }} style={{ width: "100%" }} />
            </div>
            <div className="erp-cod-wd-field">
              <label>Note (optional)</label>
              <Input value={wdForm.note} onChange={function (e) { setWdForm(Object.assign({}, wdForm, { note: e.target.value })); }} placeholder="Cash, bank transfer…" style={{ width: "100%" }} />
            </div>
            <div className="erp-cod-wd-actions">
              <Btn col="gray" onClick={function () { setWdModal(null); }}>Cancel</Btn>
              <Btn col="green" onClick={addWithdrawal}>Record withdrawal</Btn>
            </div>
            </div>
          </div>
        </div>
      )}

      {labelPreview && (
        <div className="erp-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 10002, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={function () { setLabelPreview(null); }}>
          <div className="erp-modal-shell erp-cod-wd-modal" style={modalShellStyle({ width: "100%", maxWidth: 920, maxHeight: "92vh" })} onClick={function (e) { e.stopPropagation(); }}>
            <div className="erp-modal-header">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="erp-modal-title">Address label — print preview</div>
                <div className="erp-modal-subtitle" style={{ color: "rgba(255,255,255,0.75)" }}>
                  A5 landscape · printable area margins: 1&nbsp;cm top/bottom, 0.5&nbsp;cm left/right
                </div>
              </div>
              <CloseIconButton onClick={function () { setLabelPreview(null); }} size={32} bg="rgba(255,255,255,0.12)" color="#fff" borderRadius={8} />
            </div>
            <div className="erp-modal-body" style={modalBodyStyle({ padding: "14px 16px 16px" })}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMd, marginBottom: 12 }}>
              {labelPreview.invoiceNo} · {sym} {fmtNum(codAddressLabelTotal(labelPreview))}
            </div>
            <div style={{ background: "#f1f5f9", borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <iframe
                title="COD address label preview"
                srcDoc={
                  "<!DOCTYPE html><html><head><meta charset=\"utf-8\">" +
                  "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap\">" +
                  codAddressLabelStyleTag() +
                  "<style>body{padding:1cm 0.5cm;background:#fff;}</style>" +
                  "</head><body>" + buildCodAddressLabelHtml(labelPreview, state.settings) + "</body></html>"
                }
                style={{ width: "100%", height: 360, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", display: "block" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <Btn col="gray" onClick={function () { setLabelPreview(null); }}>Close</Btn>
              <Btn col="green" onClick={function () { runLabelPrint(labelPreview); }}>Print</Btn>
            </div>
            </div>
          </div>
        </div>
      )}

      {statusPwModal && (
        <div className="erp-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="erp-modal-shell erp-cod-wd-modal" style={modalShellStyle({ width: "100%", maxWidth: 380 })}>
            <div className="erp-modal-header">
              <div className="erp-modal-title">Admin password required</div>
              <CloseIconButton onClick={function () { setStatusPwModal(null); setStatusPwEntry(""); setStatusPwErr(""); }} size={32} bg="rgba(255,255,255,0.12)" color="#fff" borderRadius={8} />
            </div>
            <div className="erp-modal-body" style={modalBodyStyle({ padding: "14px 16px 16px" })}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
              Change status from <strong>{statusPwModal.fromStatus}</strong> to <strong>{statusPwModal.newStatus}</strong>?
            </div>
            <Input
              type="password"
              value={statusPwEntry}
              onChange={function (e) { setStatusPwEntry(e.target.value); setStatusPwErr(""); }}
              placeholder="Enter admin password"
              onKeyDown={function (e) { if (e.key === "Enter") submitStatusPassword(); }}
            />
            {statusPwErr && <div style={{ fontSize: 11, color: C.red, fontWeight: 700, marginTop: 6 }}>{statusPwErr}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <Btn col="gray" onClick={function () { setStatusPwModal(null); setStatusPwEntry(""); setStatusPwErr(""); }}>Cancel</Btn>
              <Btn col="blue" onClick={submitStatusPassword}>Confirm</Btn>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CodDatabase;
