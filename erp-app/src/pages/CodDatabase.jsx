import React, { useState, useMemo, useEffect } from "react";
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
import { modalHeaderBarStyle, modalShellStyle, modalBodyStyle } from "../components/modalChrome.js";
import { stampUpdatedAt } from "../utils/stampUpdatedAt.js";

var STATUS_COLORS = { Accepted: "#2979ff", Dispatched: "#f59e0b", Delivered: "#16a34a", Returned: "#dc2626", All: "#64748b" };
var STATUS_ICONS = { All: "📋", Accepted: "📥", Dispatched: "🚚", Delivered: "✅", Returned: "↩️" };

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
  var [expandedPanels, setExpandedPanels] = useState({
    netProfit: false,
    shopProfit: false,
    partnerProfit: false,
    costRecovery: false,
  });

  var togglePanel = function (key) {
    setExpandedPanels(function (prev) {
      var next = Object.assign({}, prev);
      next[key] = !prev[key];
      return next;
    });
  };

  var gridTableStyle = function (fontSize) {
    return { width: "100%", borderCollapse: "collapse", fontSize: fontSize || 12, border: "1px solid " + C.border };
  };
  var gridCell = { border: "1px solid " + C.border, padding: "8px 10px", verticalAlign: "middle" };
  var gridHead = Object.assign({}, gridCell, { background: "#f8fafc", fontWeight: 800 });
  var trackerTableStyle = { width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" };
  var trackerHead = { padding: "5px 4px", fontWeight: 800, color: C.th, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "2px solid " + C.border, background: "#f7f9ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  var trackerCell = { padding: "5px 4px", fontSize: 11, color: C.text, verticalAlign: "middle", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word" };
  var trackerAmt = Object.assign({}, trackerCell, { textAlign: "right", whiteSpace: "nowrap", fontSize: 10.5, fontVariantNumeric: "tabular-nums" });
  var trackerActCell = { padding: "4px 3px", verticalAlign: "middle", textAlign: "right", whiteSpace: "nowrap" };
  var shortInvoiceNo = function (no) {
    var s = String(no || "—");
    if (s.length <= 18) return s;
    return s.slice(0, 12) + "…" + s.slice(-4);
  };

  useEffect(function () {
    if (!costProfitEnabled && tab === "finance") setTab("tracker");
  }, [costProfitEnabled, tab]);

  var records = activeCodRecords(state.codRecords || S.get("tc3_codRecords", []) || [], state.sales || []);
  var withdrawals = state.codWithdrawals || S.get("tc3_codWithdrawals", []) || [];
  var profitSettings = hydrateProfitSettings(state.codProfitSettings || ensureCodProfitSettings(S));
  var shareholders = profitSettings.shareholders || [];
  var totalInvestment = Number(profitSettings.totalInvestment) || 0;
  var investedSum = sumShareholderInvestments(shareholders);

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

  var persistProfitSettings = function (next) {
    var hydrated = hydrateProfitSettings(next);
    hydrated.shareholders = (hydrated.shareholders || []).map(function (sh) {
      return stampUpdatedAt(Object.assign({}, sh));
    });
    /* Mirror shareholders into mergeable partners array for multi-PC sync. */
    S.set("tc3_codPartners", hydrated.shareholders.slice());
    S.set("tc3_codProfitSettings", hydrated);
    setState(function (st) {
      return Object.assign({}, st, {
        codProfitSettings: hydrated,
        codPartners: hydrated.shareholders.slice(),
      });
    });
  };

  var updateSettings = function (patch) {
    persistProfitSettings(Object.assign({}, profitSettings, patch));
  };

  var updateShareholder = function (shId, patch) {
    var next = shareholders.map(function (sh) {
      if (sh.id !== shId) return sh;
      var merged = Object.assign({}, sh, patch);
      if (patch.userSharePercentage != null) {
        merged.partnerSharePercentage = Math.max(0, 100 - (Number(patch.userSharePercentage) || 0));
      }
      return merged;
    });
    updateSettings({ shareholders: next });
  };

  var addShareholder = function () {
    var sh = emptyShareholder(uid());
    sh.sortOrder = shareholders.length + 1;
    updateSettings({ shareholders: shareholders.concat([sh]) });
  };

  var removeShareholder = function (shId) {
    showConfirm("Remove this shareholder from profit sharing?", function () {
      updateSettings({ shareholders: shareholders.filter(function (sh) { return sh.id !== shId; }) });
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
    return computeShareholderBalances(profitSettings, records, withdrawals);
  }, [profitSettings, records, withdrawals]);

  var poolTotals = useMemo(function () {
    return summarizeCodPoolBalance(records, withdrawals, profitSettings);
  }, [records, withdrawals, profitSettings]);

  var fundBalances = useMemo(function () {
    return computeCodFundBalances(records, withdrawals, profitSettings);
  }, [records, withdrawals, profitSettings]);

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

  var tabBtnStyle = function (id) {
    return {
      padding: "8px 14px",
      borderRadius: 8,
      border: "1px solid " + (tab === id ? C.blue : C.border),
      background: tab === id ? "#e8f0fe" : "#fff",
      color: tab === id ? C.blue : C.textMd,
      fontWeight: 800,
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit",
      outline: "none",
      boxShadow: "none",
    };
  };

  var addQuickPayee = function () {
    var name = String(wdQuickPayee || "").trim();
    if (!name) { showAlert("Enter payee name."); return; }
    var sh = emptyShareholder(uid());
    sh.name = name;
    sh.sortOrder = shareholders.length + 1;
    updateSettings({ shareholders: shareholders.concat([sh]) });
    setWdForm(Object.assign({}, wdForm, { shareholderId: sh.id }));
    setWdQuickPayee("");
    addAudit("COD payee added", name);
  };

  var financeSubBtnStyle = function (id) {
    return {
      padding: "6px 12px",
      borderRadius: 6,
      border: "1px solid " + (financeSubTab === id ? C.blue : C.border),
      background: financeSubTab === id ? "#e8f0fe" : "#fff",
      color: financeSubTab === id ? C.blue : C.textMd,
      fontWeight: 700,
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      outline: "none",
      boxShadow: "none",
    };
  };

  var renderCollapseHeader = function (panelKey, title, subtitle, colors, onWithdraw) {
    var open = expandedPanels[panelKey];
    var col = colors || {};
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px 8px 14px",
          background: col.bg || "#f8fafc",
          borderBottom: open ? ("1px solid " + (col.line || C.border)) : "none",
        }}
      >
        <button
          type="button"
          onClick={function () { togglePanel(panelKey); }}
          onMouseDown={function (e) { e.preventDefault(); }}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "4px 0",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            textAlign: "left",
            minWidth: 0,
            outline: "none",
            boxShadow: "none",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: col.title || C.text }}>{title}</div>
            {!open && subtitle ? (
              <div style={{ fontSize: 11, color: col.subtitle || C.muted, marginTop: 3, lineHeight: 1.4 }}>{subtitle}</div>
            ) : null}
          </div>
          <span style={{ fontSize: 18, color: col.title || C.text, fontWeight: 900, flexShrink: 0, lineHeight: 1 }}>{open ? "▾" : "▸"}</span>
        </button>
        {onWithdraw ? (
          <Btn sm col="green" onClick={function (e) { e.stopPropagation(); onWithdraw(); }}>Withdraw</Btn>
        ) : null}
      </div>
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
    var partnerTotal = partnerFund ? partnerFund.total : (pt.totalOpeningOwed + pt.totalProfitOwed);
    var partnerRemaining = partnerFund ? partnerFund.remaining : pt.totalBalanceRemaining;

    return (
      <div style={{ marginBottom: 18 }}>
        <div style={{ marginBottom: 12, borderRadius: 12, border: "2px solid #2979ff", overflow: "hidden", background: "#fff" }}>
          {renderCollapseHeader(
            "netProfit",
            "Total net profit (delivered COD)",
            sym + " " + fmtNum(pt.netProfitDelivered) + " · Shop " + sym + " " + fmtNum(shopTotal) + " · Partners " + sym + " " + fmtNum(pt.totalProfitOwed),
            { bg: "linear-gradient(135deg,#1e3a5f 0%,#2979ff 100%)", title: "#fff", subtitle: "rgba(255,255,255,0.88)", line: "#1d4ed8" }
          )}
          {expandedPanels.netProfit ? (
            <div style={{ padding: 16, background: "linear-gradient(135deg,#1e3a5f 0%,#2979ff 100%)", color: "#fff" }}>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{sym} {fmtNum(pt.netProfitDelivered)}</div>
              <div style={{ fontSize: 11, opacity: 0.9, marginTop: 8, lineHeight: 1.5 }}>
                = Shop profit ({sym} {fmtNum(shopTotal)}) + Partner shares ({sym} {fmtNum(pt.totalProfitOwed)})
                {pt.totalOpeningOwed > 0 ? (" + old partner balance " + sym + " " + fmtNum(pt.totalOpeningOwed)) : ""}
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ marginBottom: 12, borderRadius: 12, border: "2px solid #0d9488", overflow: "hidden", background: "#fff" }}>
          {renderCollapseHeader(
            "shopProfit",
            shopName + " — Shop profit",
            "Can withdraw more: " + sym + " " + fmtNum(shopRemaining),
            { bg: "#f0fdfa", title: "#0d9488", line: "#99f6e4" },
            function () { openWithdrawModal("yourProfit"); }
          )}
          {expandedPanels.shopProfit ? (
            <table style={gridTableStyle(12)}>
              <thead>
                <TR>
                  <TH style={gridHead}>Shop profit share</TH>
                  <TH right style={gridHead}>Withdrawn</TH>
                  <TH right style={gridHead}>Can withdraw more</TH>
                </TR>
              </thead>
              <tbody>
                <TR>
                  <TD style={Object.assign({}, gridCell, { fontWeight: 800, color: "#0d9488" })}>{sym} {fmtNum(shopTotal)}</TD>
                  <TD right style={Object.assign({}, gridCell, { fontWeight: 700, color: C.red })}>{sym} {fmtNum(shopFund ? shopFund.withdrawn : pt.yourProfitWithdrawn)}</TD>
                  <TD right style={Object.assign({}, gridCell, { fontWeight: 900, color: C.blue, fontSize: 14 })}>{sym} {fmtNum(shopRemaining)}</TD>
                </TR>
              </tbody>
            </table>
          ) : null}
        </div>

        <div style={{ marginBottom: 12, borderRadius: 12, border: "2px solid #16a34a", overflow: "hidden", background: "#fff" }}>
          {renderCollapseHeader(
            "partnerProfit",
            "Partner profit shares",
            (pt.totalOpeningOwed > 0 ? ("Old balance " + sym + " " + fmtNum(pt.totalOpeningOwed) + " · ") : "") +
              "Profit share " + sym + " " + fmtNum(pt.totalProfitOwed) + " · Can withdraw more: " + sym + " " + fmtNum(partnerRemaining),
            { bg: "#f0fdf4", title: "#16a34a", line: "#bbf7d0" },
            function () { openWithdrawModal("profit"); }
          )}
          {expandedPanels.partnerProfit ? (
            <React.Fragment>
              <table style={gridTableStyle(12)}>
                <thead>
                  <TR>
                    <TH right style={gridHead}>Old balance</TH>
                    <TH right style={gridHead}>Profit share</TH>
                    <TH right style={gridHead}>Total owed</TH>
                    <TH right style={gridHead}>Withdrawn</TH>
                    <TH right style={gridHead}>Can withdraw more</TH>
                  </TR>
                </thead>
                <tbody>
                  <TR>
                    <TD right style={Object.assign({}, gridCell, { fontWeight: 700, color: pt.totalOpeningOwed > 0 ? "#b45309" : C.muted })}>{sym} {fmtNum(pt.totalOpeningOwed)}</TD>
                    <TD right style={Object.assign({}, gridCell, { fontWeight: 800, color: "#16a34a" })}>{sym} {fmtNum(pt.totalProfitOwed)}</TD>
                    <TD right style={Object.assign({}, gridCell, { fontWeight: 800 })}>{sym} {fmtNum(partnerTotal)}</TD>
                    <TD right style={Object.assign({}, gridCell, { fontWeight: 700, color: C.red })}>{sym} {fmtNum(partnerFund ? partnerFund.withdrawn : sumWithdrawalsByFund(withdrawals, "profit"))}</TD>
                    <TD right style={Object.assign({}, gridCell, { fontWeight: 900, color: C.blue, fontSize: 14 })}>{sym} {fmtNum(partnerRemaining)}</TD>
                  </TR>
                </tbody>
              </table>
              {activeSh.length > 0 ? (
                <div style={{ padding: "10px 14px", background: "#fff", borderTop: "1px solid " + C.border }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, marginBottom: 8 }}>Each partner detail</div>
                  <table style={gridTableStyle(11)}>
                    <thead>
                      <TR>
                        <TH style={gridHead}>Partner</TH>
                        <TH right style={gridHead}>Old balance</TH>
                        <TH right style={gridHead}>Profit share</TH>
                        <TH right style={gridHead}>Total owed</TH>
                        <TH right style={gridHead}>Withdrawn</TH>
                        <TH right style={gridHead}>Can withdraw more</TH>
                      </TR>
                    </thead>
                    <tbody>
                      {balanceRows.map(function (row) {
                        return (
                          <TR key={"pd-" + row.shareholderId}>
                            <TD style={Object.assign({}, gridCell, { fontWeight: 800 })}>{row.name || "—"}</TD>
                            <TD right style={Object.assign({}, gridCell, { fontWeight: 700, color: row.openingBalanceOwed > 0 ? "#b45309" : C.muted })}>{sym} {fmtNum(row.openingBalanceOwed)}</TD>
                            <TD right style={Object.assign({}, gridCell, { fontWeight: 700, color: "#16a34a" })}>{sym} {fmtNum(row.profitOwed)}</TD>
                            <TD right style={Object.assign({}, gridCell, { fontWeight: 800 })}>{sym} {fmtNum(row.totalOwed)}</TD>
                            <TD right style={Object.assign({}, gridCell, { fontWeight: 700, color: C.red })}>{sym} {fmtNum(row.totalWithdrawn)}</TD>
                            <TD right style={Object.assign({}, gridCell, { fontWeight: 900, color: row.canWithdrawMore > 0 ? C.blue : C.muted })}>{sym} {fmtNum(row.canWithdrawMore)}</TD>
                          </TR>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: 16, textAlign: "center", color: C.muted, fontSize: 12, borderTop: "1px solid " + C.border }}>No partners set up. Add partners under Partner settings.</div>
              )}
            </React.Fragment>
          ) : null}
        </div>

        <div style={{ marginBottom: 12, borderRadius: 12, border: "2px solid #2979ff", overflow: "hidden", background: "#fff" }}>
          {renderCollapseHeader(
            "costRecovery",
            "Cost recovery (paid items · free items · COD)",
            costFunds.length ? (
              "Paid " + sym + " " + fmtNum((costFunds[0] && costFunds[0].remaining) || 0) +
              " · Free " + sym + " " + fmtNum((costFunds[1] && costFunds[1].remaining) || 0) +
              " · COD " + sym + " " + fmtNum((costFunds[2] && costFunds[2].remaining) || 0)
            ) : "Expand for cost totals",
            { bg: "#e8f0fe", title: C.blue, line: "#bfdbfe" },
            function () { openWithdrawModal("paidItems"); }
          )}
          {expandedPanels.costRecovery ? (
            <table style={gridTableStyle(12)}>
              <thead>
                <TR>
                  <TH style={gridHead}>Cost type</TH>
                  <TH right style={gridHead}>Total</TH>
                  <TH right style={gridHead}>Withdrawn</TH>
                  <TH right style={gridHead}>Can withdraw more</TH>
                </TR>
              </thead>
              <tbody>
                {costFunds.map(function (f) {
                  return (
                    <TR key={f.id}>
                      <TD style={Object.assign({}, gridCell, { fontWeight: 800, color: f.color })}>{f.label}</TD>
                      <TD right style={Object.assign({}, gridCell, { fontWeight: 700 })}>{sym} {fmtNum(f.total)}</TD>
                      <TD right style={Object.assign({}, gridCell, { fontWeight: 700, color: C.red })}>{sym} {fmtNum(f.withdrawn)}</TD>
                      <TD right style={Object.assign({}, gridCell, { fontWeight: 900, color: f.remaining > 0 ? C.blue : C.muted })}>{sym} {fmtNum(f.remaining)}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>
        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid " + C.border }}>
          Tap a section title to expand or collapse. Use <strong>Withdraw</strong> on each section to record payouts. All withdrawal history is on the <strong>Withdrawals</strong> tab. COD-only — not main ERP Accounts.
        </div>
      </div>
    );
  };

  var activeSh = activeShareholders(profitSettings);
  var statusCounts = useMemo(function () {
    var counts = { All: records.length };
    COD_DELIVERY_STATUSES.forEach(function (s) {
      counts[s] = records.filter(function (r) { return r.deliveryStatus === s; }).length;
    });
    return counts;
  }, [records]);

  return (
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={tabBtnStyle("tracker")} onClick={function () { setTab("tracker"); }}>Tracker</button>
        {costProfitEnabled ? (
          <button type="button" style={tabBtnStyle("finance")} onClick={function () { setTab("finance"); }}>Costs &amp; profit</button>
        ) : null}
      </div>

      {tab === "tracker" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10 }}>
            {["All"].concat(COD_DELIVERY_STATUSES).map(function (s) {
              var count = statusCounts[s] || 0;
              var active = statusFilter === s;
              var col = STATUS_COLORS[s] || C.blue;
              return (
                <div
                  key={s}
                  onClick={function () { setStatusFilter(s); }}
                  style={{
                    background: active ? col + "18" : "#fff",
                    borderRadius: 12,
                    padding: "12px 10px",
                    border: "2px solid " + (active ? col : C.border),
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "all .15s",
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 2 }}>{STATUS_ICONS[s] || "•"}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: col, lineHeight: 1 }}>{count}</div>
                  <div style={{ fontSize: 10, color: active ? col : C.muted, fontWeight: 700, marginTop: 3 }}>{s}</div>
                </div>
              );
            })}
          </div>
          <Card>
            <CardTitle>COD &amp; delivery tracker{statusFilter !== "All" ? (" · " + statusFilter) : ""}</CardTitle>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <Input value={search} onChange={function (e) { setSearch(e.target.value); }} placeholder="Search invoice, customer, tracking, address…" style={{ flex: "1 1 220px", minWidth: 200 }} />
            </div>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: 32, color: C.muted, fontSize: 13 }}>
                {records.length === 0
                  ? <span>No COD records yet. Enable <strong>COD track (Sales)</strong> in Settings → Modules.</span>
                  : <span>No records with status <strong>{statusFilter}</strong>.</span>}
              </div>
            ) : (
              <div>
                <table style={trackerTableStyle}>
                  <colgroup>
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "24%" }} />
                    <col style={{ width: "6%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "11%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={Object.assign({}, trackerHead, { textAlign: "left" })}>Date</th>
                      <th style={Object.assign({}, trackerHead, { textAlign: "left" })}>Invoice</th>
                      <th style={Object.assign({}, trackerHead, { textAlign: "left" })}>Customer</th>
                      <th style={Object.assign({}, trackerHead, { textAlign: "left" })}>Type</th>
                      <th style={Object.assign({}, trackerHead, { textAlign: "left" })}>Track</th>
                      <th style={Object.assign({}, trackerHead, { textAlign: "left" })}>Status</th>
                      <th style={Object.assign({}, trackerHead, { textAlign: "right" })}>Sold</th>
                      <th style={Object.assign({}, trackerHead, { textAlign: "right" })}>Cost</th>
                      <th style={Object.assign({}, trackerHead, { textAlign: "right" })}>COD</th>
                      <th style={Object.assign({}, trackerHead, { textAlign: "right" })}>Profit</th>
                      <th style={Object.assign({}, trackerHead, { textAlign: "right" })}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pager.slice.map(function (r, ri) {
                      var stColor = STATUS_COLORS[r.deliveryStatus] || C.muted;
                      var addr = String(r.customerAddress || "").trim();
                      var phoneLine = [r.customerPhone, r.altPhone ? ("alt " + r.altPhone) : ""].filter(Boolean).join(" · ");
                      return (
                        <tr key={r.id} style={{ background: ri % 2 === 0 ? "#fff" : "#f8fbff", borderBottom: "1px solid " + C.borderLight }}>
                          <td style={trackerCell}>{fmtDate(r.saleDate || r.createdAt)}</td>
                          <td style={Object.assign({}, trackerCell, { fontWeight: 700, fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })} title={r.invoiceNo || ""}>{shortInvoiceNo(r.invoiceNo)}</td>
                          <td style={trackerCell}>
                            <div style={{ fontWeight: 600, fontSize: 12, color: C.text, lineHeight: 1.25 }}>{r.customerName}</div>
                            {addr ? <div style={{ fontSize: 11.5, fontWeight: 400, color: C.textMd, marginTop: 2, lineHeight: 1.35 }}>{addr}</div> : null}
                            {phoneLine ? <div style={{ fontSize: 11.5, fontWeight: 400, color: C.textMd, marginTop: addr ? 2 : 2, lineHeight: 1.35 }}>{phoneLine}</div> : null}
                          </td>
                          <td style={Object.assign({}, trackerCell, { fontSize: 10.5 })}>{r.saleType}</td>
                          <td style={Object.assign({}, trackerCell, { fontSize: 10.5 })}>{r.trackingNumber || "—"}</td>
                          <td style={trackerCell}>
                            <span style={{ fontSize: 9, fontWeight: 800, color: stColor, background: stColor + "18", padding: "2px 6px", borderRadius: 999, whiteSpace: "nowrap", display: "inline-block" }}>{r.deliveryStatus}</span>
                          </td>
                          <td style={trackerAmt}>{sym} {fmtNum(r.soldTotal)}</td>
                          <td style={trackerAmt}>{sym} {fmtNum(r.costTotal)}</td>
                          <td style={trackerAmt}>{sym} {fmtNum(r.courierCost)}</td>
                          <td style={Object.assign({}, trackerAmt, { fontWeight: 800, color: (r.netProfit || 0) >= 0 ? C.green : C.red })}>{sym} {fmtNum(r.netProfit)}</td>
                          <td style={trackerActCell}>
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
                <Pager pager={pager} />
              </div>
            )}
          </Card>
        </div>
      )}

      {costProfitEnabled && tab === "finance" && (
        <Card>
          {renderCodPoolSummary()}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <button type="button" style={financeSubBtnStyle("breakdown")} onClick={function () { setFinanceSubTab("breakdown"); }}>Order costs</button>
            <button type="button" style={financeSubBtnStyle("withdrawals")} onClick={function () { setFinanceSubTab("withdrawals"); }}>Withdrawals</button>
            <button type="button" style={financeSubBtnStyle("profitSplit")} onClick={function () { setFinanceSubTab("profitSplit"); }}>Profit split by order</button>
            <button type="button" style={financeSubBtnStyle("settings")} onClick={function () { setFinanceSubTab("settings"); }}>Partner settings</button>
          </div>

          {financeSubTab === "breakdown" && (
            <React.Fragment>
              <CardTitle>Cost breakdown by order</CardTitle>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
                Each row shows paid items, free items, and COD/delivery cost separately.
              </p>
              {records.length === 0 ? (
                <div style={{ textAlign: "center", padding: 28, color: C.muted }}>No COD records yet.</div>
              ) : (
                <React.Fragment>
                  <div style={{ overflowX: "auto", marginBottom: 14 }}>
                    <table style={gridTableStyle(12)}>
                      <thead>
                        <TR>
                          <TH style={gridHead}>Date</TH>
                          <TH style={gridHead}>Invoice</TH>
                          <TH style={gridHead}>Customer</TH>
                          <TH style={gridHead}>Items</TH>
                          <TH right style={gridHead}>Sold</TH>
                          <TH right style={gridHead}>Paid items</TH>
                          <TH right style={gridHead}>Free items</TH>
                          <TH right style={gridHead}>COD cost</TH>
                          <TH right style={gridHead}>Other</TH>
                          <TH right style={gridHead}>Profit</TH>
                        </TR>
                      </thead>
                      <tbody>
                        {sortNewestFirst(records.slice()).map(function (r) {
                          var paid = getPaidItemsCost(r);
                          var free = Number(r.freeItemsCost) || 0;
                          var cod = Number(r.courierCost) || 0;
                          var other = Number(r.otherCost) || 0;
                          return (
                            <TR key={"cb-" + r.id}>
                              <TD style={gridCell}>{fmtDate(r.saleDate || r.createdAt)}</TD>
                              <TD style={Object.assign({}, gridCell, { fontWeight: 700 })}>{r.invoiceNo || "—"}</TD>
                              <TD style={gridCell}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{r.customerName}</div>
                                <div style={{ fontSize: 12, fontWeight: 400, color: C.textMd, marginTop: 2 }}>{r.customerPhone || "—"}</div>
                              </TD>
                              <TD style={Object.assign({}, gridCell, { maxWidth: 180, wordBreak: "break-word", fontSize: 11 })}>{r.itemsSummary || "—"}</TD>
                              <TD right style={gridCell}>{sym} {fmtNum(r.soldTotal)}</TD>
                              <TD right style={Object.assign({}, gridCell, { color: C.blue, fontWeight: 700 })}>{sym} {fmtNum(paid)}</TD>
                              <TD right style={Object.assign({}, gridCell, { color: free > 0 ? "#7c3aed" : C.muted, fontWeight: free > 0 ? 700 : 400 })}>{sym} {fmtNum(free)}</TD>
                              <TD right style={Object.assign({}, gridCell, { color: cod > 0 ? "#f59e0b" : C.muted, fontWeight: cod > 0 ? 700 : 400 })}>{sym} {fmtNum(cod)}</TD>
                              <TD right style={gridCell}>{sym} {fmtNum(other)}</TD>
                              <TD right style={Object.assign({}, gridCell, { fontWeight: 800, color: (r.netProfit || 0) >= 0 ? C.green : C.red })}>{sym} {fmtNum(r.netProfit)}</TD>
                            </TR>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {(function () {
                    var deliveredCount = records.filter(function (r) { return r.deliveryStatus === "Delivered"; }).length;
                    var summaryItems = [
                      { label: "Orders", value: String(records.length), color: C.text },
                      { label: "Sold", value: sym + " " + fmtNum(poolTotals.soldTotal), color: C.text },
                      { label: "Paid items", value: sym + " " + fmtNum(poolTotals.paidItemsCost), color: C.blue },
                      { label: "Free items", value: sym + " " + fmtNum(poolTotals.freeItemsCost), color: "#7c3aed" },
                      { label: "COD cost", value: sym + " " + fmtNum(poolTotals.courierCost), color: "#f59e0b" },
                      { label: "Other", value: sym + " " + fmtNum(poolTotals.otherCost), color: C.textMd },
                      { label: "Net profit (all)", value: sym + " " + fmtNum(poolTotals.netProfitAll), color: poolTotals.netProfitAll >= 0 ? C.green : C.red },
                    ];
                    return (
                      <div style={{ borderRadius: 10, border: "2px solid " + C.border, overflow: "hidden", background: "#fff" }}>
                        <div style={{ padding: "10px 14px", background: "#f8fafc", borderBottom: "1px solid " + C.border }}>
                          <div style={{ fontSize: 12, fontWeight: 900, color: C.text }}>Totals — all orders ({records.length})</div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                            Delivered: {deliveredCount} order{deliveredCount === 1 ? "" : "s"} · net profit {sym} {fmtNum(poolTotals.netProfitDelivered)}
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 0 }}>
                          {summaryItems.map(function (item, idx) {
                            return (
                              <div key={"sum-" + idx} style={{ padding: "12px 14px", borderRight: idx < summaryItems.length - 1 ? "1px solid " + C.border : "none", borderBottom: "1px solid " + C.borderLight }}>
                                <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{item.label}</div>
                                <div style={{ fontSize: 14, fontWeight: 900, color: item.color }}>{item.value}</div>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ padding: "10px 14px", background: "#f0fdfa", borderTop: "1px solid #99f6e4", fontSize: 11, color: "#0d9488", lineHeight: 1.5 }}>
                          <strong>Delivered only:</strong> paid items {sym} {fmtNum(poolTotals.deliveredPaidItemsCost)} · free items {sym} {fmtNum(poolTotals.deliveredFreeItemsCost)} · COD {sym} {fmtNum(poolTotals.deliveredCourierCost)} · net profit {sym} {fmtNum(poolTotals.netProfitDelivered)}
                        </div>
                      </div>
                    );
                  })()}
                </React.Fragment>
              )}
            </React.Fragment>
          )}

          {financeSubTab === "withdrawals" && (
            <React.Fragment>
              <CardTitle>Withdrawal records</CardTitle>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
                Filter and review COD withdrawals only. Record new withdrawals using the <strong>Withdraw</strong> button on each summary section above.
              </p>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap", padding: 12, background: "#f8fafc", borderRadius: 10, border: "1px solid " + C.border }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>Month</label>
                  <input
                    type="month"
                    value={withdrawMonth === "all" ? "" : withdrawMonth}
                    onChange={function (e) { setWithdrawMonth(e.target.value || "all"); }}
                    style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>Type</label>
                  <Sel value={wdFilterFund} onChange={function (e) { setWdFilterFund(e.target.value); if (e.target.value !== "profit") setWdFilterPartner(""); }} style={{ minWidth: 160 }}>
                    <option value="all">All types</option>
                    <option value="yourProfit">Shop profit</option>
                    <option value="profit">Partner profit</option>
                    <option value="paidItems">Paid items cost</option>
                    <option value="freeItems">Free items cost</option>
                    <option value="courier">COD / delivery cost</option>
                  </Sel>
                </div>
                {(wdFilterFund === "all" || wdFilterFund === "profit") && activeSh.length > 0 ? (
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>Partner</label>
                    <Sel value={wdFilterPartner} onChange={function (e) { setWdFilterPartner(e.target.value); }} style={{ minWidth: 140 }}>
                      <option value="">All partners</option>
                      {activeSh.map(function (sh) {
                        return <option key={sh.id} value={sh.id}>{sh.name || "Unnamed"}</option>;
                      })}
                    </Sel>
                  </div>
                ) : null}
                <button type="button" onClick={function () { setWithdrawMonth("all"); setWdFilterFund("all"); setWdFilterPartner(""); }} style={{ fontSize: 11, fontWeight: 700, color: C.blue, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "8px 0" }}>Clear filters</button>
              </div>
              {filteredWithdrawals.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24, color: C.muted, fontSize: 13 }}>No withdrawals match these filters.</div>
              ) : (
                <table style={gridTableStyle(12)}>
                  <thead>
                    <TR>
                      <TH style={gridHead}>Date</TH>
                      <TH style={gridHead}>Type</TH>
                      <TH style={gridHead}>Payee</TH>
                      <TH right style={gridHead}>Amount</TH>
                      <TH style={gridHead}>Note</TH>
                      <TH right style={gridHead}>Balance after</TH>
                      <TH style={gridHead}></TH>
                    </TR>
                  </thead>
                  <tbody>
                    {filteredWithdrawals.map(function (w) {
                      return (
                        <TR key={w.id}>
                          <TD style={gridCell}>{fmtDate(w.date)}</TD>
                          <TD style={Object.assign({}, gridCell, { fontWeight: 700 })}>{codWithdrawalFundLabel(withdrawalFund(w))}</TD>
                          <TD style={Object.assign({}, gridCell, { fontWeight: 600 })}>{w.shareholderName || "—"}</TD>
                          <TD right style={Object.assign({}, gridCell, { fontWeight: 800, color: C.red })}>{sym} {fmtNum(w.amount)}</TD>
                          <TD style={Object.assign({}, gridCell, { maxWidth: 200, wordBreak: "break-word" })}>{w.note || "—"}</TD>
                          <TD right style={Object.assign({}, gridCell, { fontWeight: 700, color: C.blue })}>{sym} {fmtNum(w.fundBalanceAfter != null ? w.fundBalanceAfter : w.balanceAfter)}</TD>
                          <TD style={gridCell}><Btn sm col="red" onClick={function () { removeWithdrawal(w); }}>Remove</Btn></TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </React.Fragment>
          )}

          {financeSubTab === "profitSplit" && (
            <React.Fragment>
              <CardTitle>Profit split by delivered order</CardTitle>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 0, marginBottom: 14 }}>
                How each delivered order&apos;s net profit is split between {shopName} and partners (by investment % and your/their share).
              </p>
              {activeSh.length === 0 ? (
                <div style={{ textAlign: "center", padding: 28, color: C.muted }}>Add partners under <strong>Partner settings</strong> first.</div>
              ) : records.filter(function (r) { return r.deliveryStatus === "Delivered"; }).length === 0 ? (
                <div style={{ textAlign: "center", padding: 28, color: C.muted }}>No delivered orders yet.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <TR>
                        <TH>Invoice</TH>
                        <TH>Customer</TH>
                        <TH right>Net profit</TH>
                        <TH right>{shopName} (shop)</TH>
                        {activeSh.map(function (sh) {
                          return <TH key={sh.id} right>{sh.name || "—"} (partner)</TH>;
                        })}
                      </TR>
                    </thead>
                    <tbody>
                      {records.filter(function (r) { return r.deliveryStatus === "Delivered"; }).map(function (r) {
                        var br = partnerProfitBreakdown(r.netProfit, profitSettings);
                        var shopShare = Math.round(((Number(r.netProfit) || 0) - br.reduce(function (a, b) { return a + (Number(b.partnerShare) || 0); }, 0)) * 100) / 100;
                        return (
                          <TR key={"p-" + r.id}>
                            <TD style={{ fontWeight: 700 }}>{r.invoiceNo}</TD>
                            <TD>{r.customerName}</TD>
                            <TD right style={{ fontWeight: 700 }}>{sym} {fmtNum(r.netProfit)}</TD>
                            <TD right style={{ fontWeight: 700, color: "#0d9488" }}>{sym} {fmtNum(shopShare)}</TD>
                            {activeSh.map(function (sh) {
                              var brow = br.find(function (b) { return b.partnerId === sh.id; });
                              return <TD key={sh.id + r.id} right>{sym} {fmtNum(brow ? brow.partnerShare : 0)}</TD>;
                            })}
                          </TR>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </React.Fragment>
          )}

          {financeSubTab === "settings" && (
            <React.Fragment>
              <CardTitle>Partner settings</CardTitle>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 0, marginBottom: 16 }}>
                Set total investment and each partner&apos;s amount. Add <strong>old balance owed</strong> for amounts you already owe them before COD tracking.
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 18, padding: 14, background: "#f8fafc", borderRadius: 10, border: "1px solid " + C.border }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>Total investment ({sym})</label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={totalInvestment || ""}
                    onChange={function (e) { updateSettings({ totalInvestment: parseFloat(e.target.value) || 0 }); }}
                    style={{ width: 160 }}
                    placeholder="e.g. 500000"
                  />
                </div>
                <div style={{ fontSize: 12, color: C.textMd }}>
                  <div>Partners invested: <strong>{sym} {fmtNum(investedSum)}</strong></div>
                  {totalInvestment > 0 && Math.abs(investedSum - totalInvestment) > 0.01 && (
                    <div style={{ color: "#b45309", fontWeight: 700, marginTop: 4 }}>
                      Difference: {sym} {fmtNum(investedSum - totalInvestment)}
                    </div>
                  )}
                </div>
                <Btn col="blue" onClick={addShareholder}>+ Add partner</Btn>
              </div>
              {shareholders.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24, color: C.muted, fontSize: 13 }}>
                  No partners yet. Click <strong>Add partner</strong> to start.
                </div>
              ) : (
                shareholders.sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); }).map(function (sh) {
                  var invPct = shareholderInvestmentPct(sh, totalInvestment);
                  return (
                    <div key={sh.id} style={{ border: "1px solid " + C.border, borderRadius: 10, padding: 14, marginBottom: 12, background: sh.isActive === false ? "#f1f5f9" : "#fff" }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <div style={{ flex: "1 1 120px" }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>Name</label>
                          <Input value={sh.name} onChange={function (e) { updateShareholder(sh.id, { name: e.target.value }); }} placeholder="Partner name" />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>Invested ({sym})</label>
                          <Input type="number" step="1" min="0" value={sh.investmentAmount || ""} onChange={function (e) { updateShareholder(sh.id, { investmentAmount: parseFloat(e.target.value) || 0 }); }} style={{ width: 120 }} placeholder="100000" />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>Old balance owed ({sym})</label>
                          <Input type="number" step="0.01" min="0" value={sh.openingBalanceOwed || ""} onChange={function (e) { updateShareholder(sh.id, { openingBalanceOwed: parseFloat(e.target.value) || 0 }); }} style={{ width: 120 }} placeholder="500" />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>Capital %</label>
                          <Input value={totalInvestment > 0 ? (fmtNum(invPct) + "%") : "—"} readOnly style={{ width: 72, background: "#f1f5f9", fontWeight: 800 }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>Shop %</label>
                          <Input type="number" min="0" max="100" value={sh.userSharePercentage} onChange={function (e) { updateShareholder(sh.id, { userSharePercentage: parseFloat(e.target.value) || 0 }); }} style={{ width: 64 }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>Partner %</label>
                          <Input value={sh.partnerSharePercentage} readOnly style={{ width: 64, background: "#f1f5f9" }} />
                        </div>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", paddingBottom: 6 }}>
                          <input type="checkbox" checked={sh.isActive !== false} onChange={function (e) { updateShareholder(sh.id, { isActive: e.target.checked }); }} />
                          Active
                        </label>
                        <Btn sm col="red" onClick={function () { removeShareholder(sh.id); }}>Remove</Btn>
                      </div>
                    </div>
                  );
                })
              )}
            </React.Fragment>
          )}
        </Card>
      )}

      {editRow && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={function () { setEditRow(null); setEditRowOrigStatus(""); }}>
          <div style={modalShellStyle({ width: "100%", maxWidth: 520, maxHeight: "90vh" })} onClick={function (e) { e.stopPropagation(); }}>
            <div style={modalHeaderBarStyle()}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>Edit COD record</div>
              <CloseIconButton onClick={function () { setEditRow(null); setEditRowOrigStatus(""); }} size={32} bg="rgba(255,255,255,0.12)" color="#fff" borderRadius={8} />
            </div>
            <div style={modalBodyStyle({ padding: "18px 20px 20px" })}>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 10003, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={function () { setWdModal(null); }}>
          <div style={modalShellStyle({ width: "100%", maxWidth: 440 })} onClick={function (e) { e.stopPropagation(); }}>
            <div style={modalHeaderBarStyle()}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>
                {wdForm.withdrawFrom === "yourProfit" ? "Shop profit withdrawal" :
                  wdForm.withdrawFrom === "profit" ? "Partner profit withdrawal" :
                  "Cost recovery withdrawal"}
              </div>
              <CloseIconButton onClick={function () { setWdModal(null); }} size={32} bg="rgba(255,255,255,0.12)" color="#fff" borderRadius={8} />
            </div>
            <div style={modalBodyStyle({ padding: "18px 22px 22px" })}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
              COD-only payout — does not affect main ERP Accounts or cash.
            </div>
            {["paidItems", "freeItems", "courier"].indexOf(wdForm.withdrawFrom) >= 0 ? (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>Cost type</label>
                <Sel value={wdForm.withdrawFrom} onChange={function (e) { setWdForm(Object.assign({}, wdForm, { withdrawFrom: e.target.value })); }} style={{ width: "100%" }}>
                  <option value="paidItems">Paid items cost</option>
                  <option value="freeItems">Free items cost</option>
                  <option value="courier">COD / delivery cost</option>
                </Sel>
              </div>
            ) : null}
            {wdForm.withdrawFrom === "profit" && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>Partner name</label>
                {activeSh.length === 0 ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Input value={wdQuickPayee} onChange={function (e) { setWdQuickPayee(e.target.value); }} placeholder="Partner name" style={{ flex: 1 }} />
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
              <div style={{ fontSize: 12, padding: "8px 12px", background: "#e8f0fe", borderRadius: 8, border: "1px solid #bfdbfe", marginBottom: 12 }}>
                <span style={{ color: C.muted, fontWeight: 700 }}>Can withdraw more: </span>
                <strong style={{ color: C.blue }}>{sym} {fmtNum(wdSelectedBalance)}</strong>
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>Date</label>
              <Input type="date" value={wdForm.date} onChange={function (e) { setWdForm(Object.assign({}, wdForm, { date: e.target.value })); }} style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>Amount ({sym})</label>
              <Input type="number" step="0.01" min="0" value={wdForm.amount} onChange={function (e) { setWdForm(Object.assign({}, wdForm, { amount: e.target.value })); }} style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>Note (optional)</label>
              <Input value={wdForm.note} onChange={function (e) { setWdForm(Object.assign({}, wdForm, { note: e.target.value })); }} placeholder="Cash, bank transfer…" style={{ width: "100%" }} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn col="gray" onClick={function () { setWdModal(null); }}>Cancel</Btn>
              <Btn col="green" onClick={addWithdrawal}>Record withdrawal</Btn>
            </div>
            </div>
          </div>
        </div>
      )}

      {labelPreview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 10002, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={function () { setLabelPreview(null); }}>
          <div style={modalShellStyle({ width: "100%", maxWidth: 920, maxHeight: "92vh" })} onClick={function (e) { e.stopPropagation(); }}>
            <div style={modalHeaderBarStyle()}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>Address label — print preview</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 4 }}>
                  A5 landscape · printable area margins: 1&nbsp;cm top/bottom, 0.5&nbsp;cm left/right
                </div>
              </div>
              <CloseIconButton onClick={function () { setLabelPreview(null); }} size={32} bg="rgba(255,255,255,0.12)" color="#fff" borderRadius={8} />
            </div>
            <div style={modalBodyStyle({ padding: "16px 20px 20px" })}>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={modalShellStyle({ width: "100%", maxWidth: 380 })}>
            <div style={modalHeaderBarStyle()}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>Admin password required</div>
              <CloseIconButton onClick={function () { setStatusPwModal(null); setStatusPwEntry(""); setStatusPwErr(""); }} size={32} bg="rgba(255,255,255,0.12)" color="#fff" borderRadius={8} />
            </div>
            <div style={modalBodyStyle({ padding: "18px 22px 22px" })}>
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
