import React, { useState, useEffect, useRef } from "react";
import {
  INVOICE_LANG_KEYS,
  INVOICE_LANG_NAMES,
  ALL_LANGUAGES,
  normalizeOptionalInvoiceLangs,
} from "../config/invoicePrintLabels.js";
import {
  CURATED_COUNTRIES,
  getSuggestedOptionalLangsForCountry,
  mergeOptionalForCountryChange,
  sanitizePersistedInvoiceLangs,
} from "../config/countryLanguageData.js";
import { getCountryMeta, getPrimaryCountryForCurrency, APP_CURRENCY_OPTIONS } from "../countryMeta";
import { mergeTaxesOnCountryChange, normalizeTaxList } from "../tax/countryTaxMeta.js";
import { validateSnapshotIntegrity } from "../accounting/financialSnapshot.js";
import { SnapshotIntegrityBadge } from "../ui/SnapshotIntegrityBadge.jsx";

var WARRANTY_TEXT = "WARRANTY POLICY\n• Laptops & Desktops: 6 months warranty on hardware defects.\n• Accessories & Peripherals: 1 month replacement warranty.\n• Warranty is void if physically damaged, liquid damaged, or tampered with.\n• Warranty covers manufacturer defects only, not user damage.\n• Please retain this invoice as proof of purchase for warranty claims.";

var Settings = function (props) {
  var state = props.state;
  var setState = props.setState;
  var licenseInfo = props.licenseInfo || null;
  var onActivate = props.onActivate || null;
  var wizardUi = props.wizardUi === true;
  var onWizardBack = props.onWizardBack;
  /* Network config — passed down from App via systemConfig prop */
  var systemConfig    = props.systemConfig || { role: 'standalone', apiUrl: '' };
  var isNetworkServer = systemConfig.role === 'network_server';
  var isNetworkClient = systemConfig.role === 'network_client';
  var isNetworkMode   = isNetworkServer || isNetworkClient;
  var S = props.S;
  var C = props.C;
  var today = props.today;
  var uid = props.uid;
  var showAlert = props.showAlert;
  var showConfirm = props.showConfirm;
  var pwMatchesAsync = props.pwMatchesAsync;
  var hashPw = props.hashPw;
  var getCurrencySymbol = props.getCurrencySymbol;
  var updateCurrencySymbol = props.updateCurrencySymbol;
  var fmtNum = props.fmtNum;
  var fmtDate = props.fmtDate;
  var fmtDateFull = props.fmtDateFull;
  var validateCoreStartupIdentity = props.validateCoreStartupIdentity;
  var getCoreStartupIdentityAlertMessage = props.getCoreStartupIdentityAlertMessage;
  var getBusinessProfile = props.getBusinessProfile;
  var _idbCache = props._idbCache;
  var _idbWrite = props._idbWrite;
  var AboutTab = props.AboutTab;
  var InvoiceThermal = props.InvoiceThermal;
  var InvoiceA4 = props.InvoiceA4;
  var Input = props.Input;
  var Btn = props.Btn;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var Sel = props.Sel;
  var Modal = props.Modal;
  var StatCard = props.StatCard;
  var [stab, setStab] = useState("shop");
  var [showSupportPinResetHint, setShowSupportPinResetHint] = useState(false);
  var [showAppPasswordResetHint, setShowAppPasswordResetHint] = useState(false);
  var [invFmt, setInvFmt] = useState("a4a5"); /* A4/A5 vs Thermal tab in Invoice Design */
  var [countrySearchOpen, setCountrySearchOpen] = useState(false);
  var [countrySearchQ, setCountrySearchQ] = useState("");
  var countryPickerWrapRef = useRef(null);
  var taxModeTooltipRef = useRef(null);
  var [taxModeTooltipOpen, setTaxModeTooltipOpen] = useState(false);
  var [taxCustomName, setTaxCustomName] = useState("");
  var [taxCustomRate, setTaxCustomRate] = useState("");
  var [coreStartupErr, setCoreStartupErr] = useState({ shopName: false, phone: false, address: false });
  var [f, setF] = useState(Object.assign({}, state.settings, {
    capitalInvested: state.settings.capitalInvested || 0,
    backupFolder: state.settings.backupFolder || "",
    warrantyEnabled: state.settings.warrantyEnabled !== false,
    warrantyText: state.settings.warrantyText || WARRANTY_TEXT,
    labelWidth: state.settings.labelWidth || "60mm",
    labelHeight: state.settings.labelHeight || "auto",
    barcodeHeight: state.settings.barcodeHeight || 30,
    barcodeWidthMm: state.settings.barcodeWidthMm || "100%",
    barcodeFontSize: state.settings.barcodeFontSize || 9,
    barcodePriceFontSize: state.settings.barcodePriceFontSize || 11,
    barcodeBarWidth: state.settings.barcodeBarWidth || "1.2",
    barcodeShowCost: state.settings.barcodeShowCost !== false,
    barcodeShowPrice: state.settings.barcodeShowPrice !== false,
    barcodeShowShopName: state.settings.barcodeShowShopName !== false,
    labelCopies: state.settings.labelCopies || 1,
    labelBorder: state.settings.labelBorder || "solid",
    labelShopColor: state.settings.labelShopColor || "#1e3a5f",
    labelPriceColor: state.settings.labelPriceColor || "#000000",
    labelBgColor: state.settings.labelBgColor || "#ffffff",
    labelTextAlign: state.settings.labelTextAlign || "center",
    labelFooterText: state.settings.labelFooterText || "",
    labelShowBarcode: state.settings.labelShowBarcode !== false,
    labelShowProductCode: state.settings.labelShowProductCode !== false,
    barcodeUseProductId: state.settings.barcodeUseProductId === true,
    invoiceAccentColor: state.settings.invoiceAccentColor || "#0284c7",
    invoiceDefaultSize: state.settings.invoiceDefaultSize || "a4",
    invoiceThermalSize: state.settings.invoiceThermalSize || "thermal80",
    invoiceLogo: state.settings.invoiceLogo || "",
    invoiceLogoSize: state.settings.invoiceLogoSize || 56,
    invoiceLogoAlign: state.settings.invoiceLogoAlign || "left",
    invoicePdfFolder: state.settings.invoicePdfFolder || "",
    shopCountry: state.settings.shopCountry || "",
    defaultInvoiceLang: state.settings.defaultInvoiceLang || "en",
    optionalInvoiceLangs: Array.isArray(state.settings.optionalInvoiceLangs) ? state.settings.optionalInvoiceLangs : ["ta", "si"],
    customInvoiceLangs: Array.isArray(state.settings.customInvoiceLangs) ? state.settings.customInvoiceLangs : [],
    taxEnabled: state.settings.taxEnabled === true,
    taxMode: state.settings.taxMode === "inclusive" ? "inclusive" : "exclusive",
    taxApplyBase: state.settings.taxApplyBase === "before_discount" ? "before_discount" : "after_discount",
    selectedTaxes: normalizeTaxList(state.settings.selectedTaxes || []),
    lockedUntilDate: state.settings.lockedUntilDate || "",
    inventoryCostingMethod: state.settings.inventoryCostingMethod === "fifo" ? "fifo" : "wac",
    preventNegativeStock: state.settings.preventNegativeStock !== false,
    allowCostFallback: state.settings.allowCostFallback === true,
    glVatPostingEnabled: state.settings.glVatPostingEnabled !== false,
  }));
  var [newAsset, setNewAsset] = useState(null);
  var [editAsset, setEditAsset] = useState(null);
  var [assetActionModal, setAssetActionModal] = useState(null);
  var [assetPw, setAssetPw] = useState("");
  var [assetReason, setAssetReason] = useState("");
  var [assetPwMsg, setAssetPwMsg] = useState("");
  var [previewInv, setPreviewInv] = useState(null);
  var [pwOld, setPwOld] = useState("");
  var [adminNameEdit, setAdminNameEdit] = useState(S.get("tc3_admin_name", ""));
  var [adminNameMsg, setAdminNameMsg] = useState(null);
  var [pwNew, setPwNew] = useState("");
  var [pwNew2, setPwNew2] = useState("");
  var [pwMsg, setPwMsg] = useState(null);
  var [resetStep, setResetStep] = useState(0);
  var [resetPw, setResetPw] = useState("");
  var [resetMsg, setResetMsg] = useState(null);
  var [bakMsg, setBakMsg] = useState(null);
  var [capForm, setCapForm] = useState({ type: "invest", amount: "", date: today(), note: "", ref: "", cashMethod: "Cash" });
  var [capEditModal, setCapEditModal] = useState(null);
  var [capEditForm, setCapEditForm] = useState(null);
  var [capActionPw, setCapActionPw] = useState("");
  var [capActionReason, setCapActionReason] = useState("");
  var [capActionMsg, setCapActionMsg] = useState("");
  var [capDeleteTarget, setCapDeleteTarget] = useState(null);
  /* Cloud sync states — must be at component top level, not inside IIFE */
  var [cloudEmail,   setCloudEmail]   = useState("");
  var [cloudPass,    setCloudPass]    = useState("");
  var [cloudMsg,     setCloudMsg]     = useState(null);
  var [cloudLoading, setCloudLoading] = useState(false);

  var ALL_KEYS = ["tc3_settings", "tc3_products", "tc3_customers", "tc3_suppliers", "tc3_sales", "tc3_purchases", "tc3_expenses", "tc3_repairs", "tc3_assets", "tc3_damageLog", "tc3_productLog", "tc3_repairDeleteLog", "tc3_capLedger", "tc3_capLog", "tc3_manualPayables", "tc3_manualReceivables", "tc3_profitDist", "tc3_assetLog", "tc3_openBal", "tc3_auditLog", "tc3_salesReturns", "tc3_purchaseReturns", "tc3_quotations", "tc3_cheques", "tc3_labelDesigns", "tc3_journal_lines", "tc3_gl_accounts", "tc3_gl_mode", "tc3_journal_hash", "tc3_inventory_layers", "tc3_financial_snapshots", "tc3_stock_movements", "tc3_inv_reconciliation"];

  var buildBackupObject = function () {
    var backup = { version: 2, timestamp: new Date().toISOString(), shopName: state.settings.shopName || "Techon", data: {} };
    ALL_KEYS.forEach(function (k) { var v = _idbCache[k]; if (v !== undefined) { backup.data[k] = v; } });
    return backup;
  };

  var downloadJson = function (backup, filename) {
    var blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  };

  var doManualBackup = function () {
    try {
      var backup = buildBackupObject();
      var d = new Date().toISOString().slice(0, 10);
      downloadJson(backup, "techon-erp-backup-" + d + ".json");
      S.set("tc3_last_manual_backup", new Date().toISOString());
      setBakMsg({ type: "success", text: "✅ Backup downloaded: techon-erp-backup-" + d + ".json" });
    } catch (e) { setBakMsg({ type: "error", text: "Backup failed: " + e.message }); }
  };

  var doSafetyBackup = function () {
    try {
      var backup = buildBackupObject();
      var ts = new Date().toISOString().split(":").join("-").split(".").join("-").slice(0, 19);
      downloadJson(backup, "techon-safety-before-restore-" + ts + ".json");
      return true;
    } catch (e) { return false; }
  };

  var doResetData = function () {
    var storedPw = S.get("tc3_apppass", "");
    pwMatchesAsync(resetPw, storedPw).then(function (ok) {
      if (!ok) { setResetMsg({ type: "error", text: "Incorrect password. Reset cancelled." }); return; }
      doResetDataCore();
    });
  };

  var doResetDataCore = function () {

    /* FIX #7: Download safety backup FIRST and confirm it succeeded before wiping */
    var backupOk = false;
    try {
      var bakObj = buildBackupObject();
      var bakStr = JSON.stringify(bakObj, null, 2);
      if (!bakStr || bakStr.length < 10) throw new Error("Backup appears empty");
      var blob = new Blob([bakStr], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var d = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
      a.href = url; a.download = "techon-safety-backup-before-reset-" + d + ".json"; a.click();
      URL.revokeObjectURL(url);
      backupOk = true;
    } catch (e) {
      setResetMsg({ type: "error", text: "Safety backup failed: " + e.message + ". Reset aborted — your data is safe." });
      return; /* ABORT if backup fails */
    }

    if (!backupOk) {
      setResetMsg({ type: "error", text: "Safety backup could not be created. Reset aborted." });
      return;
    }

    setResetMsg({ type: "success", text: "✅ Safety backup downloaded. Wiping data..." });

    /* Small delay so user sees the progress message */
    setTimeout(function () {
      /* Nuclear wipe — clear IDB cache and IndexedDB for all tc3_ keys */
      var allCacheKeys = Object.keys(_idbCache).filter(function (k) { return k.indexOf("tc3_") === 0; });
      allCacheKeys.forEach(function (k) { delete _idbCache[k]; _idbWrite(k, undefined); });
      /* Also clear localStorage for backward compatibility */
      for (var ki = localStorage.length - 1; ki >= 0; ki--) {
        var kk = localStorage.key(ki);
        if (kk && kk.indexOf("tc3_") === 0) localStorage.removeItem(kk);
      }
      /* Write empty arrays for all data keys so loadState never falls back to SEED */
      var emptyData = ["tc3_products", "tc3_customers", "tc3_suppliers", "tc3_sales", "tc3_purchases", "tc3_expenses", "tc3_repairs", "tc3_assets", "tc3_damageLog", "tc3_productLog", "tc3_repairDeleteLog", "tc3_labelDesigns"];
      emptyData.forEach(function (k) { S.set(k, []); });
      /* Write blank settings — no shop name, no logo, no warranty, no preset values */
      var blankSettings = { shopName: "", address: "", phone: "", phone2: "", whatsapp: "", email: "", website: "", brn: "", footer: "", capitalInvested: 0, warrantyEnabled: false, warrantyText: "", invoiceAccentColor: "#0d47a1", invoiceDefaultSize: "a4", invoiceThermalSize: "thermal80", invoiceLogo: "", invoiceLogoSize: 80, barcodeWidth: 60, barcodeHeight: 30, barcodeFontSize: 9, barcodeFontSize2: 11, barcodeBarWidth: "1.2", barcodeShowCost: true, barcodeShowPrice: true, barcodeShowShopName: true, barcodeUseProductId: false, labelWidth: "60mm", labelHeight: "auto", barcodeWidthMm: "100%", labelCopies: 1, labelBorder: "solid", labelShopColor: "#1e3a5f", labelPriceColor: "#000000", labelBgColor: "#ffffff", labelTextAlign: "center", labelFooterText: "", labelShowBarcode: true, labelShowProductCode: true, costCodeWord: "STARLIGHKZ", shopCountry: "", defaultInvoiceLang: "en", optionalInvoiceLangs: ["ta", "si"], customInvoiceLangs: [], taxEnabled: false, taxMode: "exclusive", selectedTaxes: [] };
      S.set("tc3_settings", blankSettings);
      /* Remove password and admin name — app will show first-run setup on reload */
      S.set("tc3_apppass", "");
      S.set("tc3_admin_name", "");
      setResetMsg({ type: "success", text: "✅ System reset complete. Reloading in 2 seconds..." });
      setTimeout(function () { window.location.reload(); }, 2000);
    }, 600);
  };

  var doRestore = function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var backup = JSON.parse(ev.target.result);
        if (!backup.data || !backup.version) { setBakMsg({ type: "error", text: "Invalid backup file format." }); return; }
        showConfirm("Restore from backup dated " + (backup.timestamp ? new Date(backup.timestamp).toLocaleString() : "unknown") + "?\n\nThis will first download a SAFETY BACKUP of your current data, then restore. Continue?", function () {
          doSafetyBackup();
          setTimeout(function () {
            /* Write restored data directly into IDB cache AND IndexedDB.
               This ensures initAndLoadIDB finds the restored data on reload,
               even though IndexedDB is not empty (so migration won't re-run). */
            ALL_KEYS.forEach(function (k) {
              if (backup.data[k] !== undefined) {
                _idbCache[k] = backup.data[k];
                _idbWrite(k, backup.data[k]);
              }
            });
            setBakMsg({ type: "success", text: "Restore complete! Reloading in 2 seconds..." });
            setTimeout(function () { window.location.reload(); }, 2000);
          }, 800);
        });
      } catch (err) { setBakMsg({ type: "error", text: "Restore failed: " + err.message }); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  var doExcelExport = function () {
    try {
      var lines = [];
      // Sheet: Products
      lines.push("=== PRODUCTS ===");
      lines.push("ID,Name,Barcode,Category,Cost,Price,Stock,Damaged");
      state.products.forEach(function (p) { lines.push([p.productId || "", p.name || "", p.barcode || "", p.category || "", p.cost || 0, p.price || 0, p.stock || 0, p.damaged || 0].join(",")); });
      lines.push("");
      // Sheet: Sales
      lines.push("=== SALES ===");
      lines.push("Invoice,Date,Customer,Items,Total,Paid,Balance,Status");
      state.sales.forEach(function (s) { lines.push([(s.invoiceNo || s.id.slice(0, 8)), s.date, (s.customerName || "Walk-in"), (s.items || []).length, s.total || 0, s.paid || 0, s.balance || 0, s.payStatus || ""].join(",")); });
      lines.push("");
      // Sheet: Purchases
      lines.push("=== PURCHASES ===");
      lines.push("Invoice,Date,Supplier,Items,Total,Paid,Balance,Status");
      state.purchases.forEach(function (p) { lines.push([(p.invoiceNo || p.id.slice(0, 8)), p.date, (p.supplier || ""), (p.items || []).length, p.total || 0, p.paidAmount || 0, Math.max(0, (p.total || 0) - (p.paidAmount || 0)), p.status || ""].join(",")); });
      lines.push("");
      // Sheet: Customers
      lines.push("=== CUSTOMERS ===");
      lines.push("Name,Phone,Address,Credit,Total Spent");
      state.customers.forEach(function (c) { lines.push([(c.name || ""), (c.phone || ""), (c.address || ""), (c.credit || 0), (c.totalSpent || 0)].join(",")); });
      lines.push("");
      // Sheet: Expenses
      lines.push("=== EXPENSES ===");
      lines.push("Date,Category,Description,Amount,Payee,Pay Mode");
      state.expenses.forEach(function (e) { lines.push([e.date, (e.category || ""), (e.description || ""), (e.amount || 0), (e.payee || ""), (e.payMode || "")].join(",")); });
      lines.push("");
      // Sheet: Repairs
      lines.push("=== REPAIRS ===");
      lines.push("ID,Date,Customer,Phone,Device,Brand,Problem,Cost,Status");
      state.repairs.forEach(function (r) { lines.push([(r.id || "").slice(0, 8), r.date, (r.customer || ""), (r.phone || ""), (r.deviceType || ""), (r.brand || ""), (r.problem || ""), (r.estimatedCost || r.cost || 0), (r.status || "")].join(",")); });
      var csv = lines.join("\n");
      var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var d = new Date().toISOString().slice(0, 10);
      a.href = url; a.download = "techon-erp-export-" + d + ".csv";
      a.click(); URL.revokeObjectURL(url);
      setBakMsg({ type: "success", text: "✅ Excel/CSV export downloaded! Open with Excel or Google Sheets." });
    } catch (e) { setBakMsg({ type: "error", text: "Export failed: " + e.message }); }
  };

  var criticalAccountingRef = useRef(null);

  var save = function (opts) {
    var silent = opts && opts.silent;
    var ns = Object.assign({}, state.settings, f);
    ns.selectedTaxes = normalizeTaxList(ns.selectedTaxes || []);
    ns.taxMode = ns.taxMode === "inclusive" ? "inclusive" : "exclusive";
    ns.taxEnabled = ns.taxEnabled === true;
    ns.allowCostFallback = ns.allowCostFallback === true;
    ns.glVatPostingEnabled = ns.glVatPostingEnabled !== false;
    ns.taxApplyBase = ns.taxApplyBase === "before_discount" ? "before_discount" : "after_discount";
    var sl = sanitizePersistedInvoiceLangs(ns.defaultInvoiceLang || "en", ns.optionalInvoiceLangs, ns.customInvoiceLangs);
    ns.optionalInvoiceLangs = sl.optionalInvoiceLangs;
    ns.customInvoiceLangs = sl.customInvoiceLangs;
    updateCurrencySymbol(ns.currency); // Update live currency symbol
    S.set("tc3_settings", ns);
    setState(function (st) { return Object.assign({}, st, { settings: ns }); });
    criticalAccountingRef.current = {
      glMode: S.get("tc3_gl_mode", "live"),
      inventoryCostingMethod: ns.inventoryCostingMethod || "wac",
      taxMode: ns.taxMode === "inclusive" ? "inclusive" : "exclusive",
      taxEnabled: ns.taxEnabled === true,
      selectedTaxesKey: JSON.stringify(normalizeTaxList(ns.selectedTaxes || [])),
      glVatPostingEnabled: ns.glVatPostingEnabled !== false,
    };
    if (!silent) showAlert("Settings saved successfully.");
  };

  var saveAccountingSettings = function () {
    var base = criticalAccountingRef.current;
    if (!base) {
      save();
      return;
    }
    var gl = S.get("tc3_gl_mode", "live");
    var taxKey = JSON.stringify(normalizeTaxList(f.selectedTaxes || []));
    var fTaxMode = f.taxMode === "inclusive" ? "inclusive" : "exclusive";
    var dirty =
      gl !== base.glMode ||
      (f.inventoryCostingMethod || "wac") !== base.inventoryCostingMethod ||
      fTaxMode !== base.taxMode ||
      (f.taxEnabled === true) !== base.taxEnabled ||
      taxKey !== base.selectedTaxesKey ||
      (f.glVatPostingEnabled !== false) !== base.glVatPostingEnabled;
    if (dirty) {
      showConfirm(
        "This may affect existing data.\n\nChanging accounting mode, inventory costing, or tax settings can impact reports and stock valuation.\n\nContinue?",
        function () { save(); }
      );
    } else {
      save();
    }
  };

  useEffect(function () {
    criticalAccountingRef.current = {
      glMode: S.get("tc3_gl_mode", "live"),
      inventoryCostingMethod: state.settings.inventoryCostingMethod || "wac",
      taxMode: state.settings.taxMode === "inclusive" ? "inclusive" : "exclusive",
      taxEnabled: state.settings.taxEnabled === true,
      selectedTaxesKey: JSON.stringify(normalizeTaxList(state.settings.selectedTaxes || [])),
      glVatPostingEnabled: state.settings.glVatPostingEnabled !== false,
    };
  }, [state.settings]);

  var saveAdminName = function () {
    if (!adminNameEdit || adminNameEdit.trim().length < 2) { setAdminNameMsg({ type: "error", text: "Name must be at least 2 characters." }); return; }
    S.set("tc3_admin_name", adminNameEdit.trim());
    setAdminNameMsg({ type: "success", text: "Administrator name updated!" });
  };

  var savePassword = function () {
    var current = S.get("tc3_apppass", "");
    if (!pwNew || pwNew.length < 4) { setPwMsg({ type: "error", text: "New password must be at least 4 characters." }); return; }
    if (pwNew !== pwNew2) { setPwMsg({ type: "error", text: "Passwords do not match." }); return; }
    /* Verify old password (async for hashed, sync for legacy plaintext) */
    pwMatchesAsync(pwOld, current).then(function (oldOk) {
      if (current && !oldOk) { setPwMsg({ type: "error", text: "Current password incorrect." }); return; }
      hashPw(pwNew).then(function (hashed) {
        S.set("tc3_apppass", hashed);
        setPwMsg({ type: "success", text: "Password changed successfully!" });
        setPwOld(""); setPwNew(""); setPwNew2("");
      });
    });
  };

  var removeLogo = function () {
    setF(function (x) { return Object.assign({}, x, { invoiceLogo: "" }); });
  };

  var handleLogoUpload = function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      setF(function (x) { return Object.assign({}, x, { invoiceLogo: ev.target.result }); });
    };
    reader.readAsDataURL(file);
  };

  var saveAsset = function () {
    if (!newAsset || !newAsset.name || !newAsset.amount) return;
    var a = { id: uid(), date: newAsset.date || today(), name: newAsset.name, category: newAsset.category || "Equipment", amount: parseFloat(newAsset.amount) || 0, note: newAsset.note || "", cashMethod: newAsset.cashMethod || "Cash" };
    var na = (state.assets || []).concat([a]);
    S.set("tc3_assets", na);
    setState(function (st) { return Object.assign({}, st, { assets: na }); });
    setNewAsset(null);
  };

  var doAssetAction = function () {
    var storedPw = S.get("tc3_apppass", "");
    if (!assetPw) { setAssetPwMsg("Password required."); return; }
    if (!assetReason || assetReason.trim().length < 3) {
      setAssetPwMsg("Please enter a reason (min 3 chars).");
      return;
    }
    pwMatchesAsync(assetPw, storedPw).then(function (ok) {
      if (!ok) { setAssetPwMsg("Incorrect password."); return; }
      var action = assetActionModal;
      if (action === "delete" && editAsset) {
        var filtered = (state.assets || []).filter(function (a) { return a.id !== editAsset.id; });
        S.set("tc3_assets", filtered);
        setState(function (st) { return Object.assign({}, st, { assets: filtered }); });
        var logEntry = { id: uid(), date: today(), action: "Deleted", assetId: editAsset.id, assetName: editAsset.name, category: editAsset.category, amount: editAsset.amount, reason: assetReason.trim() };
        var prevLog = S.get("tc3_assetLog", []);
        var newLog = prevLog.concat([logEntry]);
        S.set("tc3_assetLog", newLog);
        setState(function (st) { return Object.assign({}, st, { assetLog: newLog }); });
      } else if (action === "edit" && editAsset) {
        var logEntry2 = { id: uid(), date: today(), action: "Edited", assetId: editAsset.id, assetName: editAsset.name, category: editAsset.category, amount: editAsset.amount, reason: assetReason.trim(), oldData: editAsset };
        var updated = (state.assets || []).map(function (a) { return a.id === editAsset.id ? Object.assign({}, editAsset) : a; });
        S.set("tc3_assets", updated);
        setState(function (st) { return Object.assign({}, st, { assets: updated }); });
        var prevLog2 = S.get("tc3_assetLog", []);
        var newLog2 = prevLog2.concat([logEntry2]);
        S.set("tc3_assetLog", newLog2);
        setState(function (st) { return Object.assign({}, st, { assetLog: newLog2 }); });
      }
      setAssetActionModal(null);
      setEditAsset(null);
      setAssetPw("");
      setAssetReason("");
      setAssetPwMsg("");
    });
  };

  var ACATS = ["Shop Interior", "Advance Payment / Deposit", "Rent Deposit", "Equipment / Machinery", "Computers / Electronics", "Printer / Scanner", "Networking Equipment", "Furniture & Fixtures", "Vehicle", "Security System (CCTV)", "Electrical / UPS", "Software / Licenses", "Tools / Instruments", "Renovation / Improvements", "Other"];
  var getCapLedger = function () { return S.get("tc3_capLedger", []); };
  var getCapLog = function () { return S.get("tc3_capLog", []); };

  var saveCapEntry = function () {
    if (!capForm.amount || parseFloat(capForm.amount) <= 0) { showAlert("Please enter a valid amount."); return; }
    if (!capForm.date) { showAlert("Please select a date."); return; }
    var entry = { id: uid(), type: capForm.type, amount: parseFloat(capForm.amount), date: capForm.date, note: capForm.note || "", ref: capForm.ref || "", cashMethod: capForm.cashMethod || "Cash", createdAt: new Date().toISOString() };
    var ledger = getCapLedger().concat([entry]);
    S.set("tc3_capLedger", ledger);
    var total = ledger.reduce(function (a, e) { return a + (e.type === "invest" ? e.amount : -e.amount); }, 0);
    var ns = Object.assign({}, state.settings, { capitalInvested: total });
    S.set("tc3_settings", ns);
    setState(function (st) { return Object.assign({}, st, { settings: ns }); });
    setCapForm({ type: "invest", amount: "", date: today(), note: "", ref: "", cashMethod: "Cash" });
  };

  var doCapEdit = function () {
    var storedPw = S.get("tc3_apppass", "");
    if (!capActionPw) { setCapActionMsg("Password required."); return; }
    if (!capActionReason || capActionReason.trim().length < 3) { setCapActionMsg("Reason required (min 3 chars)."); return; }
    pwMatchesAsync(capActionPw, storedPw).then(function (ok) {
      if (!ok) { setCapActionMsg("Incorrect password."); return; }
      var ledger = getCapLedger().map(function (e) { return e.id === capEditForm.id ? Object.assign({}, capEditForm) : e; });
      S.set("tc3_capLedger", ledger);
      var total = ledger.reduce(function (a, e) { return a + (e.type === "invest" ? e.amount : -e.amount); }, 0);
      var ns = Object.assign({}, state.settings, { capitalInvested: total });
      S.set("tc3_settings", ns);
      setState(function (st) { return Object.assign({}, st, { settings: ns }); });
      var logEntry = { id: uid(), action: "Edited", entryId: capEditForm.id, type: capEditForm.type, amount: capEditForm.amount, date: capEditForm.date, reason: capActionReason, at: new Date().toISOString() };
      S.set("tc3_capLog", getCapLog().concat([logEntry]));
      setCapEditModal(null); setCapEditForm(null); setCapActionPw(""); setCapActionReason(""); setCapActionMsg("");
    });
  };

  var doCapDelete = function () {
    var storedPw = S.get("tc3_apppass", "");
    if (!capActionPw) { setCapActionMsg("Password required."); return; }
    if (!capActionReason || capActionReason.trim().length < 3) { setCapActionMsg("Reason required (min 3 chars)."); return; }
    pwMatchesAsync(capActionPw, storedPw).then(function (ok) {
      if (!ok) { setCapActionMsg("Incorrect password."); return; }
      var ledger = getCapLedger().filter(function (e) { return e.id !== capDeleteTarget.id; });
      S.set("tc3_capLedger", ledger);
      var total = ledger.reduce(function (a, e) { return a + (e.type === "invest" ? e.amount : -e.amount); }, 0);
      var ns = Object.assign({}, state.settings, { capitalInvested: total });
      S.set("tc3_settings", ns);
      setState(function (st) { return Object.assign({}, st, { settings: ns }); });
      var logEntry = { id: uid(), action: "Deleted", entryId: capDeleteTarget.id, type: capDeleteTarget.type, amount: capDeleteTarget.amount, date: capDeleteTarget.date, reason: capActionReason, at: new Date().toISOString() };
      S.set("tc3_capLog", getCapLog().concat([logEntry]));
      setCapDeleteTarget(null); setCapActionPw(""); setCapActionReason(""); setCapActionMsg("");
    });
  };

  var TABS = [["shop", "Shop Info"], ["langcurrency", "Language & Currency"], ["invoice", "Invoice Design"], ["backup", "Backup"], ["security", "Security"]];
  if (isNetworkMode) TABS.push(["network", "Network"]);
  TABS.push(["about", "About"]);

  var applyShopCountry = function (v) {
    setF(function (x) {
      var cust = Array.isArray(x.customInvoiceLangs) ? x.customInvoiceLangs.slice() : [];
      var meta = getCountryMeta(v);
      var patch = {
        shopCountry: v,
        defaultInvoiceLang: "en",
        optionalInvoiceLangs: mergeOptionalForCountryChange("en", v, cust),
        customInvoiceLangs: cust,
        selectedTaxes: mergeTaxesOnCountryChange(v, x.selectedTaxes),
      };
      if (meta && meta.currency) patch.currency = meta.currency;
      return Object.assign({}, x, patch);
    });
    var meta = getCountryMeta(v);
    if (meta && meta.currency) updateCurrencySymbol(meta.currency);
  };

  useEffect(function () {
    if (!countrySearchOpen) return;
    function onDocMouseDown(e) {
      if (countryPickerWrapRef.current && !countryPickerWrapRef.current.contains(e.target)) {
        setCountrySearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown, true);
    return function () { document.removeEventListener("mousedown", onDocMouseDown, true); };
  }, [countrySearchOpen]);

  useEffect(function () {
    if (stab !== "langcurrency") setCountrySearchOpen(false);
  }, [stab]);

  useEffect(function () {
    try {
      if (props.embeddedWizard) return;
      var pinReset = sessionStorage.getItem("tc3_open_security_pin_reset") === "1";
      var appPwReset = sessionStorage.getItem("tc3_open_app_password_reset") === "1";
      if (pinReset) {
        sessionStorage.removeItem("tc3_open_security_pin_reset");
        setStab("security");
        setShowSupportPinResetHint(true);
      }
      if (appPwReset) {
        sessionStorage.removeItem("tc3_open_app_password_reset");
        setStab("security");
        setShowAppPasswordResetHint(true);
      }
    } catch (e) { /* ignore */ }
  }, [props.embeddedWizard]);

  /* Startup wizard: force correct tab when embedding Settings */
  useEffect(function () {
    if (props.embeddedWizard === "shop_limited") setStab("shop");
    else if (props.embeddedWizard === "langcurrency") setStab("langcurrency");
  }, [props.embeddedWizard]);

  /* Wizard shop step: focus first invalid core field when entering this step (not on every keystroke). */
  useEffect(function () {
    if (props.embeddedWizard !== "shop_limited" || stab !== "shop") return;
    var snapshot = f;
    var t = setTimeout(function () {
      var v = validateCoreStartupIdentity(snapshot);
      if (v.ok) return;
      var order = ["shopName", "phone", "address"];
      for (var oi = 0; oi < order.length; oi++) {
        if (v.missing.indexOf(order[oi]) >= 0) {
          var el = document.getElementById("tc-core-" + order[oi]);
          if (el) {
            try { el.focus({ preventScroll: true }); } catch (e2) { el.focus(); }
          }
          break;
        }
      }
    }, 80);
    return function () { clearTimeout(t); };
  }, [stab, props.embeddedWizard]);

  var hideWizardTabs = !!props.embeddedWizard;
  var taxTipFine = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  useEffect(function () {
    if (!taxModeTooltipOpen) return;
    if (taxTipFine) return;
    function onDocMouseDown(e) {
      if (taxModeTooltipRef.current && !taxModeTooltipRef.current.contains(e.target)) {
        setTaxModeTooltipOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown, true);
    return function () { document.removeEventListener("mousedown", onDocMouseDown, true); };
  }, [taxModeTooltipOpen, taxTipFine]);

  var selectedCountryLabel = "";
  CURATED_COUNTRIES.forEach(function (c) {
    if (c.code === (f.shopCountry || "")) selectedCountryLabel = c.name;
  });
  var countryInputDisplay = countrySearchOpen ? countrySearchQ : selectedCountryLabel;

  var currencySelectValue = f.currency || state.settings.currency || "Rs";
  (function () {
    var ok = false;
    APP_CURRENCY_OPTIONS.forEach(function (o) {
      if (o.value === currencySelectValue) ok = true;
    });
    if (!ok) currencySelectValue = "Rs";
  })();

  var sampleInv = {
    invoiceNo: "INV-20250101-0001", date: today(),
    customerName: "Sample Customer", customerPhone: "0771234567",
    items: [{ name: "Laptop HP 15s", qty: 1, price: 85000 }, { name: "Laptop Bag", qty: 1, price: 3500 }, { name: "USB Mouse", qty: 2, price: 1200 }],
    subTotal: 90900, discount: 900, total: 90000, paid: 50000, balance: 40000, payStatus: "Partial", includeWarranty: true
  };

  var embWiz = props.embeddedWizard === "shop_limited" || props.embeddedWizard === "langcurrency";
  var langWizShell = wizardUi && props.embeddedWizard === "langcurrency";
  var wizPanelStyle = { background: "#fff", borderRadius: 16, border: "1px solid #e8ecf4", boxShadow: "0 4px 24px rgba(15,23,42,0.06)", padding: "20px 22px", marginBottom: 16 };
  var wizHeading = function (t) {
    return <div style={{ fontSize: 11, fontWeight: 900, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>{t}</div>;
  };
  var runWizardCoreIdentityStep = function (afterValid) {
    if (!embWiz) {
      afterValid();
      return;
    }
    var v = validateCoreStartupIdentity(f);
    if (!v.ok) {
      showAlert(getCoreStartupIdentityAlertMessage(v.missing));
      setCoreStartupErr({
        shopName: v.missing.indexOf("shopName") >= 0,
        phone: v.missing.indexOf("phone") >= 0,
        address: v.missing.indexOf("address") >= 0
      });
      setStab("shop");
      setTimeout(function () {
        var order = ["shopName", "phone", "address"];
        for (var oi = 0; oi < order.length; oi++) {
          if (v.missing.indexOf(order[oi]) >= 0) {
            var el = document.getElementById("tc-core-" + order[oi]);
            if (el && el.scrollIntoView) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              try { el.focus({ preventScroll: true }); } catch (e2) { el.focus(); }
            }
            break;
          }
        }
      }, 120);
      return;
    }
    setCoreStartupErr({ shopName: false, phone: false, address: false });
    afterValid();
  };

  return (
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {!hideWizardTabs && (
      <div style={{ display: "flex", gap: 4, borderBottom: "2px solid " + C.border, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map(function (t) {
          var icons = { shop: "🏪", langcurrency: "🌍", capital: "💼", invoice: "🧾", barcode: "🏷", assets: "📦", backup: "💾", security: "🔐", network: "🌐", about: "ℹ" };
          return <button key={t[0]} onClick={function () { setStab(t[0]); }} style={{ padding: "10px 20px", borderRadius: "10px 10px 0 0", border: "1.5px solid " + (stab === t[0] ? C.border : "transparent"), borderBottom: stab === t[0] ? "2px solid #fff" : "none", background: stab === t[0] ? "#fff" : "transparent", color: stab === t[0] ? C.accent : C.muted, fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: stab === t[0] ? -2 : 0 }}>{icons[t[0]]} {t[1]}</button>;
        })}
      </div>
      )}

      {stab === "shop" && (
        <div style={{ display: "flex", flexDirection: "column", gap: wizardUi && props.embeddedWizard === "shop_limited" ? 0 : 14 }}>
          {wizardUi && props.embeddedWizard === "shop_limited" ? (
            <React.Fragment>
              <div style={wizPanelStyle}>
                {wizHeading("Basic information")}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {(function () {
                    var bp = getBusinessProfile();
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 12, background: "linear-gradient(135deg," + bp.color + "14," + bp.color + "08)", border: "1.5px solid " + bp.color + "40", borderRadius: 12, padding: "12px 16px" }}>
                        <span style={{ fontSize: 24 }}>{bp.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>Business Type</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: bp.color }}>{bp.name}</div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{bp.units.length} units · {bp.categories.length} categories{bp.modules.repairs ? " · Repairs enabled" : ""}</div>
                        </div>
                        <div style={{ fontSize: 10, background: bp.color + "20", color: bp.color, borderRadius: 6, padding: "4px 10px", fontWeight: 800, letterSpacing: "0.04em" }}>FIXED</div>
                      </div>
                    );
                  })()}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <Input id="tc-core-shopName" error={embWiz && coreStartupErr.shopName} aria-describedby={embWiz && coreStartupErr.shopName ? "tc-core-hint-shopName" : undefined} label="Shop Name" value={f.shopName || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { shopName: e.target.value }); }); if (embWiz) setCoreStartupErr(function (prev) { return Object.assign({}, prev, { shopName: false }); }); }} placeholder="e.g. Techon Computers" />
                      {embWiz && coreStartupErr.shopName && <div id="tc-core-hint-shopName" role="status" aria-live="polite" style={{ fontSize: 11, color: "#e03151", fontWeight: 600, marginTop: 2, transition: "opacity .15s ease" }}>Required</div>}
                    </div>
                    <div />
                  </div>
                </div>
              </div>
              <div style={wizPanelStyle}>
                {wizHeading("Contact information")}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <Input id="tc-core-phone" error={embWiz && coreStartupErr.phone} aria-describedby={embWiz && (coreStartupErr.phone || coreStartupErr.address) ? "tc-core-hint-contact" : undefined} label="Primary Phone" value={f.phone || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); if (embWiz) setCoreStartupErr(function (prev) { return Object.assign({}, prev, { phone: false, address: false }); }); }} placeholder="+94 77 123 4567" />
                  </div>
                  <Input label="Second Phone" value={f.phone2 || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { phone2: e.target.value }); }); }} placeholder="+94 11 234 5678" />
                  <Input label="WhatsApp Number" value={f.whatsapp || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { whatsapp: e.target.value }); }); }} placeholder="+94 77 123 4567" />
                </div>
              </div>
              <div style={wizPanelStyle}>
                {wizHeading("Online information")}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Input label="Email Address" value={f.email || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { email: e.target.value }); }); }} placeholder="info@techon.lk" />
                  <Input label="Website" value={f.website || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { website: e.target.value }); }); }} placeholder="www.techon.lk" />
                </div>
              </div>
              <div style={Object.assign({}, wizPanelStyle, { marginBottom: 8 })}>
                {wizHeading("Address & invoice footer")}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <Input id="tc-core-address" error={embWiz && coreStartupErr.address} aria-describedby={embWiz && (coreStartupErr.phone || coreStartupErr.address) ? "tc-core-hint-contact" : undefined} label="Shop Address" value={f.address || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { address: e.target.value }); }); if (embWiz) setCoreStartupErr(function (prev) { return Object.assign({}, prev, { phone: false, address: false }); }); }} />
                    {embWiz && (coreStartupErr.phone || coreStartupErr.address) && <div id="tc-core-hint-contact" role="status" aria-live="polite" style={{ fontSize: 11, color: "#e03151", fontWeight: 600, marginTop: 2, transition: "opacity .15s ease" }}>Enter at least one</div>}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Input label="Business Reg. No (BRN)" value={f.brn || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { brn: e.target.value }); }); }} placeholder="e.g. PV 00012345" />
                    <Input label="Invoice Footer Message" value={f.footer || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { footer: e.target.value }); }); }} placeholder="Thank you for shopping with us!" />
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid #e8ecf4", marginTop: 4 }}>
                <button type="button" onClick={function () { if (onWizardBack) onWizardBack(); }} style={{ padding: "12px 22px", borderRadius: 12, border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 14, fontWeight: 800, color: "#475569", cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
                <Btn col="cyan" onClick={function () { runWizardCoreIdentityStep(function () { save({ silent: true }); if (props.onWizardNext) props.onWizardNext(); }); }}>Continue →</Btn>
              </div>
            </React.Fragment>
          ) : (
          <Card>
            <CardTitle sub="Your shop contact and display information">Shop Information</CardTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Business Type — read only */}
              {(function () {
                var bp = getBusinessProfile();
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, background: "linear-gradient(135deg," + bp.color + "14," + bp.color + "08)", border: "1.5px solid " + bp.color + "40", borderRadius: 10, padding: "12px 16px" }}>
                    <span style={{ fontSize: 24 }}>{bp.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>Business Type</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: bp.color }}>{bp.name}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{bp.units.length} units · {bp.categories.length} categories{bp.modules.repairs ? " · Repairs enabled" : ""}</div>
                    </div>
                    <div style={{ fontSize: 10, background: bp.color + "20", color: bp.color, borderRadius: 6, padding: "4px 10px", fontWeight: 800, letterSpacing: "0.04em" }}>FIXED</div>
                  </div>
                );
              })()}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <Input id="tc-core-shopName" error={embWiz && coreStartupErr.shopName} aria-describedby={embWiz && coreStartupErr.shopName ? "tc-core-hint-shopName" : undefined} label="Shop Name" value={f.shopName || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { shopName: e.target.value }); }); if (embWiz) setCoreStartupErr(function (prev) { return Object.assign({}, prev, { shopName: false }); }); }} placeholder="e.g. Techon Computers" />
                  {embWiz && coreStartupErr.shopName && <div id="tc-core-hint-shopName" role="status" aria-live="polite" style={{ fontSize: 11, color: "#e03151", fontWeight: 600, marginTop: 2, transition: "opacity .15s ease" }}>Required</div>}
                </div>
                <div>
                  <Input id="tc-core-phone" error={embWiz && coreStartupErr.phone} aria-describedby={embWiz && (coreStartupErr.phone || coreStartupErr.address) ? "tc-core-hint-contact" : undefined} label="Primary Phone" value={f.phone || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); if (embWiz) setCoreStartupErr(function (prev) { return Object.assign({}, prev, { phone: false, address: false }); }); }} placeholder="+94 77 123 4567" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Input label="Second Phone" value={f.phone2 || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { phone2: e.target.value }); }); }} placeholder="+94 11 234 5678" />
                <Input label="WhatsApp Number" value={f.whatsapp || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { whatsapp: e.target.value }); }); }} placeholder="+94 77 123 4567" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Input label="Email Address" value={f.email || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { email: e.target.value }); }); }} placeholder="info@techon.lk" />
                <Input label="Website" value={f.website || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { website: e.target.value }); }); }} placeholder="www.techon.lk" />
              </div>
              <div>
                <Input id="tc-core-address" error={embWiz && coreStartupErr.address} aria-describedby={embWiz && (coreStartupErr.phone || coreStartupErr.address) ? "tc-core-hint-contact" : undefined} label="Shop Address" value={f.address || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { address: e.target.value }); }); if (embWiz) setCoreStartupErr(function (prev) { return Object.assign({}, prev, { phone: false, address: false }); }); }} />
                {embWiz && (coreStartupErr.phone || coreStartupErr.address) && <div id="tc-core-hint-contact" role="status" aria-live="polite" style={{ fontSize: 11, color: "#e03151", fontWeight: 600, marginTop: 2, transition: "opacity .15s ease" }}>Enter at least one</div>}
              </div>
              <Input label="Business Reg. No (BRN)" value={f.brn || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { brn: e.target.value }); }); }} placeholder="e.g. PV 00012345" />
              <Input label="Invoice Footer Message" value={f.footer || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { footer: e.target.value }); }); }} placeholder="Thank you for shopping with us!" />
              <div style={{ marginTop: 4 }}>
                {props.embeddedWizard === "shop_limited" ? (
                  <Btn col="cyan" onClick={function () { runWizardCoreIdentityStep(function () { save({ silent: true }); if (props.onWizardNext) props.onWizardNext(); }); }}>Save &amp; Continue</Btn>
                ) : (
                  <Btn col="cyan" onClick={save}>Save Shop Info</Btn>
                )}
              </div>
            </div>
          </Card>
          )}

          {!props.embeddedWizard && (
            <React.Fragment>
              <Card>
                <CardTitle sub="Warn when editing records before this date">📅 Period Close Date</CardTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
                  <div style={{ background: C.accentSoft, borderRadius: 9, padding: "10px 14px", fontSize: 12, color: C.accent }}>
                    Set a &quot;Books Closed&quot; date. Any edit to records dated before this date will show a warning to protect historical data.
                  </div>
                  <Input label="Books Closed Date" type="date" value={f.booksClosedDate || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { booksClosedDate: e.target.value }); }); }} />
                  {f.booksClosedDate && <div style={{ fontSize: 11, color: C.muted }}>⚠ Edits to records before <strong>{fmtDate(f.booksClosedDate)}</strong> will require confirmation.</div>}
                  {f.booksClosedDate && <button onClick={function () { setF(function (x) { return Object.assign({}, x, { booksClosedDate: "" }); }); }} style={{ background: "none", border: "none", color: C.red, fontSize: 12, cursor: "pointer", textAlign: "left", fontWeight: 600 }}>✕ Clear date</button>}
                </div>
              </Card>

              <Card>
                <CardTitle sub="Double-entry journal mode, inventory costing, and hard period lock">⚖ Accounting &amp; GL</CardTitle>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
                    gap: 16,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ gridColumn: "1 / -1", width: "100%", marginBottom: 12, boxSizing: "border-box" }}>
                    <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: "#0369a1", width: "100%", boxSizing: "border-box" }}>
                      <strong>Live</strong> updates the journal on each transaction. <strong>Repair</strong> only rebuilds when you use Rebuild in Accounts or when data changes in this mode (fallback for large imports).
                    </div>
                  </div>

                  <div
                    style={{
                      gridColumn: "1 / -1",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
                      gap: 16,
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                      <label htmlFor="tc-settings-gl-mode" style={{ fontSize: 14, fontWeight: 500, color: C.text, lineHeight: 1.35 }}>Journal mode</label>
                      <select
                        id="tc-settings-gl-mode"
                        value={S.get("tc3_gl_mode", "live")}
                        onChange={function (e) {
                          S.set("tc3_gl_mode", e.target.value);
                          setState(function (st) { return Object.assign({}, st); });
                        }}
                        style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, background: "#fff", color: C.text, cursor: "pointer" }}
                      >
                        <option value="live">Live — journal is authoritative (recommended)</option>
                        <option value="rebuild">Repair — rebuild journal on schedule / manual only</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                      <label htmlFor="tc-settings-inv-costing" style={{ fontSize: 14, fontWeight: 500, color: C.text, lineHeight: 1.35 }}>Inventory costing</label>
                      <select
                        id="tc-settings-inv-costing"
                        value={f.inventoryCostingMethod || "wac"}
                        onChange={function (e) { setF(function (x) { return Object.assign({}, x, { inventoryCostingMethod: e.target.value }); }); }}
                        style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, background: "#fff", color: C.text, cursor: "pointer" }}
                      >
                        <option value="wac">Weighted average (line / product cost)</option>
                        <option value="fifo">FIFO (uses product fifoBatches when set)</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                      <label htmlFor="tc-settings-lock-date" style={{ fontSize: 14, fontWeight: 500, color: C.text, lineHeight: 1.35 }}>Lock date</label>
                      <input
                        id="tc-settings-lock-date"
                        type="date"
                        value={f.lockedUntilDate || ""}
                        onChange={function (e) { setF(function (x) { return Object.assign({}, x, { lockedUntilDate: e.target.value }); }); }}
                        style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#fff", color: C.text }}
                      />
                      <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.35 }}>Hard lock — no posts before this date</span>
                    </div>
                  </div>

                  {f.lockedUntilDate && (
                    <div style={{ gridColumn: "1 / -1", fontSize: 11, color: C.muted, marginTop: -4 }}>
                      Transactions dated before <strong>{fmtDate(f.lockedUntilDate)}</strong> are blocked unless Admin (PIN) is unlocked.
                    </div>
                  )}

                  <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, lineHeight: 1.35 }}>
                      <input
                        type="checkbox"
                        checked={!f.preventNegativeStock}
                        onChange={function (e) { setF(function (x) { return Object.assign({}, x, { preventNegativeStock: !e.target.checked }); }); }}
                        style={{ width: 16, height: 16, flexShrink: 0, accentColor: C.accent }}
                      />
                      <span>Allow negative stock (disables hard block on save)</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, lineHeight: 1.35 }}>
                      <input
                        type="checkbox"
                        checked={f.allowCostFallback === true}
                        onChange={function (e) { setF(function (x) { return Object.assign({}, x, { allowCostFallback: e.target.checked }); }); }}
                        style={{ width: 16, height: 16, flexShrink: 0, accentColor: C.accent }}
                      />
                      <span>FIFO: allow line-cost fallback when no layers (default off — stricter audit)</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, lineHeight: 1.35 }}>
                      <input
                        type="checkbox"
                        checked={f.glVatPostingEnabled !== false}
                        onChange={function (e) { setF(function (x) { return Object.assign({}, x, { glVatPostingEnabled: e.target.checked }); }); }}
                        style={{ width: 16, height: 16, flexShrink: 0, accentColor: C.accent }}
                      />
                      <span>Post VAT to GL (VAT Payable / Receivable) when tax is enabled</span>
                    </label>
                  </div>

                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
                    {typeof props.createFinancialSnapshot === "function" && (
                      <Btn col="gray" onClick={function () {
                        props.createFinancialSnapshot({ label: "Manual snapshot (Settings)" });
                      }}>Save financial snapshot</Btn>
                    )}
                    {typeof props.repairInventoryLayersFromReplay === "function" && (
                      <Btn col="cyan" onClick={props.repairInventoryLayersFromReplay}>Repair inventory layers (replay)</Btn>
                    )}
                    <Btn col="cyan" onClick={saveAccountingSettings}>Save accounting settings</Btn>
                  </div>

                  {typeof props.createFinancialSnapshot === "function" && (
                    <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 8, width: "100%", marginTop: 2 }}>
                      {(function () {
                        var snaps = S.get("tc3_financial_snapshots", []);
                        var last = Array.isArray(snaps) && snaps.length ? snaps[snaps.length - 1] : null;
                        if (!last) {
                          return (
                            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 11 }}>
                              <span style={{ color: C.muted }}>No snapshots yet. New saves will show as</span>
                              <SnapshotIntegrityBadge variant="sealed" />
                              <span style={{ color: C.muted }}>when you save.</span>
                            </div>
                          );
                        }
                        var sealed = !!(last.contentHash && validateSnapshotIntegrity(last));
                        var legacy = !last.contentHash;
                        return (
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 11, minWidth: 0 }}>
                            <span style={{ color: C.muted }}>Latest snapshot:</span>
                            {sealed ? (
                              <SnapshotIntegrityBadge variant="sealed" liveStatus />
                            ) : legacy ? (
                              <SnapshotIntegrityBadge variant="legacy" liveStatus />
                            ) : (
                              <SnapshotIntegrityBadge variant="failed" liveStatus />
                            )}
                            {last.label && <span style={{ color: C.muted }}>{last.label}</span>}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </Card>

              <Card>
                <CardTitle sub="Shown on invoices when warranty is enabled">Warranty Policy</CardTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 14px", borderRadius: 9, border: "1.5px solid " + (f.warrantyEnabled ? C.accent : C.border), background: f.warrantyEnabled ? C.accentSoft : "#fff" }}>
                    <input type="checkbox" checked={f.warrantyEnabled} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { warrantyEnabled: e.target.checked }); }); }} style={{ width: 16, height: 16, accentColor: C.accent }} />
                    <span style={{ fontWeight: 700, fontSize: 13, color: f.warrantyEnabled ? C.accent : C.textMd }}>Enable warranty text on invoices</span>
                  </label>
                  {f.warrantyEnabled && (
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, display: "block", marginBottom: 6 }}>Warranty Text</label>
                      <textarea value={f.warrantyText || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { warrantyText: e.target.value }); }); }} rows={8} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "10px 14px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
                    </div>
                  )}
                  <Btn col="cyan" onClick={save}>Save Warranty</Btn>
                </div>
              </Card>
            </React.Fragment>
          )}
        </div>
      )}

      {stab === "langcurrency" && (
        <div style={{ display: "flex", flexDirection: "column", gap: langWizShell ? 0 : 14 }}>
          <Card wizardChrome={langWizShell} pad={langWizShell ? 22 : 20}>
            {langWizShell ? (
              <CardTitle variant="wizard" sub="Choose your country and currency—they stay aligned for symbols and regional options. For Euro (€), pick the country that matches your business (for example Germany, France, or Italy).">
                Country &amp; currency
              </CardTitle>
            ) : (
              <CardTitle sub="Choose your shop country and currency—they stay in sync for correct symbols and regional options. For Euro (€), pick the country that matches your business (for example Germany, France, or Italy) from the list.">
                🌍 1. Country &amp; currency
              </CardTitle>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
              <div ref={countryPickerWrapRef} style={{ position: "relative", zIndex: countrySearchOpen ? 50 : 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Country</div>
                <input
                  type="text"
                  placeholder="Search curated countries…"
                  value={countryInputDisplay}
                  onChange={function (e) {
                    setCountrySearchQ(e.target.value);
                    if (!countrySearchOpen) setCountrySearchOpen(true);
                  }}
                  onFocus={function () {
                    setCountrySearchOpen(true);
                    setCountrySearchQ(selectedCountryLabel || "");
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", background: "#fff", color: C.text }}
                />
                {countrySearchOpen && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: "100%",
                      marginTop: 4,
                      maxHeight: 280,
                      overflowY: "auto",
                      background: "#fff",
                      border: "1.5px solid " + C.border,
                      borderRadius: 8,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    }}
                  >
                    <button
                      type="button"
                      onMouseDown={function (e) { e.preventDefault(); }}
                      onClick={function () {
                        applyShopCountry("");
                        setCountrySearchOpen(false);
                        setCountrySearchQ("");
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        fontSize: 13,
                        border: "none",
                        borderBottom: "1px solid " + C.borderLight,
                        background: !f.shopCountry ? C.accentSoft : "#fff",
                        cursor: "pointer",
                        fontWeight: 600,
                        color: C.muted,
                      }}
                    >
                      — Not set —
                    </button>
                    {(function () {
                      var q = (countrySearchQ || "").trim().toLowerCase();
                      var list = !q
                        ? CURATED_COUNTRIES
                        : CURATED_COUNTRIES.filter(function (c) {
                          return c.name.toLowerCase().indexOf(q) >= 0 || c.code.toLowerCase().indexOf(q) >= 0;
                        });
                      if (list.length === 0) {
                        return <div style={{ padding: "14px 12px", fontSize: 13, color: C.muted }}>No countries match your search.</div>;
                      }
                      return list.map(function (c) {
                        var active = (f.shopCountry || "") === c.code;
                        return (
                          <button
                            key={c.code}
                            type="button"
                            onMouseDown={function (e) { e.preventDefault(); }}
                            onClick={function () {
                              applyShopCountry(c.code);
                              setCountrySearchOpen(false);
                              setCountrySearchQ("");
                            }}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              padding: "8px 12px",
                              fontSize: 13,
                              border: "none",
                              borderBottom: "1px solid " + C.borderLight,
                              background: active ? C.accentSoft : "#fff",
                              cursor: "pointer",
                              color: C.textMd,
                              fontWeight: active ? 700 : 500,
                            }}
                          >
                            <span style={{ fontWeight: 700, marginRight: 8, color: C.muted }}>{c.code}</span>
                            {c.name}
                          </button>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Currency</div>
                <select
                  value={currencySelectValue}
                  onChange={function (e) {
                    var sym = e.target.value;
                    updateCurrencySymbol(sym);
                    var iso = getPrimaryCountryForCurrency(sym);
                    setF(function (x) {
                      var cust = Array.isArray(x.customInvoiceLangs) ? x.customInvoiceLangs.slice() : [];
                      var next = Object.assign({}, x, { currency: sym });
                      if (!iso) return next;
                      return Object.assign({}, next, {
                        shopCountry: iso,
                        defaultInvoiceLang: "en",
                        optionalInvoiceLangs: mergeOptionalForCountryChange("en", iso, cust),
                        customInvoiceLangs: cust,
                        selectedTaxes: mergeTaxesOnCountryChange(iso, x.selectedTaxes),
                      });
                    });
                  }}
                  style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", cursor: "pointer", background: "#fff", color: C.text }}
                >
                  {APP_CURRENCY_OPTIONS.map(function (opt) {
                    return <option key={opt.value} value={opt.value}>{opt.label}</option>;
                  })}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12, alignItems: "stretch" }}>
              <div style={{ padding: "10px 14px", background: C.accentSoft, borderRadius: 8, border: "1.5px solid " + C.border }}>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Live amount preview</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.accent }}>{currencySelectValue + " " + fmtNum(1234567)}</div>
              </div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45, padding: "8px 0" }}>
                Only supported country–currency pairs are listed. Picking a currency sets the matching country; picking a country sets its currency.
              </div>
            </div>
          </Card>

          <Card wizardChrome={langWizShell} pad={langWizShell ? 22 : 20}>
            {langWizShell ? (
              <CardTitle variant="wizard" sub="Default is English. Suggested languages follow your country; you can change them anytime.">
                Invoice language
              </CardTitle>
            ) : (
              <CardTitle sub="Default is English. Suggested languages are based on your selected country. You can still add or remove languages anytime. Custom languages you add are kept when you change country or currency.">🌐 2. Invoice languages</CardTitle>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ maxWidth: 420 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Default print language</div>
                <select
                  value={f.defaultInvoiceLang || "en"}
                  onChange={function (e) {
                    var nv = e.target.value;
                    setF(function (x) {
                      var cust = (x.customInvoiceLangs || []).filter(function (c) { return c !== nv; });
                      return Object.assign({}, x, {
                        defaultInvoiceLang: nv,
                        optionalInvoiceLangs: normalizeOptionalInvoiceLangs(nv, x.optionalInvoiceLangs || []),
                        customInvoiceLangs: cust,
                      });
                    });
                  }}
                  style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", cursor: "pointer", background: "#fff", color: C.text }}
                >
                  {INVOICE_LANG_KEYS.map(function (k) {
                    return <option key={k} value={k}>{INVOICE_LANG_NAMES[k] || k}</option>;
                  })}
                </select>
              </div>

              {(function () {
                var def = f.defaultInvoiceLang || "en";
                var sugg = getSuggestedOptionalLangsForCountry(f.shopCountry || "");
                var cust = f.customInvoiceLangs || [];
                var suggestedForUi = sugg.filter(function (k) { return k !== def && cust.indexOf(k) < 0; });
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>A) Suggested for this country</div>
                      {!f.shopCountry ? (
                        <div style={{ fontSize: 12, color: C.muted }}>Select a country to see suggested languages (e.g. Sri Lanka → Sinhala, Tamil). You can still add any language below.</div>
                      ) : suggestedForUi.length === 0 ? (
                        <div style={{ fontSize: 12, color: C.muted }}>No extra suggested languages for this country, or they are already added as custom.</div>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                          {suggestedForUi.map(function (k) {
                            var checked = (f.optionalInvoiceLangs || []).indexOf(k) >= 0;
                            return (
                              <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.textMd }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={function (e) {
                                    var on = e.target.checked;
                                    setF(function (x) {
                                      var cur = (x.optionalInvoiceLangs || []).slice();
                                      if (on) {
                                        if (cur.indexOf(k) < 0) cur.push(k);
                                      } else {
                                        cur = cur.filter(function (c) { return c !== k; });
                                      }
                                      return Object.assign({}, x, { optionalInvoiceLangs: cur });
                                    });
                                  }}
                                  style={{ width: 16, height: 16, accentColor: C.accent }}
                                />
                                {INVOICE_LANG_NAMES[k] || k}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div style={{ borderTop: "1px solid " + C.borderLight, paddingTop: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>B) Add more languages</div>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.textMd }}>+ Add language</span>
                        <select
                          defaultValue=""
                          key={"add-lang-" + ((f.optionalInvoiceLangs || []).join(",") + "|" + (f.customInvoiceLangs || []).join(","))}
                          onChange={function (e) {
                            var k = e.target.value;
                            if (!k) return;
                            setF(function (x) {
                              var d = x.defaultInvoiceLang || "en";
                              if (k === d) return x;
                              var cList = (x.customInvoiceLangs || []).slice();
                              var oList = (x.optionalInvoiceLangs || []).slice();
                              if (cList.indexOf(k) >= 0) return x;
                              cList.push(k);
                              if (oList.indexOf(k) < 0) oList.push(k);
                              return Object.assign({}, x, { customInvoiceLangs: cList, optionalInvoiceLangs: oList });
                            });
                            e.target.value = "";
                          }}
                          style={{ minWidth: 220, border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", cursor: "pointer", background: "#fff", color: C.text }}
                        >
                          <option value="">Choose language…</option>
                          {ALL_LANGUAGES.filter(function (L) {
                            if (L.code === def) return false;
                            return (f.customInvoiceLangs || []).indexOf(L.code) < 0;
                          }).map(function (L) {
                            return <option key={L.code} value={L.code}>{L.name}</option>;
                          })}
                        </select>
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Lists every supported print language. Adding here pins the language when you change country.</div>
                    </div>

                    {(cust || []).filter(function (k) { return k && k !== def; }).length > 0 && (
                      <div style={{ borderTop: "1px solid " + C.borderLight, paddingTop: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Your added languages</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {cust.filter(function (k) { return k && k !== def; }).map(function (k) {
                            return (
                              <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 10px", borderRadius: 8, border: "1.5px solid " + C.border, background: "#fafbff" }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: C.textMd }}>{INVOICE_LANG_NAMES[k] || k}</span>
                                <button
                                  type="button"
                                  onClick={function () {
                                    setF(function (x) {
                                      var c2 = (x.customInvoiceLangs || []).filter(function (c) { return c !== k; });
                                      var o2 = (x.optionalInvoiceLangs || []).filter(function (c) { return c !== k; });
                                      return Object.assign({}, x, { customInvoiceLangs: c2, optionalInvoiceLangs: o2 });
                                    });
                                  }}
                                  style={{ background: "none", border: "none", color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                                >
                                  Remove
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </Card>

          <Card wizardChrome={langWizShell} pad={langWizShell ? 22 : 20}>
            {langWizShell ? (
              <CardTitle variant="wizard" sub="Optional. Suggested rates match your country; you can edit or add custom taxes.">
                Tax
              </CardTitle>
            ) : (
              <CardTitle sub="Optional — enable taxes for your region. Suggested rates load from your selected country; you can edit percentages and add custom taxes.">
                💰 3. Tax
              </CardTitle>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 14px", borderRadius: 9, border: "1.5px solid " + (f.taxEnabled ? C.accent : C.border), background: f.taxEnabled ? C.accentSoft : "#fff" }}>
                <input
                  type="checkbox"
                  checked={f.taxEnabled === true}
                  onChange={function (e) {
                    var on = e.target.checked;
                    setF(function (x) {
                      var patch = { taxEnabled: on };
                      if (on && (!(x.selectedTaxes || []).length) && x.shopCountry) {
                        patch.selectedTaxes = mergeTaxesOnCountryChange(x.shopCountry, []);
                      }
                      return Object.assign({}, x, patch);
                    });
                  }}
                  style={{ width: 16, height: 16, accentColor: C.accent }}
                />
                <span style={{ fontWeight: 700, fontSize: 13, color: f.taxEnabled ? C.accent : C.textMd }}>Enable Tax</span>
              </label>

              {f.taxEnabled && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>
                    {f.shopCountry
                      ? "Taxes below match your country where we provide defaults. Change country above to refresh suggestions — your custom taxes are kept."
                      : "Select a country above to load suggested taxes (e.g. VAT, GST). You can still add custom taxes."}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(f.selectedTaxes || []).length === 0 ? (
                      <div style={{ fontSize: 13, color: C.muted, padding: "10px 12px", border: "1.5px dashed " + C.border, borderRadius: 8 }}>No taxes yet. Select a country or add a custom tax.</div>
                    ) : (
                      (f.selectedTaxes || []).map(function (t, idx) {
                        return (
                          <div
                            key={"tax-" + idx + "-" + (t.name || "")}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "28px minmax(0, 1fr) 88px",
                              alignItems: "center",
                              gap: 10,
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1.5px solid " + C.border,
                              background: "#fafbff",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={t.enabled !== false}
                              onChange={function () {
                                setF(function (x) {
                                  var list = (x.selectedTaxes || []).map(function (row, i) {
                                    if (i !== idx) return row;
                                    var wasOn = row.enabled !== false;
                                    return Object.assign({}, row, { enabled: !wasOn });
                                  });
                                  return Object.assign({}, x, { selectedTaxes: list });
                                });
                              }}
                              style={{ width: 16, height: 16, accentColor: C.accent, justifySelf: "center" }}
                            />
                            <span style={{ fontSize: 13, fontWeight: 700, color: C.textMd }}>{t.name}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.01}
                                value={t.rate === undefined || t.rate === null ? "" : t.rate}
                                onChange={function (e) {
                                  var raw = e.target.value;
                                  var v = parseFloat(raw);
                                  setF(function (x) {
                                    var list = (x.selectedTaxes || []).map(function (row, i) {
                                      if (i !== idx) return row;
                                      return Object.assign({}, row, { rate: raw === "" || isNaN(v) ? 0 : v });
                                    });
                                    return Object.assign({}, x, { selectedTaxes: list });
                                  });
                                }}
                                style={{
                                  width: 64,
                                  textAlign: "right",
                                  padding: "6px 8px",
                                  border: "1.5px solid " + C.border,
                                  borderRadius: 6,
                                  fontSize: 13,
                                  fontFamily: "'JetBrains Mono',monospace",
                                  boxSizing: "border-box",
                                }}
                              />
                              <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, width: 14 }}>%</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                    <div ref={taxModeTooltipRef} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8 }}
                      onMouseEnter={taxTipFine ? function () { setTaxModeTooltipOpen(true); } : undefined}
                      onMouseLeave={taxTipFine ? function () { setTaxModeTooltipOpen(false); } : undefined}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.textMd }}>Tax Mode</span>
                      <button
                        type="button"
                        aria-label="How tax mode works"
                        onClick={function (e) {
                          e.preventDefault();
                          if (!taxTipFine) setTaxModeTooltipOpen(function (o) { return !o; });
                        }}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: "50%",
                          border: "1.5px solid " + C.border,
                          background: "#fff",
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 700,
                          color: C.accent,
                          lineHeight: 1,
                          padding: 0,
                        }}
                      >
                        ⓘ
                      </button>
                      {taxModeTooltipOpen && (
                        <div
                          style={{
                            position: "absolute",
                            zIndex: 120,
                            left: 0,
                            bottom: "100%",
                            marginBottom: 8,
                            width: 280,
                            padding: "12px 14px",
                            borderRadius: 10,
                            border: "1.5px solid " + C.border,
                            background: "#fff",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                            fontSize: 12,
                            color: C.textMd,
                            lineHeight: 1.55,
                          }}
                        >
                          <div style={{ fontWeight: 800, marginBottom: 8, color: C.accent }}>Exclusive</div>
                          <div>Price: 100</div>
                          <div>Tax (10%): 10</div>
                          <div style={{ marginBottom: 10 }}>Total: 110</div>
                          <div style={{ fontWeight: 800, marginBottom: 8, color: C.accent }}>Inclusive</div>
                          <div>Price: 110</div>
                          <div>Tax inside: 10</div>
                          <div>Total: 110</div>
                        </div>
                      )}
                    </div>
                    <select
                      value={f.taxMode === "inclusive" ? "inclusive" : "exclusive"}
                      onChange={function (e) {
                        setF(function (x) { return Object.assign({}, x, { taxMode: e.target.value }); });
                      }}
                      style={{ minWidth: 160, border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", cursor: "pointer", background: "#fff", color: C.text }}
                    >
                      <option value="exclusive">Exclusive</option>
                      <option value="inclusive">Inclusive</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.textMd }}>Calculate tax on</span>
                    <select
                      value={f.taxApplyBase === "before_discount" ? "before_discount" : "after_discount"}
                      onChange={function (e) {
                        setF(function (x) { return Object.assign({}, x, { taxApplyBase: e.target.value }); });
                      }}
                      style={{ maxWidth: 420, border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", cursor: "pointer", background: "#fff", color: C.text }}
                    >
                      <option value="after_discount">Cart subtotal after discount (default)</option>
                      <option value="before_discount">Cart subtotal before discount (exclusive tax only)</option>
                    </select>
                    <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.45 }}>
                      Default: discount reduces the taxable base. “Before discount” charges tax on the full subtotal, then subtracts the discount from the invoice total (exclusive mode). Inclusive mode uses after-discount base.
                    </div>
                  </div>

                  <div style={{ borderTop: "1px solid " + C.borderLight, paddingTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Add custom tax</div>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 10 }}>
                      <div style={{ flex: "1 1 140px", minWidth: 120 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 4 }}>Name</div>
                        <input
                          type="text"
                          value={taxCustomName}
                          onChange={function (e) { setTaxCustomName(e.target.value); }}
                          placeholder="e.g. Service fee"
                          style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
                        />
                      </div>
                      <div style={{ width: 88 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 4 }}>%</div>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={taxCustomRate}
                          onChange={function (e) { setTaxCustomRate(e.target.value); }}
                          placeholder="0"
                          style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 10px", fontSize: 13, textAlign: "right", fontFamily: "'JetBrains Mono',monospace" }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={function () {
                          var name = taxCustomName.trim();
                          if (!name) return;
                          var rate = parseFloat(taxCustomRate);
                          setF(function (x) {
                            var list = (x.selectedTaxes || []).concat([{ name: name, rate: isNaN(rate) ? 0 : rate, enabled: true, custom: true }]);
                            return Object.assign({}, x, { selectedTaxes: list });
                          });
                          setTaxCustomName("");
                          setTaxCustomRate("");
                        }}
                        style={{
                          padding: "9px 14px",
                          borderRadius: 8,
                          border: "1.5px dashed " + C.accent,
                          background: C.accentSoft,
                          color: C.accent,
                          fontWeight: 800,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        + Add Custom Tax
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <div>
            {props.embeddedWizard === "langcurrency" ? (
              langWizShell ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid #e8ecf4", marginTop: 4 }}>
                    <button type="button" onClick={function () { if (onWizardBack) onWizardBack(); }} style={{ padding: "12px 22px", borderRadius: 12, border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 14, fontWeight: 800, color: "#475569", cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, justifyContent: "flex-end", flex: "1 1 auto" }}>
                      <button
                        type="button"
                        onClick={function () { runWizardCoreIdentityStep(function () { save({ silent: true }); if (props.onWizardComplete) props.onWizardComplete(); }); }}
                        style={{
                          padding: "12px 18px",
                          borderRadius: 12,
                          border: "1.5px solid #e2e8f0",
                          background: "#fff",
                          color: C.textMd,
                          fontSize: 14,
                          fontWeight: 800,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        Skip for now
                      </button>
                      <Btn col="cyan" onClick={function () { runWizardCoreIdentityStep(function () { save({ silent: true }); if (props.onWizardComplete) props.onWizardComplete(); }); }}>Finish setup →</Btn>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: C.muted, maxWidth: 420, lineHeight: 1.4 }}>Shop name and a phone or address are still required. Other language and tax options stay at defaults.</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                  <Btn col="cyan" onClick={function () { runWizardCoreIdentityStep(function () { save({ silent: true }); if (props.onWizardComplete) props.onWizardComplete(); }); }}>Save &amp; Finish setup</Btn>
                  <button
                    type="button"
                    onClick={function () { runWizardCoreIdentityStep(function () { save({ silent: true }); if (props.onWizardComplete) props.onWizardComplete(); }); }}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: "1.5px solid " + C.border,
                      background: "#fff",
                      color: C.textMd,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Skip for now
                  </button>
                  <span style={{ fontSize: 11, color: C.muted, maxWidth: 280, lineHeight: 1.4 }}>Shop name and a phone or address are still required. Other language and tax options stay at defaults.</span>
                </div>
              )
            ) : (
              <Btn col="cyan" onClick={save}>Save Language &amp; Currency</Btn>
            )}
          </div>
        </div>
      )}

      {stab === "invoice" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* ── Top-level A4/A5 vs Thermal tabs ── */}
          {(function () {
            var isA4A5 = invFmt === "a4a5";

            /* ── Shared: logo only (design is fixed/standard) ── */
            var sharedControls = (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Logo */}
                <div style={{ borderTop: "1px solid " + C.borderLight, paddingTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
                    {isA4A5 ? "📄 Logo for A4 / A5" : "🖨 Logo for Thermal"}
                  </div>
                  {f.invoiceLogo ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <img src={f.invoiceLogo} alt="logo" style={{ width: isA4A5 ? (f.invoiceLogoSize || 80) : (f.thermalLogoSize || 40), height: "auto", objectFit: "contain", border: "1px solid " + C.border, borderRadius: 7, background: "#f7f9ff", padding: 4 }} />
                        <Btn sm col="red" onClick={removeLogo}>Remove Logo</Btn>
                      </div>
                      {isA4A5 ? (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, marginBottom: 6 }}>A4/A5 Logo Size — {f.invoiceLogoSize || 80}px</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, color: C.muted }}>Small</span>
                            <input type="range" min="40" max="200" value={f.invoiceLogoSize || 80} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { invoiceLogoSize: parseInt(e.target.value) }); }); }} style={{ flex: 1 }} />
                            <span style={{ fontSize: 11, color: C.muted }}>Large</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: C.accent, minWidth: 40 }}>{f.invoiceLogoSize || 80}px</span>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, marginBottom: 6 }}>Thermal Logo Size — {f.thermalLogoSize || 40}px</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, color: C.muted }}>Small</span>
                            <input type="range" min="20" max="80" value={f.thermalLogoSize || 40} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { thermalLogoSize: parseInt(e.target.value) }); }); }} style={{ flex: 1 }} />
                            <span style={{ fontSize: 11, color: C.muted }}>Large</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: C.orange, minWidth: 40 }}>{f.thermalLogoSize || 40}px</span>
                          </div>
                        </div>
                      )}
                      {isA4A5 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, marginBottom: 6 }}>Logo Position</div>
                          <div style={{ display: "flex", gap: 6 }}>
                            {[["left","◀ Left"],["center","◆ Center"],["right","▶ Right"]].map(function (al) {
                              var isA = (f.invoiceLogoAlign || "left") === al[0];
                              return <button key={al[0]} onClick={function () { setF(function (x) { return Object.assign({}, x, { invoiceLogoAlign: al[0] }); }); }}
                                style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "2px solid " + (isA ? C.accent : C.border), background: isA ? C.accentSoft : "#fff", color: isA ? C.accent : C.muted, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{al[1]}</button>;
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ background: "#f7f9ff", border: "2px dashed " + C.border, borderRadius: 9, padding: "14px", textAlign: "center" }}>
                      <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Upload PNG/JPG logo</div>
                      <label style={{ background: "linear-gradient(135deg,#2979ff,#5591ff)", color: "#fff", borderRadius: 7, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "inline-block" }}>
                        Choose Logo
                        <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            );

            /* ── A4/A5 specific controls ── */
            var a4a5Controls = (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Default size */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Default Paper Size</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[["a4","📄 A4","Full Page"],["a5","📋 A5","Half Page"]].map(function (s) {
                      var active = (f.invoiceDefaultSize || "a4") === s[0];
                      return <button key={s[0]} onClick={function () { setF(function (x) { return Object.assign({}, x, { invoiceDefaultSize: s[0] }); }); }}
                        style={{ flex: 1, padding: "10px 12px", borderRadius: 9, border: "2px solid " + (active ? C.accent : C.border), background: active ? C.accentSoft : "#fff", color: active ? C.accent : C.textMd, fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "center" }}>
                        <div>{active ? "✓ " : ""}{s[1]}</div>
                        <div style={{ fontSize: 10, color: active ? C.accent : C.muted, marginTop: 2 }}>{s[2]}</div>
                      </button>;
                    })}
                  </div>
                </div>

                {/* Shop Name size */}
                <div style={{ borderTop: "1px solid " + C.borderLight, paddingTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Shop Name Size</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: C.muted }}>S</span>
                    <input type="range" min="10" max="36" step="1" value={f.shopNameFontSize || 15} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { shopNameFontSize: parseInt(e.target.value) }); }); }} style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: C.muted }}>L</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.accent, minWidth: 36 }}>{f.shopNameFontSize || 15}px</span>
                  </div>
                  <div style={{ marginTop: 8, padding: "6px 10px", background: "#f7f9ff", borderRadius: 8 }}>
                    <span style={{ fontWeight: 900, fontSize: f.shopNameFontSize || 15, color: f.invoiceAccentColor || "#0d47a1", textTransform: "uppercase" }}>{f.shopName || "Techon Computers"}</span>
                  </div>
                </div>

                {/* Shop Info size */}
                <div style={{ borderTop: "1px solid " + C.borderLight, paddingTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Address / Phone / Email Size</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: C.muted }}>S</span>
                    <input type="range" min="8" max="16" step="1" value={f.shopInfoFontSize || 11} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { shopInfoFontSize: parseInt(e.target.value) }); }); }} style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: C.muted }}>L</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.accent, minWidth: 36 }}>{f.shopInfoFontSize || 11}px</span>
                  </div>
                  <div style={{ marginTop: 8, padding: "6px 10px", background: "#f7f9ff", borderRadius: 8, display: "flex", flexDirection: "column", gap: 1 }}>
                    {[f.address, f.phone ? "Phone: " + f.phone : null, f.email, f.website].filter(Boolean).slice(0,3).map(function (line, i) {
                      return <span key={i} style={{ fontSize: f.shopInfoFontSize || 11, color: "#555" }}>{line}</span>;
                    })}
                    {!f.address && !f.phone && <span style={{ fontSize: f.shopInfoFontSize || 11, color: "#aaa" }}>123 Main Street, Negombo · +94 77 123 4567</span>}
                  </div>
                </div>

              </div>
            );

            /* ── Thermal specific controls ── */
            var thermalControls = (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Default thermal size */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Default Thermal Size</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[["thermal58","🖨 58mm","Narrow"],["thermal80","🖨 80mm","Standard POS"]].map(function (s) {
                      var active = (f.invoiceThermalSize || "thermal80") === s[0];
                      return <button key={s[0]} onClick={function () { setF(function (x) { return Object.assign({}, x, { invoiceThermalSize: s[0] }); }); }}
                        style={{ flex: 1, padding: "10px 12px", borderRadius: 9, border: "2px solid " + (active ? C.orange : C.border), background: active ? "#fff3e0" : "#fff", color: active ? C.orange : C.textMd, fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "center" }}>
                        <div>{active ? "✓ " : ""}{s[1]}</div>
                        <div style={{ fontSize: 10, color: active ? C.orange : C.muted, marginTop: 2 }}>{s[2]}</div>
                      </button>;
                    })}
                  </div>
                </div>

                {/* Thermal shop name size */}
                <div style={{ borderTop: "1px solid " + C.borderLight, paddingTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Shop Name Size (Thermal)</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: C.muted }}>S</span>
                    <input type="range" min="10" max="28" step="1" value={f.thermalShopNameSize || 18} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { thermalShopNameSize: parseInt(e.target.value) }); }); }} style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: C.muted }}>L</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.orange, minWidth: 36 }}>{f.thermalShopNameSize || 18}px</span>
                  </div>
                  <div style={{ marginTop: 8, padding: "6px 10px", background: "#fff8f0", borderRadius: 8, textAlign: "center" }}>
                    <span style={{ fontWeight: 900, fontSize: f.thermalShopNameSize || 18, textTransform: "uppercase", letterSpacing: "0.08em" }}>{f.shopName || "Techon Computers"}</span>
                  </div>
                </div>

                {/* Thermal shop info size */}
                <div style={{ borderTop: "1px solid " + C.borderLight, paddingTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Address / Phone / Email Size (Thermal)</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: C.muted }}>S</span>
                    <input type="range" min="7" max="13" step="1" value={f.thermalInfoSize || 10} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { thermalInfoSize: parseInt(e.target.value) }); }); }} style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: C.muted }}>L</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.orange, minWidth: 36 }}>{f.thermalInfoSize || 10}px</span>
                  </div>
                  <div style={{ marginTop: 8, padding: "6px 10px", background: "#fff8f0", borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: f.thermalInfoSize || 10, color: "#333" }}>{f.address || "123 Main Street, Negombo"}</div>
                    <div style={{ fontSize: f.thermalInfoSize || 10, color: "#333" }}>{f.phone || "+94 31 222 3456"}</div>
                  </div>
                </div>

              </div>
            );

            /* ── Live previews ── */
            var previews = isA4A5 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>📄 A4 — Live Preview</div>
                  <button onClick={function () { setPreviewInv("a4"); }}
                    style={{ padding: "4px 14px", borderRadius: 7, border: "1.5px solid " + C.accent, background: C.accentSoft, color: C.accent, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    👁 View Full
                  </button>
                </div>
                <div style={{ background: "#fff", border: "1px solid " + C.border, borderRadius: 10, overflow: "hidden", height: 320 }}>
                  <div style={{ transform: "scale(0.38)", transformOrigin: "top left", width: "263%", pointerEvents: "none" }}>
                    <InvoiceA4 inv={sampleInv} settings={f} invoiceLang={f.defaultInvoiceLang || "en"} size="a4" />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>📋 A5 — Live Preview</div>
                  <button onClick={function () { setPreviewInv("a5"); }}
                    style={{ padding: "4px 14px", borderRadius: 7, border: "1.5px solid " + C.accent, background: C.accentSoft, color: C.accent, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    👁 View Full
                  </button>
                </div>
                <div style={{ background: "#fff", border: "1px solid " + C.border, borderRadius: 10, overflow: "hidden", height: 260 }}>
                  <div style={{ transform: "scale(0.46)", transformOrigin: "top left", width: "217%", pointerEvents: "none" }}>
                    <InvoiceA4 inv={sampleInv} settings={f} invoiceLang={f.defaultInvoiceLang || "en"} size="a5" />
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>🖨 80mm — Live Preview</div>
                    <button onClick={function () { setPreviewInv("thermal80"); }}
                      style={{ padding: "4px 14px", borderRadius: 7, border: "1.5px solid " + C.orange, background: "#fff7ed", color: C.orange, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      👁 View Full
                    </button>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid " + C.border, borderRadius: 10, overflow: "hidden", height: 320 }}>
                    <div style={{ transform: "scale(0.75)", transformOrigin: "top left", width: "133%", pointerEvents: "none" }}>
                      <InvoiceThermal inv={sampleInv} settings={f} invoiceLang={f.defaultInvoiceLang || "en"} width={302} />
                    </div>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>🖨 58mm — Live Preview</div>
                    <button onClick={function () { setPreviewInv("thermal58"); }}
                      style={{ padding: "4px 14px", borderRadius: 7, border: "1.5px solid " + C.orange, background: "#fff7ed", color: C.orange, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      👁 View Full
                    </button>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid " + C.border, borderRadius: 10, overflow: "hidden", height: 320 }}>
                    <div style={{ transform: "scale(0.75)", transformOrigin: "top left", width: "133%", pointerEvents: "none" }}>
                      <InvoiceThermal inv={sampleInv} settings={f} invoiceLang={f.defaultInvoiceLang || "en"} width={218} />
                    </div>
                  </div>
                </div>
              </div>
            );

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Card>
                  <CardTitle sub="Invoices and PDFs shared via WhatsApp from Sales, Invoices, and other screens save here automatically (not your Downloads folder). Leave default to use Documents/TechonERP/Invoices.">
                    📁 WhatsApp invoice PDF folder
                  </CardTitle>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                      Default: <strong style={{ color: C.text }}>Documents/TechonERP/Invoices</strong>. Choose another folder if you prefer.
                    </div>
                    <div style={{ background: "#f8faff", border: "1.5px solid " + C.border, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.text, fontFamily: "monospace", wordBreak: "break-all" }}>
                      {f.invoicePdfFolder || "Documents/TechonERP/Invoices (default)"}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Btn col="blue" onClick={async function () {
                        if (window.electronAPI && window.electronAPI.selectFolder) {
                          var folder = await window.electronAPI.selectFolder();
                          if (folder) {
                            setF(function (x) { return Object.assign({}, x, { invoicePdfFolder: folder }); });
                            var ns = Object.assign({}, state.settings, f, { invoicePdfFolder: folder });
                            S.set("tc3_settings", ns);
                            setState(function (st) { return Object.assign({}, st, { settings: ns }); });
                            showAlert("Invoice PDF folder saved.");
                          }
                        } else {
                          showAlert("Folder selection is only available in the desktop app.");
                        }
                      }}>Select folder…</Btn>
                      {f.invoicePdfFolder ? (
                        <Btn col="gray" onClick={function () {
                          setF(function (x) { return Object.assign({}, x, { invoicePdfFolder: "" }); });
                          var ns = Object.assign({}, state.settings, f, { invoicePdfFolder: "" });
                          S.set("tc3_settings", ns);
                          setState(function (st) { return Object.assign({}, st, { settings: ns }); });
                          showAlert("Reset to default folder (Documents/TechonERP/Invoices).");
                        }}>Use default folder</Btn>
                      ) : null}
                    </div>
                  </div>
                </Card>
                {/* Format toggle */}
                <div style={{ display: "flex", gap: 0, background: "#f1f5f9", borderRadius: 10, padding: 4 }}>
                  {[["a4a5","📄 A4 / A5 Invoice"],["thermal","🖨 Thermal Receipt"]].map(function (tab) {
                    var active = invFmt === tab[0];
                    return <button key={tab[0]} onClick={function () { setInvFmt(tab[0]); }}
                      style={{ flex: 1, padding: "9px 16px", borderRadius: 8, border: "none", background: active ? "#fff" : "transparent", color: active ? C.accent : C.muted, fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: active ? "0 1px 4px rgba(0,0,0,0.1)" : "none", transition: "all .15s" }}>
                      {tab[1]}
                    </button>;
                  })}
                </div>

                {/* Main layout */}
                <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,340px) 1fr", gap: 14, alignItems: "start" }}>
                  <Card>
                    <CardTitle sub={isA4A5 ? "A4 & A5 invoice settings" : "Thermal receipt settings"}>
                      {isA4A5 ? "📄 A4 / A5 Settings" : "🖨 Thermal Settings"}
                    </CardTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {isA4A5 ? a4a5Controls : thermalControls}
                      <div style={{ borderTop: "1px solid " + C.borderLight, paddingTop: 12 }}>
                        {sharedControls}
                      </div>
                      <Btn col="cyan" onClick={save}>💾 Save Invoice Settings</Btn>
                    </div>
                  </Card>
                  <div>
                    {previews}
                  </div>
                </div>
              </div>
            );
          })()}

        </div>
      )}

      {stab === "backup" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {bakMsg && <div style={{ background: bakMsg.type === "error" ? C.dangerSoft : C.successSoft, color: bakMsg.type === "error" ? C.red : C.green, borderRadius: 10, padding: "12px 18px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>{bakMsg.text}</div>}

          <Card>
            <CardTitle sub="Choose a custom location for your automatic backups">Backup Folder</CardTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 6 }}>Current Backup Folder</div>
                <div style={{ background: "#f8faff", border: "1.5px solid " + C.border, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.text, fontFamily: "monospace", wordBreak: "break-all" }}>
                  {f.backupFolder || "Documents/TechonERP/backups (Default)"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <Btn col="blue" onClick={async function () {
                  if (window.electronAPI && window.electronAPI.selectFolder) {
                    const folder = await window.electronAPI.selectFolder();
                    if (folder) {
                      setF(function (x) { return Object.assign({}, x, { backupFolder: folder }); });
                      var ns = Object.assign({}, state.settings, f, { backupFolder: folder });
                      S.set("tc3_settings", ns);
                      setState(function (st) { return Object.assign({}, st, { settings: ns }); });
                      setBakMsg({ type: "success", text: "Backup folder updated successfully." });
                    }
                  } else {
                    setBakMsg({ type: "error", text: "Folder selection is only available in the desktop app." });
                  }
                }}>Select Folder</Btn>
                {f.backupFolder && (
                  <Btn col="gray" onClick={function () {
                    setF(function (x) { return Object.assign({}, x, { backupFolder: "" }); });
                    var ns = Object.assign({}, state.settings, f, { backupFolder: "" });
                    S.set("tc3_settings", ns);
                    setState(function (st) { return Object.assign({}, st, { settings: ns }); });
                    setBakMsg({ type: "success", text: "Reset to default backup folder." });
                  }}>Reset Default</Btn>
                )}
              </div>
            </div>
          </Card>

          {/* ── Backup age warning banner ── */}
          {(function () {
            var manualT = S.get("tc3_last_manual_backup", null);
            var autoT   = S.get("tc3_last_auto_backup", null) || S.get("tc3_autobak_time", null);
            var bestMs  = Math.max(manualT ? new Date(manualT).getTime() : 0, autoT ? new Date(autoT).getTime() : 0);
            if (bestMs === 0) {
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fef3c7", border: "1.5px solid #f59e0b", borderRadius: 10, padding: "11px 16px", marginBottom: 12, fontSize: 13, color: "#92400e", fontWeight: 600 }}>
                  ⚠️ No backup found. Please download a backup now to protect your shop data.
                </div>
              );
            }
            var ageDays = (Date.now() - bestMs) / (1000 * 60 * 60 * 24);
            if (ageDays >= 2) {
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fef3c7", border: "1.5px solid #f59e0b", borderRadius: 10, padding: "11px 16px", marginBottom: 12, fontSize: 13, color: "#92400e", fontWeight: 600 }}>
                  ⚠️ Last backup was <b>{Math.floor(ageDays)} days ago</b>. Please back up your data soon.
                </div>
              );
            }
            return null;
          })()}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
            <StatCard label="Last Manual Backup" money={false}
              value={(function () { var t = S.get("tc3_last_manual_backup", null); return t ? "Downloaded" : "Never"; })()}
              sub={(function () { var t = S.get("tc3_last_manual_backup", null); return t ? new Date(t).toLocaleString() : "Click Download below"; })()}
              accent={C.blue} icon="💾" />
            <StatCard label="Last Auto Backup" money={false}
              value={(function () { var t = S.get("tc3_last_auto_backup", null) || S.get("tc3_autobak_time", null); return t ? "Saved ✅" : "Pending"; })()}
              sub={(function () { var t = S.get("tc3_last_auto_backup", null) || S.get("tc3_autobak_time", null); return t ? new Date(t).toLocaleString() : "Runs every 5 min"; })()}
              accent={C.green} icon="🔄" />
            <StatCard label="Auto Backup File" money={false}
              value="Every 5 min"
              sub="Documents/TechonERP/backups/"
              accent={C.cyan} icon="📂" />
            <StatCard label="Daily Snapshot" money={false}
              value={(function () { var d = S.get("tc3_daily_bak_date", null); return d === new Date().toISOString().slice(0, 10) ? "Done ✅" : "Pending"; })()}
              sub={(function () { var d = S.get("tc3_daily_bak_date", null); return d ? ("Last: " + d) : "Not yet today"; })()}
              accent={C.purple} icon="📅" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Card>
              <CardTitle sub="Safe copies of all your ERP data">Manual & Daily Backup</CardTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ background: C.accentSoft, borderRadius: 9, padding: "12px 16px", fontSize: 12, color: C.accent, lineHeight: 1.7 }}>
                  Downloads a <strong>backup-YYYY-MM-DD.json</strong> file to your computer.
                  Auto-backup runs every 5 minutes, on tab/window close, and on app exit. In Electron, backups are saved to Documents/TechonERP/backups/ as techon-backup-YYYY-MM-DD-HHMM.json (last 30 kept).
                </div>
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 9, padding: "12px 16px", fontSize: 12, color: "#92400e", lineHeight: 1.8 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 13 }}>💡 Important: Save your backups here</div>
                  <div>Always save backup files to this folder on your computer:</div>
                  <div style={{ fontFamily: "monospace", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6, padding: "6px 12px", margin: "6px 0", fontSize: 13, fontWeight: 700, color: "#78350f", letterSpacing: "0.02em" }}>Documents\TechonERP\backups</div>
                  <div style={{ color: "#555", fontSize: 11.5 }}>Example path on your PC:</div>
                  <div style={{ fontFamily: "monospace", background: "#f5f5f5", border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 12px", margin: "4px 0", fontSize: 12, color: "#333" }}>C:\Users\RASHID\Documents\TechonERP\backups</div>
                  <div style={{ marginTop: 4, fontSize: 11, color: "#777" }}>That way all backups stay organised and safe.</div>
                </div>
                <Btn col="cyan" onClick={doManualBackup}>⬇ Download Backup Now</Btn>
                <Btn col="blue" sm onClick={function () {
                  try {
                    var bakObj = S.get("tc3_autobak", null); var bak = bakObj ? JSON.stringify(bakObj, null, 2) : null;
                    if (!bak) { setBakMsg({ type: "error", text: "No auto-backup found yet." }); return; }
                    var b = JSON.parse(bak);
                    var url = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: "application/json" }));
                    var a = document.createElement("a"); a.href = url; a.download = "techon-autobak.json"; a.click(); URL.revokeObjectURL(url);
                    setBakMsg({ type: "success", text: "Auto-backup exported!" });
                  } catch (e) { setBakMsg({ type: "error", text: "Failed: " + e.message }); }
                }}>⬇ Export Last Auto-Backup</Btn>
              </div>
            </Card>
            <Card>
              <CardTitle sub="Restore from a previous backup file">Restore Backup</CardTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ background: C.warnSoft, border: "1px solid #fcd34d", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: "#92400e" }}>
                  ⚠ A <strong>safety backup of your current data</strong> will be automatically downloaded before restoring. Nothing will be lost.
                </div>
                <label style={{ background: "linear-gradient(135deg,#e07a10,#f59e0b)", color: "#fff", borderRadius: 8, padding: "11px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "center", display: "block" }}>
                  📂 Choose Backup File to Restore
                  <input type="file" accept=".json" onChange={doRestore} style={{ display: "none" }} />
                </label>
              </div>
            </Card>
          </div>
          <Card>
            <CardTitle sub="Export data for accountants or external review">Excel / CSV Export</CardTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: "#166534" }}>
                Exports all ERP data (Products, Sales, Purchases, Customers, Expenses, Repairs) as a <strong>CSV file</strong> — open with <strong>Microsoft Excel</strong> or Google Sheets.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn col="green" onClick={doExcelExport}>📊 Export All Data to CSV/Excel</Btn>
              </div>
            </div>
          </Card>

          

          {/* ── CLOUD DASHBOARD SYNC ── */}
          <Card>
            <CardTitle sub="Connect to TechonERP Dashboard at app.techon.lk">☁ Cloud Dashboard Sync</CardTitle>
            {S.get("tc3_cloud_sync", false) && S.get("tc3_cloud_email", null) ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ background: "#dcfce7", border: "1px solid #86efac", borderRadius: 9, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>✅</span>
                  <div>
                    <div style={{ fontWeight: 800, color: "#15803d", fontSize: 13 }}>Cloud sync is active</div>
                    <div style={{ fontSize: 12, color: "#166534", marginTop: 2 }}>Connected as: {S.get("tc3_cloud_email", "")}</div>
                    <div style={{ fontSize: 12, color: "#166534", marginTop: 1 }}>Data syncs automatically every 60 seconds</div>
                    {S.get("tc3_last_cloud_sync", null) && <div style={{ fontSize: 11, color: "#166534", marginTop: 2 }}>Last sync: {new Date(S.get("tc3_last_cloud_sync", "")).toLocaleString()}</div>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn col="green" onClick={function () {
                    var apiKey = S.get("tc3_cloud_api_key", null);
                    if (!apiKey) { setCloudMsg({ type: "error", text: "Not connected. Please disconnect and reconnect." }); return; }
                    setCloudMsg({ type: "info", text: "Syncing…" });
                    var st = S.get("tc3_settings", {});
                    var balances = getCashBalances(state);
                    fetch("https://api.techon.lk/sync.php", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        api_key: apiKey,
                        sales: S.get("tc3_sales",[]), purchases: S.get("tc3_purchases",[]),
                        products: S.get("tc3_products",[]), customers: S.get("tc3_customers",[]),
                        suppliers: S.get("tc3_suppliers",[]), expenses: S.get("tc3_expenses",[]),
                        repairs: S.get("tc3_repairs",[]), cheques: S.get("tc3_cheques",[]),
                        salesReturns: S.get("tc3_salesReturns",[]),
                        manualReceivables: S.get("tc3_manualReceivables",[]),
                        manualPayables: S.get("tc3_manualPayables",[]),
                        snapshot: { shopName: st.shopName||"", address: st.address||"", phone: st.phone||"", email: st.email||"", website: st.website||"", currency: st.currency||"Rs", capitalInvested: st.capitalInvested||0, cashBalance: balances.cash||0, bankBalance: balances.bank||0, totalReceivable: 0, totalPayable: 0, stockValue: 0 }
                      })
                    }).then(function (r) { return r.json(); }).then(function (d) {
                      if (d && d.success) { S.set("tc3_last_cloud_sync", new Date().toISOString()); setCloudMsg({ type: "success", text: "✅ Synced successfully!" }); }
                      else { setCloudMsg({ type: "error", text: "Sync error: " + (d.error || "Unknown") }); }
                    }).catch(function () { setCloudMsg({ type: "error", text: "No internet connection." }); });
                  }}>🔄 Sync Now</Btn>
                  <Btn col="red" onClick={function () {
                    showConfirm("Disconnect from cloud dashboard?", function () {
                      S.set("tc3_cloud_sync", false); S.set("tc3_cloud_email", null); S.set("tc3_cloud_pass", null); S.set("tc3_cloud_token", null); S.set("tc3_cloud_api_key", null);
                      showAlert("Disconnected. Reload the app to apply.");
                    });
                  }}>Disconnect</Btn>
                </div>
                {cloudMsg && <div style={{ background: cloudMsg.type === "error" ? "#fde8ed" : cloudMsg.type === "info" ? "#e8eeff" : "#dcfce7", color: cloudMsg.type === "error" ? C.red : cloudMsg.type === "info" ? C.accent : C.green, borderRadius: 8, padding: "9px 14px", fontSize: 12, fontWeight: 600 }}>{cloudMsg.text}</div>}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ background: C.accentSoft, borderRadius: 9, padding: "10px 14px", fontSize: 12, color: C.accent }}>
                  Connect your ERP to <strong>app.techon.lk</strong> — enter your dashboard login credentials below.
                </div>
                <Input label="Dashboard Email" type="email" value={cloudEmail} onChange={function (e) { setCloudEmail(e.target.value); setCloudMsg(null); }} placeholder="your@email.com" />
                <Input label="Dashboard Password" type="password" value={cloudPass} onChange={function (e) { setCloudPass(e.target.value); setCloudMsg(null); }} placeholder="Your dashboard password" />
                {cloudMsg && <div style={{ background: cloudMsg.type === "error" ? "#fde8ed" : "#dcfce7", color: cloudMsg.type === "error" ? C.red : C.green, borderRadius: 8, padding: "9px 14px", fontSize: 12, fontWeight: 600 }}>{cloudMsg.text}</div>}
                <Btn col="blue" disabled={cloudLoading || !cloudEmail || !cloudPass} onClick={function () {
                  setCloudLoading(true); setCloudMsg(null);
                  fetch("https://api.techon.lk/login.php", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: cloudEmail, password: cloudPass })
                  }).then(function (r) { return r.json(); }).then(function (d) {
                    setCloudLoading(false);
                    if (d.success) {
                      /* Store api_key for sync — never need to login again, no session conflict */
                      S.set("tc3_cloud_email",   cloudEmail);
                      S.set("tc3_cloud_pass",    cloudPass);
                      S.set("tc3_cloud_api_key", d.api_key);
                      S.set("tc3_cloud_sync",    true);
                      setCloudMsg({ type: "success", text: "✅ Connected! Cloud sync is now active." });
                      setCloudEmail(""); setCloudPass("");
                    } else {
                      setCloudMsg({ type: "error", text: d.error || "Login failed." });
                    }
                  }).catch(function () {
                    setCloudLoading(false);
                    setCloudMsg({ type: "error", text: "Cannot reach server. Check your internet." });
                  });
                }}>{cloudLoading ? "Connecting…" : "🔗 Connect to Cloud Dashboard"}</Btn>
                <div style={{ fontSize: 11, color: C.muted, textAlign: "center" }}>Don't have an account? Register at <strong>app.techon.lk</strong> first.</div>
              </div>
            )}
          </Card>

          {/* Network details moved to the Network tab */}

          {/* ── RESET SYSTEM DATA ── */}
          <Card>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#b91c1c", marginBottom: 4 }}>Reset System Data</div>
                <div style={{ fontSize: 12, color: "#6b7280", maxWidth: 480, lineHeight: 1.6 }}>
                  Permanently wipes <strong>everything</strong> — all sales, purchases, products, customers, suppliers, inventory, expenses, repairs, settings, logo and password.
                  The app returns to a completely fresh state. A safety backup is auto-downloaded first.
                </div>
              </div>
              <Btn col="red" onClick={function () { setResetStep(1); setResetPw(""); setResetMsg(null); }}>🗑 Reset All Data</Btn>
            </div>
          </Card>

        </div>
      )}

      {/* ── RESET CONFIRM MODAL ── */}
      {resetStep > 0 && (
        <Modal title="Reset System Data" onClose={function () { setResetStep(0); setResetPw(""); setResetMsg(null); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Warning banner */}
            <div style={{ background: "#fef2f2", border: "2px solid #fca5a5", borderRadius: 10, padding: "16px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ fontSize: 22, flexShrink: 0 }}>⚠</div>
              <div>
                <div style={{ fontWeight: 800, color: "#b91c1c", fontSize: 14, marginBottom: 4 }}>This action cannot be undone</div>
                <div style={{ fontSize: 12.5, color: "#7f1d1d", lineHeight: 1.7 }}>
                  All of the following will be <strong>permanently deleted</strong>:
                </div>
                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 16px", fontSize: 12, color: "#991b1b" }}>
                  {["Sales & Invoices", "Purchase Records", "Products & Inventory", "Customers", "Suppliers", "Expenses", "Repairs", "Assets & Logs", "Shop Settings", "Logo & Invoice Design", "Warranty Info", "Password & Admin Name"].map(function (item) {
                    return <div key={item} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ color: "#dc2626", fontWeight: 700 }}>✕</span>{item}</div>;
                  })}
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: "#166534", fontWeight: 600, background: "#f0fdf4", borderRadius: 6, padding: "6px 10px" }}>
                  ✓ A safety backup (.json) is auto-downloaded before the reset so you can restore if needed.
                </div>
              </div>
            </div>

            {/* Password input */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>Enter Admin Password to confirm:</div>
              <input
                type="password"
                value={resetPw}
                onChange={function (e) { setResetPw(e.target.value); setResetMsg(null); }}
                placeholder="Admin password"
                style={{ width: "100%", border: "2px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 14, outline: "none", fontFamily: "inherit" }}
                onKeyDown={function (e) { if (e.key === "Enter" && resetPw) doResetData(); }}
              />
            </div>

            {/* Error / success message */}
            {resetMsg && (
              <div style={{ background: resetMsg.type === "error" ? "#fef2f2" : "#f0fdf4", border: "1px solid " + (resetMsg.type === "error" ? "#fca5a5" : "#86efac"), borderRadius: 8, padding: "10px 14px", fontSize: 12.5, color: resetMsg.type === "error" ? "#b91c1c" : "#166534", fontWeight: 600 }}>
                {resetMsg.text}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn col="gray" onClick={function () { setResetStep(0); setResetPw(""); setResetMsg(null); }}>Cancel</Btn>
              <Btn col="red" onClick={doResetData} disabled={!resetPw}>🗑 Confirm Reset</Btn>
            </div>

          </div>
        </Modal>
      )}

      {stab === "security" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* ── UNIFIED SECURITY SETTINGS CARD ── */}
          <Card>
            <CardTitle sub="Manage login, PIN, auto-lock and administrator settings">Security Settings</CardTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 480 }}>
              {showSupportPinResetHint && (
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, background: "linear-gradient(135deg,#e0f2fe,#dbeafe)", border: "1.5px solid #7dd3fc", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#0369a1", fontWeight: 600, textAlign: "left", lineHeight: 1.5 }}>
                  <span>🔑 <strong>Set a new Admin PIN</strong> below (support unlock). Then tap <strong>Update Settings</strong>.</span>
                  <button type="button" onClick={function () { setShowSupportPinResetHint(false); }} style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: "#0369a1", background: "rgba(255,255,255,0.7)", border: "1px solid #7dd3fc", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>Dismiss</button>
                </div>
              )}
              {showAppPasswordResetHint && (
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, background: "linear-gradient(135deg,#ecfdf5,#d1fae5)", border: "1.5px solid #6ee7b7", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#047857", fontWeight: 600, textAlign: "left", lineHeight: 1.5 }}>
                  <span>🔐 <strong>Set a new login password</strong> in <strong>Change Login Password</strong> below (support unlock). Leave <strong>Current Password</strong> empty for this one-time reset. Then tap <strong>Update Settings</strong>.</span>
                  <button type="button" onClick={function () { setShowAppPasswordResetHint(false); }} style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: "#047857", background: "rgba(255,255,255,0.7)", border: "1px solid #6ee7b7", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>Dismiss</button>
                </div>
              )}

              {/* Password on launch toggle */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Login Protection</div>
                <div style={{ background: "#f8fafc", border: "1.5px solid " + C.border, borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>🔒 Require Password on Launch</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                        {f.requirePasswordOnLogin !== false ? "Password screen shown every time the app opens" : "App opens directly — no password required"}
                      </div>
                    </div>
                    <button onClick={function () { setF(function (x) { return Object.assign({}, x, { requirePasswordOnLogin: x.requirePasswordOnLogin === false ? true : false }); }); }}
                      style={{ flexShrink: 0, width: 48, height: 27, borderRadius: 14, border: "none", cursor: "pointer",
                        background: f.requirePasswordOnLogin !== false ? C.accent : "#cbd5e1", position: "relative", transition: "background 0.2s" }}>
                      <div style={{ position: "absolute", top: 3, width: 21, height: 21, borderRadius: 11, background: "#fff",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.25)", transition: "left 0.2s",
                        left: f.requirePasswordOnLogin !== false ? 24 : 3 }} />
                    </button>
                  </div>
                  {f.requirePasswordOnLogin === false && (
                    <div style={{ marginTop: 10, background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 7, padding: "8px 12px", fontSize: 11, color: "#92400e" }}>
                      ⚠️ Password protection is <strong>disabled</strong>. App will open without asking for a password.
                    </div>
                  )}
                </div>
              </div>

              <div style={{ borderTop: "1px solid " + C.border }} />

              {/* Admin name */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Administrator Name</div>
                <Input label="Name shown in sidebar" value={adminNameEdit} onChange={function (e) { setAdminNameEdit(e.target.value); }} placeholder="e.g. Rashid" />
              </div>

              <div style={{ borderTop: "1px solid " + C.border }} />

              {/* Admin PIN */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Admin PIN</div>
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: "#92400e", fontWeight: 600, marginBottom: 10 }}>
                  🔐 This PIN switches from Sales Mode to Admin Mode. Use 4–6 digits.
                </div>
                <Input label="Admin PIN (4–6 digits)" type="password" value={f.adminPin || ""} onChange={function (e) { var v = e.target.value.replace(/\D/g, "").slice(0, 6); setF(function (x) { return Object.assign({}, x, { adminPin: v }); }); }} placeholder="Enter 4–6 digit PIN..." />
                {f.adminPin && f.adminPin.length >= 4 && (
                  <div style={{ background: "#e6f7f2", border: "1px solid #9ee8ce", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#065f46", fontWeight: 700, marginTop: 8 }}>
                    ✅ PIN set{f.adminPin.startsWith && f.adminPin.startsWith("sha256:") ? " (secured)" : " — " + f.adminPin.length + " digits"}
                  </div>
                )}
                {f.adminPin && f.adminPin.length > 0 && f.adminPin.length < 4 && (
                  <div style={{ fontSize: 12, color: C.red, fontWeight: 600, marginTop: 6 }}>PIN must be at least 4 digits.</div>
                )}
              </div>

              <div style={{ borderTop: "1px solid " + C.border }} />

              {/* Auto-lock */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Auto-Lock</div>
                <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", padding: "12px 14px", borderRadius: 10, border: "1.5px solid " + (f.autoLockEnabled ? C.blue : C.border), background: f.autoLockEnabled ? C.accentSoft : "#fafbff", marginBottom: 10 }}>
                  <input type="checkbox" checked={f.autoLockEnabled !== false} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { autoLockEnabled: e.target.checked }); }); }} style={{ width: 16, height: 16, accentColor: C.blue }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: f.autoLockEnabled ? C.blue : C.textMd }}>Enable Auto-Lock</div>
                    <div style={{ fontSize: 12, color: C.muted }}>Automatically lock to Sales Mode after inactivity</div>
                  </div>
                </label>
                {f.autoLockEnabled !== false && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="number" min="1" max="120" value={f.autoLockMinutes || 10}
                      onChange={function (e) { var v = Math.max(1, Math.min(120, parseInt(e.target.value) || 1)); setF(function (x) { return Object.assign({}, x, { autoLockMinutes: v }); }); }}
                      style={{ width: 90, border: "1.5px solid " + C.border, borderRadius: 9, padding: "9px 14px", fontSize: 16, fontWeight: 700, outline: "none", fontFamily: "inherit", color: C.text, textAlign: "center" }} />
                    <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>minutes of inactivity (1 – 120)</span>
                  </div>
                )}
              </div>

              <div style={{ borderTop: "1px solid " + C.border }} />

              {/* Change password */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Change Login Password</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ background: C.accentSoft, borderRadius: 9, padding: "9px 14px", fontSize: 12, color: C.accent }}>
                    Leave these blank if you don't want to change your password.
                  </div>
                  {pwMsg && (
                    <div style={{ background: pwMsg.type === "error" ? C.dangerSoft : C.successSoft, color: pwMsg.type === "error" ? C.red : C.green, borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 600 }}>{pwMsg.text}</div>
                  )}
                  <Input label="Current Password" type="password" value={pwOld} onChange={function (e) { setPwOld(e.target.value); setPwMsg(null); }} placeholder="Enter current password..." />
                  <Input label="New Password" type="password" value={pwNew} onChange={function (e) { setPwNew(e.target.value); setPwMsg(null); }} placeholder="Min 4 characters..." />
                  <Input label="Confirm New Password" type="password" value={pwNew2} onChange={function (e) { setPwNew2(e.target.value); setPwMsg(null); }} placeholder="Repeat new password..." />
                </div>
              </div>

              {/* Single save button */}
              <Btn col="blue" full onClick={function () {
                /* Validate PIN */
                if (f.adminPin && f.adminPin.length > 0 && f.adminPin.length < 4) {
                  showAlert("PIN must be at least 4 digits."); return;
                }
                /* Validate admin name */
                if (adminNameEdit && adminNameEdit.trim().length < 2) {
                  showAlert("Administrator name must be at least 2 characters."); return;
                }
                /* Handle password change if fields filled */
                if (pwNew || pwOld) {
                  var current = S.get("tc3_apppass", "");
                  var allowNoOld = false;
                  try { allowNoOld = sessionStorage.getItem("tc3_allow_login_pw_reset_without_old") === "1"; } catch (e) {}
                  if (!pwNew || pwNew.length < 4) { setPwMsg({ type: "error", text: "New password must be at least 4 characters." }); return; }
                  if (pwNew !== pwNew2) { setPwMsg({ type: "error", text: "Passwords do not match." }); return; }
                  if (allowNoOld) {
                    hashPw(pwNew).then(function (hashed) {
                      S.set("tc3_apppass", hashed);
                      try { sessionStorage.removeItem("tc3_allow_login_pw_reset_without_old"); } catch (e2) {}
                      setPwOld(""); setPwNew(""); setPwNew2("");
                      setShowAppPasswordResetHint(false);
                      setPwMsg({ type: "success", text: "Password changed!" });
                    });
                    return;
                  }
                  /* Verify old password async then save hashed new */
                  pwMatchesAsync(pwOld, current).then(function (oldOk) {
                    if (current && !oldOk) { setPwMsg({ type: "error", text: "Current password incorrect." }); return; }
                    hashPw(pwNew).then(function (hashed) {
                      S.set("tc3_apppass", hashed);
                      setPwOld(""); setPwNew(""); setPwNew2("");
                      setPwMsg({ type: "success", text: "Password changed!" });
                    });
                  });
                  return; /* settings save happens after async completes via normal flow */
                }
                /* Save admin name */
                if (adminNameEdit && adminNameEdit.trim().length >= 2) {
                  S.set("tc3_admin_name", adminNameEdit.trim());
                }
                /* Hash PIN before saving to settings */
                var saveSettingsWithPin = function (pinToSave) {
                  var ns = Object.assign({}, state.settings, f, {
                    adminPin: pinToSave,
                    autoLockEnabled: f.autoLockEnabled !== false,
                    autoLockMinutes: f.autoLockMinutes || 10,
                    requirePasswordOnLogin: f.requirePasswordOnLogin !== false
                  });
                  S.set("tc3_settings", ns);
                  setState(function (st) { return Object.assign({}, st, { settings: ns }); });
                  showAlert("✅ Settings updated successfully!");
                };
                var rawPin = f.adminPin || "";
                if (rawPin && rawPin.length >= 4 && !rawPin.startsWith("sha256:")) {
                  hashPw(rawPin).then(function (hashedPin) { saveSettingsWithPin(hashedPin); });
                } else {
                  saveSettingsWithPin(rawPin);
                }
              }}>💾 Update Settings</Btn>

            </div>
          </Card>

        </div>
      )}


      {stab === "network" && isNetworkMode && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* ── Mode & Status ── */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: isNetworkServer ? "#e6f7f2" : "#e8eeff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                {isNetworkServer ? "🗄️" : "🖨️"}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.text, letterSpacing: "-0.01em" }}>
                  {isNetworkServer ? "Network Server Mode" : "Network Client (POS) Mode"}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  {isNetworkServer ? "This PC stores all shop data in local MySQL (XAMPP)" : "POS terminal only — data comes from the server PC"}
                </div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, background: isNetworkServer ? "#e6f7f2" : "#e8eeff", border: "1px solid " + (isNetworkServer ? "#0f9e6e" : "#2979ff"), borderRadius: 20, padding: "4px 12px" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: isNetworkServer ? "#0f9e6e" : "#2979ff" }}></div>
                <span style={{ fontSize: 11, fontWeight: 700, color: isNetworkServer ? "#0f9e6e" : "#2979ff" }}>
                  {isNetworkServer ? "Server" : "Client"}
                </span>
              </div>
            </div>

            {/* API URL row */}
            <div style={{ background: "#f0f4ff", border: "1.5px solid #c7d8ff", borderRadius: 10, padding: "12px 16px", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                {isNetworkServer ? "Server API URL (share with client PCs)" : "Connected Server URL"}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 13, color: C.blue, fontWeight: 700, wordBreak: "break-all" }}>
                {systemConfig.apiUrl || "Not configured"}
              </div>
              {systemConfig.apiUrl && (
                <button onClick={function () { try { navigator.clipboard.writeText(systemConfig.apiUrl); showAlert("API URL copied to clipboard!"); } catch (e) {} }}
                  style={{ marginTop: 8, background: C.blue, color: "#fff", border: "none", borderRadius: 6, padding: "4px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  📋 Copy URL
                </button>
              )}
            </div>

            {/* Security Key row */}
            {systemConfig.apiKey && (
              <div style={{ background: "#fef3e2", border: "1.5px solid #fcd34d", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                  🔑 Security Key {isNetworkServer ? "(install on each client PC)" : "(used to connect to this server)"}
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: "#78350f", fontWeight: 700, wordBreak: "break-all", letterSpacing: "0.04em" }}>
                  {systemConfig.apiKey}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <button onClick={function () { try { navigator.clipboard.writeText(systemConfig.apiKey); showAlert("Security key copied to clipboard!"); } catch (e) {} }}
                    style={{ background: "#e07a10", color: "#fff", border: "none", borderRadius: 6, padding: "4px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    📋 Copy Key
                  </button>
                  <span style={{ fontSize: 11, color: "#92400e", lineHeight: "26px" }}>Keep this secret — do not share publicly</span>
                </div>
              </div>
            )}

            {/* Role details */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "System Mode", value: "Network" },
                { label: "Role", value: isNetworkServer ? "Main Server" : "POS Terminal" },
                { label: "Data Storage", value: isNetworkServer ? "Local MySQL (XAMPP)" : "Server (via API)" },
                { label: "ERP Access", value: isNetworkServer ? "Full ERP" : "Sales Only" },
              ].map(function (row) {
                return (
                  <div key={row.label} style={{ background: "#f8faff", border: "1px solid " + C.border, borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{row.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{row.value}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* ── Server Actions (server only) ── */}
          {isNetworkServer && (
            <Card>
              <CardTitle sub="Database backup and maintenance">Server Actions</CardTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Btn col="green" onClick={function () {
                    var api = window.electronAPI;
                    if (!api || !api.backupDatabase) { showAlert("Backup not available in this build."); return; }
                    api.backupDatabase({}).then(function (r) {
                      if (r.ok) showAlert("✅ Database backup saved!\n\nFile: " + r.path);
                      else showAlert("Backup failed: " + r.message);
                    });
                  }}>💾 Backup Database Now</Btn>
                  <Btn col="gray" onClick={function () {
                    var api = window.electronAPI;
                    if (api && api.openBackupFolder) api.openBackupFolder();
                  }}>📂 Open Backup Folder</Btn>
                </div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                  Backups are saved as <code>.sql</code> files in <strong>Documents/TechonERP/backups/</strong>. Keep regular backups to avoid data loss.
                </div>
              </div>
            </Card>
          )}

          {/* ── Logs ── */}
          <Card>
            <CardTitle sub="Sync errors, API failures and connection logs">System Logs</CardTitle>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn col="gray" onClick={function () {
                var api = window.electronAPI;
                if (api && api.openLogFolder) api.openLogFolder();
              }}>📋 Open Log Folder</Btn>
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 1.6 }}>
              Log files are stored in <strong>Documents/TechonERP/logs/</strong>.
            </div>
          </Card>

          {/* ── Reset Wizard ── */}
          <Card>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.orange, marginBottom: 4 }}>Reset Setup Wizard</div>
                <div style={{ fontSize: 12, color: "#6b7280", maxWidth: 480, lineHeight: 1.6 }}>
                  Clears network configuration so you can re-run the setup wizard on next restart. <strong>No business data is deleted.</strong>
                </div>
              </div>
              <Btn col="orange" onClick={function () {
                showConfirm("Reset Setup Wizard? This will require you to choose your system mode again on next restart. Current data is not deleted.", function () {
                  var api = window.electronAPI;
                  if (api && api.resetNetworkConfig) {
                    api.resetNetworkConfig().then(function () {
                      showAlert("Setup wizard has been reset. Please restart Techon ERP.");
                    });
                  }
                });
              }}>⚙️ Reset Setup Wizard</Btn>
            </div>
          </Card>

        </div>
      )}

      {stab === "about" && (
        <AboutTab licenseInfo={licenseInfo} onActivate={onActivate} C={C} />
      )}

      {previewInv && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 3000,
          background: "rgba(10,15,30,0.85)",
          backdropFilter: "blur(6px)",
          display: "flex", flexDirection: "column",
          alignItems: "center",
          height: "100vh",
          overflow: "hidden",
        }}>
          {/* Top bar */}
          <div style={{
            width: "100%", background: C.navBg,
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            padding: "10px 20px",
            display: "flex", alignItems: "center", gap: 14,
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "rgba(200,220,255,0.9)" }}>
              {previewInv === "a4" ? "📄 A4 Invoice Preview"
                : previewInv === "a5" ? "📋 A5 Invoice Preview"
                : previewInv === "thermal80" ? "🖨 Thermal 80mm Preview"
                : "🖨 Thermal 58mm Preview"}
            </span>
            <span style={{ fontSize: 11, color: "rgba(200,220,255,0.45)", fontWeight: 500 }}>
              Sample invoice — shows your current design settings
            </span>
            <div style={{ flex: 1 }} />
            <button
              onClick={function () { setPreviewInv(null); }}
              style={{
                padding: "7px 18px", borderRadius: 8,
                background: "rgba(255,255,255,0.08)",
                color: "rgba(200,220,255,0.85)",
                border: "1px solid rgba(255,255,255,0.15)",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >✕ Close</button>
          </div>

          {/* Invoice document — scrollable */}
          <div style={{
            flex: 1, overflow: "auto", width: "100%",
            minHeight: 0,
            padding: "28px 16px",
            background: "#e8ecf5",
          }}>
            <div style={{
              background: "#fff",
              boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
              borderRadius: (previewInv === "thermal58" || previewInv === "thermal80") ? 8 : 4,
              overflow: "visible",
              width: "fit-content",
              margin: "0 auto",
            }}>
              {(previewInv === "thermal58" || previewInv === "thermal80")
                ? <InvoiceThermal inv={sampleInv} settings={f} invoiceLang={f.defaultInvoiceLang || "en"} width={previewInv === "thermal58" ? 218 : 302} />
                : <InvoiceA4 inv={sampleInv} settings={f} invoiceLang={f.defaultInvoiceLang || "en"} size={previewInv} />
              }
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default Settings;
